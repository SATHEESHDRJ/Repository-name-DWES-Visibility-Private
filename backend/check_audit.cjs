const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB' });
client.connect().then(async () => {
  const res = await client.query("SELECT * FROM tech_audit_log WHERE action='cable_skip' AND (panel_name LIKE '%H001%' OR frame_id LIKE '%H001%')");
  console.log(JSON.stringify(res.rows, null, 2));
  client.end();
});
