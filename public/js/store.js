/* ---------- cloud store: talks to the Worker API (/api/*); online only ---------- */
/* Documents live in D1. Record-style collections (invoices, ledger, ...) are loaded for a recent window
   and older months are fetched on demand with loadRange(). Other devices' changes arrive by polling. */
const LOGS = new Set(["sales", "purchases", "counts", "ledger", "sreturns", "preturns", "writeoffs", "expenses", "shifts", "audit"]);
const clone = (o) => JSON.parse(JSON.stringify(o));

function setNet(ok) {
  const el = document.getElementById("saveState");
  if (el) el.textContent = ok ? "متصل بالخادم" : "غير متصل بالخادم — تحقق من الإنترنت";
  document.body.classList.toggle("netdown", !ok);
}
async function apiCall(method, url, body) {
  let r;
  try {
    r = await fetch(url, {
      method, credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    setNet(false);
    throw new Error("تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.");
  }
  setNet(true);
  let j = null;
  try { j = await r.json(); } catch (e) { /* empty body */ }
  if (r.status === 401 && url !== "/api/login") onSessionLost();
  if (!r.ok) {
    const e = new Error((j && j.error) || "خطأ في الخادم (" + r.status + ")");
    e.status = r.status; e.data = j;
    throw e;
  }
  return j;
}

function makeStore() {
  const mem = {}, revs = {}, subs = [], loaded = new Set();
  let lastSeen = 0, started = false, polling = false, pollTimer = null, winN = 3, chain = Promise.resolve();
  const seq = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  const path = (c, id) => c + "/" + id;
  const windowStart = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (winN - 1)); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const pendingEmit = new Set();
  const emit = (c) => {
    if (pendingEmit.has(c)) return;
    pendingEmit.add(c);
    setTimeout(() => { pendingEmit.delete(c); subs.forEach((s) => { if (s.c === c && s.ready) deliver(s); }); }, 0);
  };
  function listOf(c, limit, order) {
    let a = Object.entries(mem[c] || {}).map(([id, v]) => ({ ...v, id }));
    if (LOGS.has(c)) { const from = windowStart(); a = a.filter((r) => (r.ts || 0) >= from); a.sort((x, y) => (y.ts || 0) - (x.ts || 0)); }
    else if (order) a.sort((x, y) => (y[order] || 0) - (x[order] || 0));
    return limit ? a.slice(0, limit) : a;
  }
  function deliver(s) { try { s.cb(listOf(s.c, s.limit, s.order)); } catch (e) { console.error(e); } }
  const put = (c, id, data, rev) => { (mem[c] = mem[c] || {})[id] = data; if (rev) revs[path(c, id)] = rev; };
  const del = (c, id) => { if (mem[c]) delete mem[c][id]; delete revs[path(c, id)]; };

  async function pull(c, query) { // paged fetch of one collection
    let after = "", out = [];
    for (;;) {
      const r = await apiCall("GET", `/api/docs/${c}?limit=2000&after=${encodeURIComponent(after)}${query || ""}`);
      for (const d of r.docs) { put(c, d.id, d.data, d.rev); out.push(d.id); }
      if (!r.next) break;
      after = r.next;
    }
    return out;
  }
  async function loadColl(c) {
    if (loaded.has(c)) return;
    await pull(c, LOGS.has(c) ? "&from=" + windowStart() : "");
    loaded.add(c);
  }
  async function refreshDoc(c, id) {
    try { const r = await apiCall("GET", `/api/docs/${c}/${encodeURIComponent(id)}`); put(c, id, r.data, r.rev); emit(c); } catch (e) { /* gone */ }
  }

  async function poll() {
    if (!started || polling || document.hidden) return;
    polling = true;
    try {
      let since = Math.max(0, lastSeen - 3000);
      for (let guard = 0; guard < 20; guard++) {
        const r = await apiCall("GET", "/api/changes?since=" + since);
        const touched = new Set();
        for (const d of r.docs) {
          const p = path(d.c, d.id);
          if (!d.deleted && (revs[p] || 0) >= d.rev) continue;
          if (d.deleted) { if (mem[d.c] && mem[d.c][d.id]) { del(d.c, d.id); touched.add(d.c); } }
          else if (loaded.has(d.c) || mem[d.c]) { put(d.c, d.id, d.data, d.rev); touched.add(d.c); }
        }
        touched.forEach(emit);
        if (!r.more) { lastSeen = r.now; break; }
        since = r.next;
      }
    } catch (e) { /* offline: try again next tick */ }
    polling = false;
  }

  const api = {
    mode: "cloud",
    async start() {
      started = true;
      lastSeen = (await apiCall("GET", "/api/time")).now;
      pollTimer = setInterval(poll, 5000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    },
    reset() {
      started = false; clearInterval(pollTimer); loaded.clear(); subs.length = 0;
      for (const k of Object.keys(mem)) delete mem[k];
      for (const k of Object.keys(revs)) delete revs[k];
    },
    status() {},
    pending: () => 0,
    flush: async () => {},
    synced: () => true,
    setWindow(n) { winN = Math.max(1, n | 0); LOGS.forEach((c) => { loaded.delete(c); }); subs.forEach((s) => { if (LOGS.has(s.c)) loadColl(s.c).then(() => emit(s.c)); }); },

    save(c, id, obj) {
      return seq(async () => {
        const d = clone(obj), p = path(c, id);
        try {
          const r = await apiCall("PUT", `/api/docs/${c}/${encodeURIComponent(id)}`, { data: d, rev: revs[p] });
          if (c === "audit") { d.ts = Date.now(); d.by = me ? me.name : ""; }
          put(c, id, d, r.rev); emit(c);
        } catch (e) {
          if (e.status === 409) { await refreshDoc(c, id); throw new Error("تم تعديل هذا السجل من جهاز آخر. حُدِّثت البيانات، أعد المحاولة."); }
          throw e;
        }
      });
    },
    remove(c, id) {
      return seq(async () => { await apiCall("DELETE", `/api/docs/${c}/${encodeURIComponent(id)}`); del(c, id); emit(c); });
    },
    async getDoc(c, id) {
      if (c === "catalog") { // static files shipped with the site
        if (mem.catalog && mem.catalog[id]) return mem.catalog[id];
        const r = await fetch(`/catalog/${id}.json`);
        if (!r.ok) return null;
        const d = await r.json(); put("catalog", id, d); return d;
      }
      if (mem[c] && mem[c][id]) return mem[c][id];
      try { const r = await apiCall("GET", `/api/docs/${c}/${encodeURIComponent(id)}`); put(c, id, r.data, r.rev); return r.data; } catch (e) { return null; }
    },
    async all(c) { // every document of a collection (used by backup)
      await pull(c, "");
      return Object.entries(mem[c] || {}).map(([id, data]) => ({ id, data }));
    },
    async loadRange(c, from, to) { // rows whose ts falls in months from..to ("YYYY-MM")
      const a = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, 1).getTime();
      const b = new Date(+to.slice(0, 4), +to.slice(5, 7), 1).getTime();
      await pull(c, `&from=${a}&to=${b}`);
      return Object.entries(mem[c] || {}).map(([id, v]) => ({ ...v, id })).filter((r) => (r.ts || 0) >= a && (r.ts || 0) < b);
    },
    async bulk(c, items) { // restore: many documents per request
      await apiCall("POST", "/api/batch", { ops: items.map((x) => ({ coll: c, id: x.id, data: x.data })) });
      items.forEach((x) => put(c, x.id, x.data)); emit(c);
    },
    async nextNo(name, min) { return (await apiCall("POST", "/api/next/" + name, { min: min || 0 })).no; },
    watch(c, limit, order, cb) {
      const s = { c, limit, order, cb, ready: false };
      subs.push(s);
      const go = () => loadColl(c).then(() => { s.ready = true; deliver(s); }).catch(() => { if (started && subs.includes(s)) setTimeout(go, 3000); });
      go();
    },
  };
  return api;
}
