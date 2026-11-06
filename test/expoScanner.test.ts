import { describe, it, expect } from 'vitest';
import { ExpoScanner } from '../src/expo/expoScanner';

describe('ExpoScanner', () => {
  const scanner = new ExpoScanner();

  it('correctly parses root index route', () => {
    const parsed = scanner.parseRoutePath('index.tsx');
    expect(parsed.routePath).toBe('/');
    expect(parsed.params).toHaveLength(0);
  });

  it('correctly strips route groups like (tabs)', () => {
    const parsed = scanner.parseRoutePath('(tabs)/explore.tsx');
    expect(parsed.routePath).toBe('/explore');
    expect(parsed.aliases).toContain('/(tabs)/explore');
  });

  it('correctly handles nested route group with index', () => {
    const parsed = scanner.parseRoutePath('(tabs)/index.tsx');
    expect(parsed.routePath).toBe('/');
    expect(parsed.aliases).toContain('/(tabs)');
  });

  it('extracts dynamic parameter [id]', () => {
    const parsed = scanner.parseRoutePath('user/[id].tsx');
    expect(parsed.routePath).toBe('/user/[id]');
    expect(parsed.params).toHaveLength(1);
    expect(parsed.params[0]).toEqual({
      name: 'id',
      type: 'string',
      required: true,
      description: 'Dynamic path parameter ([id])',
    });
  });

  it('extracts catch-all parameter [...slug]', () => {
    const parsed = scanner.parseRoutePath('docs/[...slug].tsx');
    expect(parsed.routePath).toBe('/docs/[...slug]');
    expect(parsed.params).toHaveLength(1);
    expect(parsed.params[0]).toEqual({
      name: 'slug',
      type: 'string[]',
      required: false,
      description: 'Catch-all parameter ([...slug])',
    });
  });

  it('matches concrete URL with dynamic route pattern', () => {
    expect(scanner.matchesPattern('/user/123', '/user/[id]')).toBe(true);
    expect(scanner.matchesPattern('/user/123/edit', '/user/[id]')).toBe(false);
    expect(scanner.matchesPattern('/docs/getting-started/quickstart', '/docs/[...slug]')).toBe(true);
    expect(scanner.matchesPattern('/profile/settings', '/profile/settings')).toBe(true);
    expect(scanner.matchesPattern('/profile/other', '/profile/settings')).toBe(false);
  });
});
