import * as vscode from 'vscode';
import { RouteManager } from '../routeManager';
import { AstHelper } from '../utils/astHelper';

export class RouterHoverProvider implements vscode.HoverProvider {
  constructor(private routeManager: RouteManager) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const config = vscode.workspace.getConfiguration('routerGoto');
    if (!config.get('enableHover', true)) {
      return undefined;
    }

    const targets = AstHelper.getTargetsAtPosition(document, position);
    if (!targets || targets.length === 0) {
      return undefined;
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    let matchedCount = 0;

    for (const target of targets) {
      let route = this.routeManager.findRoute(target.routeString);
      if (!route && target.memberOnly) {
        route = this.routeManager.findRoute(target.memberOnly);
      }

      if (!route) {
        continue;
      }

      matchedCount++;
      const relPath = vscode.workspace.asRelativePath(route.fileUri);

      if (matchedCount > 1) {
        md.appendMarkdown(`\n---\n`);
      }

      if (target.isMethodClick) {
        md.appendMarkdown(`🎯 **Navigate Target:** \`${route.name}\`\n\n`);
      }

      if (route.framework === 'expo-router') {
        md.appendMarkdown(`### 📱 Expo Router: \`${route.name}\`\n\n`);
        md.appendMarkdown(`📂 **Target Screen:** [${relPath}](${route.fileUri.toString()})\n\n`);

        if (route.aliases && route.aliases.length > 0) {
          md.appendMarkdown(`*Aliases:* ${route.aliases.map((a) => `\`${a}\``).join(', ')}\n\n`);
        }

        if (route.params.length > 0) {
          md.appendMarkdown(`**Dynamic URL Parameters:**\n\n`);
          for (const p of route.params) {
            md.appendMarkdown(
              `- **\`${p.name}\`** (\`${p.type}\`, ${p.required ? '**required**' : '*optional*'}): ${p.description || ''}\n`
            );
          }
        }
      } else {
        md.appendMarkdown(`### 🧭 React Navigation: \`${route.name}\`\n\n`);

        if (route.componentName) {
          md.appendMarkdown(`🧩 **Component:** \`${route.componentName}\`\n\n`);
        }

        md.appendMarkdown(`📂 **Screen File:** [${relPath}](${route.fileUri.toString()})\n\n`);

        if (route.typeLocation) {
          const typeRel = vscode.workspace.asRelativePath(route.typeLocation.uri);
          md.appendMarkdown(`📝 **Type Definition:** [${typeRel}#${route.typeLocation.range.start.line + 1}](${route.typeLocation.uri.toString()})\n\n`);
        }

        if (route.rawParamString && route.rawParamString !== 'undefined') {
          md.appendMarkdown(`**Screen Params:**\n\`\`\`typescript\n${route.rawParamString}\n\`\`\`\n`);
        } else if (route.params.length > 0) {
          md.appendMarkdown(`**Parameters:**\n\n`);
          for (const p of route.params) {
            md.appendMarkdown(
              `- **\`${p.name}\`** (\`${p.type}\`${p.required ? ', required' : ''})\n`
            );
          }
        }
      }
    }

    if (matchedCount === 0) {
      return undefined;
    }

    return new vscode.Hover(md, targets[0].range);
  }
}
