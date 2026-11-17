import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowParser } from '../src/compiler/parser';
import { CodeGenerator } from '../src/compiler/code-generator';
import { WorkflowContext } from '../src/runtime/workflow-context';

// This n8n export routes A/C to accepted and B to rejected in native n8n 2.41.7.
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dir, 'fixtures/if-batch.json'), 'utf8'));
const leads = JSON.parse(fixture.nodes.find((n: any) => n.name === 'Input leads').parameters.jsCode.slice(7, -1));

test('IF batches preserve both output ports through downstream nodes and explicit Merge', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2f-if-'));
  try {
    fs.mkdirSync(path.join(dir, 'runtime'));
    fs.mkdirSync(path.join(dir, 'workflows'));
    for (const file of fs.readdirSync(path.join(import.meta.dir, '../src/runtime'))) {
      if (file.endsWith('.ts')) fs.copyFileSync(path.join(import.meta.dir, '../src/runtime', file), path.join(dir, 'runtime', file));
    }
    const cases = [
      { items: leads, accepted: ['A', 'C'], rejected: ['B'] },
      { items: [leads[1], leads[0], leads[2]], accepted: ['A', 'C'], rejected: ['B'] },
      { items: [leads[0], leads[2]], accepted: ['A', 'C'], rejected: [] },
      { items: [leads[1]], accepted: [], rejected: ['B'] },
    ];
    for (const [index, c] of cases.entries()) {
      const json = structuredClone(fixture);
      json.nodes.find((n: any) => n.name === 'Input leads').parameters.jsCode = `return ${JSON.stringify(c.items)};`;
      // Connect IF's output ports directly, so Merge must select each port's array.
      json.nodes.push({ id: 'join', name: 'Join', type: 'n8n-nodes-base.merge', typeVersion: 3.2, position: [800, 100], parameters: { mode: 'append' } });
      json.connections['Is Valid Lead?'].main[0].push({ node: 'Join', type: 'main', index: 0 });
      json.connections['Is Valid Lead?'].main[1].push({ node: 'Join', type: 'main', index: 1 });
      const name = `batch_${index}`;
      const parsed = WorkflowParser.parseWorkflow(json, name)!;
      const file = path.join(dir, 'workflows', parsed.relativePath);
      fs.writeFileSync(file, CodeGenerator.generateWorkflowCode(parsed));
      const module = await import(file);
      const { context } = await module[`workflow_${name}`]();
      const ids = (node: string, port = 0) => context.getNode(node, port).all().map((i: any) => i.json.id);
      expect(ids('Is Valid Lead?', 0)).toEqual(c.accepted);
      expect(ids('Is Valid Lead?', 1)).toEqual(c.rejected);
      expect(ids('Accepted leads')).toEqual(c.accepted);
      expect(ids('Rejected leads')).toEqual(c.rejected);
      expect(ids('Join')).toEqual([...c.accepted, ...c.rejected]);
      expect(context.hasExecutedNode('Accepted leads')).toBe(c.accepted.length > 0);
      expect(context.hasExecutedNode('Rejected leads')).toBe(c.rejected.length > 0);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('empty output is recorded without activating or retaining its branch', () => {
  const context = new WorkflowContext();
  context.setNodeOutput('IF', [{ json: { id: 'A' } }], 0);
  context.setNodeOutput('IF', [{ json: { id: 'B' } }], 1);
  context.setNodeOutput('IF', [], 0);
  expect(context.hasExecutedNode('IF')).toBe(true);
  expect(context.isBranchActive('IF', 0)).toBe(false);
  expect(context.isBranchActive('IF', 1)).toBe(true);
  expect(context.getNode('IF').all()).toEqual([]);
  expect(context.getNode('IF', 1).first()?.json.id).toBe('B');
});
