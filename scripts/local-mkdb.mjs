import pg from "pg";

const client = new pg.Client({ connectionString: process.argv[2] });
await client.connect();
for (const name of ["myhot", "myhot_test"]) {
  const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (found.rowCount === 0) {
    await client.query(`CREATE DATABASE ${name}`);
    console.log("created", name);
  } else {
    console.log("exists", name);
  }
}
await client.end();
