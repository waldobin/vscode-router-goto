import { describe, it, expect } from 'vitest';
import { AstHelper } from '../src/utils/astHelper';
import { Position } from './vscodeMock';

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

describe('AstHelper', () => {
  it('extracts string literal at cursor position in navigation.navigate', () => {
    const doc = createMockDocument([
      "navigation.navigate('UserProfile', { userId: 123 });",
    ]);

    // Cursor on 'UserProfile'
    const match = AstHelper.getStringLiteralAtPosition(doc, new Position(0, 25));
    expect(match).not.toBeNull();
    expect(match?.routeString).toBe('UserProfile');
    expect(match?.frameworkHint).toBe('react-navigation');
  });

  it('extracts expo router path from router.push', () => {
    const doc = createMockDocument([
      "router.push('/profile/settings');",
    ]);

    // Cursor on '/profile/settings'
    const match = AstHelper.getStringLiteralAtPosition(doc, new Position(0, 18));
    expect(match).not.toBeNull();
    expect(match?.routeString).toBe('/profile/settings');
    expect(match?.frameworkHint).toBe('expo-router');
  });

  it('extracts route from <Link href="..." />', () => {
    const doc = createMockDocument([
      '<Link href="/modal">Open Modal</Link>',
    ]);

    const match = AstHelper.getStringLiteralAtPosition(doc, new Position(0, 15));
    expect(match).not.toBeNull();
    expect(match?.routeString).toBe('/modal');
    expect(match?.frameworkHint).toBe('expo-router');
  });

  it('detects completion context for route name', () => {
    const doc = createMockDocument([
      "navigation.navigate('",
    ]);

    const ctx = AstHelper.getCompletionContext(doc, new Position(0, 21));
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe('route-name');
    expect(ctx?.frameworkHint).toBe('react-navigation');
  });

  it('detects completion context for expo router.push', () => {
    const doc = createMockDocument([
      "router.push('/",
    ]);

    const ctx = AstHelper.getCompletionContext(doc, new Position(0, 14));
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe('route-name');
    expect(ctx?.frameworkHint).toBe('expo-router');
  });

  it('detects completion context for params object in navigation.navigate', () => {
    const doc = createMockDocument([
      "navigation.navigate('UserProfile', { ",
    ]);

    const ctx = AstHelper.getCompletionContext(doc, new Position(0, 37));
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe('param-key');
    expect(ctx?.currentRouteName).toBe('UserProfile');
  });

  it('detects all route strings in a line', () => {
    const doc = createMockDocument([
      "navigation.navigate('Home'); router.push('/settings');",
    ]);

    const matches = AstHelper.getAllRouteStringsInLine(doc, 0);
    expect(matches).toHaveLength(2);
    expect(matches[0].routeString).toBe('Home');
    expect(matches[1].routeString).toBe('/settings');
  });
});
