import * as vscode from 'vscode';
import * as path from 'path';
import { RouteDefinition, RouteParam } from '../types';

export class ExpoScanner {
  private routes: Map<string, RouteDefinition> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {}

  /**
   * Scan workspace for Expo Router files in configured app directories.
   */
  public async scanWorkspace(): Promise<RouteDefinition[]> {
    this.routes.clear();

    const config = vscode.workspace.getConfiguration('routerGoto');
    const appDirs: string[] = config.get('appDirectories', ['app', 'src/app']);

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    for (const folder of workspaceFolders) {
      for (const appDir of appDirs) {
        // Find files in folder/appDir
        const pattern = new vscode.RelativePattern(
          folder,
          `${appDir}/**/*.{js,jsx,ts,tsx}`
        );
        const files = await vscode.workspace.findFiles(
          pattern,
          '**/node_modules/**'
        );

        for (const fileUri of files) {
          this.processFile(fileUri, folder.uri.fsPath, appDir);
        }
      }
    }

    return Array.from(this.routes.values());
  }

  /**
   * Process a single Expo Router file
   */
  public processFile(fileUri: vscode.Uri, workspaceRoot: string, appDir: string): RouteDefinition | null {
    const fsPath = fileUri.fsPath;
    const relativeToApp = this.getRelativePathToApp(fsPath, workspaceRoot, appDir);
    if (!relativeToApp) {
      return null;
    }

    // Ignore special files, layouts, tests, and component folders
    const basename = path.basename(fsPath);
    if (
      basename.startsWith('_layout.') ||
      basename.includes('.test.') ||
      basename.includes('.spec.') ||
      basename.includes('.stories.') ||
      relativeToApp.includes('/components/') ||
      relativeToApp.includes('/__tests__/')
    ) {
      return null;
    }

    const isSpecialRoute = basename.startsWith('+'); // e.g. +not-found.tsx, +html.tsx

    // Calculate Expo Route Path
    const { routePath, aliases, params } = this.parseRoutePath(relativeToApp);

    const routeDef: RouteDefinition = {
      id: `expo:${routePath}`,
      framework: 'expo-router',
      name: routePath,
      aliases,
      fileUri,
      params,
      description: `Expo Router: ${relativeToApp}`,
      isLayout: false,
    };

    this.routes.set(routePath, routeDef);
    for (const alias of aliases) {
      if (!this.routes.has(alias)) {
        this.routes.set(alias, routeDef);
      }
    }

    return routeDef;
  }

  /**
   * Delete route associated with a file
   */
  public removeFile(fileUri: vscode.Uri) {
    for (const [key, def] of this.routes.entries()) {
      if (def.fileUri.fsPath === fileUri.fsPath) {
        this.routes.delete(key);
      }
    }
  }

  public getRoutes(): RouteDefinition[] {
    // Return unique definitions
    const seen = new Set<string>();
    const result: RouteDefinition[] = [];
    for (const def of this.routes.values()) {
      if (!seen.has(def.id)) {
        seen.add(def.id);
        result.push(def);
      }
    }
    return result;
  }

  public findRoute(inputPath: string): RouteDefinition | undefined {
    // Clean query params or hash if any: /profile/123?tab=info -> /profile/123
    const cleanPath = inputPath.split('?')[0].split('#')[0].trim();

    // 1. Direct match with stored route name or alias
    if (this.routes.has(cleanPath)) {
      return this.routes.get(cleanPath);
    }

    // Normalized with leading slash
    const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    if (this.routes.has(normalized)) {
      return this.routes.get(normalized);
    }

    // 2. Dynamic pattern matching: e.g. input "/user/42" matching "/user/[id]"
    for (const def of this.getRoutes()) {
      if (this.matchesPattern(normalized, def.name)) {
        return def;
      }
      for (const alias of def.aliases || []) {
        if (this.matchesPattern(normalized, alias)) {
          return def;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if a concrete URL matches a route pattern with dynamic segments
   * e.g. "/user/42" matches "/user/[id]"
   * e.g. "/blog/2026/hello" matches "/blog/[...slug]"
   */
  public matchesPattern(concretePath: string, routePattern: string): boolean {
    const concreteSegments = concretePath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const patternSegments = routePattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

    let cIdx = 0;
    let pIdx = 0;

    while (pIdx < patternSegments.length) {
      const pSeg = patternSegments[pIdx];

      // Catch-all segment: [...slug]
      if (pSeg.startsWith('[...') && pSeg.endsWith(']')) {
        // Consumes rest of concreteSegments
        return cIdx < concreteSegments.length || pIdx === patternSegments.length - 1;
      }

      // Single dynamic segment: [id]
      if (pSeg.startsWith('[') && pSeg.endsWith(']')) {
        if (cIdx >= concreteSegments.length) {
          return false;
        }
        cIdx++;
        pIdx++;
        continue;
      }

      // Static segment
      if (cIdx >= concreteSegments.length || concreteSegments[cIdx] !== pSeg) {
        return false;
      }

      cIdx++;
      pIdx++;
    }

    return cIdx === concreteSegments.length && pIdx === patternSegments.length;
  }

  /**
   * Computes the Expo URL route path from file relative path.
   * Handles:
   * - index.tsx -> /
   * - (group)/foo.tsx -> /foo (group omitted from URL)
   * - [id].tsx -> /[id]
   * - [...slug].tsx -> /[...slug]
   * - sub/index.tsx -> /sub
   */
  public parseRoutePath(relativeToApp: string): {
    routePath: string;
    aliases: string[];
    params: RouteParam[];
  } {
    // Strip file extension
    const ext = path.extname(relativeToApp);
    let noExt = relativeToApp.slice(0, -ext.length);

    // Normalize slashes
    noExt = noExt.replace(/\\/g, '/');

    const rawSegments = noExt.split('/').filter(Boolean);
    const params: RouteParam[] = [];

    // Parse dynamic params
    for (const seg of rawSegments) {
      if (seg.startsWith('[...') && seg.endsWith(']')) {
        const paramName = seg.slice(4, -1);
        params.push({
          name: paramName,
          type: 'string[]',
          required: false,
          description: `Catch-all parameter (${seg})`,
        });
      } else if (seg.startsWith('[') && seg.endsWith(']')) {
        const paramName = seg.slice(1, -1);
        params.push({
          name: paramName,
          type: 'string',
          required: true,
          description: `Dynamic path parameter (${seg})`,
        });
      }
    }

    // 1. Full route path retaining group info if needed
    // In Expo Router: (group) is omitted from actual route path
    const urlSegments: string[] = [];
    const withGroupSegments: string[] = [];

    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      const isLast = i === rawSegments.length - 1;

      withGroupSegments.push(seg);

      // Check if it's a group: (tabs), (auth), etc.
      if (seg.startsWith('(') && seg.endsWith(')')) {
        continue; // Group not included in browser/URL pathname
      }

      if (isLast && seg === 'index') {
        // index doesn't add to path
        continue;
      }

      urlSegments.push(seg);
    }

    const routePath = '/' + urlSegments.join('/');
    const cleanRoutePath = routePath === '' ? '/' : routePath;

    // Aliases:
    const aliases: string[] = [];

    // Also include full raw path with groups as an alias, in case someone types `/(tabs)/home`
    const groupPath = '/' + withGroupSegments.filter((s, idx) => !(idx === withGroupSegments.length - 1 && s === 'index')).join('/');
    if (groupPath !== cleanRoutePath) {
      aliases.push(groupPath);
    }

    // If route is /index or ends with /index
    if (noExt.endsWith('/index')) {
      aliases.push(cleanRoutePath + '/index');
    }

    return {
      routePath: cleanRoutePath,
      aliases,
      params,
    };
  }

  private getRelativePathToApp(fsPath: string, workspaceRoot: string, appDir: string): string | null {
    const fullAppDir = path.resolve(workspaceRoot, appDir);
    if (!fsPath.startsWith(fullAppDir)) {
      return null;
    }
    let rel = fsPath.substring(fullAppDir.length);
    if (rel.startsWith('/') || rel.startsWith('\\')) {
      rel = rel.substring(1);
    }
    return rel;
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.routes.clear();
  }
}
