/* Minimal D1-compatible wrapper over node:sqlite, used by the local dev server and the tests. */
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.db, this.sql); s.args = a.map((x) => (x === undefined ? null : x)); return s; }
  _run() { return this.db.prepare(this.sql); }
  async first() { return this._run().get(...this.args) ?? null; }
  async all() { return { results: this._run().all(...this.args), success: true }; }
  async run() { const r = this._run().run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
}
export function makeD1(file = ":memory:") {
  const db = new DatabaseSync(file);
  return {
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(s.sql.match(/RETURNING/i) ? { results: s._run().all(...s.args) } : { meta: s._run().run(...s.args) });
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
