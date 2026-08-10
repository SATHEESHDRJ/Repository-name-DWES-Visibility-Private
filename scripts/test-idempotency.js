const http = require('http');

const makeRequest = (key) => {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/tech/assign-frame',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': key,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    req.write(JSON.stringify({ project_code: 'TEST', frame_id: 'F1', technician_id: 1 }));
    req.end();
  });
};

async function run() {
  const key = 'test-key-' + Date.now();
  console.log(`Sending 10 concurrent requests with key ${key}...`);
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(makeRequest(key));
  }
  
  const results = await Promise.all(promises);
  const statuses = results.map(r => r.status || r.error);
  console.log('Results:', statuses);
  
  const statusCounts = {};
  for (const s of statuses) {
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log('Summary:', statusCounts);
}

run();
