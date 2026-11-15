import fs from 'fs';
import path from 'path';
import os from 'os';
import Fastify from 'fastify';
import { WorkflowParser } from '../src/compiler/parser';
import { CodeGenerator } from '../src/compiler/code-generator';
import { RouteGenerator } from '../src/compiler/route-generator';

async function runBenchmark() {
  const iterations = 1000;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2f-bench-'));

  try {
    const compileStart = performance.now();
    const workflows = WorkflowParser.parseInput(path.resolve('./examples'));

    const wfDir = path.join(tmpDir, 'workflows');
    const rtDir = path.join(tmpDir, 'runtime');
    const routesDir = path.join(tmpDir, 'routes');
    fs.mkdirSync(wfDir, { recursive: true });
    fs.mkdirSync(rtDir, { recursive: true });
    fs.mkdirSync(routesDir, { recursive: true });

    const srcRtDir = path.resolve('./src/runtime');
    for (const f of fs.readdirSync(srcRtDir)) {
      if (f.endsWith('.ts')) {
        fs.copyFileSync(path.join(srcRtDir, f), path.join(rtDir, f));
      }
    }

    for (const wf of workflows) {
      fs.writeFileSync(path.join(wfDir, wf.relativePath), CodeGenerator.generateWorkflowCode(wf), 'utf8');
    }
    fs.writeFileSync(
      path.join(routesDir, 'index.ts'),
      RouteGenerator.generateRoutesCode(workflows),
      'utf8'
    );
    const compileMs = (performance.now() - compileStart).toFixed(2);

    const routesMod = await import(path.join(routesDir, 'index.ts'));
    const fastify = Fastify();
    await fastify.register(routesMod.registerCompiledRoutes);
    const address = await fastify.listen({ port: 0, host: '127.0.0.1' });
    const targetUrl = `${address}/webhook/lead-intake`;
    const payload = JSON.stringify({ name: 'Ada Lovelace', email: 'ada@analyticalengine.org' });

    // Warmup
    for (let i = 0; i < 20; i++) {
      await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
    }

    const latencies: number[] = [];
    const benchStart = performance.now();

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      await res.arrayBuffer();
      if (res.status !== 200) {
        throw new Error(`Unexpected status code: ${res.status}`);
      }
      latencies.push(performance.now() - t0);
    }

    const totalMs = performance.now() - benchStart;
    latencies.sort((a, b) => a - b);

    const min = latencies[0].toFixed(3);
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3);
    const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(3);
    const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(3);
    const rps = Math.round((iterations / totalMs) * 1000);
    const rssMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

    console.log(`\n⚡ n8n-to-fastify Benchmark Results (${iterations} requests w/ Subworkflow + IF + Set)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Compilation Time : ${compileMs} ms`);
    console.log(`  Throughput       : ${rps.toLocaleString()} req/s`);
    console.log(`  Min Latency      : ${min} ms`);
    console.log(`  Avg Latency      : ${avg} ms`);
    console.log(`  p95 Latency      : ${p95} ms`);
    console.log(`  p99 Latency      : ${p99} ms`);
    console.log(`  Memory RSS       : ${rssMb} MB`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    await fastify.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runBenchmark();
