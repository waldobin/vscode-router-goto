import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReactNavScanner } from '../src/reactNavigation/reactNavScanner';
import { RouteManager } from '../src/routeManager';
import { RouterDefinitionProvider } from '../src/providers/definitionProvider';
import { AstHelper } from '../src/utils/astHelper';
import { Uri, Position } from './vscodeMock';

describe('Nested Navigation & Enum Support', () => {
  let tempDir: string;
  let scanner: ReactNavScanner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-enum-test-'));
    scanner = new ReactNavScanner();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    scanner.dispose();
  });

  it('scans enums and resolves Screen definitions using enum identifiers', async () => {
    // 1. Create Enums file
    const enumsFile = path.join(tempDir, 'enums.ts');
    fs.writeFileSync(
      enumsFile,
      `
export enum ScreenEnum {
  AccountSetting = 'AccountSetting',
  Home = 'Home',
}
export enum MenuTabEnum {
  Policy = 'PolicyScreen',
}
      `,
      'utf-8'
    );

    // 2. Create Component files
    const accountCompFile = path.join(tempDir, 'AccountSettingScreen.tsx');
    fs.writeFileSync(accountCompFile, `export const AccountSettingScreen = () => null;`, 'utf-8');

    const policyCompFile = path.join(tempDir, 'PolicyScreen.tsx');
    fs.writeFileSync(policyCompFile, `export const PolicyScreen = () => null;`, 'utf-8');

    // 3. Create Navigators
    const navFile = path.join(tempDir, 'Navigator.tsx');
    fs.writeFileSync(
      navFile,
      `
import React from 'react';
import { ScreenEnum, MenuTabEnum } from './enums';
import { AccountSettingScreen } from './AccountSettingScreen';
import { PolicyScreen } from './PolicyScreen';

export function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name={ScreenEnum.AccountSetting} component={AccountSettingScreen} />
      <Tab.Screen name={MenuTabEnum.Policy} component={PolicyScreen} />
    </Stack.Navigator>
  );
}
      `,
      'utf-8'
    );

    await scanner.processFile(Uri.file(enumsFile) as any);
    await scanner.processFile(Uri.file(navFile) as any);

    // Test finding by full enum identifier
    const accountRoute = scanner.findRoute('ScreenEnum.AccountSetting');
    expect(accountRoute).toBeDefined();
    expect(accountRoute?.fileUri.fsPath).toBe(accountCompFile);

    const policyRoute = scanner.findRoute('MenuTabEnum.Policy');
    expect(policyRoute).toBeDefined();
    expect(policyRoute?.fileUri.fsPath).toBe(policyCompFile);

    // Test finding by member name
    expect(scanner.findRoute('AccountSetting')).toBeDefined();
    expect(scanner.findRoute('Policy')).toBeDefined();
  });

  it('extracts targets from multiline navigation.navigate call when clicking navigate', () => {
    const code = `
navigation.navigate(ScreenEnum.AccountSetting, {
  screen: MenuTabEnum.Policy,
  params: {
    stage: stage || PolicyStageEnum.Active,
    policyNumber: '',
  },
});
    `;

    const mockDoc = {
      fileName: '/test/MyScreen.tsx',
      languageId: 'typescriptreact',
      getText: () => code,
      positionAt: (offset: number) => {
        const lines = code.substring(0, offset).split('\n');
        return new Position(lines.length - 1, lines[lines.length - 1].length);
      },
      offsetAt: (pos: Position) => {
        const lines = code.split('\n');
        let off = 0;
        for (let i = 0; i < pos.line; i++) {
          off += lines[i].length + 1;
        }
        return off + pos.character;
      },
      lineAt: (line: number) => ({
        text: code.split('\n')[line],
        lineNumber: line,
      }),
    } as any;

    // Line 1: "navigation.navigate(ScreenEnum.AccountSetting, {"
    // Position on "navigate" (character 13)
    const targets = AstHelper.getTargetsAtPosition(mockDoc, new Position(1, 13));

    expect(targets).toHaveLength(2);
    // Nested target should be first priority
    expect(targets[0].routeString).toBe('MenuTabEnum.Policy');
    expect(targets[0].memberOnly).toBe('Policy');
    // Parent root target second
    expect(targets[1].routeString).toBe('ScreenEnum.AccountSetting');
    expect(targets[1].memberOnly).toBe('AccountSetting');
  });

  it('extracts target when clicking on ScreenEnum.AccountSetting directly', () => {
    const code = `navigation.navigate(ScreenEnum.AccountSetting, { screen: MenuTabEnum.Policy });`;

    const mockDoc = {
      fileName: '/test/MyScreen.tsx',
      languageId: 'typescriptreact',
      getText: () => code,
      positionAt: (offset: number) => new Position(0, offset),
      offsetAt: (pos: Position) => pos.character,
      lineAt: (line: number) => ({ text: code, lineNumber: 0 }),
    } as any;

    // Position on "AccountSetting" (character 32)
    const targets = AstHelper.getTargetsAtPosition(mockDoc, new Position(0, 32));

    expect(targets).toHaveLength(1);
    expect(targets[0].routeString).toBe('ScreenEnum.AccountSetting');
    expect(targets[0].memberOnly).toBe('AccountSetting');
  });

  it('extracts target when clicking on MenuTabEnum.Policy directly', () => {
    const code = `navigation.navigate(ScreenEnum.AccountSetting, { screen: MenuTabEnum.Policy });`;

    const mockDoc = {
      fileName: '/test/MyScreen.tsx',
      languageId: 'typescriptreact',
      getText: () => code,
      positionAt: (offset: number) => new Position(0, offset),
      offsetAt: (pos: Position) => pos.character,
      lineAt: (line: number) => ({ text: code, lineNumber: 0 }),
    } as any;

    // Position on "Policy" (character 65)
    const targets = AstHelper.getTargetsAtPosition(mockDoc, new Position(0, 65));

    expect(targets).toHaveLength(1);
    expect(targets[0].routeString).toBe('MenuTabEnum.Policy');
    expect(targets[0].memberOnly).toBe('Policy');
  });
});
