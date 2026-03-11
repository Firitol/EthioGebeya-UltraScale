const { spawn } = require('node:child_process');

const BASE = 'http://127.0.0.1:3000';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(retries = 30) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await wait(200);
  }
  throw new Error('Server did not become ready in time');
}

async function run() {
  const server = spawn(process.execPath, ['server.js'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (data) => process.stdout.write(data));
  server.stderr.on('data', (data) => process.stderr.write(data));

  try {
    await waitForServer();

    const health = await fetch(`${BASE}/api/health`);
    if (!health.ok) throw new Error('Health endpoint failed');

    const products = await fetch(`${BASE}/api/products`);
    const productJson = await products.json();
    if (!products.ok || !Array.isArray(productJson.items)) {
      throw new Error('Products endpoint failed');
    }

    console.log('smoke-test: ok');
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error('smoke-test: fail', error.message);
  process.exitCode = 1;
});
