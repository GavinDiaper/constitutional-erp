import { af as ensure_array_like, d as escape_html, ag as attr, ah as attr_class, ai as stringify, aj as attr_style, ak as fallback, al as bind_props, am as store_get, an as unsubscribe_stores } from './renderer-qSu5LOv4.js';
import { w as writable } from './index-Do1NdkHO.js';

const apiBaseUrl = "http://localhost:3011";
const apiKey = "change-me";
function toAbsoluteUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
async function fetchHubJson(path, actor, init) {
  const response = await fetch(toAbsoluteUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-actor-id": actor.actorId,
      "x-actor-tier": String(actor.authorityTier),
      ...{}
    }
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const problem = await response.json();
      throw new Error(formatProblemMessage(problem, `ERP Mapping API request failed (${response.status})`));
    }
    const bodyText = await response.text();
    const detail = bodyText.trim() ? bodyText : "No response body";
    throw new Error(`ERP Mapping API request failed (${response.status}): ${detail}`);
  }
  return await response.json();
}
function formatProblemMessage(problem, fallback2) {
  if (!problem || typeof problem !== "object") {
    return fallback2;
  }
  const record = problem;
  const detail = formatProblemField(record.detail);
  if (detail) {
    return detail;
  }
  const title = formatProblemField(record.title);
  return title || fallback2;
}
function formatProblemField(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value === void 0 || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function queryTable(table, actor, limit = 500, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return fetchHubJson(`/api/v1/query/${table}?${params.toString()}`, actor);
}
const actorOptions = [
  { actorId: "principal.system", authorityTier: 5 },
  { actorId: "principal.p2p-tier1", authorityTier: 1 },
  { actorId: "principal.p2p-tier3", authorityTier: 3 },
  { actorId: "principal.o2c-tier2", authorityTier: 2 },
  { actorId: "principal.h2r-tier2", authorityTier: 2 },
  { actorId: "principal.r2r-tier3", authorityTier: 3 }
];
const actorStore = writable(actorOptions[0]);
function Tabs($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let tabs = fallback($$props["tabs"], () => [], true);
    let selected = fallback($$props["selected"], "");
    let onSelect = fallback($$props["onSelect"], () => void 0);
    $$renderer2.push(`<div class="flex flex-wrap gap-2"><!--[-->`);
    const each_array = ensure_array_like(tabs);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tab = each_array[$$index];
      $$renderer2.push(`<button type="button"${attr_class(`rounded-md px-3 py-2 text-sm ${selected === tab ? "dark:bg-white dark:text-slate-900 bg-slate-900 text-white" : "dark:bg-white/10 bg-slate-500/10"}`)}>${escape_html(tab)}</button>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { tabs, selected, onSelect });
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let compareDomains, compareEntities, filteredCompare, processDomains, processSystems, processSystemIds, processPivoted, filteredProcess, processVisibleSystems, gapSystems, filteredGap, sfSystems, filteredSystemFields, mappingRowsSorted;
    const TABS = [
      "Systems",
      "Compare Fields",
      "Gap Report",
      "Processes",
      "System Fields"
    ];
    const mappingStatuses = ["MAPPED", "PARTIAL", "NOT_APPLICABLE", "GAP"];
    let activeTab = "Gap Report";
    let selectedActorId = actorOptions[0].actorId;
    let systemsRows = [];
    let gapRows = [];
    let compareRows = [];
    let processRows = [];
    let systemFieldRows = [];
    let loadingMap = {
      Systems: false,
      "Compare Fields": false,
      "Gap Report": false,
      Processes: false,
      "System Fields": false
    };
    let errorMap = {
      Systems: "",
      "Compare Fields": "",
      "Gap Report": "",
      Processes: "",
      "System Fields": ""
    };
    let loadedMap = {
      Systems: false,
      "Compare Fields": false,
      "Gap Report": false,
      Processes: false,
      "System Fields": false
    };
    let compareDomain = "";
    let compareEntity = "";
    let compareSearch = "";
    let processDomain = "";
    let processSystem = "";
    let systemFieldSystem = "";
    let gapSystem = "";
    let editorLoading = false;
    let canonicalFields = [];
    let mappingRows = [];
    let selectedMappingId = "";
    let formFieldId = "";
    let formSystemId = "";
    let formErpModule = "";
    let formErpTable = "";
    let formErpField = "";
    let formErpFullReference = "";
    let formMappingStatus = "MAPPED";
    let formTransformationNotes = "";
    let formIsBidirectional = true;
    async function loadTab(tab) {
      if (loadedMap[tab]) return;
      loadingMap = { ...loadingMap, [tab]: true };
      errorMap = { ...errorMap, [tab]: "" };
      try {
        if (tab === "Systems") {
          const r = await queryTable("erp_system", store_get($$store_subs ??= {}, "$actorStore", actorStore), 500, 0);
          systemsRows = r.data ?? [];
        } else if (tab === "Gap Report") {
          const r = await queryTable("v_system_gap_report", store_get($$store_subs ??= {}, "$actorStore", actorStore), 500, 0);
          gapRows = r.data ?? [];
        } else if (tab === "Compare Fields") {
          const r = await queryTable("v_cross_system_field_compare", store_get($$store_subs ??= {}, "$actorStore", actorStore), 500, 0);
          compareRows = r.data ?? [];
        } else if (tab === "Processes") {
          const r = await queryTable("v_process_coverage", store_get($$store_subs ??= {}, "$actorStore", actorStore), 500, 0);
          processRows = r.data ?? [];
        } else if (tab === "System Fields") {
          const r = await queryTable("v_system_specific_fields", store_get($$store_subs ??= {}, "$actorStore", actorStore), 500, 0);
          systemFieldRows = r.data ?? [];
        }
        loadedMap = { ...loadedMap, [tab]: true };
      } catch (e) {
        errorMap = {
          ...errorMap,
          [tab]: e instanceof Error ? e.message : "Failed to load data."
        };
      } finally {
        loadingMap = { ...loadingMap, [tab]: false };
      }
    }
    function switchTab(tab) {
      activeTab = tab;
      void loadTab(activeTab);
    }
    function norm(v) {
      return (v ?? "").trim().toLowerCase();
    }
    function coverageClass(pct) {
      if (pct === null) return "dark:text-white/40 text-slate-400";
      if (pct >= 80) return "text-emerald-500 font-semibold";
      if (pct >= 40) return "text-amber-400 font-semibold";
      return "text-rose-400 font-semibold";
    }
    function statusDot(status) {
      if (!status || status === "GAP") return "·";
      if (status === "MAPPED") return "✓";
      if (status === "PARTIAL") return "~";
      if (status === "NOT_APPLICABLE") return "—";
      return "?";
    }
    function statusCellClass(status) {
      if (!status || status === "GAP") return "dark:text-white/20 text-slate-300";
      if (status === "MAPPED") return "text-emerald-500";
      if (status === "PARTIAL") return "text-amber-400";
      if (status === "NOT_APPLICABLE") return "dark:text-white/40 text-slate-400";
      return "";
    }
    function categoryBadgeClass(cat) {
      if (cat === "Tier1") return "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30";
      if (cat === "Tier2") return "bg-sky-500/20 text-sky-300 border border-sky-500/30";
      if (cat === "OpenSource") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      return "dark:bg-white/10 bg-slate-200";
    }
    function genBadgeClass(gen) {
      if (gen === "Cloud") return "bg-purple-500/20 text-purple-300 border border-purple-500/30";
      if (gen === "On-Premise") return "bg-orange-500/20 text-orange-300 border border-orange-500/30";
      return "bg-teal-500/20 text-teal-300 border border-teal-500/30";
    }
    compareDomains = [...new Set(compareRows.map((r) => r.domain))].sort();
    compareEntities = [
      ...new Set(compareRows.filter((r) => !compareDomain).map((r) => r.entity_name))
    ].sort();
    filteredCompare = compareRows.filter((r) => {
      const q = norm(compareSearch);
      return !q || norm(r.canonical_field).includes(q) || norm(r.entity_name).includes(q) || norm(r.fusion_field).includes(q) || norm(r.sap_s4_field).includes(q) || norm(r.d365fo_field).includes(q);
    });
    processDomains = [...new Set(processRows.map((r) => r.domain))].sort();
    processSystems = [...new Set(processRows.map((r) => r.system_id))].sort();
    processSystemIds = [...new Set(processRows.map((r) => r.system_id))].sort();
    processPivoted = (() => {
      const map = /* @__PURE__ */ new Map();
      for (const r of processRows) {
        if (!map.has(r.process_id)) {
          map.set(r.process_id, {
            process_id: r.process_id,
            domain: r.domain,
            process_name: r.process_name,
            canonical_command: r.canonical_command,
            sequence_order: r.sequence_order,
            systems: {}
          });
        }
        map.get(r.process_id).systems[r.system_id] = {
          status: r.mapping_status,
          erp_process_name: r.erp_process_name,
          erp_transaction_code: r.erp_transaction_code,
          erp_module: r.erp_module,
          notes: r.notes
        };
      }
      return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain) || a.sequence_order - b.sequence_order);
    })();
    filteredProcess = processPivoted.filter((r) => {
      const sysOk = !processSystem;
      return sysOk;
    });
    processVisibleSystems = processSystemIds;
    gapSystems = [...new Set(gapRows.map((r) => r.system_id))].sort();
    filteredGap = gapRows.filter((r) => !gapSystem);
    sfSystems = [...new Set(systemFieldRows.map((r) => r.system_id))].sort();
    filteredSystemFields = systemFieldRows.filter((r) => !systemFieldSystem);
    mappingRowsSorted = [...mappingRows].sort((a, b) => a.field_id.localeCompare(b.field_id));
    $$renderer2.push(`<section class="space-y-4"><div><h2 class="text-2xl font-semibold">ERP Mapping Tool</h2> <p class="muted mt-2 text-sm">Standalone explorer and editor for ERP mapping V2 tables.</p></div> `);
    Tabs($$renderer2, { tabs: [...TABS], selected: activeTab, onSelect: switchTab });
    $$renderer2.push(`<!----> <div class="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 dark:border-white/20 p-3"><label class="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-white/60" for="actor-select">Actor</label> `);
    $$renderer2.select(
      {
        id: "actor-select",
        class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs",
        value: selectedActorId
      },
      ($$renderer3) => {
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(actorOptions);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let actor = each_array[$$index];
          $$renderer3.option({ value: actor.actorId }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(actor.actorId)} (tier ${escape_html(actor.authorityTier)})`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(` <button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10">Reload</button></div> `);
    if (activeTab === "Systems") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex items-center gap-2"><button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10"${attr("disabled", loadingMap["Systems"], true)}>${escape_html(loadingMap["Systems"] ? "Refreshing..." : "Refresh")}</button> <span class="muted text-xs">${escape_html(systemsRows.length)} systems</span></div> `);
      if (errorMap["Systems"]) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">${escape_html(errorMap["Systems"])}</p>`);
      } else if (loadingMap["Systems"]) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<p class="muted text-sm p-3">Loading…</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300"><table class="min-w-full text-left text-sm"><thead><tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500"><th class="px-3 py-2">System ID</th><th class="px-3 py-2">Name</th><th class="px-3 py-2">Vendor</th><th class="px-3 py-2">Generation</th><th class="px-3 py-2">Category</th><th class="px-3 py-2">Version</th><th class="px-3 py-2">Notes</th></tr></thead><tbody><!--[-->`);
        const each_array_1 = ensure_array_like(systemsRows);
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let s = each_array_1[$$index_1];
          $$renderer2.push(`<tr class="border-b dark:border-white/10 border-slate-200 align-top"><td class="px-3 py-2 font-mono text-xs font-semibold">${escape_html(s.system_id)}</td><td class="px-3 py-2 font-medium">${escape_html(s.name)}</td><td class="px-3 py-2 text-xs">${escape_html(s.vendor)}</td><td class="px-3 py-2"><span${attr_class(`rounded px-1.5 py-0.5 text-xs ${stringify(genBadgeClass(s.generation))}`)}>${escape_html(s.generation)}</span></td><td class="px-3 py-2"><span${attr_class(`rounded px-1.5 py-0.5 text-xs ${stringify(categoryBadgeClass(s.category))}`)}>${escape_html(s.category)}</span></td><td class="px-3 py-2 font-mono text-xs dark:text-white/70 text-slate-600">${escape_html(s.erp_version ?? "—")}</td><td class="px-3 py-2 text-xs dark:text-white/60 text-slate-500 max-w-xs">${escape_html(s.notes ?? "—")}</td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (activeTab === "Gap Report") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-wrap items-center gap-2"><button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10"${attr("disabled", loadingMap["Gap Report"], true)}>${escape_html(loadingMap["Gap Report"] ? "Refreshing..." : "Refresh")}</button> `);
      $$renderer2.select(
        {
          class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs",
          value: gapSystem
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "" }, ($$renderer4) => {
            $$renderer4.push(`All systems`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_2 = ensure_array_like(gapSystems);
          for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
            let sid = each_array_2[$$index_2];
            $$renderer3.option({ value: sid }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(sid)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
      $$renderer2.push(` <span class="muted text-xs">${escape_html(filteredGap.length)} rows</span></div> `);
      if (errorMap["Gap Report"]) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">${escape_html(errorMap["Gap Report"])}</p>`);
      } else if (loadingMap["Gap Report"]) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<p class="muted text-sm p-3">Loading…</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300"><table class="min-w-full text-left text-sm"><thead><tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500"><th class="px-3 py-2">Domain</th><th class="px-3 py-2">System</th><th class="px-3 py-2">Vendor</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-right">Mapped</th><th class="px-3 py-2 text-right">Partial</th><th class="px-3 py-2 text-right">Gap</th><th class="px-3 py-2 text-right">Coverage</th><th class="px-3 py-2">Bar</th></tr></thead><tbody><!--[-->`);
        const each_array_3 = ensure_array_like(filteredGap);
        for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
          let r = each_array_3[$$index_3];
          $$renderer2.push(`<tr class="border-b dark:border-white/10 border-slate-200 align-middle"><td class="px-3 py-2 font-semibold text-xs">${escape_html(r.domain)}</td><td class="px-3 py-2 font-mono text-xs">${escape_html(r.system_id)}</td><td class="px-3 py-2 text-xs dark:text-white/60 text-slate-500">${escape_html(r.vendor)}</td><td class="px-3 py-2 text-right tabular-nums text-xs">${escape_html(r.total_fields)}</td><td class="px-3 py-2 text-right tabular-nums text-xs text-emerald-500">${escape_html(r.mapped)}</td><td class="px-3 py-2 text-right tabular-nums text-xs text-amber-400">${escape_html(r.partial)}</td><td class="px-3 py-2 text-right tabular-nums text-xs text-rose-400">${escape_html(r.gap)}</td><td${attr_class(`px-3 py-2 text-right tabular-nums text-xs ${stringify(coverageClass(r.coverage_pct))}`)}>${escape_html(r.coverage_pct !== null ? r.coverage_pct + "%" : "—")}</td><td class="px-3 py-2"><div class="h-2 w-24 rounded-full dark:bg-white/10 bg-slate-200 overflow-hidden"><div${attr_class(`h-full rounded-full ${stringify((r.coverage_pct ?? 0) >= 80 ? "bg-emerald-500" : (r.coverage_pct ?? 0) >= 40 ? "bg-amber-400" : "bg-rose-400")}`)}${attr_style(`width: ${stringify(r.coverage_pct ?? 0)}%`)}></div></div></td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (activeTab === "Compare Fields") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-wrap items-center gap-2"><button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10"${attr("disabled", loadingMap["Compare Fields"], true)}>${escape_html(loadingMap["Compare Fields"] ? "Refreshing..." : "Refresh")}</button> `);
      $$renderer2.select(
        {
          class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs",
          value: compareDomain
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "" }, ($$renderer4) => {
            $$renderer4.push(`All domains`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_4 = ensure_array_like(compareDomains);
          for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
            let d = each_array_4[$$index_4];
            $$renderer3.option({ value: d }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(d)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
      $$renderer2.push(` `);
      $$renderer2.select(
        {
          class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs",
          value: compareEntity
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "" }, ($$renderer4) => {
            $$renderer4.push(`All entities`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_5 = ensure_array_like(compareEntities);
          for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
            let e = each_array_5[$$index_5];
            $$renderer3.option({ value: e }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(e)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
      $$renderer2.push(` <input class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs w-52" placeholder="Search field or reference…"${attr("value", compareSearch)}/> <span class="muted text-xs">${escape_html(filteredCompare.length)} fields</span></div> <p class="muted text-xs"><span class="text-emerald-500 font-semibold">✓ MAPPED</span>   <span class="text-amber-400 font-semibold">~ PARTIAL</span>   <span class="dark:text-white/40 text-slate-400">— N/A</span>   <span class="dark:text-white/20 text-slate-300">· GAP</span></p> `);
      if (errorMap["Compare Fields"]) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">${escape_html(errorMap["Compare Fields"])}</p>`);
      } else if (loadingMap["Compare Fields"]) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<p class="muted text-sm p-3">Loading…</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300"><table class="min-w-full text-left text-xs"><thead><tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500"><th class="px-3 py-2">Domain</th><th class="px-3 py-2">Entity</th><th class="px-3 py-2">Canonical Field</th><th class="px-3 py-2">Type</th><th class="px-2 py-2 text-center">Key</th><th class="px-3 py-2 border-l dark:border-white/10 border-slate-200">Fusion</th><th class="px-3 py-2">EBS</th><th class="px-3 py-2">SAP S/4</th><th class="px-3 py-2">SAP ECC</th><th class="px-3 py-2">Workday</th><th class="px-3 py-2">D365 F&amp;O</th><th class="px-3 py-2">NetSuite</th><th class="px-3 py-2">Odoo</th></tr></thead><tbody><!--[-->`);
        const each_array_6 = ensure_array_like(filteredCompare);
        for (let $$index_6 = 0, $$length = each_array_6.length; $$index_6 < $$length; $$index_6++) {
          let r = each_array_6[$$index_6];
          $$renderer2.push(`<tr class="border-b dark:border-white/10 border-slate-200 align-top hover:dark:bg-white/5 hover:bg-slate-50"><td class="px-3 py-1.5 font-semibold">${escape_html(r.domain)}</td><td class="px-3 py-1.5">${escape_html(r.entity_name)}</td><td class="px-3 py-1.5 font-mono font-semibold">${escape_html(r.canonical_field)}</td><td class="px-3 py-1.5 dark:text-white/50 text-slate-400">${escape_html(r.field_type)}</td><td class="px-2 py-1.5 text-center">${escape_html(r.is_key ? "🔑" : "")}</td><td${attr_class(`px-3 py-1.5 border-l dark:border-white/10 border-slate-200 ${stringify(statusCellClass(r.fusion_status))}`)}>`);
          if (r.fusion_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.fusion_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.fusion_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td><td${attr_class(`px-3 py-1.5 ${stringify(statusCellClass(r.ebs_status))}`)}>`);
          if (r.ebs_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.ebs_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.ebs_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td><td${attr_class(`px-3 py-1.5 ${stringify(statusCellClass(r.sap_s4_status))}`)}>`);
          if (r.sap_s4_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.sap_s4_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.sap_s4_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td><td${attr_class(`px-3 py-1.5 ${stringify(statusCellClass(r.sap_ecc_status))}`)}>`);
          if (r.sap_ecc_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.sap_ecc_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.sap_ecc_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td><td${attr_class(`px-3 py-1.5 ${stringify(statusCellClass(r.workday_status))}`)}>`);
          if (r.workday_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.workday_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.workday_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td><td${attr_class(`px-3 py-1.5 ${stringify(statusCellClass(r.d365fo_status))}`)}>`);
          if (r.d365fo_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.d365fo_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.d365fo_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td><td${attr_class(`px-3 py-1.5 ${stringify(statusCellClass(r.netsuite_status))}`)}>`);
          if (r.netsuite_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.netsuite_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.netsuite_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td><td${attr_class(`px-3 py-1.5 ${stringify(statusCellClass(r.odoo_status))}`)}>`);
          if (r.odoo_field) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="font-mono">${escape_html(r.odoo_field)}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="select-none">${escape_html(statusDot(r.odoo_status))}</span>`);
          }
          $$renderer2.push(`<!--]--></td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (activeTab === "Processes") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-wrap items-center gap-2"><button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10"${attr("disabled", loadingMap["Processes"], true)}>${escape_html(loadingMap["Processes"] ? "Refreshing..." : "Refresh")}</button> `);
      $$renderer2.select(
        {
          class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs",
          value: processDomain
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "" }, ($$renderer4) => {
            $$renderer4.push(`All domains`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_7 = ensure_array_like(processDomains);
          for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
            let d = each_array_7[$$index_7];
            $$renderer3.option({ value: d }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(d)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
      $$renderer2.push(` `);
      $$renderer2.select(
        {
          class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs",
          value: processSystem
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "" }, ($$renderer4) => {
            $$renderer4.push(`All systems`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_8 = ensure_array_like(processSystems);
          for (let $$index_8 = 0, $$length = each_array_8.length; $$index_8 < $$length; $$index_8++) {
            let sid = each_array_8[$$index_8];
            $$renderer3.option({ value: sid }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(sid)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
      $$renderer2.push(` <span class="muted text-xs">${escape_html(filteredProcess.length)} processes</span></div> `);
      if (errorMap["Processes"]) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">${escape_html(errorMap["Processes"])}</p>`);
      } else if (loadingMap["Processes"]) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<p class="muted text-sm p-3">Loading…</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300"><table class="min-w-full text-left text-xs"><thead><tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500"><th class="px-3 py-2">Domain</th><th class="px-3 py-2">Process</th><th class="px-3 py-2">Command</th><!--[-->`);
        const each_array_9 = ensure_array_like(processVisibleSystems);
        for (let $$index_9 = 0, $$length = each_array_9.length; $$index_9 < $$length; $$index_9++) {
          let sid = each_array_9[$$index_9];
          $$renderer2.push(`<th class="px-3 py-2 border-l dark:border-white/10 border-slate-200">${escape_html(sid)}</th>`);
        }
        $$renderer2.push(`<!--]--></tr></thead><tbody><!--[-->`);
        const each_array_10 = ensure_array_like(filteredProcess);
        for (let $$index_11 = 0, $$length = each_array_10.length; $$index_11 < $$length; $$index_11++) {
          let row = each_array_10[$$index_11];
          $$renderer2.push(`<tr class="border-b dark:border-white/10 border-slate-200 align-top hover:dark:bg-white/5 hover:bg-slate-50"><td class="px-3 py-2 font-semibold">${escape_html(row.domain)}</td><td class="px-3 py-2 font-medium max-w-45">${escape_html(row.process_name)}</td><td class="px-3 py-2 font-mono dark:text-white/50 text-slate-400">${escape_html(row.canonical_command ?? "—")}</td><!--[-->`);
          const each_array_11 = ensure_array_like(processVisibleSystems);
          for (let $$index_10 = 0, $$length2 = each_array_11.length; $$index_10 < $$length2; $$index_10++) {
            let sid = each_array_11[$$index_10];
            const sys = row.systems[sid];
            $$renderer2.push(`<td${attr_class(`px-3 py-2 border-l dark:border-white/10 border-slate-200 ${stringify(statusCellClass(sys?.status ?? null))} max-w-50`)}>`);
            if (sys && sys.status !== "GAP") {
              $$renderer2.push("<!--[0-->");
              $$renderer2.push(`<div class="space-y-0.5">`);
              if (sys.erp_process_name) {
                $$renderer2.push("<!--[0-->");
                $$renderer2.push(`<div class="font-medium dark:text-white text-slate-800">${escape_html(sys.erp_process_name)}</div>`);
              } else {
                $$renderer2.push("<!--[-1-->");
              }
              $$renderer2.push(`<!--]--> `);
              if (sys.erp_transaction_code) {
                $$renderer2.push("<!--[0-->");
                $$renderer2.push(`<div class="font-mono text-xs dark:text-white/70 text-slate-600">${escape_html(sys.erp_transaction_code)}</div>`);
              } else {
                $$renderer2.push("<!--[-1-->");
              }
              $$renderer2.push(`<!--]--> `);
              if (sys.erp_module) {
                $$renderer2.push("<!--[0-->");
                $$renderer2.push(`<div class="dark:text-white/40 text-slate-400 text-xs">${escape_html(sys.erp_module)}</div>`);
              } else {
                $$renderer2.push("<!--[-1-->");
              }
              $$renderer2.push(`<!--]--></div>`);
            } else {
              $$renderer2.push("<!--[-1-->");
              $$renderer2.push(`<span class="select-none">${escape_html(statusDot(sys?.status ?? null))}</span>`);
            }
            $$renderer2.push(`<!--]--></td>`);
          }
          $$renderer2.push(`<!--]--></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (activeTab === "System Fields") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="space-y-1 rounded-md border dark:border-amber-400/30 border-amber-300/60 bg-amber-400/5 p-3"><p class="text-xs font-semibold dark:text-amber-300 text-amber-700">ERP-native fields with no canonical equivalent</p> <p class="text-xs dark:text-white/60 text-slate-500">These are fields that exist in specific ERP systems but fall outside the canonical data model — e.g. SAP Controlling objects, Workday Worktags, Oracle flexfield segments.</p></div> <div class="flex flex-wrap items-center gap-2"><button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10"${attr("disabled", loadingMap["System Fields"], true)}>${escape_html(loadingMap["System Fields"] ? "Refreshing..." : "Refresh")}</button> `);
      $$renderer2.select(
        {
          class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs",
          value: systemFieldSystem
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "" }, ($$renderer4) => {
            $$renderer4.push(`All systems`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_12 = ensure_array_like(sfSystems);
          for (let $$index_12 = 0, $$length = each_array_12.length; $$index_12 < $$length; $$index_12++) {
            let sid = each_array_12[$$index_12];
            $$renderer3.option({ value: sid }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(sid)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
      $$renderer2.push(` <span class="muted text-xs">${escape_html(filteredSystemFields.length)} fields</span></div> `);
      if (errorMap["System Fields"]) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">${escape_html(errorMap["System Fields"])}</p>`);
      } else if (loadingMap["System Fields"]) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<p class="muted text-sm p-3">Loading…</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300"><table class="min-w-full text-left text-xs"><thead><tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500"><th class="px-3 py-2">System</th><th class="px-3 py-2">Domain</th><th class="px-3 py-2">Entity Context</th><th class="px-3 py-2">Module</th><th class="px-3 py-2">ERP Field Reference</th><th class="px-3 py-2">Purpose</th><th class="px-3 py-2">Why No Canonical Equivalent</th></tr></thead><tbody><!--[-->`);
        const each_array_13 = ensure_array_like(filteredSystemFields);
        for (let $$index_13 = 0, $$length = each_array_13.length; $$index_13 < $$length; $$index_13++) {
          let r = each_array_13[$$index_13];
          $$renderer2.push(`<tr class="border-b dark:border-white/10 border-slate-200 align-top"><td class="px-3 py-2 font-mono font-semibold">${escape_html(r.system_id)}</td><td class="px-3 py-2 font-semibold">${escape_html(r.domain)}</td><td class="px-3 py-2">${escape_html(r.entity_context)}</td><td class="px-3 py-2 dark:text-white/60 text-slate-500">${escape_html(r.erp_module ?? "—")}</td><td class="px-3 py-2 font-mono dark:text-indigo-300 text-indigo-700">${escape_html(r.erp_full_reference)}</td><td class="px-3 py-2 max-w-xs">${escape_html(r.purpose)}</td><td class="px-3 py-2 max-w-sm dark:text-white/60 text-slate-500">${escape_html(r.notes ?? "—")}</td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <section class="space-y-3 rounded-md border border-slate-300 dark:border-white/20 p-4"><div class="flex items-center justify-between gap-2"><h3 class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/60">Manage Field Mappings</h3> <button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10"${attr("disabled", editorLoading, true)}>${escape_html("Refresh Editor")}</button></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="grid gap-2 md:grid-cols-2"><label class="flex flex-col gap-1 text-xs"><span class="muted">Canonical field</span> `);
    $$renderer2.select(
      {
        class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2",
        value: formFieldId,
        disabled: Boolean(selectedMappingId)
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`Select field`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array_14 = ensure_array_like(canonicalFields);
        for (let $$index_14 = 0, $$length = each_array_14.length; $$index_14 < $$length; $$index_14++) {
          let field = each_array_14[$$index_14];
          $$renderer3.option({ value: field.field_id }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(field.domain)} - ${escape_html(field.canonical_field)} (${escape_html(field.field_id)})`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</label> <label class="flex flex-col gap-1 text-xs"><span class="muted">System</span> `);
    $$renderer2.select(
      {
        class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2",
        value: formSystemId,
        disabled: Boolean(selectedMappingId)
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`Select system`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array_15 = ensure_array_like(systemsRows);
        for (let $$index_15 = 0, $$length = each_array_15.length; $$index_15 < $$length; $$index_15++) {
          let system = each_array_15[$$index_15];
          $$renderer3.option({ value: system.system_id }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(system.system_id)} - ${escape_html(system.name)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</label> <label class="flex flex-col gap-1 text-xs"><span class="muted">Mapping status</span> `);
    $$renderer2.select(
      {
        class: "rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2",
        value: formMappingStatus
      },
      ($$renderer3) => {
        $$renderer3.push(`<!--[-->`);
        const each_array_16 = ensure_array_like(mappingStatuses);
        for (let $$index_16 = 0, $$length = each_array_16.length; $$index_16 < $$length; $$index_16++) {
          let status = each_array_16[$$index_16];
          $$renderer3.option({ value: status }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(status)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</label> <label class="flex flex-col gap-1 text-xs"><span class="muted">ERP module</span> <input class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2"${attr("value", formErpModule)} placeholder="Order Management"/></label> <label class="flex flex-col gap-1 text-xs"><span class="muted">ERP table</span> <input class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2"${attr("value", formErpTable)} placeholder="DOO_HEADERS_ALL"/></label> <label class="flex flex-col gap-1 text-xs"><span class="muted">ERP field</span> <input class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2"${attr("value", formErpField)} placeholder="HEADER_ID"/></label></div> <label class="flex flex-col gap-1 text-xs"><span class="muted">ERP full reference</span> <input class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2"${attr("value", formErpFullReference)} placeholder="DOO_HEADERS_ALL.HEADER_ID"/></label> <label class="flex flex-col gap-1 text-xs"><span class="muted">Transformation notes</span> <textarea class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2" rows="2" placeholder="Any conversion or truncation rules">`);
    const $$body = escape_html(formTransformationNotes);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea></label> <label class="flex items-center gap-2 text-xs"><input type="checkbox"${attr("checked", formIsBidirectional, true)}/> <span class="muted">Bidirectional mapping</span></label> <div class="flex flex-wrap gap-2"><button type="button" class="rounded-md border border-emerald-500/55 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"${attr("disabled", editorLoading, true)}>${escape_html("Create mapping")}</button> <button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10">Reset form</button></div> <div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300"><table class="min-w-full text-left text-xs"><thead><tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500"><th class="px-3 py-2">ID</th><th class="px-3 py-2">Field</th><th class="px-3 py-2">System</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Reference</th><th class="px-3 py-2">Action</th></tr></thead><tbody><!--[-->`);
    const each_array_17 = ensure_array_like(mappingRowsSorted);
    for (let $$index_17 = 0, $$length = each_array_17.length; $$index_17 < $$length; $$index_17++) {
      let row = each_array_17[$$index_17];
      $$renderer2.push(`<tr class="border-b dark:border-white/10 border-slate-200 align-top"><td class="px-3 py-2 font-mono">${escape_html(row.id)}</td><td class="px-3 py-2 font-mono">${escape_html(row.field_id)}</td><td class="px-3 py-2">${escape_html(row.system_id)}</td><td class="px-3 py-2">${escape_html(row.mapping_status)}</td><td class="px-3 py-2">${escape_html(row.erp_full_reference ?? "—")}</td><td class="px-3 py-2"><button type="button" class="rounded border dark:border-white/35 border-slate-300 px-2 py-1 text-[11px]">Edit</button></td></tr>`);
    }
    $$renderer2.push(`<!--]--></tbody></table></div></section> <div class="flex flex-wrap gap-2 pt-2"><button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10">Reload Page Data</button></div></section>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-CGZrrJ4t.js.map
