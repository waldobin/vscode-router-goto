import * as vscode from 'vscode';
import { ExpoScanner } from './expo/expoScanner';
import { ReactNavScanner } from './reactNavigation/reactNavScanner';
import { ReactRouterScanner } from './reactRouter/reactRouterScanner';
import { RouteDefinition } from './types';

export class RouteManager implements vscode.Disposable {
  private expoScanner: ExpoScanner;
  private reactNavScanner: ReactNavScanner;
  private reactRouterScanner: ReactRouterScanner;
  private fileWatcher?: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];
  private onRoutesUpdatedEmitter = new vscode.EventEmitter<void>();
  public readonly onRoutesUpdated = this.onRoutesUpdatedEmitter.event;

  private isScanning = false;

  constructor() {
    this.expoScanner = new ExpoScanner();
    this.reactNavScanner = new ReactNavScanner();
    this.reactRouterScanner = new ReactRouterScanner();
    this.setupFileWatcher();
  }

  public async init() {
    await this.rescan();
  }

  public async rescan(): Promise<void> {
    if (this.isScanning) {
      return;
    }
    this.isScanning = true;

    try {
      const config = vscode.workspace.getConfiguration('routerGoto');
      const enableExpo = config.get('enableExpoRouter', true);
      const enableReactNav = config.get('enableReactNavigation', true);
      const enableReactRouter = config.get('enableReactRouter', true);

      const promises: Promise<any>[] = [];

      if (enableExpo) {
        promises.push(this.expoScanner.scanWorkspace());
      }
      if (enableReactNav) {
        promises.push(this.reactNavScanner.scanWorkspace());
      }
      if (enableReactRouter) {
        promises.push(this.reactRouterScanner.scanWorkspace());
      }

      await Promise.all(promises);
      this.onRoutesUpdatedEmitter.fire();
    } finally {
      this.isScanning = false;
    }
  }

  private setupFileWatcher() {
    // Watch for file changes across ts, tsx, js, jsx
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx}');

    watcher.onDidCreate(async (uri) => {
      await this.handleFileChange(uri);
    });

    watcher.onDidChange(async (uri) => {
      await this.handleFileChange(uri);
    });

    watcher.onDidDelete((uri) => {
      this.expoScanner.removeFile(uri);
      this.reactNavScanner.removeFile(uri);
      this.reactRouterScanner.removeFile(uri);
      this.onRoutesUpdatedEmitter.fire();
    });

    this.fileWatcher = watcher;
    this.disposables.push(watcher);
  }

  private async handleFileChange(uri: vscode.Uri) {
    const fsPath = uri.fsPath;
    if (fsPath.includes('node_modules') || fsPath.includes('.git')) {
      return;
    }

    const config = vscode.workspace.getConfiguration('routerGoto');
    const enableExpo = config.get('enableExpoRouter', true);
    const enableReactNav = config.get('enableReactNavigation', true);
    const enableReactRouter = config.get('enableReactRouter', true);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return;
    }

    if (enableExpo) {
      const appDirs: string[] = config.get('appDirectories', ['app', 'src/app']);
      for (const appDir of appDirs) {
        this.expoScanner.processFile(uri, workspaceFolder.uri.fsPath, appDir);
      }
    }

    if (enableReactNav) {
      await this.reactNavScanner.processFile(uri);
    }

    if (enableReactRouter) {
      await this.reactRouterScanner.processFile(uri);
    }

    this.onRoutesUpdatedEmitter.fire();
  }

  public getAllRoutes(): RouteDefinition[] {
    const config = vscode.workspace.getConfiguration('routerGoto');
    const enableExpo = config.get('enableExpoRouter', true);
    const enableReactNav = config.get('enableReactNavigation', true);
    const enableReactRouter = config.get('enableReactRouter', true);

    const results: RouteDefinition[] = [];
    if (enableExpo) {
      results.push(...this.expoScanner.getRoutes());
    }
    if (enableReactNav) {
      results.push(...this.reactNavScanner.getRoutes());
    }
    if (enableReactRouter) {
      results.push(...this.reactRouterScanner.getRoutes());
    }
    return results;
  }

  public getExpoRoutes(): RouteDefinition[] {
    return this.expoScanner.getRoutes();
  }

  public getReactNavRoutes(): RouteDefinition[] {
    return this.reactNavScanner.getRoutes();
  }

  public getReactRouterRoutes(): RouteDefinition[] {
    return this.reactRouterScanner.getRoutes();
  }

  public findRoute(nameOrPath: string): RouteDefinition | undefined {
    // 1. Check Expo routes first if it looks like a path (starts with / or has /)
    if (nameOrPath.startsWith('/') || nameOrPath.includes('/')) {
      const expo = this.expoScanner.findRoute(nameOrPath);
      if (expo) return expo;
      const reactRouter = this.reactRouterScanner.findRoute(nameOrPath);
      if (reactRouter) return reactRouter;
    }

    // 2. Check React Navigation
    const reactNav = this.reactNavScanner.findRoute(nameOrPath);
    if (reactNav) return reactNav;

    // 3. Fallback React Router search
    const reactRouter = this.reactRouterScanner.findRoute(nameOrPath);
    if (reactRouter) return reactRouter;

    // 4. Fallback Expo search without leading slash
    return this.expoScanner.findRoute(nameOrPath);
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.expoScanner.dispose();
    this.reactNavScanner.dispose();
    this.reactRouterScanner.dispose();
    this.onRoutesUpdatedEmitter.dispose();
  }
}
