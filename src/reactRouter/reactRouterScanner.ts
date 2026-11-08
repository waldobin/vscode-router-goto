import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import { RouteDefinition, RouteParam } from '../types';

export class ReactRouterScanner {
  private routes: Map<string, RouteDefinition> = new Map();
  private disposables: vscode.Disposable[] = [];
  private pathAliases: Map<string, string[]> = new Map();
  private baseUrl: string = '.';

  constructor() {}

  public async scanWorkspace(): Promise<RouteDefinition[]> {
    this.routes.clear();
    this.loadTsConfigPaths();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    for (const folder of workspaceFolders) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.{ts,tsx,js,jsx}'),
        '{**/node_modules/**,**/dist/**,**/build/**,**/.git/**}'
      );

      for (const fileUri of files) {
        try {
          await this.processFile(fileUri);
        } catch {
          // Ignore parsing errors for individual files
        }
      }
    }

    return Array.from(this.routes.values());
  }

  /**
   * Load path aliases from tsconfig.json / tsconfig.paths.json / jsconfig.json
   */
  public loadTsConfigPaths() {
    this.pathAliases.clear();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    for (const folder of workspaceFolders) {
      const root = folder.uri.fsPath;
      const candidates = [
        path.join(root, 'tsconfig.paths.json'),
        path.join(root, 'tsconfig.json'),
        path.join(root, 'jsconfig.json'),
      ];

      for (const configFile of candidates) {
        if (fs.existsSync(configFile)) {
          try {
            const raw = fs.readFileSync(configFile, 'utf-8');
            // Remove single & multi-line comments in JSON
            const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');
            const parsed = JSON.parse(cleaned);

            // Handle "extends": "./tsconfig.paths.json"
            if (parsed.extends) {
              const extendedPath = path.resolve(root, parsed.extends);
              if (fs.existsSync(extendedPath)) {
                try {
                  const extRaw = fs.readFileSync(extendedPath, 'utf-8').replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');
                  const extParsed = JSON.parse(extRaw);
                  if (extParsed.compilerOptions?.paths) {
                    this.registerPaths(extParsed.compilerOptions.paths, root, extParsed.compilerOptions.baseUrl || '.');
                  }
                } catch {}
              }
            }

            if (parsed.compilerOptions?.paths) {
              this.registerPaths(parsed.compilerOptions.paths, root, parsed.compilerOptions.baseUrl || '.');
            }
          } catch {}
        }
      }
    }
  }

  private registerPaths(paths: Record<string, string[]>, root: string, baseUrl: string) {
    this.baseUrl = baseUrl;
    for (const [key, targets] of Object.entries(paths)) {
      const resolvedTargets = targets.map((t) => path.resolve(root, baseUrl, t.replace(/\*$/, '')));
      this.pathAliases.set(key.replace(/\*$/, ''), resolvedTargets);
    }
  }

  public async processFile(fileUri: vscode.Uri): Promise<void> {
    const fsPath = fileUri.fsPath;
    let content: string;
    try {
      content = await fs.promises.readFile(fsPath, 'utf-8');
    } catch {
      return;
    }

    // Fast heuristic check
    const hasRoute = content.includes('<Route') || content.includes('createBrowserRouter') || content.includes('useRoutes');
    if (!hasRoute) {
      return;
    }

    const sourceFile = ts.createSourceFile(
      fsPath,
      content,
      ts.ScriptTarget.Latest,
      true,
      fsPath.endsWith('.tsx') || fsPath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const importsMap = new Map<string, string>();
    this.collectImports(sourceFile, importsMap);

    this.walkAst(sourceFile, fileUri, importsMap);
  }

  private collectImports(sourceFile: ts.SourceFile, importsMap: Map<string, string>) {
    ts.forEachChild(sourceFile, (node) => {
      // 1. Standard imports: import Component from './Component'
      if (ts.isImportDeclaration(node) && node.importClause && node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          const importPath = node.moduleSpecifier.text;
          if (node.importClause.name) {
            importsMap.set(node.importClause.name.text, importPath);
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const el of node.importClause.namedBindings.elements) {
                importsMap.set(el.name.text, importPath);
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              importsMap.set(node.importClause.namedBindings.name.text, importPath);
            }
          }
        }
      }

      // 2. Dynamic/Lazy imports: const Home = Loadable(lazy(() => import("@pages/Home")));
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            const varName = decl.name.text;
            const initText = decl.initializer.getText(sourceFile);
            const dynamicImportMatch = /import\s*\(\s*(['"`])([^'"`]+)\1\s*\)/.exec(initText);
            if (dynamicImportMatch) {
              importsMap.set(varName, dynamicImportMatch[2]);
            }
          }
        }
      }
    });
  }

  private walkAst(sourceFile: ts.SourceFile, fileUri: vscode.Uri, importsMap: Map<string, string>) {
    const visit = (node: ts.Node, parentPath: string = '') => {
      // 1. JSX Routes: <Route path="/..." element={<Screen />} />
      if (ts.isJsxElement(node)) {
        const opening = node.openingElement;
        const tagName = opening.tagName.getText(sourceFile);
        if (tagName === 'Route' || tagName.endsWith('.Route')) {
          const { pathStr, currentPath } = this.extractRouteInfo(opening, sourceFile, parentPath);
          if (pathStr) {
            const componentName = this.extractComponentFromElement(opening, sourceFile);
            this.registerRoute(pathStr, componentName, fileUri, importsMap);
          }
          // Recursively visit children with updated parentPath
          for (const child of node.children) {
            visit(child, currentPath || parentPath);
          }
          return;
        }
      } else if (ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(sourceFile);
        if (tagName === 'Route' || tagName.endsWith('.Route')) {
          const { pathStr } = this.extractRouteInfo(node, sourceFile, parentPath);
          if (pathStr) {
            const componentName = this.extractComponentFromElement(node, sourceFile);
            this.registerRoute(pathStr, componentName, fileUri, importsMap);
          }
        }
      }

      // 2. Object routes in createBrowserRouter([ { path: "...", element: <Component /> } ])
      if (ts.isObjectLiteralExpression(node)) {
        let pathValue: string | undefined;
        let elementNode: ts.Expression | undefined;
        let childrenNode: ts.ArrayLiteralExpression | undefined;

        for (const prop of node.properties) {
          if (ts.isPropertyAssignment(prop)) {
            const propName = prop.name.getText(sourceFile);
            if (propName === 'path') {
              if (ts.isStringLiteral(prop.initializer)) {
                pathValue = prop.initializer.text;
              }
            } else if (propName === 'element' || propName === 'Component' || propName === 'component') {
              elementNode = prop.initializer;
            } else if (propName === 'children' && ts.isArrayLiteralExpression(prop.initializer)) {
              childrenNode = prop.initializer;
            }
          }
        }

        if (pathValue !== undefined) {
          const fullPath = this.combinePaths(parentPath, pathValue);
          let compName: string | undefined;
          if (elementNode) {
            compName = this.extractComponentFromExpression(elementNode, sourceFile);
          }
          this.registerRoute(fullPath, compName, fileUri, importsMap);

          if (childrenNode) {
            for (const child of childrenNode.elements) {
              visit(child, fullPath);
            }
            return;
          }
        }
      }

      ts.forEachChild(node, (n) => visit(n, parentPath));
    };

    visit(sourceFile);
  }

  private extractRouteInfo(
    element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    sourceFile: ts.SourceFile,
    parentPath: string
  ): { pathStr?: string; currentPath: string } {
    let rawPath: string | undefined;

    for (const attr of element.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name.text === 'path') {
        if (attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) {
            rawPath = attr.initializer.text;
          } else if (
            ts.isJsxExpression(attr.initializer) &&
            attr.initializer.expression &&
            ts.isStringLiteral(attr.initializer.expression)
          ) {
            rawPath = attr.initializer.expression.text;
          }
        }
      }
    }

    if (rawPath === undefined) {
      return { currentPath: parentPath };
    }

    const fullPath = this.combinePaths(parentPath, rawPath);
    return { pathStr: fullPath, currentPath: fullPath };
  }

  private combinePaths(parent: string, child: string): string {
    if (!parent) {
      return child.startsWith('/') ? child : '/' + child;
    }
    if (child.startsWith('/')) {
      return child;
    }
    const cleanParent = parent.endsWith('/') ? parent.slice(0, -1) : parent;
    return `${cleanParent}/${child}`;
  }

  private extractComponentFromElement(
    element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    sourceFile: ts.SourceFile
  ): string | undefined {
    for (const attr of element.attributes.properties) {
      if (ts.isJsxAttribute(attr)) {
        const attrName = attr.name.text;
        if ((attrName === 'element' || attrName === 'Component' || attrName === 'component') && attr.initializer) {
          if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
            return this.extractComponentFromExpression(attr.initializer.expression, sourceFile);
          }
          if (ts.isStringLiteral(attr.initializer)) {
            return attr.initializer.text;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Find the actual screen component inside element expression:
   * e.g. <ConsentPage /> -> ConsentPage
   * e.g. <ProtectedDeviceSearch><DeviceInfoStep1Page /></ProtectedDeviceSearch> -> DeviceInfoStep1Page
   * e.g. Loadable(lazy(...)) -> Component
   */
  private extractComponentFromExpression(expr: ts.Expression, sourceFile: ts.SourceFile): string | undefined {
    // If it's a direct identifier: Component={ConsentPage}
    if (ts.isIdentifier(expr)) {
      return expr.text;
    }

    // If it's JSX: <ConsentPage /> or <ProtectedDeviceSearch><DeviceInfoStep1Page /></ProtectedDeviceSearch>
    if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) {
      const candidates: string[] = [];

      const walk = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(sourceFile);
          if (tag && /^[A-Z]/.test(tag)) {
            candidates.push(tag);
          }
        }
        ts.forEachChild(node, walk);
      };

      walk(expr);

      if (candidates.length > 0) {
        // Prioritize names ending in Page, Screen, View, or take the last/inner component
        const preferred = candidates.find((c) => c.endsWith('Page') || c.endsWith('Screen') || c.endsWith('View'));
        return preferred || candidates[candidates.length - 1];
      }
    }

    return undefined;
  }

  private registerRoute(
    routePath: string,
    componentName: string | undefined,
    currentFileUri: vscode.Uri,
    importsMap: Map<string, string>
  ) {
    if (!routePath || routePath === '*') {
      return;
    }

    let targetFileUri = currentFileUri;
    let targetRange: vscode.Range | undefined;

    if (componentName && importsMap.has(componentName)) {
      const importPath = importsMap.get(componentName)!;
      const resolved = this.resolveImportPath(currentFileUri, importPath);
      if (resolved) {
        targetFileUri = resolved;
      }
    }

    // Extract dynamic params: e.g. "/user/:id/:tab?"
    const params: RouteParam[] = [];
    const paramRegex = /:([a-zA-Z0-9_]+)(\?)?/g;
    let match: RegExpExecArray | null;
    while ((match = paramRegex.exec(routePath)) !== null) {
      params.push({
        name: match[1],
        type: 'string',
        required: !match[2],
        description: `URL parameter :${match[1]}`,
      });
    }

    const routeDef: RouteDefinition = {
      id: `react-router:${routePath}`,
      framework: 'react-router',
      name: routePath,
      fileUri: targetFileUri,
      targetRange,
      componentName,
      params,
      description: `React Router: ${routePath}`,
    };

    this.routes.set(routePath, routeDef);

    // Also register without trailing slash if present
    if (routePath.endsWith('/') && routePath.length > 1) {
      this.routes.set(routePath.slice(0, -1), routeDef);
    }
  }

  public resolveImportPath(currentFileUri: vscode.Uri, importPath: string): vscode.Uri | null {
    const currentDir = path.dirname(currentFileUri.fsPath);
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

    // 1. Check Path Aliases (e.g. @pages/..., @/...)
    for (const [rawAlias, targetDirs] of this.pathAliases.entries()) {
      const prefix = rawAlias.replace(/\/$/, '');
      if (importPath === prefix || importPath.startsWith(prefix + '/')) {
        const subPath = importPath.slice(prefix.length).replace(/^\//, '');
        for (const targetDir of targetDirs) {
          const candidateBase = path.join(targetDir, subPath);
          const resolved = this.tryExtensions(candidateBase, extensions);
          if (resolved) {
            return resolved;
          }
        }
      }
    }

    // 2. Relative imports (./ or ../)
    if (importPath.startsWith('.')) {
      const candidateBase = path.resolve(currentDir, importPath);
      const resolved = this.tryExtensions(candidateBase, extensions);
      if (resolved) {
        return resolved;
      }
    }

    // 3. Fallback heuristic: check src/ directory if path starts with @ or ~
    if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(currentFileUri);
      if (workspaceFolder) {
        const subPath = importPath.slice(2);
        const candidateBase = path.join(workspaceFolder.uri.fsPath, 'src', subPath);
        const resolved = this.tryExtensions(candidateBase, extensions);
        if (resolved) {
          return resolved;
        }
      }
    }

    return null;
  }

  private tryExtensions(base: string, extensions: string[]): vscode.Uri | null {
    if (fs.existsSync(base) && fs.statSync(base).isFile()) {
      return vscode.Uri.file(base);
    }
    for (const ext of extensions) {
      const candidate = base + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return vscode.Uri.file(candidate);
      }
    }
    return null;
  }

  public findRoute(routePath: string): RouteDefinition | undefined {
    if (this.routes.has(routePath)) {
      return this.routes.get(routePath);
    }

    // Normalize leading slash
    const withSlash = routePath.startsWith('/') ? routePath : '/' + routePath;
    if (this.routes.has(withSlash)) {
      return this.routes.get(withSlash);
    }

    const withoutSlash = routePath.startsWith('/') ? routePath.slice(1) : routePath;
    if (this.routes.has(withoutSlash)) {
      return this.routes.get(withoutSlash);
    }

    // Parameterized matching: e.g. "/user/:id" matching "/user/123" or "/user/[id]"
    for (const [key, def] of this.routes.entries()) {
      if (key.includes(':') || key.includes('[')) {
        const pattern =
          '^' +
          key
            .replace(/:[a-zA-Z0-9_]+\??/g, '(?:\\[[^\\]]+\\]|[^/]+)')
            .replace(/\[[a-zA-Z0-9_.]+\]/g, '(?:\\[[^\\]]+\\]|:[a-zA-Z0-9_]+|[^/]+)') +
          '$';
        try {
          if (new RegExp(pattern).test(withSlash)) {
            return def;
          }
        } catch {}
      }
    }

    return undefined;
  }

  public getRoutes(): RouteDefinition[] {
    return Array.from(this.routes.values());
  }

  public removeFile(fileUri: vscode.Uri) {
    for (const [key, def] of this.routes.entries()) {
      if (def.fileUri.fsPath === fileUri.fsPath) {
        this.routes.delete(key);
      }
    }
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.routes.clear();
    this.pathAliases.clear();
  }
}
