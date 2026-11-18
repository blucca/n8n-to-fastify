import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import assert from 'node:assert/strict';
const [sourceArg, casesArg, outputArg, label = 'compiler'] = process.argv.slice(2);
assert(sourceArg && casesArg && outputArg, 'usage: bun run-compiler.ts SOURCE CASES OUT LABEL');
const source = resolve(sourceArg), cases = resolve(casesArg), out = resolve(outputArg);
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(join(cases, 'manifest.json'), 'utf8'));
const results = [];
for (const c of manifest.cases) {
  const dir = join(out, c.id);
  await mkdir(dir, { recursive: true });
  const args = [process.execPath, join(source, 'bin/cli.ts'), 'compile', join(cases, `${c.id}.json`), '--out', join(dir, 'service')];
  if (label === 'pr35') args.push('--strict');
  const compiled = Bun.spawnSync(args, { cwd: source });
  await writeFile(join(dir, 'compile.stdout.log'), compiled.stdout);
  await writeFile(join(dir, 'compile.stderr.log'), compiled.stderr);
  assert.equal(compiled.exitCode, 0, compiled.stderr.toString());
  let actual;
  try {
    const run = (await import(join(dir, 'service/workflows', `${c.id}.ts`)))[`workflow_${c.id}`];
    const result = await run(c.input);
    actual = { status: 'success', items: result.items, source: result.context.getNode('Source').all(), nextExecuted: result.context.hasExecutedNode('Next') };
  } catch (error) {
    actual = { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  const matches = actual.status === c.expected.status && (c.expected.status === 'error'
    ? actual.message === c.expected.message
    : isDeepStrictEqual(actual.items, c.expected.items));
  const row = { id: c.id, expected: c.expected, actual, matches };
  results.push(row);
  await writeFile(join(dir, 'result.json'), JSON.stringify(row, null, 2) + '\n');
}
await writeFile(join(out, 'results.json'), JSON.stringify({ label, cases: results }, null, 2) + '\n');
console.log(JSON.stringify({ label, matches: results.filter(x => x.matches).length, total: results.length, cases: results.map(x => ({ id: x.id, matches: x.matches, actual: x.actual })) }));
