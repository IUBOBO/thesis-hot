import pg from "pg";

const c = new pg.Client({ connectionString: "postgres://postgres@127.0.0.1:5432/myhot" });
await c.connect();
const total = await c.query("select count(*)::int n from articles");
const bySource = await c.query("select source_id, count(*)::int n from articles group by 1 order by 2 desc limit 6");
const withBody = await c.query("select count(*)::int n from articles where body_status = 'ok'");
const pubs = await c.query("select count(*)::int n from publications");
console.log("articles:", total.rows[0].n, "| with body:", withBody.rows[0].n, "| publications:", pubs.rows[0].n);
console.log(bySource.rows.map((r) => `${r.source_id}:${r.n}`).join("  "));
await c.end();
