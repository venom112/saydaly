/* Pharmacy system API — Cloudflare Worker + D1.
   Static files (public/) are served by the assets binding; everything under /api/* is handled here. */
import { SCHEMA } from "./schema.js";

const COLLS = new Set(["products", "sales", "purchases", "counts", "parties", "ledger", "sreturns", "preturns", "writeoffs", "expenses", "shifts", "audit", "meta"]);
const NO_DELETE = new Set(["sales", "purchases", "counts", "ledger", "sreturns", "preturns", "writeoffs", "expenses", "shifts", "audit"]);
const ADMIN_READ = new Set(["audit"]);
const ADMIN_WRITE = new Set(["meta"]);
const NUMBERED = { sales: "sales", purchases: "purchases", sreturns: "sreturns", preturns: "preturns" };
const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const USER_RE = /^[a-z0-9._-]{3,30}$/;
const MAX_DOC = 900_000;
const PBKDF2_ITER = 100_000; // Workers cap PBKDF2 at 100k iterations

const enc = new TextEncoder();
const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const fail = (status, error, extra) => json({ error, ...(extra || {}) }, status);

/* ---------- crypto helpers ---------- */
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
const randHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return toHex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PBKDF2_ITER }, key, 256));
}
async function sha256(text) { return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function makeCred(password) { const salt = randHex(16); return { salt, hash: await pbkdf2(password, salt) }; }

/* ---------- schema + seed ---------- */
let ready = null;
function ensureReady(env) {
  if (!ready) {
    ready = (async () => {
      await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
      if (!n.n) {
        const pw = env.ADMIN_PASSWORD || "admin";
        const c = await makeCred(pw);
        await env.DB.prepare("INSERT OR IGNORE INTO users(id,username,name,role,active,perms,salt,hash,must_change,created) VALUES('admin','admin','المدير','admin',1,'{}',?1,?2,?3,?4)")
          .bind(c.salt, c.hash, env.ADMIN_PASSWORD ? 0 : 1, Date.now()).run();
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/* ---------- users / sessions ---------- */
const pubUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active, perms: JSON.parse(u.perms || "{}"), mustChange: !!u.must_change, createdAt: u.created });
const cookieOf = (req, name) => {
  const m = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
};
const sessionHours = (env) => Number(env.SESSION_HOURS) || 12;
function setCookie(token, env, maxAge) {
  return `ph_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
async function authenticate(req, env) {
  const token = cookieOf(req, "ph_session");
  if (!token) return null;
  const th = await sha256(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT u.*, s.expires AS s_exp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?1 AND s.expires>?2 AND u.active=1"
  ).bind(th, now).first();
  if (!row) return null;
  const ttl = sessionHours(env) * 3600_000;
  if (row.s_exp - now < ttl / 2) await env.DB.prepare("UPDATE sessions SET expires=?1 WHERE token_hash=?2").bind(now + ttl, th).run();
  row._th = th;
  return row;
}
async function writeAudit(env, user, act, detail, ref) {
  const id = Date.now().toString(36) + randHex(3);
  const data = { ts: Date.now(), by: user ? user.name : "", act, detail: detail || "", ref: ref || "" };
  await env.DB.prepare("INSERT INTO docs(coll,id,data,ts,rev,updated,deleted) VALUES('audit',?1,?2,?3,1,?3,0)").bind(id, JSON.stringify(data), data.ts).run();
}
const isAdmin = (u) => u.role === "admin";
const perms = (u) => { try { return JSON.parse(u.perms || "{}"); } catch { return {}; } };

/* ---------- docs ---------- */
function docStatement(env, coll, id, dataText, ts, now) {
  return env.DB.prepare(
    "INSERT INTO docs(coll,id,data,ts,rev,updated,deleted) VALUES(?1,?2,?3,?4,1,?5,0) " +
    "ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data,ts=excluded.ts,rev=docs.rev+1,updated=excluded.updated,deleted=0 RETURNING rev"
  ).bind(coll, id, dataText, ts, now);
}
async function bumpCounter(env, coll, data) {
  const name = NUMBERED[coll];
  if (!name || !data || typeof data.no !== "number" || !isFinite(data.no)) return;
  await env.DB.prepare("INSERT INTO counters(name,value) VALUES(?1,?2) ON CONFLICT(name) DO UPDATE SET value=MAX(value,?2)").bind(name, Math.floor(data.no)).run();
}
function checkDoc(coll, id, data) {
  if (!COLLS.has(coll)) return "مجموعة غير معروفة";
  if (!ID_RE.test(id)) return "معرّف غير صالح";
  if (!data || typeof data !== "object" || Array.isArray(data)) return "بيانات غير صالحة";
  return null;
}

async function handleDocs(req, env, user, url, parts) {
  const coll = parts[2], id = parts[3] ? decodeURIComponent(parts[3]) : null;
  if (!COLLS.has(coll)) return fail(404, "مجموعة غير معروفة");
  const method = req.method;

  if (method === "GET" && !id) {
    if (ADMIN_READ.has(coll) && !isAdmin(user)) return fail(403, "غير مسموح");
    const from = url.searchParams.get("from"), to = url.searchParams.get("to"), after = url.searchParams.get("after") || "";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit")) || 2000, 1), 5000);
    let sql = "SELECT id,rev,data FROM docs WHERE coll=?1 AND deleted=0 AND id>?2";
    const args = [coll, after];
    if (from) { args.push(Number(from)); sql += ` AND ts>=?${args.length}`; }
    if (to) { args.push(Number(to)); sql += ` AND ts<?${args.length}`; }
    args.push(limit + 1);
    sql += ` ORDER BY id LIMIT ?${args.length}`;
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    const more = results.length > limit;
    const rows = more ? results.slice(0, limit) : results;
    const body = `{"docs":[${rows.map((r) => `{"id":${JSON.stringify(r.id)},"rev":${r.rev},"data":${r.data}}`).join(",")}],"next":${more ? JSON.stringify(rows[rows.length - 1].id) : "null"}}`;
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (method === "GET" && id) {
    if (ADMIN_READ.has(coll) && !isAdmin(user)) return fail(403, "غير مسموح");
    const r = await env.DB.prepare("SELECT rev,data FROM docs WHERE coll=?1 AND id=?2 AND deleted=0").bind(coll, id).first();
    if (!r) return fail(404, "غير موجود");
    return new Response(`{"rev":${r.rev},"data":${r.data}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (method === "PUT" && id) {
    let b; try { b = await req.json(); } catch { return fail(400, "JSON غير صالح"); }
    const bad = checkDoc(coll, id, b.data); if (bad) return fail(400, bad);
    if (ADMIN_WRITE.has(coll) && !isAdmin(user)) return fail(403, "هذه البيانات للمدير فقط");
    const now = Date.now();
    if (coll === "audit") { b.data.ts = now; b.data.by = user.name; }
    const text = JSON.stringify(b.data);
    if (text.length > MAX_DOC) return fail(413, "المستند كبير جدا");
    const ts = typeof b.data.ts === "number" ? Math.floor(b.data.ts) : now;
    const ex = await env.DB.prepare("SELECT rev,deleted FROM docs WHERE coll=?1 AND id=?2").bind(coll, id).first();
    if (coll === "audit" && ex) return fail(403, "سجل العمليات لا يُعدَّل");
    if (ex && !ex.deleted && typeof b.rev === "number") {
      const r = await env.DB.prepare("UPDATE docs SET data=?3,ts=?4,rev=rev+1,updated=?5 WHERE coll=?1 AND id=?2 AND rev=?6 AND deleted=0 RETURNING rev")
        .bind(coll, id, text, ts, now, b.rev).first();
      if (!r) { const cur = await env.DB.prepare("SELECT rev FROM docs WHERE coll=?1 AND id=?2").bind(coll, id).first(); return fail(409, "conflict", { rev: cur ? cur.rev : 0 }); }
      await bumpCounter(env, coll, b.data);
      return json({ rev: r.rev });
    }
    const r = await docStatement(env, coll, id, text, ts, now).first();
    await bumpCounter(env, coll, b.data);
    return json({ rev: r.rev });
  }
  if (method === "DELETE" && id) {
    if (NO_DELETE.has(coll)) return fail(403, "لا يمكن حذف هذا النوع. استخدم الإلغاء");
    if (ADMIN_WRITE.has(coll) && !isAdmin(user)) return fail(403, "هذه البيانات للمدير فقط");
    if (coll === "products" && !isAdmin(user) && !(perms(user).acts || {}).editItems) return fail(403, "ليس لديك صلاحية حذف الأصناف");
    await env.DB.prepare("UPDATE docs SET deleted=1,rev=rev+1,updated=?3 WHERE coll=?1 AND id=?2").bind(coll, id, Date.now()).run();
    return json({ ok: true });
  }
  return fail(405, "طريقة غير مدعومة");
}

async function handleBatch(req, env, user) {
  if (!isAdmin(user)) return fail(403, "للمدير فقط");
  let b; try { b = await req.json(); } catch { return fail(400, "JSON غير صالح"); }
  if (!Array.isArray(b.ops) || b.ops.length > 100) return fail(400, "عدد العمليات غير صالح");
  const now = Date.now(), stmts = [];
  for (const o of b.ops) {
    const bad = checkDoc(o.coll, String(o.id), o.data); if (bad) return fail(400, bad);
    if (o.coll === "audit") continue;
    const text = JSON.stringify(o.data);
    if (text.length > MAX_DOC) return fail(413, "مستند كبير جدا");
    stmts.push(docStatement(env, o.coll, String(o.id), text, typeof o.data.ts === "number" ? Math.floor(o.data.ts) : now, now));
  }
  if (stmts.length) await env.DB.batch(stmts);
  for (const o of b.ops) await bumpCounter(env, o.coll, o.data);
  return json({ ok: true, n: stmts.length });
}

async function handleChanges(env, user, url) {
  const since = Number(url.searchParams.get("since")) || 0;
  const limit = 3000;
  const { results } = await env.DB.prepare(
    "SELECT coll,id,rev,deleted,updated,data FROM docs WHERE updated>=?1" + (isAdmin(user) ? "" : " AND coll!='audit'") + " ORDER BY updated,coll,id LIMIT ?2"
  ).bind(since, limit + 1).all();
  const more = results.length > limit, rows = more ? results.slice(0, limit) : results;
  const next = rows.length ? rows[rows.length - 1].updated : since;
  const body = `{"now":${Date.now()},"more":${more},"next":${next},"docs":[${rows.map((r) =>
    `{"c":${JSON.stringify(r.coll)},"id":${JSON.stringify(r.id)},"rev":${r.rev},"deleted":${r.deleted ? "true" : "false"},"data":${r.deleted ? "null" : r.data}}`).join(",")}]}`;
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/* ---------- auth endpoints ---------- */
async function handleLogin(req, env) {
  let b; try { b = await req.json(); } catch { return fail(400, "JSON غير صالح"); }
  const username = String(b.username || "").trim().toLowerCase(), password = String(b.password || "");
  if (!username || !password) return fail(400, "أدخل اسم المستخدم وكلمة المرور");
  const key = "u:" + username, now = Date.now();
  const att = await env.DB.prepare("SELECT fails,locked_until FROM login_attempts WHERE key=?1").bind(key).first();
  if (att && att.locked_until > now) return fail(429, `محاولات كثيرة. انتظر ${Math.ceil((att.locked_until - now) / 1000)} ثانية.`);
  const u = await env.DB.prepare("SELECT * FROM users WHERE username=?1").bind(username).first();
  const hash = u ? await pbkdf2(password, u.salt) : await pbkdf2(password, "00".repeat(16)); // equalise timing
  if (!u || !u.active || !safeEq(hash, u.hash)) {
    const fails = (att ? att.fails : 0) + 1;
    await env.DB.prepare("INSERT INTO login_attempts(key,fails,locked_until) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET fails=?2,locked_until=?3")
      .bind(key, fails >= 5 ? 0 : fails, fails >= 5 ? now + 5 * 60_000 : 0).run();
    await writeAudit(env, null, "محاولة دخول فاشلة", username);
    return fail(401, "اسم المستخدم أو كلمة المرور غير صحيحة");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE key=?1").bind(key).run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires<?1").bind(now).run();
  const token = randHex(32), ttl = sessionHours(env) * 3600_000;
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires,created) VALUES(?1,?2,?3,?4)").bind(await sha256(token), u.id, now + ttl, now).run();
  await writeAudit(env, u, "تسجيل دخول", "");
  return json({ user: pubUser(u) }, 200, { "set-cookie": setCookie(token, env, ttl / 1000) });
}
async function handleLogout(env, user) {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?1").bind(user._th).run();
  return json({ ok: true }, 200, { "set-cookie": "ph_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
}
async function handlePassword(req, env, user) {
  let b; try { b = await req.json(); } catch { return fail(400, "JSON غير صالح"); }
  const np = String(b.newPassword || "");
  if (np.length < 4) return fail(400, "كلمة المرور 4 أحرف على الأقل");
  if (!safeEq(await pbkdf2(String(b.oldPassword || ""), user.salt), user.hash)) return fail(403, "كلمة المرور الحالية غير صحيحة");
  const c = await makeCred(np);
  await env.DB.prepare("UPDATE users SET salt=?1,hash=?2,must_change=0 WHERE id=?3").bind(c.salt, c.hash, user.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?1 AND token_hash!=?2").bind(user.id, user._th).run();
  await writeAudit(env, user, "تغيير كلمة سر", user.name);
  return json({ ok: true });
}

async function handleUsers(req, env, user, url, parts) {
  if (!isAdmin(user)) return fail(403, "للمدير فقط");
  const uid = parts[2] ? decodeURIComponent(parts[2]) : null;
  if (req.method === "GET" && !uid) {
    const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY created").all();
    return json({ users: results.map(pubUser) });
  }
  if (req.method === "POST" && !uid) {
    let b; try { b = await req.json(); } catch { return fail(400, "JSON غير صالح"); }
    const name = String(b.name || "").trim();
    if (!name) return fail(400, "الاسم مطلوب");
    const permsText = JSON.stringify({ tabs: (b.perms && b.perms.tabs) || {}, acts: (b.perms && b.perms.acts) || {} });
    if (b.id) { // update
      const u = await env.DB.prepare("SELECT * FROM users WHERE id=?1").bind(String(b.id)).first();
      if (!u) return fail(404, "المستخدم غير موجود");
      const adm = u.role === "admin";
      let salt = u.salt, hash = u.hash, must = u.must_change;
      if (b.password) { if (String(b.password).length < 4) return fail(400, "كلمة المرور 4 أحرف على الأقل"); ({ salt, hash } = await makeCred(String(b.password))); must = 0; }
      await env.DB.prepare("UPDATE users SET name=?2,active=?3,perms=?4,salt=?5,hash=?6,must_change=?7 WHERE id=?1")
        .bind(u.id, name, adm ? 1 : (b.active === false ? 0 : 1), adm ? "{}" : permsText, salt, hash, must).run();
      if (b.password || (!adm && b.active === false)) await env.DB.prepare("DELETE FROM sessions WHERE user_id=?1").bind(u.id).run();
      await writeAudit(env, user, "تعديل مستخدم/صلاحيات", name + (b.active === false ? " (معطّل)" : "") + (b.password ? " · كلمة سر جديدة" : ""));
      const nu = await env.DB.prepare("SELECT * FROM users WHERE id=?1").bind(u.id).first();
      return json({ user: pubUser(nu) });
    }
    const username = String(b.username || "").trim().toLowerCase();
    if (!USER_RE.test(username)) return fail(400, "اسم المستخدم 3-30 حرفا إنجليزيا أو أرقاما");
    if (String(b.password || "").length < 4) return fail(400, "كلمة المرور 4 أحرف على الأقل");
    const ex = await env.DB.prepare("SELECT 1 AS x FROM users WHERE username=?1").bind(username).first();
    if (ex) return fail(409, "اسم المستخدم مستخدم بالفعل");
    const id = "u" + randHex(6), c = await makeCred(String(b.password));
    await env.DB.prepare("INSERT INTO users(id,username,name,role,active,perms,salt,hash,must_change,created) VALUES(?1,?2,?3,'user',?4,?5,?6,?7,0,?8)")
      .bind(id, username, name, b.active === false ? 0 : 1, permsText, c.salt, c.hash, Date.now()).run();
    await writeAudit(env, user, "إنشاء مستخدم", name + " (" + username + ")");
    const nu = await env.DB.prepare("SELECT * FROM users WHERE id=?1").bind(id).first();
    return json({ user: pubUser(nu) });
  }
  if (req.method === "DELETE" && uid) {
    const u = await env.DB.prepare("SELECT * FROM users WHERE id=?1").bind(uid).first();
    if (!u) return fail(404, "المستخدم غير موجود");
    if (u.role === "admin") return fail(403, "لا يمكن حذف حساب المدير");
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=?1").bind(uid).run();
    await env.DB.prepare("DELETE FROM users WHERE id=?1").bind(uid).run();
    await writeAudit(env, user, "حذف مستخدم", u.name);
    return json({ ok: true });
  }
  return fail(405, "طريقة غير مدعومة");
}

async function handleNext(req, env, name) {
  if (!Object.values(NUMBERED).includes(name)) return fail(404, "غير معروف");
  let b = {}; try { b = await req.json(); } catch { /* optional body */ }
  const min = Math.max(0, Math.floor(Number(b.min) || 0));
  const r = await env.DB.prepare("INSERT INTO counters(name,value) VALUES(?1,?2+1) ON CONFLICT(name) DO UPDATE SET value=MAX(value,?2)+1 RETURNING value")
    .bind(name, min).first();
  return json({ no: r.value });
}

/* ---------- router ---------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      await ensureReady(env);
      const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
      const method = req.method;
      if (method !== "GET" && method !== "HEAD") { // CSRF: same-origin only
        const origin = req.headers.get("origin");
        if (origin && origin !== url.origin) return fail(403, "طلب مرفوض");
      }
      if (parts[1] === "login" && method === "POST") return await handleLogin(req, env);
      if (parts[1] === "health") return json({ ok: true });
      const user = await authenticate(req, env);
      if (!user) return fail(401, "يلزم تسجيل الدخول");
      switch (parts[1]) {
        case "me": return json({ user: pubUser(user), now: Date.now() });
        case "time": return json({ now: Date.now() });
        case "logout": return await handleLogout(env, user);
        case "password": return await handlePassword(req, env, user);
        case "users": return await handleUsers(req, env, user, url, parts);
        case "docs": return await handleDocs(req, env, user, url, parts);
        case "batch": return await handleBatch(req, env, user);
        case "changes": return await handleChanges(env, user, url);
        case "next": return await handleNext(req, env, parts[2]);
      }
      return fail(404, "غير موجود");
    } catch (e) {
      console.error(e);
      return fail(500, "خطأ داخلي في الخادم");
    }
  },
};
