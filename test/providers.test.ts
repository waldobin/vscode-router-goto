import { describe, it, expect, beforeEach } from 'vitest';
import { RouteManager } from '../src/routeManager';
import { RouterCompletionProvider } from '../src/providers/completionProvider';
import { RouterDefinitionProvider } from '../src/providers/definitionProvider';
import { RouterHoverProvider } from '../src/providers/hoverProvider';
import { RouterDocumentLinkProvider } from '../src/providers/documentLinkProvider';
import { Position, Uri } from './vscodeMock';

function createMockDocument(lineTexts: string[]) {
  return {
    lineCount: lineTexts.length,
    lineAt: (line: number) => ({
      text: lineTexts[line],
      lineNumber: line,
    }),
    getText: () => lineTexts.join('\n'),
  } as any;
}

describe('Providers Test', () => {
  let routeManager: RouteManager;
  let completionProvider: RouterCompletionProvider;
  let definitionProvider: RouterDefinitionProvider;
  let hoverProvider: RouterHoverProvider;
  let documentLinkProvider: RouterDocumentLinkProvider;

  beforeEach(() => {
    routeManager = new RouteManager();
    completionProvider = new RouterCompletionProvider(routeManager);
    definitionProvider = new RouterDefinitionProvider(routeManager);
    hoverProvider = new RouterHoverProvider(routeManager);
    documentLinkProvider = new RouterDocumentLinkProvider(routeManager);

    // Mock some routes directly on routeManager for testing
    (routeManager as any).expoScanner.routes.set('/profile/settings', {
      id: 'expo:/profile/settings',
      framework: 'expo-router',
      name: '/profile/settings',
      aliases: [],
      fileUri: Uri.file('/workspace/app/profile/settings.tsx'),
      params: [],
      description: 'Expo Router screen',
    });

    (routeManager as any).expoScanner.routes.set('/user/[id]', {
      id: 'expo:/user/[id]',
      framework: 'expo-router',
      name: '/user/[id]',
      aliases: [],
      fileUri: Uri.file('/workspace/app/user/[id].tsx'),
      params: [{ name: 'id', type: 'string', required: true }],
      description: 'Expo Router dynamic user screen',
    });

    (routeManager as any).reactNavScanner.screens.set('UserProfile', {
      id: 'react-nav:UserProfile',
      framework: 'react-navigation',
      name: 'UserProfile',
      fileUri: Uri.file('/workspace/screens/UserProfileScreen.tsx'),
      componentName: 'UserProfileScreen',
      params: [{ name: 'userId', type: 'number', required: true }],
      rawParamString: '{ userId: number }',
    });
  });

  it('provides route completions inside router.push', () => {
    const doc = createMockDocument(["router.push('/"]);
    const items = completionProvider.provideCompletionItems(
      doc,
      new Position(0, 14),
      {} as any,
      {} as any
    ) as any[];

    expect(items).toBeDefined();
    expect(items.length).toBeGreaterThan(0);
    const labels = items.map((i) => i.label);
    expect(labels).toContain('/profile/settings');
    expect(labels).toContain('/user/[id]');
  });

  it('provides param completions inside navigation.navigate params object', () => {
    const doc = createMockDocument(["navigation.navigate('UserProfile', { "]);
    const items = completionProvider.provideCompletionItems(
      doc,
      new Position(0, 38),
      {} as any,
      {} as any
    ) as any[];

    expect(items).toBeDefined();
    expect(items.length).toBe(1);
    expect(items[0].label).toBe('userId');
  });

  it('provides definition for clicked route string', () => {
    const doc = createMockDocument(["navigation.navigate('UserProfile', { userId: 123 });"]);
    const locations = definitionProvider.provideDefinition(
      doc,
      new Position(0, 24),
      {} as any
    ) as any[];

    expect(locations).toBeDefined();
    expect(locations.length).toBeGreaterThan(0);
    expect(locations[0].uri.fsPath).toBe('/workspace/screens/UserProfileScreen.tsx');
  });

  it('provides definition for Expo dynamic path', () => {
    const doc = createMockDocument(["router.push('/user/42');"]);
    const locations = definitionProvider.provideDefinition(
      doc,
      new Position(0, 16),
      {} as any
    ) as any[];

    expect(locations).toBeDefined();
    expect(locations.length).toBeGreaterThan(0);
    expect(locations[0].uri.fsPath).toBe('/workspace/app/user/[id].tsx');
  });

  it('provides hover documentation with parameters and screen info', () => {
    const doc = createMockDocument(["navigation.navigate('UserProfile');"]);
    const hover = hoverProvider.provideHover(
      doc,
      new Position(0, 24),
      {} as any
    ) as any;

    expect(hover).toBeDefined();
    expect(hover.contents.value).toContain('React Navigation: `UserProfile`');
    expect(hover.contents.value).toContain('UserProfileScreen');
  });

  it('provides document links when path is on same line', () => {
    const doc = createMockDocument([
      'router.navigate({',
      '  pathname: "/profile/settings",',
      '});',
    ]);

    const links = documentLinkProvider.provideDocumentLinks(doc, {} as any) as any[];
    expect(links).toBeDefined();
    expect(links).toHaveLength(1);
    expect(links[0].range.start.line).toBe(1);
    expect(links[0].target.path).toBe('/workspace/app/profile/settings.tsx');
  });

  it('provides document links when path is on next line (multiline pathname)', () => {
    const doc = createMockDocument([
      'router.navigate({',
      '  pathname:',
      '    "/profile/settings",',
      '  params: { tab: "general" },',
      '});',
    ]);

    const links = documentLinkProvider.provideDocumentLinks(doc, {} as any) as any[];
    expect(links).toBeDefined();
    expect(links).toHaveLength(1);
    expect(links[0].range.start.line).toBe(2);
    expect(links[0].range.start.character).toBe(5);
    expect(links[0].target.path).toBe('/workspace/app/profile/settings.tsx');
  });
});
