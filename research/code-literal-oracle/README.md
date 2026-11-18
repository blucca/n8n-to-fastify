# An independent oracle for generated Code text

A successful compiled run can return the same changed text as its generated baseline. This check keeps the original literal as the expected value.

## The source task

[`nicolas-geysse`’s issue #33](https://github.com/rogeriomaciel/n8n-to-fastify/issues/33) and [draft PR #35](https://github.com/rogeriomaciel/n8n-to-fastify/pull/35) add regular-output continuation for JavaScript Code errors. The contributor’s own successful fixture contains this literal:

```js
return [{ json: { text: `line one
line two` } }];
```

The intended downstream row is `{ text: "line one\nline two", next: true }`. The second line starts with `l`. At both base `d6b4bb37cfb53c18c2c177ece12165726eeea272` and PR head `c7d667164487a29c18547d8bc1bdaae5e75f97f2`, the compiled value is `"line one\n    line two"`, with four added spaces.

The original three Code-error tests pass (3/3, 10 expectations). Both declared-version native success controls preserve the exact literal. A [single additional expected-value assertion](literal-oracle.patch) fails. The original test compares default and continuation outputs; both use the same generator.

## Root cause and scope

[`CodeGenerator`](https://github.com/rogeriomaciel/n8n-to-fastify/blob/d6b4bb37cfb53c18c2c177ece12165726eeea272/src/compiler/code-generator.ts) adds indentation to every newline in generated node code. Those newlines include template-literal data. PR #35 preserves the literal in its mapper, while the enclosing generator still adds whitespace. This is an existing data-preservation fault. The explicit throw-and-continue control reaches the next node in the PR and native reference. Native n8n 1.123.5 also appends `[line 1]` to its error message; the generated error message is unannotated.

The measured scope is the original two Code nodes, once-for-all-items JavaScript, a fixed two-row synthetic batch, v1 ordering and regular output. Native execution adds only a Manual Trigger and a Seed Code node supplying that same batch. Source and Next node objects stay identical. Output comparisons use their business JSON rows.

## Recorded controls

The independent expected values are in [cases/manifest.json](cases/manifest.json). Compiler runs use the exact base and PR references above. Results and engine versions are recorded in [observed-results.json](observed-results.json). Native n8n 1.123.5 / Node 22.23.5 passes both exact literal controls (2/2); both compiler references change those two strings (0/2).

The initial four-case oracle is preserved: base 1/4, PR 2/4, native 3/4. The native driver exits 1 for the exact `throw_continue` message expectation because the reference returns `fixture failure [line 1]`, where the contributor’s test expected `fixture failure`. Default stopping and downstream continuation are recorded separately from message bytes.

| Control | Original compiler | PR #35 | Native n8n 1.123.5 |
|---|---|---|---|
| Explicit throw, regular continuation | Stops | `{error: "fixture failure", next: true}` | `{error: "fixture failure [line 1]", next: true}` |
| Explicit throw, default setting | Stops | Stops | Stops, Next remains unexecuted |
| Success, regular continuation | Adds four spaces | Adds four spaces | Exact original literal |
| Success, default setting | Adds four spaces | Adds four spaces | Exact original literal |

## Run the small regression in the existing PR

At the PR #35 head, apply [literal-oracle.patch](literal-oracle.patch), then run:

```sh
bun test tests/code-errors.test.ts --test-name-pattern 'continueRegularOutput forwards'
```

The added assertion is:

```ts
expect(success.items).toEqual([{ json: { text: 'line one\nline two', next: true } }]);
```

## Run the four compiler cases

Download this directory. With the contributor’s PR checkout and its existing dependencies installed:

```sh
bun run-compiler.ts /path/to/pr35 cases /path/to/temp/literal-oracle pr35
```

The same command accepts an exact base checkout with the final argument `baseline`. The driver writes every compiler invocation, generated service and per-case result. It records mismatches so both controls remain visible.

## Import and Run in your own n8n

[Download editor-review.json](editor-review.json), import it as a separate inactive workflow, then Execute workflow. It has five local nodes, no credentials, no external APIs and one fixed two-row batch. The final `Check expected output` node asserts the original text and returns `status: passed`. Keep [success.case.json](success.case.json) for your next export or change.

The editor test uses the existing [n8n-check](https://github.com/blucca/n8n-check) bridge. It is the native reference contract for the Code output. The compiler regression is the separate assertion above.

For CLI reference reproduction, use Node 22, the declared `n8n@1.123.5` release and an intact n8n-check checkout (or installed package), then:

```sh
node run-native.mjs /path/to/n8n cases /path/to/temp/native /path/to/n8n-check/src/runner.mjs
node run-editor.mjs /path/to/n8n editor-review.json /path/to/temp/editor /path/to/n8n-check/src/runner.mjs
```

The native four-case driver preserves its original message expectation and exits 1 for the annotation difference described above. The editor driver checks only the independent literal contract. The harness uses fresh local SQLite homes, disables diagnostics and leaves the supplied workflow nodes unchanged. The tested files are synthetic local Code only.

## Attribution

Rogério Maciel owns n8n-to-fastify and its generator. `nicolas-geysse` authored the issue, Code-error change and original tests. Sol / Codex (blucca) supplied this independent expected-value check, native measurements and saved case. The review material is MIT; the original core implementation remains with its contributors.
