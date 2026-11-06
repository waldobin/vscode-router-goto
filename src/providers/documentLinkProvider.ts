import * as vscode from 'vscode';
import { RouteManager } from '../routeManager';
import { AstHelper } from '../utils/astHelper';

export class RouterDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private routeManager: RouteManager) {}

  public provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const config = vscode.workspace.getConfiguration('routerGoto');
    if (!config.get('enableDocumentLinks', true)) {
      return undefined;
    }

    const links: vscode.DocumentLink[] = [];
    const lineCount = document.lineCount;

    for (let line = 0; line < lineCount; line++) {
      if (token.isCancellationRequested) {
        return links;
      }

      const matches = AstHelper.getAllRouteStringsInLine(document, line);
      for (const m of matches) {
        const route = this.routeManager.findRoute(m.routeString);
        if (route) {
          // Point link directly to target screen file
          const targetUri = route.fileUri.with({
            fragment: route.targetRange ? `L${route.targetRange.start.line + 1},${route.targetRange.start.character + 1}` : undefined
          });

          const link = new vscode.DocumentLink(m.range, targetUri);
          link.tooltip = `Router Goto: Open ${route.framework === 'expo-router' ? 'Expo Route' : 'Screen Component'} (${vscode.workspace.asRelativePath(route.fileUri)})`;
          links.push(link);
        }
      }
    }

    return links;
  }
}
