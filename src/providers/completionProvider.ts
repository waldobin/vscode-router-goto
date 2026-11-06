import * as vscode from 'vscode';
import { RouteManager } from '../routeManager';
import { AstHelper } from '../utils/astHelper';
import { RouteDefinition } from '../types';

export class RouterCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private routeManager: RouteManager) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const ctx = AstHelper.getCompletionContext(document, position);
    if (!ctx) {
      return undefined;
    }

    if (ctx.type === 'route-name') {
      return this.provideRouteCompletions(ctx.frameworkHint, ctx.range);
    }

    if (ctx.type === 'param-key' && ctx.currentRouteName) {
      return this.provideParamCompletions(ctx.currentRouteName);
    }

    return undefined;
  }

  private provideRouteCompletions(
    frameworkHint?: 'expo-router' | 'react-navigation',
    replaceRange?: vscode.Range
  ): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    const routes = this.routeManager.getAllRoutes();

    for (const route of routes) {
      // Prioritize hinted framework if any
      const isPriority = frameworkHint ? route.framework === frameworkHint : true;

      const item = new vscode.CompletionItem(
        route.name,
        route.framework === 'expo-router'
          ? vscode.CompletionItemKind.Folder
          : vscode.CompletionItemKind.Class
      );

      item.range = replaceRange;
      item.sortText = isPriority ? `0_${route.name}` : `1_${route.name}`;

      if (route.framework === 'expo-router') {
        item.detail = `(Expo Router) ${route.name}`;

        const doc = new vscode.MarkdownString();
        doc.appendMarkdown(`### 📱 Expo Router: \`${route.name}\`\n\n`);
        doc.appendMarkdown(`**File:** \`${vscode.workspace.asRelativePath(route.fileUri)}\`\n\n`);

        if (route.params.length > 0) {
          doc.appendMarkdown(`**Parameters:**\n`);
          for (const p of route.params) {
            doc.appendMarkdown(
              `- \`${p.name}\` (${p.type}${p.required ? ', required' : ', optional'}): ${p.description || ''}\n`
            );
          }
        } else {
          doc.appendMarkdown(`*No dynamic parameters required.*\n`);
        }
        item.documentation = doc;

        // If route has dynamic parameters like [id], offer snippet completion
        if (route.name.includes('[') && route.name.includes(']')) {
          let snippet = route.name;
          let placeholderIdx = 1;
          snippet = snippet.replace(/\[\.\.\.([^\]]+)\]/g, `\${${placeholderIdx++}:$1}`);
          snippet = snippet.replace(/\[([^\]]+)\]/g, `\${${placeholderIdx++}:$1}`);
          item.insertText = new vscode.SnippetString(snippet);
        }
      } else {
        // React Navigation
        item.detail = `(React Navigation) ${route.name}`;

        const doc = new vscode.MarkdownString();
        doc.appendMarkdown(`### 🧭 React Navigation Screen: \`${route.name}\`\n\n`);
        if (route.componentName) {
          doc.appendMarkdown(`**Component:** \`${route.componentName}\`\n\n`);
        }
        doc.appendMarkdown(`**Defined in:** \`${vscode.workspace.asRelativePath(route.fileUri)}\`\n\n`);

        if (route.rawParamString && route.rawParamString !== 'undefined') {
          doc.appendMarkdown(`**Params Type:**\n\`\`\`typescript\n${route.rawParamString}\n\`\`\`\n`);
        } else if (route.params.length > 0) {
          doc.appendMarkdown(`**Parameters:**\n`);
          for (const p of route.params) {
            doc.appendMarkdown(`- \`${p.name}\`: \`${p.type}\`\n`);
          }
        } else {
          doc.appendMarkdown(`*No params (undefined)*\n`);
        }
        item.documentation = doc;
      }

      items.push(item);
    }

    return items;
  }

  private provideParamCompletions(currentRouteName: string): vscode.CompletionItem[] {
    const route = this.routeManager.findRoute(currentRouteName);
    if (!route || route.params.length === 0) {
      return [];
    }

    const items: vscode.CompletionItem[] = [];

    for (const param of route.params) {
      const item = new vscode.CompletionItem(
        param.name,
        vscode.CompletionItemKind.Property
      );

      item.detail = `${param.name}: ${param.type}${param.required ? ' (required)' : ''}`;
      item.documentation = new vscode.MarkdownString(
        `Parameter for \`${route.name}\`\n\nType: \`${param.type}\``
      );

      // Insert as `key: value` snippet
      item.insertText = new vscode.SnippetString(`${param.name}: \${1}`);
      item.sortText = param.required ? `0_${param.name}` : `1_${param.name}`;

      items.push(item);
    }

    return items;
  }
}
