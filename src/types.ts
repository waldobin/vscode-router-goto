import * as vscode from 'vscode';

export type FrameworkType = 'expo-router' | 'react-navigation';

export interface RouteParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface RouteDefinition {
  id: string; // Unique identifier: e.g. "expo:/user/[id]" or "react-nav:UserProfile"
  framework: FrameworkType;
  name: string; // The route path (e.g. "/profile/settings" or "/user/[id]") or Screen Name (e.g. "UserProfile")
  aliases?: string[]; // E.g. normalized path without group: "/settings" for "(tabs)/settings"
  enumReferences?: string[]; // E.g. ["ScreenEnum.AccountSetting", "AccountSetting"]
  fileUri: vscode.Uri; // The file containing the screen component or route
  targetRange?: vscode.Range; // Exact range to jump to in file (e.g. function component declaration)
  typeLocation?: {
    uri: vscode.Uri;
    range: vscode.Range;
  };
  componentName?: string;
  params: RouteParam[];
  rawParamString?: string; // E.g. "{ userId: string; fromSearch?: boolean }"
  description?: string;
  isLayout?: boolean;
}

export interface NavigationCallContext {
  framework: FrameworkType | 'both';
  type: 'route-argument' | 'link-href' | 'param-key' | 'param-object';
  routeString?: string;
  routeRange?: vscode.Range;
  currentRouteName?: string;
  calleeName?: string; // E.g. "navigate", "push", "replace"
}
