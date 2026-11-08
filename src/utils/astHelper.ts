import * as vscode from 'vscode';
import * as ts from 'typescript';

export interface RouteMatchInfo {
  routeString: string;
  memberOnly?: string;
  range: vscode.Range;
  isExpoLike: boolean;
  frameworkHint?: 'expo-router' | 'react-navigation' | 'react-router';
  isMethodClick?: boolean;
}

export interface CompletionContextInfo {
  type: 'route-name' | 'param-key';
  frameworkHint?: 'expo-router' | 'react-navigation' | 'react-router';
  currentRouteName?: string;
  range: vscode.Range;
}

export class AstHelper {
  /**
   * Find navigation targets (route string, enum, identifier, or nested screen) at position.
   * Can return multiple targets when clicking on navigation.navigate(...) (e.g. nested screen + parent screen).
   */
  public static getTargetsAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): RouteMatchInfo[] {
    const results: RouteMatchInfo[] = [];

    // 1. Check if clicking on a string literal: 'UserProfile' or '/user/123'
    const strMatch = this.getStringLiteralAtPosition(document, position);
    if (strMatch) {
      return [strMatch];
    }

    // 2. Parse AST for identifiers, enums, or method click (navigation.navigate)
    const content = document.getText();
    const sourceFile = ts.createSourceFile(
      document.fileName,
      content,
      ts.ScriptTarget.Latest,
      true,
      document.languageId.includes('react') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const offset = document.offsetAt(position);
    const targetNode = this.findNodeAtOffset(sourceFile, offset);

    if (!targetNode) {
      return results;
    }

    // Check if clicking directly on "navigate", "push", "replace"
    const callExpr = this.findAncestorCallExpression(targetNode);
    if (callExpr && this.isNavigationCall(callExpr, sourceFile, targetNode)) {
      // User clicked on "navigate" / "push" / "replace"
      const extracted = this.extractTargetsFromNavigationCall(callExpr, sourceFile);
      if (extracted.length > 0) {
        return extracted;
      }
    }

    // Check if clicking on PropertyAccessExpression e.g. ScreenEnum.AccountSetting or MenuTabEnum.Policy
    let propAccess: ts.PropertyAccessExpression | undefined;
    if (ts.isPropertyAccessExpression(targetNode)) {
      propAccess = targetNode;
    } else if (targetNode.parent && ts.isPropertyAccessExpression(targetNode.parent)) {
      propAccess = targetNode.parent;
    }

    if (propAccess) {
      const fullText = propAccess.getText(sourceFile);
      const member = propAccess.name.text;
      const start = document.positionAt(propAccess.getStart(sourceFile));
      const end = document.positionAt(propAccess.getEnd());
      const range = new vscode.Range(start, end);

      return [
        {
          routeString: fullText,
          memberOnly: member,
          range,
          isExpoLike: false,
          frameworkHint: 'react-navigation',
        },
      ];
    }

    // Check if clicking on Identifier e.g. Policy or AccountSetting
    if (ts.isIdentifier(targetNode)) {
      const text = targetNode.text;
      // Skip language keywords or navigation object itself
      if (text !== 'navigation' && text !== 'router' && text !== 'navigate' && text !== 'push') {
        const start = document.positionAt(targetNode.getStart(sourceFile));
        const end = document.positionAt(targetNode.getEnd());
        const range = new vscode.Range(start, end);

        return [
          {
            routeString: text,
            memberOnly: text,
            range,
            isExpoLike: false,
            frameworkHint: 'react-navigation',
          },
        ];
      }
    }

    return results;
  }

  private static findNodeAtOffset(sourceFile: ts.SourceFile, offset: number): ts.Node | undefined {
    let found: ts.Node | undefined;

    function walk(node: ts.Node) {
      if (offset >= node.getStart(sourceFile) && offset <= node.getEnd()) {
        found = node;
        ts.forEachChild(node, walk);
      }
    }

    walk(sourceFile);
    return found;
  }

  private static findAncestorCallExpression(node: ts.Node): ts.CallExpression | undefined {
    let curr: ts.Node | undefined = node;
    while (curr) {
      if (ts.isCallExpression(curr)) {
        return curr;
      }
      curr = curr.parent;
    }
    return undefined;
  }

  private static isNavigationCall(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile,
    cursorNode: ts.Node
  ): boolean {
    const exprText = call.expression.getText(sourceFile);
    const isNav =
      exprText.includes('.navigate') ||
      exprText.includes('.push') ||
      exprText.includes('.replace') ||
      exprText === 'navigate' ||
      exprText === 'redirect';

    if (!isNav) {
      return false;
    }

    // Check if cursor is on or near the method identifier
    const cursorText = cursorNode.getText(sourceFile);
    if (
      cursorText === 'navigate' ||
      cursorText === 'push' ||
      cursorText === 'replace' ||
      cursorText === 'navigation' ||
      cursorText === 'redirect'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Extract target screen names and nested screen names from a navigation call:
   * e.g. navigation.navigate(ScreenEnum.AccountSetting, { screen: MenuTabEnum.Policy, ... })
   */
  public static extractTargetsFromNavigationCall(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile
  ): RouteMatchInfo[] {
    const results: RouteMatchInfo[] = [];
    const args = call.arguments;
    if (args.length === 0) {
      return results;
    }

    let rootTarget: RouteMatchInfo | undefined;
    let nestedTarget: RouteMatchInfo | undefined;

    // Arg 0: Root target
    const arg0 = args[0];
    if (ts.isStringLiteral(arg0)) {
      rootTarget = {
        routeString: arg0.text,
        range: new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, 0)
        ),
        isExpoLike: arg0.text.startsWith('/') || arg0.text.includes('/'),
        frameworkHint: arg0.text.startsWith('/') ? 'expo-router' : 'react-navigation',
        isMethodClick: true,
      };
    } else if (ts.isPropertyAccessExpression(arg0)) {
      rootTarget = {
        routeString: arg0.getText(sourceFile),
        memberOnly: arg0.name.text,
        range: new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, 0)
        ),
        isExpoLike: false,
        frameworkHint: 'react-navigation',
        isMethodClick: true,
      };
    } else if (ts.isIdentifier(arg0)) {
      rootTarget = {
        routeString: arg0.text,
        memberOnly: arg0.text,
        range: new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, 0)
        ),
        isExpoLike: false,
        frameworkHint: 'react-navigation',
        isMethodClick: true,
      };
    } else if (ts.isObjectLiteralExpression(arg0)) {
      // Expo Router: router.push({ pathname: '/user/[id]' })
      for (const prop of arg0.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText(sourceFile) === 'pathname') {
          if (ts.isStringLiteral(prop.initializer)) {
            rootTarget = {
              routeString: prop.initializer.text,
              range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
              isExpoLike: true,
              frameworkHint: 'expo-router',
              isMethodClick: true,
            };
          }
        }
      }
    }

    // Arg 1: Nested Navigation target ({ screen: MenuTabEnum.Policy, params: { ... } })
    if (args.length > 1 && ts.isObjectLiteralExpression(args[1])) {
      const obj = args[1] as ts.ObjectLiteralExpression;
      for (const prop of obj.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText(sourceFile) === 'screen') {
          const init = prop.initializer;
          if (ts.isStringLiteral(init)) {
            nestedTarget = {
              routeString: init.text,
              range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
              isExpoLike: false,
              frameworkHint: 'react-navigation',
              isMethodClick: true,
            };
          } else if (ts.isPropertyAccessExpression(init)) {
            nestedTarget = {
              routeString: init.getText(sourceFile),
              memberOnly: init.name.text,
              range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
              isExpoLike: false,
              frameworkHint: 'react-navigation',
              isMethodClick: true,
            };
          } else if (ts.isIdentifier(init)) {
            nestedTarget = {
              routeString: init.text,
              memberOnly: init.text,
              range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
              isExpoLike: false,
              frameworkHint: 'react-navigation',
              isMethodClick: true,
            };
          }
        }
      }
    }

    // Prioritize nested target first because that's the ultimate destination screen!
    if (nestedTarget) {
      results.push(nestedTarget);
    }
    if (rootTarget) {
      results.push(rootTarget);
    }

    return results;
  }

  /**
   * Helper to retrieve preceding text in the document before a given position,
   * looking backwards across previous lines.
   */
  public static getPrecedingText(
    document: vscode.TextDocument,
    lineNumber: number,
    charIndex: number,
    maxLookbackLines: number = 10
  ): string {
    const currentLine = document.lineAt(lineNumber).text.substring(0, charIndex);
    const startLine = Math.max(0, lineNumber - maxLookbackLines);
    const lines: string[] = [];
    for (let i = startLine; i < lineNumber; i++) {
      lines.push(document.lineAt(i).text);
    }
    lines.push(currentLine);
    return lines.join('\n');
  }

  /**
   * Detect if the text preceding a string literal indicates a navigation context.
   */
  public static detectNavigationContext(text: string): {
    isNav: boolean;
    frameworkHint?: 'expo-router' | 'react-navigation' | 'react-router';
  } {
    // Strip comments and trailing whitespace
    const clean = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .trimEnd();

    // 1. Expo Router object pathname: pathname: "..." or pathname: \n "..."
    if (/pathname\s*:\s*$/.test(clean)) {
      return { isNav: true, frameworkHint: 'expo-router' };
    }

    // 2. Direct navigation call: router.navigate(...), navigation.push(...), or bare navigate(...)
    const navCallMatch = /(?:(?:\bnavigation|\brouter)\s*\.\s*(?:navigate|push|replace)|\bnavigate|\bredirect)\s*\(\s*$/.exec(clean);
    if (navCallMatch) {
      let hint: 'expo-router' | 'react-navigation' | 'react-router' = 'react-router';
      if (clean.includes('router.')) {
        hint = 'expo-router';
      } else if (clean.includes('navigation.')) {
        hint = 'react-navigation';
      }
      return {
        isNav: true,
        frameworkHint: hint,
      };
    }

    // 3. Link component href or to: <Link href="..." or <Link to="..."
    if (/(?:href|to)\s*=\s*\{?\s*$/.test(clean)) {
      const isTo = /\bto\s*=\s*\{?\s*$/.test(clean);
      return { isNav: true, frameworkHint: isTo ? 'react-router' : 'expo-router' };
    }

    // 4. React Navigation nested screen: screen: "..."
    if (/\bscreen\s*:\s*$/.test(clean)) {
      return { isNav: true, frameworkHint: 'react-navigation' };
    }

    // 5. Stack.Navigator initialRouteName: initialRouteName="..."
    if (/\binitialRouteName\s*=\s*\{?\s*$/.test(clean)) {
      return { isNav: true, frameworkHint: 'react-navigation' };
    }

    // 6. Screen component name: <Stack.Screen name="..." or <Screen \n name=\n "..."
    if (/<(?:[A-Za-z0-9]+\.)?Screen\b[\s\S]*?\bname\s*=\s*\{?\s*$/.test(clean)) {
      return { isNav: true, frameworkHint: 'react-navigation' };
    }

    // 7. React Router Route path: <Route path="..." or <Route \n path=\n "..."
    if (/<(?:[A-Za-z0-9]+\.)?Route\b[\s\S]*?\bpath\s*=\s*\{?\s*$/.test(clean)) {
      return { isNav: true, frameworkHint: 'react-router' };
    }

    return { isNav: false };
  }

  /**
   * Find string literal at position in the document.
   */
  public static getStringLiteralAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): RouteMatchInfo | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const char = position.character;

    const strRegex = /(["'`])([^"'`]*?)\1/g;
    let match: RegExpExecArray | null;

    while ((match = strRegex.exec(lineText)) !== null) {
      const quoteStart = match.index;
      const strContent = match[2];
      const quoteEnd = quoteStart + match[0].length;

      if (char >= quoteStart && char <= quoteEnd) {
        const contentStart = quoteStart + 1;
        const contentEnd = quoteEnd - 1;
        const range = new vscode.Range(
          new vscode.Position(position.line, contentStart),
          new vscode.Position(position.line, contentEnd)
        );

        const beforeString = lineText.substring(0, quoteStart);
        let navContext = this.detectNavigationContext(beforeString);
        if (!navContext.isNav) {
          const precedingText = this.getPrecedingText(document, position.line, quoteStart);
          navContext = this.detectNavigationContext(precedingText);
        }

        const isExpoLike = strContent.startsWith('/') || strContent.includes('/');

        return {
          routeString: strContent,
          range,
          isExpoLike,
          frameworkHint: navContext.frameworkHint || (isExpoLike ? 'expo-router' : 'react-navigation'),
        };
      }
    }

    return null;
  }

  /**
   * Find all route string occurrences in a document line for DocumentLinks and Diagnostics.
   */
  public static getAllRouteStringsInLine(
    document: vscode.TextDocument,
    lineNumber: number
  ): RouteMatchInfo[] {
    const line = document.lineAt(lineNumber);
    const lineText = line.text;
    const results: RouteMatchInfo[] = [];

    // Quick check: if the line doesn't contain any quotes, it can't contain a string literal
    if (!lineText.includes("'") && !lineText.includes('"') && !lineText.includes('`')) {
      return results;
    }

    const strRegex = /(["'`])([^"'`\n]+?)\1/g;
    let match: RegExpExecArray | null;

    while ((match = strRegex.exec(lineText)) !== null) {
      const quoteStart = match.index;
      const strContent = match[2];
      const quoteEnd = quoteStart + match[0].length;

      // First check context on the same line
      const beforeString = lineText.substring(0, quoteStart);
      let navContext = this.detectNavigationContext(beforeString);

      // If not detected on current line, check preceding text across lines
      if (!navContext.isNav) {
        const precedingText = this.getPrecedingText(document, lineNumber, quoteStart);
        navContext = this.detectNavigationContext(precedingText);
      }

      if (navContext.isNav) {
        const isExpoLike = strContent.startsWith('/') || strContent.includes('/');
        const frameworkHint = navContext.frameworkHint || (isExpoLike ? 'expo-router' : 'react-navigation');

        results.push({
          routeString: strContent,
          range: new vscode.Range(
            new vscode.Position(lineNumber, quoteStart + 1),
            new vscode.Position(lineNumber, quoteEnd - 1)
          ),
          isExpoLike,
          frameworkHint,
        });
      }
    }

    return results;
  }

  /**
   * Determine completion context at cursor position:
   * 1. Route name autocomplete
   * 2. Param key autocomplete
   */
  public static getCompletionContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): CompletionContextInfo | null {
    const line = document.lineAt(position.line);
    const textBeforeCursor = line.text.substring(0, position.character);

    // 1. Check if inside route name argument
    let navCallMatch = /(?:(?:\bnavigation|\brouter)\s*\.\s*(?:navigate|push|replace)|\bnavigate|\bredirect)\s*\(\s*(['"`]?)([^'"`]*)$/.exec(textBeforeCursor);
    let linkHrefMatch = /<Link[^>]*href=\s*(['"`]?)([^'"`]*)$/.exec(textBeforeCursor);
    let pathnameMatch = /pathname\s*:\s*(['"`]?)([^'"`]*)$/.exec(textBeforeCursor);

    // If not matched on current line alone, look back across preceding lines
    if (!navCallMatch && !linkHrefMatch && !pathnameMatch) {
      const precedingText = this.getPrecedingText(document, position.line, position.character);
      const cleanPreceding = precedingText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .trimEnd();

      pathnameMatch = /pathname\s*:\s*(['"`]?)([^'"`\n]*)$/.exec(cleanPreceding);
      if (!pathnameMatch) {
        navCallMatch = /(?:(?:\bnavigation|\brouter)\s*\.\s*(?:navigate|push|replace)|\bnavigate|\bredirect)\s*\(\s*(['"`]?)([^'"`\n]*)$/.exec(cleanPreceding);
      }
      if (!pathnameMatch && !navCallMatch) {
        linkHrefMatch = /<Link\b[\s\S]*?\bhref=\s*(['"`]?)([^'"`\n]*)$/.exec(cleanPreceding);
      }
    }

    if (navCallMatch) {
      const typed = navCallMatch[2];
      const isRouter = /router\s*\./.test(navCallMatch[0]);
      const isNav = /navigation\s*\./.test(navCallMatch[0]);
      const frameworkHint: 'expo-router' | 'react-navigation' | 'react-router' = isRouter
        ? 'expo-router'
        : isNav
        ? 'react-navigation'
        : 'react-router';

      const range = new vscode.Range(
        new vscode.Position(position.line, position.character - typed.length),
        position
      );

      return {
        type: 'route-name',
        frameworkHint,
        range,
      };
    }

    if (linkHrefMatch) {
      const typed = linkHrefMatch[2];
      const range = new vscode.Range(
        new vscode.Position(position.line, position.character - typed.length),
        position
      );
      return {
        type: 'route-name',
        frameworkHint: 'expo-router',
        range,
      };
    }

    if (pathnameMatch) {
      const typed = pathnameMatch[2];
      const range = new vscode.Range(
        new vscode.Position(position.line, position.character - typed.length),
        position
      );
      return {
        type: 'route-name',
        frameworkHint: 'expo-router',
        range,
      };
    }

    // 2. Check if inside params object!
    let paramCallMatch = /(?:navigation|router)\s*\.\s*(?:navigate|push|replace)\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*\{([^}]*)$/.exec(textBeforeCursor);
    let expoParamsMatch = /params\s*:\s*\{([^}]*)$/.exec(textBeforeCursor);

    if (!paramCallMatch && !expoParamsMatch) {
      const precedingText = this.getPrecedingText(document, position.line, position.character);
      const cleanPreceding = precedingText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .trimEnd();

      paramCallMatch = /(?:navigation|router)\s*\.\s*(?:navigate|push|replace)\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*\{([^}]*)$/.exec(cleanPreceding);
      if (!paramCallMatch) {
        expoParamsMatch = /params\s*:\s*\{([^}]*)$/.exec(cleanPreceding);
      }
    }

    if (paramCallMatch) {
      const routeName = paramCallMatch[2];
      const isRouter = /router\s*\./.test(paramCallMatch[0]);

      return {
        type: 'param-key',
        frameworkHint: isRouter ? 'expo-router' : 'react-navigation',
        currentRouteName: routeName,
        range: new vscode.Range(position, position),
      };
    }

    if (expoParamsMatch) {
      const fullTextBefore = this.getPrecedingText(document, position.line, position.character, 15);
      const pathnameExtract = /pathname\s*:\s*(['"`])([^'"`]+)\1/.exec(fullTextBefore);
      const currentRouteName = pathnameExtract ? pathnameExtract[2] : undefined;

      return {
        type: 'param-key',
        frameworkHint: 'expo-router',
        currentRouteName,
        range: new vscode.Range(position, position),
      };
    }

    return null;
  }
}
