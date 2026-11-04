/* API tests: node --test tests/ */
import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./dev-server.mjs";

const PORT = 8799, B = `http://localhost:${PORT}`;
let server, cookie = "";
const call = async (method, url, body, ck = cookie) => {
  const r = await fetch(B + url, { method, headers: { "content-type": "application/json", ...(ck ? { cookie: ck } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.getSetCookie?.()[0];
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j, sc };
};
const login = async (u, p) => { const r = await call("POST", "/api/login", { username: u, password: p }, ""); return r.sc ? { ...r, ck: r.sc.split(";")[0] } : r; };

test.before(async () => { server = await startServer(PORT); });
test.after(() => server.close());

test("requires login; wrong password rejected", async () => {
  assert.equal((await call("GET", "/api/docs/products", undefined, "")).s, 401);
  assert.equal((await login("admin", "nope")).s, 401);
});
test("default admin logs in and must change password", async () => {
  const r = await login("admin", "admin");
  assert.equal(r.s, 200); assert.equal(r.j.user.mustChange, true); cookie = r.ck;
  assert.match(r.sc, /HttpOnly/); assert.match(r.sc, /SameSite=Strict/);
});
test("documents: create, optimistic lock, list, soft delete", async () => {
  const a = await call("PUT", "/api/docs/products/p1", { data: { name: "بانادول", batches: [] } });
  assert.equal(a.s, 200); assert.equal(a.j.rev, 1);
  const b = await call("PUT", "/api/docs/products/p1", { data: { name: "بانادول 2" }, rev: 1 });
  assert.equal(b.j.rev, 2);
  const stale = await call("PUT", "/api/docs/products/p1", { data: { name: "x" }, rev: 1 });
  assert.equal(stale.s, 409);
  const l = await call("GET", "/api/docs/products");
  assert.equal(l.j.docs.length, 1); assert.equal(l.j.docs[0].data.name, "بانادول 2");
  assert.equal((await call("DELETE", "/api/docs/products/p1")).s, 200);
  assert.equal((await call("GET", "/api/docs/products")).j.docs.length, 0);
});
test("log collections: range query and no delete", async () => {
  const t = Date.UTC(2026, 0, 15);
  await call("PUT", "/api/docs/sales/s1", { data: { no: 1001, ts: t, total: 10 } });
  await call("PUT", "/api/docs/sales/s2", { data: { no: 1002, ts: t + 90 * 864e5, total: 20 } });
  const r = await call("GET", `/api/docs/sales?from=${t - 1000}&to=${t + 864e5}`);
  assert.deepEqual(r.j.docs.map((d) => d.id), ["s1"]);
  assert.equal((await call("DELETE", "/api/docs/sales/s1")).s, 403);
});
test("invoice numbers come from the server and never repeat", async () => {
  const a = (await call("POST", "/api/next/sales", { min: 1000 })).j.no, b = (await call("POST", "/api/next/sales", { min: 1000 })).j.no;
  assert.ok(b === a + 1 && a > 1002, `${a},${b}`);
});
test("audit log is append-only, stamped by server, admin-only read", async () => {
  await call("PUT", "/api/docs/audit/a1", { data: { act: "x", by: "spoof", ts: 1 } });
  assert.equal((await call("PUT", "/api/docs/audit/a1", { data: { act: "y" } })).s, 403);
  const l = await call("GET", "/api/docs/audit");
  const row = l.j.docs.find((d) => d.id === "a1").data;
  assert.equal(row.by, "المدير"); assert.ok(row.ts > 1000);
});
test("user management, permissions and sessions", async () => {
  const c = await call("POST", "/api/users", { username: "Cash1", name: "كاشير", password: "1234", perms: { tabs: { sale: true }, acts: {} } });
  assert.equal(c.s, 200); assert.equal(c.j.user.username, "cash1");
  assert.equal((await call("POST", "/api/users", { username: "cash1", name: "x", password: "1234" })).s, 409);
  const u = await login("cash1", "1234"); assert.equal(u.s, 200);
  const ck = u.ck;
  assert.equal((await call("GET", "/api/users", undefined, ck)).s, 403);
  assert.equal((await call("PUT", "/api/docs/meta/settings", { data: { name: "x" } }, ck)).s, 403);
  assert.equal((await call("GET", "/api/docs/audit", undefined, ck)).s, 403);
  assert.equal((await call("PUT", "/api/docs/products/p9", { data: { name: "n" } }, ck)).s, 200);
  assert.equal((await call("DELETE", "/api/docs/products/p9", undefined, ck)).s, 403);
  // disabling kills the session
  await call("POST", "/api/users", { id: c.j.user.id, name: "كاشير", active: false, perms: {} });
  assert.equal((await call("GET", "/api/me", undefined, ck)).s, 401);
  assert.equal((await login("cash1", "1234")).s, 401);
});
test("changes feed returns updates and deletions", async () => {
  const t0 = (await call("GET", "/api/time")).j.now;
  await call("PUT", "/api/docs/parties/c1", { data: { name: "عميل" } });
  await call("DELETE", "/api/docs/products/p9");
  const r = await call("GET", `/api/changes?since=${t0 - 5}`);
  assert.ok(r.j.docs.some((d) => d.c === "parties" && d.id === "c1" && !d.deleted));
});
test("login lockout after 5 failures", async () => {
  await call("POST", "/api/users", { username: "bob", name: "Bob", password: "abcd" });
  for (let i = 0; i < 5; i++) await login("bob", "bad");
  assert.equal((await login("bob", "abcd")).s, 429);
});
test("own password change; cross-site writes refused", async () => {
  assert.equal((await call("POST", "/api/password", { oldPassword: "wrong", newPassword: "newpass" })).s, 403);
  assert.equal((await call("POST", "/api/password", { oldPassword: "admin", newPassword: "newpass" })).s, 200);
  assert.equal((await login("admin", "admin")).s, 401);
  const r = await login("admin", "newpass"); assert.equal(r.s, 200); cookie = r.ck; assert.equal(r.j.user.mustChange, false);
  const x = await fetch(B + "/api/docs/products/zz", { method: "PUT", headers: { "content-type": "application/json", cookie, origin: "https://evil.example" }, body: JSON.stringify({ data: { a: 1 } }) });
  assert.equal(x.status, 403);
});
