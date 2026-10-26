/* Beginner-friendly guided search: ask intent first, parameters second. */
(function () {
  const box = document.getElementById("wizardBox");
  if (!box) return;

  const state = { step: 1, cat: "", mode: "", use: "" };

  const CATS = [
    { id: "spring", t: "弹簧", d: "压簧、拉簧、扭簧" },
    { id: "bellows", t: "波纹管", d: "会伸缩的密封金属管" },
    { id: "coupling", t: "联轴器", d: "连接电机与轴" },
    { id: "", t: "不确定", d: "按尺寸或用途找" },
  ];

  const USES = [
    { id: "spring", t: "复位 / 定位", d: "按下去要弹回来" },
    { id: "bellows", t: "密封 / 隔离", d: "不能漏气漏液" },
    { id: "coupling", t: "传动 / 连接", d: "把扭矩传过去" },
    { id: "spring", t: "减振 / 缓冲", d: "吸收冲击和振动" },
  ];

  const FIELDS = {
    spring: [
      ["od", "外径", "mm", "3.8"],
      ["freeLength", "自由长度", "mm", "25.4"],
      ["thickness", "线径", "mm", "0.5"],
    ],
    bellows: [
      ["od", "外径", "mm", "50"],
      ["length", "总长度", "mm", "40"],
      ["stroke", "行程", "mm", "8"],
    ],
    coupling: [
      ["bore", "孔径", "mm", "6"],
      ["length", "总长度", "mm", "25"],
      ["torque", "扭矩", "N·m", "2"],
    ],
    "": [
      ["od", "外径", "mm", "8"],
      ["length", "长度", "mm", "20"],
    ],
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function num(n, d) {
    return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: d == null ? 2 : d });
  }

  function open() {
    state.step = 1; state.cat = ""; state.mode = ""; state.use = "";
    box.classList.add("on");
    render();
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function close() { box.classList.remove("on"); }

  function head() {
    const step = state.step;
    return `<div class="wz-head"><h2>3 步找到型号</h2><button class="wz-close" data-act="close">关闭</button></div>
      <p class="wz-sub">不用懂参数，按你手上有的信息选就行。</p>
      <div class="wz-steps">${[1, 2, 3].map((i) => `<span class="${i <= step ? "on" : ""}"></span>`).join("")}</div>`;
  }

  function step1() {
    return head() +
      `<p class="wz-q">第 1 步：客户要找哪一类？</p>
       <p class="wz-hint">不确定就选最后一项，我们按尺寸帮你判断。</p>
       <div class="wz-grid">${CATS.map((c) =>
        `<button class="wz-choice" data-act="cat" data-id="${c.id}"><b>${c.t}</b><small>${c.d}</small></button>`).join("")}</div>`;
  }

  function step2() {
    return head() +
      `<p class="wz-q">第 2 步：客户给了你什么？</p>
       <p class="wz-hint">有型号最快；只有尺寸也能找；什么都没有就按用途猜。</p>
       <div class="wz-grid">
         <button class="wz-choice" data-act="mode" data-id="model"><b>有型号</b><small>客户报了一串编号</small></button>
         <button class="wz-choice" data-act="mode" data-id="size"><b>有尺寸</b><small>只知道多大、多长</small></button>
         <button class="wz-choice" data-act="mode" data-id="use"><b>只知道用途</b><small>说不清规格，只知道干什么用</small></button>
       </div>
       <div class="wz-actions"><button class="wz-btn ghost" data-act="back">上一步</button></div>`;
  }

  function step2form() {
    if (state.mode === "model") {
      return head() +
        `<p class="wz-q">客户报的型号是什么？</p>
         <p class="wz-hint">完整型号最好；记不全也可以，我们按前缀找。</p>
         <div class="wz-form"><label>型号<input id="wzModel" autocomplete="off" placeholder="例如 10075"></label></div>
         <div class="wz-actions"><button class="wz-btn" data-act="search-model">查找</button>
         <button class="wz-btn ghost" data-act="back2">返回</button></div>`;
    }
    if (state.mode === "use") {
      return head() +
        `<p class="wz-q">这个零件是干什么用的？</p>
         <p class="wz-hint">按用途先缩小范围，再问尺寸。</p>
         <div class="wz-grid">${USES.map((u) =>
          `<button class="wz-choice" data-act="use" data-id="${u.id}"><b>${u.t}</b><small>${u.d}</small></button>`).join("")}</div>
         <div class="wz-actions"><button class="wz-btn ghost" data-act="back2">返回</button></div>`;
    }
    const fields = FIELDS[state.cat || ""] || FIELDS[""];
    return head() +
      `<p class="wz-q">第 3 步：填客户给的尺寸</p>
       <p class="wz-hint">只填知道的，留空会自动放宽范围。</p>
       <div class="wz-form">${fields.map(([k, label, unit, ph]) =>
        `<label>${label} <span style="float:right;color:#6b7480;font-weight:400">${unit}</span>
         <input data-field="${k}" inputmode="decimal" type="number" step="any" min="0" placeholder="例如 ${ph}"></label>`).join("")}</div>
       <div class="wz-actions"><button class="wz-btn" data-act="search-size">查找</button>
       <button class="wz-btn ghost" data-act="back2">返回</button></div>`;
  }

  function verdict(x) {
    if (x.modelRank === 0) return "型号完全匹配";
    if (!x.numeric) return "相关型号";
    if (x.tier <= 0.05) return "尺寸很接近";
    if (x.tier <= 0.1) return "基本可用，建议确认";
    return "偏差较大";
  }

  function why(x) {
    if (x.modelRank === 0) return "客户报的型号在库里，参数可直接用。";
    if (!x.numeric) return "按关键词匹配到，建议核对参数。";
    const ms = (x.matches || []).filter(Boolean).slice(0, 2).map((m) =>
      `${m.p.name_zh}差 ${num(Math.abs(m.v - m.target.value))} ${m.u}（${num(m.rel * 100, 1)}%）`);
    return ms.length ? ms.join("，") + "。" : "参数接近。";
  }

  function step3(results, note) {
    if (!results.length) {
      return head() +
        `<p class="wz-q">没找到合适型号</p>
         <div class="wz-empty">${esc(note || "库里没有满足条件的型号。可以放宽一个尺寸，或联系工程确认是否定制。")}</div>
         <div class="wz-actions">
           <button class="wz-btn" data-act="relax">放宽到 ±30% 再找</button>
           <button class="wz-btn ghost" data-act="toNormal">转到高级查询</button>
           <button class="wz-btn ghost" data-act="restart">重新开始</button>
         </div>`;
    }
    return head() +
      `<p class="wz-q">找到 ${results.length} 个候选${results.length > 3 ? "，先看最接近的 3 个" : ""}</p>
       <p class="wz-hint">按接近程度排序。</p>
       <div class="wz-results">${results.slice(0, 3).map((x) => {
        const label = verdict(x);
        const cls = label === "偏差较大" ? "no" : "";
        return `<div class="wz-card ${cls}">
          <div class="wz-card-head"><b><span class="wz-model-tag">型号</span>${esc(x.r.model)}</b><span class="wz-verdict">${label}</span></div>
          <p class="wz-why">${esc(why(x))}</p>
          <div class="wz-specs">${esc(x.r.brand)} · ${esc(x.r.category)}<br>
            ${(x.r.parameters || []).slice(0, 3).map((p) =>
              `${esc(p.name_zh)} ${num(p.si_value != null ? p.si_value : p.value)} ${esc(p.si_unit || p.unit)}`).join(" · ")}</div>
        </div>`;
      }).join("")}</div>
       <div class="wz-actions">
         <button class="wz-btn" data-act="toNormal">看全部结果并对比</button>
         <button class="wz-btn ghost" data-act="restart">重新开始</button>
       </div>`;
  }

  function render(results, note) {
    if (results) { box.innerHTML = step3(results, note); return; }
    if (state.step === 1) box.innerHTML = step1();
    else if (state.step === 2) box.innerHTML = step2();
    else box.innerHTML = step2form();
  }

  function sortResults(res) {
    return res.sort((a, b) => a.modelRank - b.modelRank || a.tier - b.tier || a.error - b.error);
  }

  async function runSearch(q, criteria, tolerance) {
    box.innerHTML = head() + `<p class="wz-q">正在查找…</p><p class="wz-hint">第一次可能需要几秒。</p>`;
    if (typeof ensureCore === "function") await ensureCore();

    let res = PartsSearch.searchStructured(data, q, criteria, {
      productType: state.cat || "",
      maxTolerance: tolerance,
    });
    if (q) res = res.filter((x) => x.modelRank < 2);
    res = sortResults(res);

    if (!res.length && typeof loadSprings === "function" && springsState === "idle") {
      box.innerHTML = head() + `<p class="wz-q">正在补全弹簧库…</p><p class="wz-hint">约 2 万个型号，稍等。</p>`;
      await loadSprings();
      res = PartsSearch.searchStructured(data, q, criteria, {
        productType: state.cat || "",
        maxTolerance: tolerance,
      });
      if (q) res = res.filter((x) => x.modelRank < 2);
      res = sortResults(res);
    }
    render(res.slice(0, 20));
  }

  function collectSize() {
    const criteria = [];
    (FIELDS[state.cat || ""] || FIELDS[""]).forEach(([k]) => {
      const el = box.querySelector(`[data-field="${k}"]`);
      if (el && el.value.trim() !== "" && Number.isFinite(el.valueAsNumber)) {
        criteria.push({ field: k, value: el.valueAsNumber });
      }
    });
    return criteria;
  }

  box.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;

    if (act === "close") { close(); return; }
    if (act === "restart") { state.step = 1; render(); return; }
    if (act === "back") { state.step = 1; render(); return; }
    if (act === "back2") { state.step = 2; render(); return; }

    if (act === "cat") { state.cat = t.dataset.id; state.step = 2; render(); return; }
    if (act === "mode") { state.mode = t.dataset.id; state.step = 3; render(); return; }
    if (act === "use") { state.cat = t.dataset.id; state.mode = "size"; state.step = 3; render(); return; }

    if (act === "search-model") {
      const q = (box.querySelector("#wzModel").value || "").trim();
      if (!q) return;
      runSearch(q, [], 0);
      return;
    }
    if (act === "search-size") {
      const criteria = collectSize();
      if (!criteria.length) {
        const hint = box.querySelector(".wz-hint");
        if (hint) hint.textContent = "至少填一个尺寸。";
        return;
      }
      runSearch("", criteria, 0.2);
      return;
    }
    if (act === "relax") { runSearch("", collectSize(), 0.3); return; }
    if (act === "toNormal") {
      const qEl = box.querySelector("#wzModel");
      const target = document.getElementById("query");
      if (qEl && qEl.value) target.value = qEl.value;
      (FIELDS[state.cat || ""] || FIELDS[""]).forEach(([k]) => {
        const el = box.querySelector(`[data-field="${k}"]`);
        const dest = document.querySelector(`[data-param="${k}"]`);
        if (el && dest) dest.value = el.value;
      });
      close();
      if (typeof search === "function") search();
      const wrap = document.getElementById("resultsWrap");
      if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  document.querySelectorAll("[data-open-wizard]").forEach((b) => b.addEventListener("click", open));
  if (/[?&]wizard=1/.test(location.search)) setTimeout(open, 400);
})();
