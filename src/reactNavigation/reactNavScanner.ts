import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import { RouteDefinition, RouteParam } from '../types';

export class ReactNavScanner {
  private screens: Map<string, RouteDefinition> = new Map();
  // Map between enum/constant identifier to evaluated string value, e.g. "ScreenEnum.AccountSetting" -> "AccountSetting"
  private enumMap: Map<string, string> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {}

  public async scanWorkspace(): Promise<RouteDefinition[]> {
    this.screens.clear();
    this.enumMap.clear();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    for (const folder of workspaceFolders) {
      // Find all ts, tsx, js, jsx files that might define routes or param lists or enums
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.{ts,tsx,js,jsx}'),
        '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/.expo/**}'
      );

      for (const fileUri of files) {
        try {
          await this.processFile(fileUri);
        } catch (e) {
          // Ignore parsing errors for individual files
        }
      }
    }

    return Array.from(this.screens.values());
  }

  public async processFile(fileUri: vscode.Uri): Promise<void> {
    const fsPath = fileUri.fsPath;
    let content: string;
    try {
      content = await fs.promises.readFile(fsPath, 'utf-8');
    } catch {
      return;
    }

    // Fast check before doing AST parse
    const hasParamList = content.includes('ParamList');
    const hasScreen = content.includes('.Screen') || content.includes('<Screen');
    const hasEnum = content.includes('enum ') || content.includes('as const');

    if (!hasParamList && !hasScreen && !hasEnum) {
      return;
    }

    const sourceFile = ts.createSourceFile(
      fsPath,
      content,
      ts.ScriptTarget.Latest,
      true,
      fsPath.endsWith('.tsx') || fsPath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    // Track imports in this file to resolve component file paths
    const importsMap = new Map<string, string>(); // identifier -> importPath
    this.collectImports(sourceFile, importsMap);

    // Walk AST
    this.walkAst(sourceFile, fileUri, content, importsMap);
  }

  private collectImports(sourceFile: ts.SourceFile, importsMap: Map<string, string>) {
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node) && node.importClause && node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          const importPath = node.moduleSpecifier.text;

          // Default import: import UserScreen from './UserScreen'
          if (node.importClause.name) {
            importsMap.set(node.importClause.name.text, importPath);
          }

          // Named imports: import { UserScreen } from './UserScreen'
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                importsMap.set(element.name.text, importPath);
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              importsMap.set(node.importClause.namedBindings.name.text, importPath);
            }
          }
        }
      }
    });
  }

  private walkAst(
    sourceFile: ts.SourceFile,
    fileUri: vscode.Uri,
    content: string,
    importsMap: Map<string, string>
  ) {
    const visit = (node: ts.Node) => {
      // 1. Detect Enums: enum ScreenEnum { AccountSetting = 'AccountSetting' }
      if (ts.isEnumDeclaration(node)) {
        this.parseEnumDeclaration(node, sourceFile);
      }

      // 2. Detect Const Objects: const SCREENS = { AccountSetting: 'AccountSetting' } as const
      if (ts.isVariableStatement(node)) {
        this.parseConstObjectDeclaration(node, sourceFile);
      }

      // 3. Detect Type Alias: type RootStackParamList = { ... }
      if (ts.isTypeAliasDeclaration(node)) {
        const typeName = node.name.text;
        if (typeName.endsWith('ParamList') || typeName.includes('ParamList')) {
          if (ts.isTypeLiteralNode(node.type)) {
            this.parseTypeLiteralMembers(node.type, sourceFile, fileUri, content);
          }
        }
      }

      // 4. Detect Interface: interface RootStackParamList { ... }
      if (ts.isInterfaceDeclaration(node)) {
        const interfaceName = node.name.text;
        if (interfaceName.endsWith('ParamList') || interfaceName.includes('ParamList')) {
          this.parseInterfaceMembers(node, sourceFile, fileUri, content);
        }
      }

      // 5. Detect JSX: <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        this.parseJsxScreen(node, sourceFile, fileUri, importsMap);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private parseEnumDeclaration(node: ts.EnumDeclaration, sourceFile: ts.SourceFile) {
    const enumName = node.name.text;
    for (const member of node.members) {
      const memberName = member.name.getText(sourceFile);
      let val = memberName;
      if (member.initializer) {
        if (ts.isStringLiteral(member.initializer)) {
          val = member.initializer.text;
        } else {
          val = member.initializer.getText(sourceFile);
        }
      }
      this.enumMap.set(`${enumName}.${memberName}`, val);
      this.enumMap.set(memberName, val);
    }
  }

  private parseConstObjectDeclaration(node: ts.VariableStatement, sourceFile: ts.SourceFile) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        const objName = decl.name.text;
        let objLiteral: ts.ObjectLiteralExpression | undefined;

        if (ts.isObjectLiteralExpression(decl.initializer)) {
          objLiteral = decl.initializer;
        } else if (
          ts.isAsExpression(decl.initializer) &&
          ts.isObjectLiteralExpression(decl.initializer.expression)
        ) {
          objLiteral = decl.initializer.expression;
        }

        if (objLiteral) {
          for (const prop of objLiteral.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name) {
              const propName = prop.name.getText(sourceFile);
              let val = propName;
              if (ts.isStringLiteral(prop.initializer)) {
                val = prop.initializer.text;
              }
              this.enumMap.set(`${objName}.${propName}`, val);
              this.enumMap.set(propName, val);
            }
          }
        }
      }
    }
  }

  private parseTypeLiteralMembers(
    typeLiteral: ts.TypeLiteralNode,
    sourceFile: ts.SourceFile,
    fileUri: vscode.Uri,
    content: string
  ) {
    for (const member of typeLiteral.members) {
      if (ts.isPropertySignature(member) && member.name) {
        this.registerParamMember(member, sourceFile, fileUri, content);
      }
    }
  }

  private parseInterfaceMembers(
    interfaceDecl: ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile,
    fileUri: vscode.Uri,
    content: string
  ) {
    for (const member of interfaceDecl.members) {
      if (ts.isPropertySignature(member) && member.name) {
        this.registerParamMember(member, sourceFile, fileUri, content);
      }
    }
  }

  private registerParamMember(
    member: ts.PropertySignature,
    sourceFile: ts.SourceFile,
    fileUri: vscode.Uri,
    content: string
  ) {
    let screenName = '';
    const enumRefs: string[] = [];

    if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
      screenName = member.name.text;
      enumRefs.push(screenName);
    } else if (ts.isComputedPropertyName(member.name)) {
      // e.g. [ScreenEnum.AccountSetting]: undefined;
      const exprText = member.name.expression.getText(sourceFile);
      const memberOnly = exprText.split('.').pop()!;
      screenName = this.enumMap.get(exprText) || memberOnly;
      enumRefs.push(exprText, memberOnly, screenName);
    } else {
      return;
    }

    const startPos = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));
    const endPos = sourceFile.getLineAndCharacterOfPosition(member.getEnd());
    const range = new vscode.Range(
      new vscode.Position(startPos.line, startPos.character),
      new vscode.Position(endPos.line, endPos.character)
    );

    const params: RouteParam[] = [];
    let rawParamString = 'undefined';

    if (member.type) {
      rawParamString = member.type.getText(sourceFile);
      if (ts.isTypeLiteralNode(member.type)) {
        for (const prop of member.type.members) {
          if (ts.isPropertySignature(prop) && prop.name) {
            const propName = prop.name.getText(sourceFile);
            const propType = prop.type ? prop.type.getText(sourceFile) : 'any';
            const isOptional = !!prop.questionToken;
            params.push({
              name: propName,
              type: propType,
              required: !isOptional,
            });
          }
        }
      }
    }

    const existing = this.screens.get(screenName);
    if (existing) {
      existing.params = params;
      existing.rawParamString = rawParamString;
      existing.typeLocation = { uri: fileUri, range };
      if (enumRefs.length > 0) {
        existing.enumReferences = Array.from(new Set([...(existing.enumReferences || []), ...enumRefs]));
      }
      if (!existing.componentName) {
        existing.fileUri = fileUri;
        existing.targetRange = range;
      }
    } else {
      const def: RouteDefinition = {
        id: `react-nav:${screenName}`,
        framework: 'react-navigation',
        name: screenName,
        enumReferences: enumRefs,
        fileUri,
        targetRange: range,
        typeLocation: { uri: fileUri, range },
        params,
        rawParamString,
        description: `React Navigation Screen: ${screenName}`,
      };
      this.screens.set(screenName, def);
    }
  }

  private parseJsxScreen(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    sourceFile: ts.SourceFile,
    fileUri: vscode.Uri,
    importsMap: Map<string, string>
  ) {
    const tagName = node.tagName.getText(sourceFile);
    if (!tagName.endsWith('Screen') && !tagName.endsWith('.Screen')) {
      return;
    }

    let screenName: string | undefined;
    let componentIdentifier: string | undefined;
    let nameNodeRange: vscode.Range | undefined;
    const enumRefs: string[] = [];

    for (const attr of node.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name) {
        const attrName = attr.name.text;
        if (attrName === 'name' && attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) {
            screenName = attr.initializer.text;
            enumRefs.push(screenName);
            const start = sourceFile.getLineAndCharacterOfPosition(attr.initializer.getStart(sourceFile));
            const end = sourceFile.getLineAndCharacterOfPosition(attr.initializer.getEnd());
            nameNodeRange = new vscode.Range(
              new vscode.Position(start.line, start.character),
              new vscode.Position(end.line, end.character)
            );
          } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
            const expr = attr.initializer.expression;
            if (ts.isStringLiteral(expr)) {
              screenName = expr.text;
              enumRefs.push(screenName);
            } else if (ts.isPropertyAccessExpression(expr)) {
              // e.g. name={ScreenEnum.AccountSetting}
              const fullExprText = expr.getText(sourceFile);
              const propName = expr.name.text;
              screenName = this.enumMap.get(fullExprText) || propName;
              enumRefs.push(fullExprText, propName, screenName);
            } else if (ts.isIdentifier(expr)) {
              const idText = expr.text;
              screenName = this.enumMap.get(idText) || idText;
              enumRefs.push(idText, screenName);
            }
          }
        } else if (attrName === 'component' && attr.initializer) {
          if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
            componentIdentifier = attr.initializer.expression.getText(sourceFile);
          }
        }
      }
    }

    if (!screenName) {
      return;
    }

    // Try to resolve component file path from import
    let targetFileUri = fileUri;
    let targetRange = nameNodeRange;

    if (componentIdentifier && importsMap.has(componentIdentifier)) {
      const relativeImport = importsMap.get(componentIdentifier)!;
      const resolvedUri = this.resolveImportPath(fileUri, relativeImport);
      if (resolvedUri) {
        targetFileUri = resolvedUri;
        targetRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
      }
    }

    const existing = this.screens.get(screenName);
    if (existing) {
      if (componentIdentifier) {
        existing.componentName = componentIdentifier;
      }
      if (targetFileUri !== fileUri) {
        existing.fileUri = targetFileUri;
        existing.targetRange = targetRange;
      }
      if (enumRefs.length > 0) {
        existing.enumReferences = Array.from(new Set([...(existing.enumReferences || []), ...enumRefs]));
      }
    } else {
      const def: RouteDefinition = {
        id: `react-nav:${screenName}`,
        framework: 'react-navigation',
        name: screenName,
        enumReferences: enumRefs,
        fileUri: targetFileUri,
        targetRange,
        componentName: componentIdentifier,
        params: [],
        rawParamString: 'undefined',
        description: `React Navigation Screen: ${screenName}`,
      };
      this.screens.set(screenName, def);
    }
  }

  private resolveImportPath(currentFileUri: vscode.Uri, importPath: string): vscode.Uri | null {
    if (!importPath.startsWith('.')) {
      return null; // External package
    }

    const currentDir = path.dirname(currentFileUri.fsPath);
    const candidateBase = path.resolve(currentDir, importPath);

    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

    // Direct check
    if (fs.existsSync(candidateBase) && fs.statSync(candidateBase).isFile()) {
      return vscode.Uri.file(candidateBase);
    }

    for (const ext of extensions) {
      const candidate = candidateBase + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return vscode.Uri.file(candidate);
      }
    }

    return null;
  }

  public removeFile(fileUri: vscode.Uri) {
    for (const [key, def] of this.screens.entries()) {
      if (
        def.fileUri.fsPath === fileUri.fsPath ||
        def.typeLocation?.uri.fsPath === fileUri.fsPath
      ) {
        this.screens.delete(key);
      }
    }
  }

  public getRoutes(): RouteDefinition[] {
    return Array.from(this.screens.values());
  }

  public findRoute(identifierOrName: string): RouteDefinition | undefined {
    // 1. Direct match with registered screen name
    if (this.screens.has(identifierOrName)) {
      return this.screens.get(identifierOrName);
    }

    // 2. Check enumMap for evaluated value
    if (this.enumMap.has(identifierOrName)) {
      const evaluated = this.enumMap.get(identifierOrName)!;
      if (this.screens.has(evaluated)) {
        return this.screens.get(evaluated);
      }
    }

    // 3. Check enumReferences on any route
    for (const def of this.screens.values()) {
      if (def.enumReferences && def.enumReferences.includes(identifierOrName)) {
        return def;
      }
    }

    // 4. If identifier has dots: e.g. ScreenEnum.AccountSetting or MenuTabEnum.Policy
    if (identifierOrName.includes('.')) {
      const member = identifierOrName.split('.').pop()!;
      if (this.screens.has(member)) {
        return this.screens.get(member);
      }
      for (const def of this.screens.values()) {
        if (def.enumReferences && def.enumReferences.includes(member)) {
          return def;
        }
      }
    }

    // 5. Case-insensitive or component name match (e.g. "AccountSetting" matches "AccountSettingScreen")
    const cleanLower = identifierOrName.replace(/^.*[./]/, '').toLowerCase();
    for (const [key, def] of this.screens.entries()) {
      if (key.toLowerCase() === cleanLower) {
        return def;
      }
      if (def.componentName && def.componentName.toLowerCase().includes(cleanLower)) {
        return def;
      }
    }

    return undefined;
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.screens.clear();
    this.enumMap.clear();
  }
}
