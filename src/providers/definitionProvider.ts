import * as vscode from 'vscode';
import { RouteManager } from '../routeManager';
import { AstHelper } from '../utils/astHelper';

export class RouterDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private routeManager: RouteManager) {}

  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    const targets = AstHelper.getTargetsAtPosition(document, position);
    if (!targets || targets.length === 0) {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration('routerGoto');
    const preferComponent = config.get('preferComponentDefinition', true);

    const locations: vscode.Location[] = [];
    const seenLocations = new Set<string>();

    for (const target of targets) {
      let route = this.routeManager.findRoute(target.routeString);
      if (!route && target.memberOnly) {
        route = this.routeManager.findRoute(target.memberOnly);
      }

      if (!route) {
        continue;
      }

      // 1. Primary Component file location
      const targetRange = route.targetRange || new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
      const compKey = `${route.fileUri.fsPath}:${targetRange.start.line}:${targetRange.start.character}`;

      if (preferComponent) {
        if (!seenLocations.has(compKey)) {
          seenLocations.add(compKey);
          locations.push(new vscode.Location(route.fileUri, targetRange));
        }
        if (route.typeLocation && route.typeLocation.uri.fsPath !== route.fileUri.fsPath) {
          const typeKey = `${route.typeLocation.uri.fsPath}:${route.typeLocation.range.start.line}:${route.typeLocation.range.start.character}`;
          if (!seenLocations.has(typeKey)) {
            seenLocations.add(typeKey);
            locations.push(new vscode.Location(route.typeLocation.uri, route.typeLocation.range));
          }
        }
      } else {
        if (route.typeLocation) {
          const typeKey = `${route.typeLocation.uri.fsPath}:${route.typeLocation.range.start.line}:${route.typeLocation.range.start.character}`;
          if (!seenLocations.has(typeKey)) {
            seenLocations.add(typeKey);
            locations.push(new vscode.Location(route.typeLocation.uri, route.typeLocation.range));
          }
        }
        if (!seenLocations.has(compKey)) {
          seenLocations.add(compKey);
          locations.push(new vscode.Location(route.fileUri, targetRange));
        }
      }
    }

    return locations.length > 0 ? locations : undefined;
  }
}
