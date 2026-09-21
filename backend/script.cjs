const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB' });
client.connect().then(async () => {
  const res = await client.query("UPDATE tech_audit_log SET details = '[TEST] ' || COALESCE(details, '') WHERE action = 'cable_skip' AND (panel_name LIKE '%H001%' OR frame_id LIKE '%H001%') RETURNING *");
  console.log('Updated rows:', res.rows);
  client.end();
}).catch(console.error);
