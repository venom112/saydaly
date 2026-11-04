/* Local server: serves public/ and runs the Worker on top of a SQLite file (no Cloudflare account needed).
   Usage: node tests/dev-server.mjs [port] [dbfile] */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { makeD1 } from "./d1shim.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

function globalHeaders() { // emulate public/_headers ("/*" block) so CSP problems show up locally
  const h = {};
  try {
    let on = false;
    for (const line of fs.readFileSync(path.join(root, "_headers"), "utf8").split("\n")) {
      if (/^\S/.test(line)) on = line.trim() === "/*";
      else if (on && line.includes(":")) { const i = line.indexOf(":"); h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    }
  } catch { /* none */ }
  return h;
}
export function startServer(port = 8787, dbFile = ":memory:", extraEnv = {}) {
  const env = {
    DB: makeD1(dbFile),
    ...extraEnv,
    ASSETS: {
      async fetch(req) {
        let p = new URL(req.url).pathname;
        if (p === "/") p = "/index.html";
        const f = path.join(root, p);
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response("not found", { status: 404 });
        return new Response(fs.readFileSync(f), { headers: { "content-type": types[path.extname(f)] || "application/octet-stream", ...globalHeaders() } });
      },
    },
  };
  const server = http.createServer(async (rq, rs) => {
    const chunks = [];
    for await (const c of rq) chunks.push(c);
    const url = `http://${rq.headers.host}${rq.url}`;
    const req = new Request(url, { method: rq.method, headers: rq.headers, body: ["GET", "HEAD"].includes(rq.method) ? undefined : Buffer.concat(chunks) });
    const res = await worker.fetch(req, env);
    const headers = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (sc.length) headers["set-cookie"] = sc;
    rs.writeHead(res.status, headers);
    rs.end(Buffer.from(await res.arrayBuffer()));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8787;
  await startServer(port, process.argv[3] || ":memory:");
  console.log("http://localhost:" + port + "  (admin / admin)");
}
