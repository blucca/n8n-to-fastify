import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import assert from 'node:assert/strict';
const [binaryArg, casesArg, outArg, checkSourceArg] = process.argv.slice(2);
assert(binaryArg && casesArg && outArg && checkSourceArg, 'usage: node run-native.mjs N8N CASES OUT CHECK_RUNNER');
const binary = resolve(binaryArg), cases = resolve(casesArg), out = resolve(outArg);
const { runtimeEnv, command } = await import(pathToFileURL(resolve(checkSourceArg)));
const { executionFrom } = await import(pathToFileURL(join(dirname(resolve(checkSourceArg)), 'report.mjs')));
await mkdir(out, { recursive: true });
const home = await mkdtemp(join(out, 'home-'));
await mkdir(join(home, 'tmp'));
const env = { ...runtimeEnv(home), NODE_OPTIONS: '--max-old-space-size=512' };
const version = await command(binary, ['--version'], env, 30000);
assert.equal(version.exitCode, 0, version.stdout + version.stderr);
const manifest = JSON.parse(await readFile(join(cases, 'manifest.json'), 'utf8'));
const results = [];
for (const c of manifest.cases) {
  const dir = join(out, c.id); await mkdir(dir, { recursive: true });
  const file = join(cases, 'native', `${c.id}.json`), workflow = JSON.parse(await readFile(file, 'utf8'));
  const imported = await command(binary, ['import:workflow', `--input=${file}`], env, 60000);
  await writeFile(join(dir, 'import.json'), JSON.stringify(imported, null, 2));
  assert.equal(imported.exitCode, 0, imported.stdout + imported.stderr);
  const executed = await command(binary, ['execute', `--id=${workflow.id}`, '--rawOutput'], env, 60000);
  await writeFile(join(dir, 'execute.json'), JSON.stringify(executed, null, 2));
  const execution = executionFrom(executed.stdout + '\n' + executed.stderr);
  await writeFile(join(dir, 'execution.json'), JSON.stringify(execution, null, 2));
  const runs = execution?.data?.resultData?.runData;
  const rows = name => (runs?.[name]?.[0]?.data?.main?.[0] ?? []).map(i => ({ json: i.json }));
  const error = execution?.data?.resultData?.error;
  const actual = executed.exitCode === 0 && execution && !error
    ? { status: 'success', items: rows('Next'), source: rows('Source'), nextExecuted: Boolean(runs?.Next) }
    : { status: 'error', message: error?.message ?? null, cliExitCode: executed.exitCode, executionFound: Boolean(execution), nextExecuted: runs ? Boolean(runs.Next) : null };
  // Failure CLI versions may omit raw JSON. Keep that observability boundary explicit.
  const matches = c.expected.status === 'error'
    ? actual.status === 'error' && executed.exitCode !== 0 && (actual.message === c.expected.message || (executed.stdout + executed.stderr).includes(c.expected.message)) && actual.nextExecuted !== true
    : actual.status === 'success' && actual.nextExecuted === true && isDeepStrictEqual(actual.items, c.expected.items);
  const row = { id: c.id, expected: c.expected, actual, matches };
  results.push(row); await writeFile(join(dir, 'result.json'), JSON.stringify(row, null, 2));
  console.log(JSON.stringify({ version: version.stdout.trim(), ...row }));
}
const result = { n8n: version.stdout.trim(), node: process.version, cases: results };
await writeFile(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
assert(results.every(x => x.matches), 'native reference differs from the independent business oracle; read results before using it');
await writeFile(join(out, 'done.json'), JSON.stringify({ passed: true, cases: results.length, n8n: result.n8n }));
