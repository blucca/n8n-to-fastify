import { CoreWorkflowParser } from './compiler/core-parser';
import { CodeGenerator } from './compiler/code-generator';
import { RouteGenerator } from './compiler/route-generator';

export function compileWorkflowJson(jsonInput: string | object) {
  const start = performance.now();
  const raw = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;

  const parsed = CoreWorkflowParser.parseWorkflow(raw, raw?.name || 'workflow', 'workflow.ts');
  if (!parsed) {
    throw new Error('Invalid n8n workflow JSON: missing "nodes" array.');
  }

  const workflowCode = CodeGenerator.generateWorkflowCode(parsed);
  const routesCode = RouteGenerator.generateRoutesCode([parsed]);
  const elapsedMs = (performance.now() - start).toFixed(2);

  return {
    name: parsed.name,
    nodeCount: parsed.nodes.length,
    triggerCount: parsed.triggers.length,
    elapsedMs,
    workflowCode,
    routesCode,
  };
}

// Expose globally for browser playground
if (typeof window !== 'undefined') {
  (window as any).N8nToFastify = { compileWorkflowJson };
}
