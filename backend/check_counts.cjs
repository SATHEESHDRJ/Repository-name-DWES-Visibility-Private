const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB' });
client.connect().then(async () => {
  const tables = ['panel_models', 'device_geometries', 'terminal_geometries', 'duct_nodes', 'duct_segments', 'cable_route_mappings'];
  for (const table of tables) {
    try {
      const res = await client.query('SELECT count(*) FROM ' + table);
      console.log(table, res.rows[0].count);
    } catch (e) {
      console.log(table, 'error:', e.message);
    }
  }
  client.end();
});
