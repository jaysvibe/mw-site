/* Pure search engine: model IDs are never interpreted as measurements. */
const PartsSearch=(()=>{
 const norm=s=>String(s??'').toLowerCase().replace(/[\s_\-–—]/g,'');
 const fields={外径:'od',od:'od',内径:'id',id:'id',孔径:'bore',bore:'bore',长度:'length',总长:'length',length:'length',壁厚:'wall',压力:'pressure',扭矩:'torque',行程:'stroke'};
 const unit=s=>({毫米:'mm',厘米:'cm',英寸:'in',inch:'in',inches:'in','"':'in'})[s.toLowerCase()]||s.toLowerCase();
 function parse(q,records){
  let rest=q.toLowerCase(),model=null;
  const exact=records.find(r=>norm(r.model)===norm(q));
  if(exact)return{model:exact.model,words:[],criteria:[]};
  for(const r of [...records].sort((a,b)=>b.model.length-a.model.length)){
   const at=rest.indexOf(r.model.toLowerCase());
   if(at>=0&&(!at||/[\s,，]/.test(rest[at-1]))&&(!rest[at+r.model.length]||/[\s,，]/.test(rest[at+r.model.length]))){model=r.model;rest=rest.slice(0,at)+' '+rest.slice(at+r.model.length);break;}
  }
  const criteria=[];let inherited=null;
  rest=rest.replace(/(外径|内径|孔径|总长|长度|壁厚|压力|扭矩|行程|\bod\b|\bid\b|\bbore\b|\blength\b|od(?=\d)|id(?=\d))?\s*[:：=]?\s*(\d+(?:\.\d+)?|\.\d+)\s*(mm|毫米|cm|厘米|inches|inch|in\b|英寸|mpa|psi|n·m|nm|n\b)?/gi,(all,field,value,u,offset)=>{
   if(!field&&!u&&offset>0&&/[a-z0-9-]/i.test(rest[offset-1]))return all;
   if(field)inherited=fields[field.toLowerCase()];
   criteria.push({field:field?fields[field.toLowerCase()]:inherited,value:+value,unit:u?unit(u):null,label:all.trim()});return ' ';
  });
  return{model,criteria,words:rest.split(/[\s,，;；]+/).filter(Boolean)};
 }
 function fieldMatch(p,f){
  const n=(p.name_zh+' '+p.name_en).toLowerCase();
  if(!f)return true;
  if(f.startsWith('name:'))return p.name_zh===f.slice(5);
  if(f==='od')return !/配合|mating|裙|skirt/.test(n)&&/外径|outer|outside|\bod\b/.test(n);
  if(f==='id')return !/裙|skirt/.test(n)&&/内径|inside|inner/.test(n);
  return ({bore:/孔径|bore/,length:/长度|总长|length/,wall:/壁厚|wall/,pressure:/压力|pressure/,torque:/扭矩|torque/,stroke:/行程|stroke/})[f]?.test(n)||false;
 }
 function match(r,c){let best=null;
  for(const p of r.parameters){if(!fieldMatch(p,c.field))continue;
   for(const pair of [[p.si_value,p.si_unit],[p.value,p.unit]]){
    let [v,u]=pair;if(v==null||!Number.isFinite(+v))continue;u=unit(u||'');v=+v;
    if(c.unit){if(c.unit==='cm'&&u==='mm'){v/=10;u='cm';}else if(c.unit==='mm'&&u==='in'){v*=25.4;u='mm';}else if(c.unit==='in'&&u==='mm'){v/=25.4;u='in';}if(u!==c.unit)continue;}
    const rel=c.value===0?(v===0?0:Infinity):Math.abs(v-c.value)/Math.abs(c.value);
    if(!best||rel<best.rel)best={p,v,u,rel,target:c};
   }
  }return best;
 }
 const tier=e=>[.05,.10,.20,.30].find(t=>e<=t+1e-10)??Infinity;
 function search(records,q,options={}){
  const parsed=parse(q,records),groups=new Map();
  if(options.field)parsed.criteria.forEach(c=>c.field=options.field);
  parsed.criteria.forEach(c=>{const key=(c.field||'*')+'|'+(c.unit||'*');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c)});
  return records.filter(r=>(!options.brand||r.brand===options.brand)&&(!options.category||r.category===options.category)).map(r=>{
   const modelRank=parsed.model?(norm(r.model)===norm(parsed.model)?0:norm(r.model).startsWith(norm(parsed.model))?1:2):2;
   const text=[r.model,r.brand,r.category,r.family,r.material,r.notes].join(' ').toLowerCase();
   const wordsOK=parsed.words.every(w=>text.includes(w));
   const matches=[...groups.values()].map(cs=>cs.map(c=>match(r,c)).filter(Boolean).sort((a,b)=>a.rel-b.rel)[0]);
   const error=matches.length?Math.max(...matches.map(m=>m?.rel??Infinity)):0;
   return{r,modelRank,wordsOK,matches,error,tier:tier(error),numeric:matches.length>0};
  }).filter(x=>x.wordsOK&&(!parsed.model||x.modelRank<2)&&(!x.numeric||x.error<=(options.maxTolerance??.30)+1e-10))
   .sort((a,b)=>a.modelRank-b.modelRank||a.tier-b.tier||a.error-b.error||a.r.model.localeCompare(b.r.model,undefined,{numeric:true}));
 }
 const structuredFields={
  od:['外径','公称外径','波纹管外径'],id:['内径','公称内径'],
  bore:['孔径','大孔径','小孔径','最大孔径'],length:['总长','长度'],
  freeLength:['自由长度'],convolutionLength:['波纹段长度'],
  convolutions:['波纹数'],thickness:['线径','壁厚'],
  rate:['弹簧刚度','弹簧率'],torque:['最大扭矩','额定扭矩'],
  stroke:['行程','压缩行程','轴向行程','最大压缩行程','轴向位移'],
  load:['建议最大载荷','全压缩力']};
 const structuredUnits={convolutions:'count',rate:'N/mm',torque:'Nm',load:'N'};
 const kind=r=>/波纹管|膜片|电气触点|互连触点/.test(r.category)?'bellows':/联轴器/.test(r.category)?'coupling':/弹簧/.test(r.category)?'spring':'other';
 function structuredMatch(r,criterion){
  const names=structuredFields[criterion.field]||[];
  const expected=structuredUnits[criterion.field]||(criterion.field==='convolutions'?'':'mm');
  let best=null;
  for(const p of r.parameters){if(!names.includes(p.name_zh))continue;
   let v=Number(p.si_value??p.value),u=p.si_unit??p.unit;
   if(!Number.isFinite(v))continue;
   if(criterion.field==='convolutions'&&u!=='count'&&u!=='')continue;
   if(criterion.field!=='convolutions'&&u!==expected&&!(criterion.field==='torque'&&u==='N·m'))continue;
   const rel=criterion.value===0?(v===0?0:Infinity):Math.abs(v-criterion.value)/Math.abs(criterion.value);
   if(!best||rel<best.rel)best={p,v,u,rel,target:{value:criterion.value,unit:expected}};
  }
  return best;
 }
 function searchStructured(records,q,criteria,options={}){
  const base=q?search(records,q,{brand:options.brand,category:options.category,maxTolerance:options.maxTolerance}):records
   .filter(r=>(!options.brand||r.brand===options.brand)&&(!options.category||r.category===options.category))
   .map(r=>({r,modelRank:2,wordsOK:true,matches:[],error:0,tier:0,numeric:false}));
  return base.filter(x=>!options.productType||kind(x.r)===options.productType).map(x=>{
   if(!criteria.length)return x;
   const matches=criteria.map(c=>structuredMatch(x.r,c));
   const error=Math.max(...matches.map(m=>m?.rel??Infinity));
   return {...x,matches,error,tier:tier(error),numeric:true};
  }).filter(x=>!criteria.length||x.error<=(options.maxTolerance??.1)+1e-10)
   .sort((a,b)=>a.modelRank-b.modelRank||a.tier-b.tier||a.error-b.error||a.r.model.localeCompare(b.r.model,undefined,{numeric:true}));
 }
 return{search,searchStructured,parse,match,tier,kind};
})();
if(typeof module!=='undefined')module.exports=PartsSearch;
