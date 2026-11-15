import fs from 'fs';
import path from 'path';
import { CoreWorkflowParser, ParsedWorkflow, N8nNode, N8nConnectionTarget } from './core-parser';

export type { ParsedWorkflow, N8nNode, N8nConnectionTarget };

export class WorkflowParser extends CoreWorkflowParser {
  static parseInput(inputPath: string): ParsedWorkflow[] {
    const resolved = path.resolve(inputPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input path not found: '${resolved}'`);
    }

    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      const content = fs.readFileSync(resolved, 'utf8');
      const json = JSON.parse(content);
      const baseName = path.basename(resolved, '.json');
      const parsed = this.parseWorkflow(json, baseName, `${baseName}.ts`);
      return parsed ? [parsed] : [];
    }

    return this.parseDirectory(resolved, resolved);
  }

  static parseDirectory(dirPath: string, rootDirPath?: string): ParsedWorkflow[] {
    const root = rootDirPath || dirPath;
    let results: ParsedWorkflow[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        results = results.concat(this.parseDirectory(fullPath, root));
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const json = JSON.parse(content);
          const parsed = this.parseWorkflow(
            json,
            entry.name.replace(/\.json$/, ''),
            relativePath
          );
          if (parsed) {
            results.push(parsed);
          }
        } catch (err: any) {
          console.error(`[n8n-to-fastify] Failed to parse '${fullPath}': ${err.message}`);
        }
      }
    }

    return results;
  }
}
