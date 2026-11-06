import * as vscode from 'vscode';
import { RouteManager } from '../routeManager';
import { AstHelper } from '../utils/astHelper';

export class RouterDiagnosticsProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor(private routeManager: RouteManager) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('routerGoto');
    this.disposables.push(this.diagnosticCollection);

    this.routeManager.onRoutesUpdated(() => {
      this.revalidateAllOpenDocuments();
    });
  }

  public registerEvents() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        this.validateDocument(e.document);
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        this.validateDocument(doc);
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.diagnosticCollection.delete(doc.uri);
      })
    );

    // Initial check for open documents
    this.revalidateAllOpenDocuments();
  }

  private revalidateAllOpenDocuments() {
    for (const doc of vscode.workspace.textDocuments) {
      this.validateDocument(doc);
    }
  }

  public validateDocument(document: vscode.TextDocument) {
    const config = vscode.workspace.getConfiguration('routerGoto');
    const enabled = config.get('enableDiagnostics', false);

    if (!enabled) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const languageId = document.languageId;
    if (
      languageId !== 'typescript' &&
      languageId !== 'typescriptreact' &&
      languageId !== 'javascript' &&
      languageId !== 'javascriptreact'
    ) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const lineCount = document.lineCount;

    for (let line = 0; line < lineCount; line++) {
      const matches = AstHelper.getAllRouteStringsInLine(document, line);
      for (const m of matches) {
        // Skip empty string
        if (!m.routeString.trim()) {
          continue;
        }

        const route = this.routeManager.findRoute(m.routeString);
        if (!route) {
          const diag = new vscode.Diagnostic(
            m.range,
            `[Router Goto] Route "${m.routeString}" does not match any known ${m.frameworkHint || 'screen'} route.`,
            vscode.DiagnosticSeverity.Warning
          );
          diag.source = 'Router Goto';
          diagnostics.push(diag);
        }
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  public dispose() {
    this.diagnosticCollection.clear();
    this.disposables.forEach((d) => d.dispose());
  }
}
