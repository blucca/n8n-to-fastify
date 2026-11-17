import { N8nItem } from './n8n-helper';

export interface NodeAccessor {
  item?: N8nItem;
  first: () => N8nItem | undefined;
  all: () => N8nItem[];
}

/**
 * Runtime execution context for a single compiled workflow invocation.
 * Tracks node outputs, active conditional branches (IF/Switch), and webhook reply state.
 */
export class WorkflowContext {
  private nodeOutputs = new Map<string, Map<number, N8nItem[]>>();
  private activeBranches = new Map<string, Set<number>>();
  private executedNodes = new Set<string>();
  public webhookResponse?: { statusCode: number; body: any; headers?: Record<string, string> };

  public setNodeOutput(nodeName: string, items: N8nItem[], activeOutputIndex: number = 0): void {
    if (!this.nodeOutputs.has(nodeName)) {
      this.nodeOutputs.set(nodeName, new Map());
    }
    this.nodeOutputs.get(nodeName)!.set(activeOutputIndex, items);
    this.executedNodes.add(nodeName);
    if (items.length > 0) {
      this.activateBranch(nodeName, activeOutputIndex);
    } else {
      this.activeBranches.get(nodeName)?.delete(activeOutputIndex);
    }
  }

  public activateBranch(nodeName: string, outputIndex: number): void {
    if (!this.activeBranches.has(nodeName)) {
      this.activeBranches.set(nodeName, new Set());
    }
    this.activeBranches.get(nodeName)!.add(outputIndex);
  }

  public isBranchActive(nodeName: string, outputIndex: number): boolean {
    return this.activeBranches.get(nodeName)?.has(outputIndex) ?? false;
  }

  public hasExecutedNode(nodeName: string): boolean {
    return this.executedNodes.has(nodeName);
  }

  public getNode(nodeName: string, outputIndex: number = 0): NodeAccessor {
    const items = this.nodeOutputs.get(nodeName)?.get(outputIndex) || [];
    return {
      item: items[0],
      first: () => items[0],
      all: () => items,
    };
  }

  public setWebhookResponse(statusCode: number, body: any, headers?: Record<string, string>): void {
    if (!this.webhookResponse) {
      this.webhookResponse = { statusCode, body, headers };
    }
  }
}
