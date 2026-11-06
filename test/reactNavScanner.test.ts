import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReactNavScanner } from '../src/reactNavigation/reactNavScanner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Uri } from './vscodeMock';

describe('ReactNavScanner', () => {
  let tempDir: string;
  let scanner: ReactNavScanner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-goto-test-'));
    scanner = new ReactNavScanner();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    scanner.dispose();
  });

  it('parses type RootStackParamList and extracts screens with params', async () => {
    const typesFilePath = path.join(tempDir, 'types.ts');
    const content = `
export type RootStackParamList = {
  Home: undefined;
  UserProfile: {
    userId: number;
    initialTab?: string;
  };
  Settings: undefined;
};
    `;
    fs.writeFileSync(typesFilePath, content, 'utf-8');

    await scanner.processFile(Uri.file(typesFilePath) as any);

    const routes = scanner.getRoutes();
    expect(routes).toHaveLength(3);

    const userProfile = scanner.findRoute('UserProfile');
    expect(userProfile).toBeDefined();
    expect(userProfile?.framework).toBe('react-navigation');
    expect(userProfile?.params).toHaveLength(2);

    expect(userProfile?.params[0]).toEqual({
      name: 'userId',
      type: 'number',
      required: true,
    });
    expect(userProfile?.params[1]).toEqual({
      name: 'initialTab',
      type: 'string',
      required: false,
    });
  });

  it('parses JSX Stack.Screen and resolves component import', async () => {
    // 1. Create component file
    const compFilePath = path.join(tempDir, 'UserProfileScreen.tsx');
    fs.writeFileSync(
      compFilePath,
      `export const UserProfileScreen = () => null;`,
      'utf-8'
    );

    // 2. Create navigator file
    const navFilePath = path.join(tempDir, 'AppNavigator.tsx');
    const content = `
import React from 'react';
import { UserProfileScreen } from './UserProfileScreen';

export function Navigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}
    `;
    fs.writeFileSync(navFilePath, content, 'utf-8');

    await scanner.processFile(Uri.file(navFilePath) as any);

    const userProfile = scanner.findRoute('UserProfile');
    expect(userProfile).toBeDefined();
    expect(userProfile?.componentName).toBe('UserProfileScreen');
    expect(userProfile?.fileUri.fsPath).toBe(compFilePath);
  });
});
