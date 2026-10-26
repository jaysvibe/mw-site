const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const PAGE = 50;
const SPRING_FILES = ["century-compression-a.json", "century-compression-b.json", "century-extension.json"];
const MOBILE_QUERY = window.matchMedia("(max-width: 760px)");

let data = [];
let commerce = {};
let current = [];
let shown = PAGE;
let coreLoaded = false;
let springsState = "idle";
let activeRun = 0;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 4 });
const fetchJSON = (path) => fetch(path).then((r) => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });

/* ---------------- 视图切换 ---------------- */
function setView(view) {
  $$(".workspace-tab").forEach((tab) => {
    const on = tab.dataset.view === view;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
    tab.setAttribute("tabindex", on ? "0" : "-1");
  });
  $("#partsView").hidden = view !== "parts";
  $("#dictionaryView").hidden = view !== "dictionary";
  $("#catalogView").hidden = view !== "catalog";

  if (view === "dictionary" || view === "catalog") {
    const frame = view === "dictionary" ? $("#dictionaryFrame") : $("#catalogFrame");
    if (!frame.getAttribute("src")) frame.src = frame.dataset.src;
    else resizeEmbedded(frame.id);
  } else {
    ensureCore();
  }
  const hash = view === "dictionary" ? "#dictionary" : view === "catalog" ? "#catalog" : "#parts";
  history.replaceState(null, "", (location.search || "") + hash);
}

function resizeEmbedded(id) {
  const frame = $("#" + id);
  if (!frame || !frame.getClientRects().length) return;
  try {
    const body = frame.contentDocument?.body;
    if (body) {
      const height = Math.ceil(body.getBoundingClientRect().height + 4) + "px";
      if (frame.style.height !== height) frame.style.height = height;
    }
  } catch (e) { /* ignore */ }
}

/* ---------------- 数据加载 ---------------- */
async function ensureCore() {
  if (coreLoaded) return;
  coreLoaded = true;
  setLoadState("loading", "正在加载标准件索引…");
  try {
    const payload = await fetchJSON("parts.json");
    commerce = await fetchJSON("commerce.json");
    data = payload.records.slice();
    $("#recordCount").textContent = fmt(data.length);
    $("#totalCount").textContent = fmt(payload.record_count || data.length);
    buildFilters();
    $("#sources").innerHTML = (payload.sources || [])
      .map((s) => `<li>${esc(s.brand)}：<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`)
      .join("");
    setLoadState("done", "");
    applyURL();
  } catch (e) {
    setLoadState("error", "索引加载失败，请刷新重试。");
    $("#empty").hidden = false;
    $("#empty").textContent = "数据加载失败，请刷新页面重试。";
  }
}

async function loadSprings() {
  if (springsState === "loading" || springsState === "done") return;
  springsState = "loading";
  setLoadState("loading", "正在加载弹簧库（约 2 万个型号）…");
  try {
    const parts = await Promise.all(SPRING_FILES.map(fetchJSON));
    data = data.concat(parts.flat());
    springsState = "done";
    buildFilters(true);
    $("#totalCount").textContent = fmt(data.length);
    $("#recordCount").textContent = fmt(data.length);
    setLoadState("done", "");
    if (hasQuery()) search();
  } catch (e) {
    springsState = "error";
    setLoadState("error", "弹簧库加载失败。");
  }
}

function buildFilters(keep) {
  for (const key of ["brand", "category"]) {
    const el = $("#" + key);
    const prev = keep ? el.value : "";
    const values = [...new Set(data.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    el.innerHTML = `<option value="">全部${key === "brand" ? "品牌" : "类别"}</option>` +
      values.map((v) => `<option>${esc(v)}</option>`).join("");
    if (prev && values.includes(prev)) el.value = prev;
  }
}

/* ---------------- 查询 ---------------- */
function selectedCriteria() {
  return $$("[data-param]")
    .filter((input) => input.value.trim() !== "" && Number.isFinite(input.valueAsNumber))
    .map((input) => ({ field: input.dataset.param, value: input.valueAsNumber }));
}

function hasQuery() {
  return $("#query").value.trim() !== "" || selectedCriteria().length > 0 ||
    $("#productType").value !== "" || $("#brand").value !== "" || $("#category").value !== "";
}

function search() {
  const run = ++activeRun;
  shown = PAGE;
  const q = $("#query").value.trim();
  const criteria = selectedCriteria();
  const tolerance = Number($("#tolerance").value);

  if (!q && criteria.length === 0 && !$("#productType").value && !$("#brand").value && !$("#category").value) {
    current = [];
    showWelcome(true);
    $("#resultCount").textContent = "0";
    $("#activeQuery").textContent = "输入关键词或参数开始查询";
    $("#results").innerHTML = "";
    $("#cards").innerHTML = "";
    $("#more").hidden = true;
    $("#empty").hidden = true;
    syncURL();
    return;
  }

  showWelcome(false);
  current = PartsSearch.searchStructured(data, q, criteria, {
    productType: $("#productType").value,
    brand: $("#brand").value,
    category: $("#category").value,
    maxTolerance: tolerance,
  });
  if (run !== activeRun) return;

  const modelish = /^[A-Za-z0-9][A-Za-z0-9\-_.]{2,}$/.test(q);
  if (modelish) current = current.filter((x) => x.modelRank < 2);

  $("#activeQuery").textContent = criteria.length
    ? `${criteria.length} 项参数同时匹配 · 最大偏差 ${Math.round(tolerance * 100)}%`
    : q ? `「${q}」的查询结果` : "按筛选条件显示";
  render();
  syncURL();
  maybeLoadSprings(q, criteria, modelish);
}

/* 只在确实需要时才下载 2 万个弹簧型号 */
function maybeLoadSprings(q, criteria, modelish) {
  if (springsState !== "idle") return;
  const springFields = ["rate", "length", "freeLength", "thickness", "load", "stroke"];
  const wantsSpring =
    $("#productType").value === "spring" ||
    criteria.some((c) => springFields.includes(c.field));

  if (wantsSpring || (modelish && current.length === 0)) {
    setLoadState("loading", "正在补全弹簧库（约 2 万个型号）…");
    loadSprings();
    return;
  }
  if ((q || criteria.length) && current.length < 5) {
    setLoadState("loading", "结果较少，正在补全弹簧库…");
    loadSprings();
  }
}

function render() {
  const body = $("#results");
  const cards = $("#cards");
  body.innerHTML = "";
  cards.innerHTML = "";
  let last = "";
  const isMobile = MOBILE_QUERY.matches;

  for (const x of current.slice(0, shown)) {
    const r = x.r;
    const c = commerce[r.model] || {};
    const label = x.modelRank === 0 ? "型号精确匹配" : x.numeric ? `偏差 ≤ ${Math.round(x.tier * 100)}%` : "型号与关键词";

    if (label !== last) {
      const tr = document.createElement("tr");
      tr.className = "group-row";
      tr.innerHTML = `<th colspan="5" scope="colgroup">${label}</th>`;
      body.appendChild(tr);
      last = label;
    }

    const detailBtn = document.createElement("button");
    detailBtn.className = "details-button";
    detailBtn.type = "button";
    detailBtn.textContent = "查看参数";
    detailBtn.addEventListener("click", () => detail(r));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><a class="model" href="${esc(c.url || r.source_url)}" target="_blank" rel="noopener">${esc(r.model)} ↗</a>
        <div class="sub">${esc(c.link_kind || "官方目录")}${r.configurable ? " · 可配置基础型号" : ""}</div></td>
      <td>${esc(r.brand)}<div class="sub">${esc(r.category)}<br>${esc(r.material || "")}</div></td>
      <td><div class="chips">${paramChips(x)}</div></td>
      <td>${priceHTML(c)}</td>
      <td>${x.modelRank === 0 ? "精确型号" : x.numeric ? `≤${Math.round(x.tier * 100)}% 档` : "关键词匹配"}</td>`;
    tr.querySelector("td").appendChild(detailBtn);
    body.appendChild(tr);

    if (isMobile) {
      const card = document.createElement("article");
      card.className = "result-card";
      card.innerHTML = `
        <div class="rc-head">
          <a class="model" href="${esc(c.url || r.source_url)}" target="_blank" rel="noopener">${esc(r.model)}</a>
          <span class="rc-rank">${x.modelRank === 0 ? "精确" : x.numeric ? `≤${Math.round(x.tier * 100)}%` : "关键词"}</span>
        </div>
        <div class="rc-meta">${esc(r.brand)} · ${esc(r.category)}</div>
        <div class="chips">${paramChips(x)}</div>
        <div class="rc-foot">${priceHTML(c)}</div>`;
      const btn = document.createElement("button");
      btn.className = "details-button";
      btn.type = "button";
      btn.textContent = "查看参数";
      btn.addEventListener("click", () => detail(r));
      card.appendChild(btn);
      cards.appendChild(card);
    }
  }

  $("#resultCount").textContent = fmt(current.length);
  $("#more").hidden = current.length <= shown;
  $("#empty").hidden = current.length > 0;
  if (!current.length) $("#empty").textContent = "没有找到符合当前条件的标准型号，试试放宽偏差或减少参数。";
  $("#tableWrap").hidden = isMobile;
  $("#cards").hidden = !isMobile;
}

function paramChips(x) {
  if (x.numeric) {
    return x.matches.filter(Boolean).slice(0, 4).map((m) =>
      `<span class="chip" title="目标 ${fmt(m.target.value)} ${esc(m.target.unit || m.u)}">${esc(m.p.name_zh)} ${fmt(m.v)} ${esc(m.u)}<em>${m.rel < 0.001 ? "精确" : "±" + fmt(m.rel * 100) + "%"}</em></span>`
    ).join("");
  }
  return (x.r.parameters || []).slice(0, 4).map((p) =>
    `<span class="chip">${esc(p.name_zh)} ${fmt(p.si_value ?? p.value)} ${esc(p.si_unit ?? p.unit)}</span>`
  ).join("");
}

function priceHTML(c) {
  if (!c.price) {
    return `${(c.configurable ? "配置后询价" : "需询价")}<div class="sub">未取得可核实单件报价</div>`;
  }
  const tiers = c.price_tiers?.length ? `<br>${c.price_tiers.length} 档批量价格` : "";
  return `${esc(c.price.currency)} ${fmt(c.price.amount)}<div class="sub">${esc(c.price.basis || "")}${tiers}<br>核对 ${esc(c.checked_at || "")}</div>`;
}

function showWelcome(on) {
  $("#welcome").hidden = !on;
  const wrap = $("#resultsWrap");
  if (wrap) wrap.hidden = !!on;
}

/* ---------------- 详情 ---------------- */
function detail(r) {
  const c = commerce[r.model] || {};
  const tiers = c.price_tiers?.length
    ? `<h3>阶梯价格</h3><table class="detail-table"><tbody>${c.price_tiers
        .map((t) => `<tr><td>${esc(t.quantity)}</td><td>${esc(c.price?.currency || "CNY")} ${fmt(t.amount)} / 件</td></tr>`)
        .join("")}</tbody></table><p class="sub">${esc(c.price_note || "")}</p>`
    : "";
  $("#detailContent").innerHTML = `
    <h2>${esc(r.model)}</h2>
    <p>${esc(r.brand)} · ${esc(r.category)}</p>
    <table class="detail-table"><tbody>${(r.parameters || []).map((p) => `
      <tr><td>${esc(p.name_zh)}<div class="sub">${esc(p.name_en)}</div></td>
      <td>${fmt(p.si_value ?? p.value)} ${esc(p.si_unit ?? p.unit)}<div class="sub">原始值 ${fmt(p.value)} ${esc(p.unit)}</div></td></tr>`).join("")}</tbody></table>
    ${tiers}<p>${esc(r.notes || "")}</p>
    <a target="_blank" rel="noopener" href="${esc(r.source_url)}">官方参数来源 ↗</a>`;
  $("#detail").showModal();
}

/* ---------------- URL 同步 ---------------- */
function syncURL() {
  if (location.hash === "#dictionary" || location.hash === "#catalog") return;
  const p = new URLSearchParams();
  const q = $("#query").value.trim();
  if (q) p.set("q", q);
  $$("[data-param]").forEach((el) => { if (el.value.trim() !== "") p.set(el.dataset.param, el.value); });
  for (const id of ["productType", "brand", "category"]) {
    const v = $("#" + id).value;
    if (v) p.set(id, v);
  }
  const tol = $("#tolerance").value;
  if (tol && tol !== "0.1") p.set("tol", tol);
  const qs = p.toString();
  history.replaceState(null, "", (qs ? "?" + qs : location.pathname) + "#parts");
}

function applyURL() {
  const p = new URLSearchParams(location.search);
  const q = p.get("q");
  if (q) $("#query").value = q;
  for (const [k, v] of p.entries()) {
    const el = document.querySelector(`[data-param="${k}"]`);
    if (el) el.value = v;
  }
  for (const id of ["productType", "brand", "category"]) {
    const v = p.get(id);
    if (v) $("#" + id).value = v;
  }
  const tol = p.get("tol");
  if (tol) $("#tolerance").value = tol;
  const toggle = $("#paramToggle");
  if (toggle && $$("[data-param]").some((el) => el.value !== "")) toggle.open = true;
  if (p.toString()) search();
  else showWelcome(true);
}

function setLoadState(kind, text) {
  const el = $("#loadState");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
  el.dataset.kind = kind;
}

/* ---------------- 事件 ---------------- */
let timer;
const scheduleSearch = () => { clearTimeout(timer); timer = setTimeout(search, 180); };

function bind() {
  $$(".workspace-tab").forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));

  $("#query").addEventListener("input", scheduleSearch);
  $$("[data-param]").forEach((input) => input.addEventListener("input", scheduleSearch));
  for (const id of ["productType", "brand", "category", "tolerance"]) $("#" + id).addEventListener("change", search);

  $("#clear").addEventListener("click", () => {
    $("#query").value = "";
    $$("[data-param]").forEach((input) => (input.value = ""));
    $("#productType").value = "";
    $("#brand").value = "";
    $("#category").value = "";
    $("#tolerance").value = "0.1";
    const toggle = $("#paramToggle");
    if (toggle) toggle.open = false;
    history.replaceState(null, "", location.pathname + "#parts");
    search();
  });

  $("#more").addEventListener("click", () => { shown += PAGE; render(); });
  $("#detail .close").addEventListener("click", () => $("#detail").close());

  $("#welcome").addEventListener("click", (e) => {
    const ex = e.target.closest("[data-example]");
    if (ex) {
      $("#query").value = ex.dataset.example;
      search();
      $("#query").focus();
      $("#tableWrap").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (e.target.closest("#loadSprings")) loadSprings();
  });

  MOBILE_QUERY.addEventListener("change", () => { if (current.length) render(); });

  for (const id of ["dictionaryFrame", "catalogFrame"]) {
    const frame = $("#" + id);
    frame.addEventListener("load", () => {
      resizeEmbedded(id);
      try { new ResizeObserver(() => resizeEmbedded(id)).observe(frame.contentDocument.body); } catch (e) {}
    });
  }
  window.addEventListener("resize", () => { resizeEmbedded("dictionaryFrame"); resizeEmbedded("catalogFrame"); });
  window.addEventListener("popstate", () => applyURL());
}

function boot() {
  bind();
  const hash = location.hash;
  if (hash === "#dictionary" || hash === "#catalog") setView(hash.slice(1));
  else { ensureCore(); setTimeout(() => setView("parts"), 0); }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

/* ---------------- 外部 / AI 调用 ---------------- */
async function readyForTool() {
  if (!coreLoaded) await ensureCore();
  if (springsState === "idle") await loadSprings();
}

if (document.modelContext?.registerTool) {
  document.modelContext.registerTool({
    name: "search_standard_parts",
    title: "查询标准件",
    description: "按型号、品牌或多个公制参数查找相近标准件",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        brand: { type: "string" },
        tolerance: { type: "number" },
        parameters: { type: "object", description: "外径 od、内径 id、孔径 bore、总长 length、自由长度 freeLength、波纹段长度 convolutionLength、波纹数 convolutions、线径/壁厚 thickness、弹簧刚度 rate、扭矩 torque、行程 stroke、载荷 load" },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
    execute: async (input) => {
      await readyForTool();
      $("#query").value = input.query;
      if (input.brand) $("#brand").value = input.brand;
      if (input.tolerance != null) {
        const opts = [0, 0.05, 0.1, 0.2, 0.3];
        $("#tolerance").value = String(opts.reduce((a, b) => (Math.abs(b - input.tolerance) < Math.abs(a - input.tolerance) ? b : a)));
      }
      if (input.parameters) {
        for (const [key, value] of Object.entries(input.parameters)) {
          const el = document.querySelector(`[data-param="${key}"]`);
          if (el && Number.isFinite(Number(value))) el.value = String(value);
        }
      }
      search();
      return { result_count: current.length, top_models: current.slice(0, 10).map((x) => x.r.model) };
    },
  });
}
