import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReactRouterScanner } from '../src/reactRouter/reactRouterScanner';
import { Uri, Position } from './vscodeMock';
import { AstHelper } from '../src/utils/astHelper';
import { RouterDefinitionProvider } from '../src/providers/definitionProvider';
import { RouterHoverProvider } from '../src/providers/hoverProvider';
import { RouteManager } from '../src/routeManager';

describe('ReactRouterScanner', () => {
  let tempDir: string;
  let scanner: ReactRouterScanner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-router-test-'));
    scanner = new ReactRouterScanner();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    scanner.dispose();
  });

  it('scans React Router JSX routes with wrapped components and path aliases', async () => {
    // 1. Setup tsconfig.paths.json
    const tsconfigPath = path.join(tempDir, 'tsconfig.paths.json');
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@pages/*': ['src/pages/*'],
            '@/*': ['src/*'],
          },
        },
      }),
      'utf-8'
    );

    // 2. Setup component files
    const pagesDir = path.join(tempDir, 'src', 'pages', 'detach-device');
    fs.mkdirSync(pagesDir, { recursive: true });

    const consentPageFile = path.join(pagesDir, 'ConsentPage.tsx');
    fs.writeFileSync(consentPageFile, 'export default function ConsentPage() { return null; }', 'utf-8');

    const searchPageFile = path.join(pagesDir, 'DeviceInfoStep1Page.tsx');
    fs.writeFileSync(searchPageFile, 'export default function DeviceInfoStep1Page() { return null; }', 'utf-8');

    // 3. Setup router file (similar to DetachDeviceRouter.tsx)
    const routesDir = path.join(tempDir, 'src', 'routes');
    fs.mkdirSync(routesDir, { recursive: true });

    const routerFile = path.join(routesDir, 'DetachDeviceRouter.tsx');
    fs.writeFileSync(
      routerFile,
      `
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import ConsentPage from '@pages/detach-device/ConsentPage';
import DeviceInfoStep1Page from '@pages/detach-device/DeviceInfoStep1Page';

export default function DetachDeviceRouter() {
  return (
    <Routes>
      <Route path="/go-thiet-bi" element={<ConsentPage />} />
      <Route
        path="/go-thiet-bi/tim-kiem"
        element={
          <ProtectedDeviceSearch>
            <DeviceInfoStep1Page />
          </ProtectedDeviceSearch>
        }
      />
    </Routes>
  );
}
      `,
      'utf-8'
    );

    // Register paths manually from tempDir
    (scanner as any).pathAliases.set('@pages/', [path.join(tempDir, 'src', 'pages')]);
    (scanner as any).pathAliases.set('@/', [path.join(tempDir, 'src')]);

    await scanner.processFile(Uri.file(routerFile) as any);

    // Test finding /go-thiet-bi
    const consentRoute = scanner.findRoute('/go-thiet-bi');
    expect(consentRoute).toBeDefined();
    expect(consentRoute?.componentName).toBe('ConsentPage');
    expect(consentRoute?.fileUri.fsPath).toBe(consentPageFile);

    // Test finding /go-thiet-bi/tim-kiem
    const searchRoute = scanner.findRoute('/go-thiet-bi/tim-kiem');
    expect(searchRoute).toBeDefined();
    expect(searchRoute?.componentName).toBe('DeviceInfoStep1Page');
    expect(searchRoute?.fileUri.fsPath).toBe(searchPageFile);
  });

  it('detects bare navigate("/path") as navigation call and provides hover', () => {
    const routeManager = new RouteManager();
    const targetFile = Uri.file('/workspace/src/pages/DeviceInfoStep1Page.tsx');

    (routeManager as any).reactRouterScanner.routes.set('/go-thiet-bi/tim-kiem', {
      id: 'react-router:/go-thiet-bi/tim-kiem',
      framework: 'react-router',
      name: '/go-thiet-bi/tim-kiem',
      fileUri: targetFile,
      componentName: 'DeviceInfoStep1Page',
      params: [],
      description: 'React Router: /go-thiet-bi/tim-kiem',
    });

    const code = `
const handleContinue = () => {
  markIntent("fromConsent");
  navigate("/go-thiet-bi/tim-kiem");
};
    `;

    const mockDoc = {
      fileName: '/workspace/src/pages/ConsentPage.tsx',
      languageId: 'typescriptreact',
      getText: () => code,
      lineAt: (line: number) => ({
        text: code.split('\n')[line],
        lineNumber: line,
      }),
      positionAt: (offset: number) => new Position(0, offset),
      offsetAt: (pos: Position) => pos.character,
    } as any;

    // Line 3: '  navigate("/go-thiet-bi/tim-kiem");'
    // Position on "/go-thiet-bi/tim-kiem" (character 15)
    const hoverProvider = new RouterHoverProvider(routeManager);
    const hover = hoverProvider.provideHover(mockDoc, new Position(3, 15), {} as any) as any;

    expect(hover).toBeDefined();
    expect(hover.contents.value).toContain('React Router: `/go-thiet-bi/tim-kiem`');
    expect(hover.contents.value).toContain('DeviceInfoStep1Page');
    expect(hover.contents.value).toContain('DeviceInfoStep1Page.tsx');

    // Also test Definition Provider
    const defProvider = new RouterDefinitionProvider(routeManager);
    const defs = defProvider.provideDefinition(mockDoc, new Position(3, 15), {} as any) as any[];

    expect(defs).toBeDefined();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].uri.fsPath).toBe('/workspace/src/pages/DeviceInfoStep1Page.tsx');
  });

  it('scans real izion-webapp-frontend DetachDeviceRouter.tsx if present', async () => {
    const izionRouterPath = '/Volumes/extFre/future/react/izion-webapp-frontend/src/routes/DetachDeviceRouter.tsx';
    if (!fs.existsSync(izionRouterPath)) {
      return;
    }

    const izionScanner = new ReactRouterScanner();
    // Register aliases as defined in izion-webapp-frontend/tsconfig.paths.json
    (izionScanner as any).pathAliases.set('@pages', ['/Volumes/extFre/future/react/izion-webapp-frontend/src/pages']);
    (izionScanner as any).pathAliases.set('@', ['/Volumes/extFre/future/react/izion-webapp-frontend/src']);

    await izionScanner.processFile(Uri.file(izionRouterPath) as any);

    const route = izionScanner.findRoute('/go-thiet-bi/tim-kiem');
    expect(route).toBeDefined();
    expect(route?.componentName).toBe('DeviceInfoStep1Page');
    expect(route?.fileUri.fsPath).toContain('DeviceInfoStep1Page.tsx');
    expect(fs.existsSync(route!.fileUri.fsPath)).toBe(true);

    const consentRoute = izionScanner.findRoute('/go-thiet-bi');
    expect(consentRoute).toBeDefined();
    expect(consentRoute?.componentName).toBe('ConsentPage');
    expect(consentRoute?.fileUri.fsPath).toContain('ConsentPage.tsx');
    expect(fs.existsSync(consentRoute!.fileUri.fsPath)).toBe(true);
  });
});
