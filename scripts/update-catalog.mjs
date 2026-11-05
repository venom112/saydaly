/* Refreshes public/catalog/*.json from an upstream CSV (default: the open Egyptian drug dataset).
   Usage:  node scripts/update-catalog.mjs            (uses CATALOG_SOURCE_URL or the default)
           CATALOG_SOURCE_URL=file:///path/to/drugs.csv node scripts/update-catalog.mjs
   Writes nothing when the data is unchanged. Refuses to overwrite when the new file looks broken. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://raw.githubusercontent.com/karem505/egyptian-drug-database/main/data/egyptian-drugs.csv";
const url = process.env.CATALOG_SOURCE_URL || DEFAULT_URL;
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "catalog");
const CHUNK = 400, MIN_ROWS = 15000, MAX_DROP = 0.15;
const COLS = ["commercial_name_en", "commercial_name_ar", "scientific_name", "manufacturer", "drug_class", "route", "price_egp"];

function parseCsv(text) { // RFC-4180 style: quotes, escaped quotes, CRLF
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const keyOf = (r) => r[0].toLowerCase() + "|" + r[3].toLowerCase();

async function download(u) {
  if (u.startsWith("file://")) return fs.readFileSync(new URL(u), "utf8");
  const r = await fetch(u, { headers: { "user-agent": "saydaly-catalog-updater" } });
  if (!r.ok) throw new Error(`تعذر تنزيل المصدر (${r.status}) ${u}`);
  return r.text();
}
function readCurrent() {
  const rows = []; let meta = null;
  for (let i = 0; ; i++) {
    const f = path.join(dir, "c" + String(i).padStart(3, "0") + ".json");
    if (!fs.existsSync(f)) break;
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    rows.push(...d.rows); if (i === 0) meta = d;
  }
  return { rows, meta };
}

const text = (await download(url)).replace(/^﻿/, "");
const table = parseCsv(text);
const head = table.shift().map((h) => h.trim());
for (const c of COLS) if (!head.includes(c)) throw new Error("العمود غير موجود في المصدر: " + c);
const ix = Object.fromEntries(COLS.map((c) => [c, head.indexOf(c)]));
const rows = [];
for (const r of table) {
  const en = (r[ix.commercial_name_en] || "").trim();
  if (!en) continue;
  const p = String(r[ix.price_egp] || "").replace(/[^\d.]/g, "");
  const price = p && isFinite(parseFloat(p)) ? Math.round(parseFloat(p) * 100) / 100 : 0;
  const row = [en, ...[1, 2, 3, 4, 5].map((k) => (r[ix[COLS[k]]] || "").trim()), price];
  rows.push(row);
}
if (rows.length < MIN_ROWS) throw new Error(`المصدر يحتوي ${rows.length} صنفا فقط (الحد الأدنى ${MIN_ROWS}). لن يتم التحديث.`);
const priced = rows.filter((r) => r[6] > 0).length;
if (priced < rows.length * 0.5) throw new Error("أقل من نصف الأصناف لها سعر. المصدر يبدو معطوبا. لن يتم التحديث.");

const { rows: oldRows, meta } = readCurrent();
if (oldRows.length && rows.length < oldRows.length * (1 - MAX_DROP)) throw new Error(`عدد الأصناف انخفض من ${oldRows.length} إلى ${rows.length} (أكثر من ${MAX_DROP * 100}%). لن يتم التحديث تلقائيا.`);

const hash = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16);
if (meta && meta.hash === hash) { console.log("لا تغييرات في الدليل (" + rows.length + " صنف)."); process.exit(0); }

const oldMap = new Map(oldRows.map((r) => [keyOf(r), r])), newMap = new Map(rows.map((r) => [keyOf(r), r]));
let added = 0, removed = 0, priceChanged = 0;
for (const [k, r] of newMap) { const o = oldMap.get(k); if (!o) added++; else if (o[6] !== r[6]) priceChanged++; }
for (const k of oldMap.keys()) if (!newMap.has(k)) removed++;

const at = new Date().toISOString();
const n = Math.ceil(rows.length / CHUNK);
for (let i = 0; i < n; i++) {
  const d = { rows: rows.slice(i * CHUNK, (i + 1) * CHUNK) };
  if (i === 0) Object.assign(d, { count: rows.length, at, source: process.env.CATALOG_SOURCE_LABEL || (url.startsWith("file://") ? "ملف محلي" : new URL(url).host + new URL(url).pathname), hash, changes: { added, removed, priceChanged } });
  fs.writeFileSync(path.join(dir, "c" + String(i).padStart(3, "0") + ".json"), JSON.stringify(d));
}
for (let i = n; ; i++) { const f = path.join(dir, "c" + String(i).padStart(3, "0") + ".json"); if (!fs.existsSync(f)) break; fs.unlinkSync(f); }
console.log(`تم تحديث الدليل: ${rows.length} صنف · جديد ${added} · محذوف ${removed} · تغيّر سعره ${priceChanged}`);
