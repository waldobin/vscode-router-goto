import * as vscode from 'vscode';
import { RouteManager } from './routeManager';
import { RouterCompletionProvider } from './providers/completionProvider';
import { RouterDefinitionProvider } from './providers/definitionProvider';
import { RouterHoverProvider } from './providers/hoverProvider';
import { RouterDocumentLinkProvider } from './providers/documentLinkProvider';
import { RouterDiagnosticsProvider } from './providers/diagnosticsProvider';
import { RouteDefinition } from './types';

const SUPPORTED_LANGUAGES = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
];

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('routerGoto');
  if (!config.get('enable', true)) {
    return;
  }

  const routeManager = new RouteManager();
  context.subscriptions.push(routeManager);

  // Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'routerGoto.showRegisteredRoutes';
  context.subscriptions.push(statusBarItem);

  const updateStatusBar = () => {
    const routes = routeManager.getAllRoutes();
    const expoCount = routeManager.getExpoRoutes().length;
    const reactNavCount = routeManager.getReactNavRoutes().length;
    statusBarItem.text = `$(compass) ${routes.length} Routes`;
    statusBarItem.tooltip = `Router Goto:\n- ${expoCount} Expo Routes\n- ${reactNavCount} React Navigation Screens\nClick to view all routes`;
    statusBarItem.show();
  };

  routeManager.onRoutesUpdated(() => {
    updateStatusBar();
  });

  // Providers
  const completionProvider = new RouterCompletionProvider(routeManager);
  const definitionProvider = new RouterDefinitionProvider(routeManager);
  const hoverProvider = new RouterHoverProvider(routeManager);
  const documentLinkProvider = new RouterDocumentLinkProvider(routeManager);
  const diagnosticsProvider = new RouterDiagnosticsProvider(routeManager);
  diagnosticsProvider.registerEvents();
  context.subscriptions.push(diagnosticsProvider);

  for (const lang of SUPPORTED_LANGUAGES) {
    // Autocomplete provider
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        lang,
        completionProvider,
        "'", '"', '`', '/', '{', ',', ' '
      )
    );

    // Click-to-Definition (Cmd+click / F12)
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(lang, definitionProvider)
    );

    // Hover provider
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(lang, hoverProvider)
    );

    // Document links (Direct clickable links)
    context.subscriptions.push(
      vscode.languages.registerDocumentLinkProvider(lang, documentLinkProvider)
    );
  }

  // Command: Rescan Routes
  context.subscriptions.push(
    vscode.commands.registerCommand('routerGoto.rescan', async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Router Goto: Rescanning navigation routes...',
          cancellable: false,
        },
        async () => {
          await routeManager.rescan();
          vscode.window.showInformationMessage(
            `Router Goto: Successfully indexed ${routeManager.getAllRoutes().length} routes.`
          );
        }
      );
    })
  );

  // Command: Show All Registered Routes in QuickPick
  context.subscriptions.push(
    vscode.commands.registerCommand('routerGoto.showRegisteredRoutes', async () => {
      const routes = routeManager.getAllRoutes();
      if (routes.length === 0) {
        vscode.window.showInformationMessage(
          'Router Goto: No routes found. Ensure your project has an app/ folder (Expo Router) or RootStackParamList / <Stack.Screen> (React Navigation).'
        );
        return;
      }

      interface RouteQuickPickItem extends vscode.QuickPickItem {
        routeDef: RouteDefinition;
      }

      const items: RouteQuickPickItem[] = routes.map((r) => {
        const icon = r.framework === 'expo-router' ? '$(folder)' : '$(symbol-class)';
        const paramsSummary =
          r.params.length > 0
            ? ` [${r.params.map((p) => p.name).join(', ')}]`
            : '';
        return {
          label: `${icon} ${r.name}`,
          description: `${r.framework}${paramsSummary}`,
          detail: vscode.workspace.asRelativePath(r.fileUri),
          routeDef: r,
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Search routes and jump to screen file...',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        const doc = await vscode.workspace.openTextDocument(selected.routeDef.fileUri);
        const editor = await vscode.window.showTextDocument(doc);
        if (selected.routeDef.targetRange) {
          editor.selection = new vscode.Selection(
            selected.routeDef.targetRange.start,
            selected.routeDef.targetRange.end
          );
          editor.revealRange(
            selected.routeDef.targetRange,
            vscode.TextEditorRevealType.InCenter
          );
        }
      }
    })
  );

  // Initial Scan in background
  await routeManager.init();
  updateStatusBar();
}

export function deactivate() {}
