# Change Log

All notable changes to the "vscode-router-goto" extension will be documented in this file.

## [0.2.0] - Nested Navigation & Enum Support

- 🧭 **Click on `navigation.navigate(...)` Directly:**
  - Clicking on the `navigate` method now resolves to the target Screen Component file (prioritizing nested screens) instead of opening `@react-navigation/core/lib/types.d.ts`!
- 🏷️ **Enum & Constants Screen Resolution:**
  - Supports `ScreenEnum.AccountSetting`, `MenuTabEnum.Policy`, and `const SCREENS = { ... } as const`.
  - Automatically maps enums to Screen Components in `<Stack.Screen name={ScreenEnum.AccountSetting} component={...} />`.
- 🪆 **Nested Navigation Support:**
  - Full support for `navigation.navigate(ParentScreen, { screen: ChildScreen, params: { ... } })`.
  - Jump directly to either parent or nested child screen component.

## [0.1.0] - Initial Release

- 🚀 **Expo Router Support**:
  - Automatically index routes from `app/` and `src/app/`.
  - Support nested route groups `(tabs)`, dynamic parameters `[id]`, catch-all routes `[...slug]`.
  - Autocomplete route paths with snippet expansions for params.
  - Click-to-Definition (Cmd+click) jump to target route files.
- 🧭 **React Navigation Support**:
  - AST scanning for TypeScript `RootStackParamList` and JSX `<Stack.Screen name="..." component={...} />`.
  - Autocomplete screen names & typed parameters.
  - Click-to-Definition jumping straight into the Screen Component file.
- 💡 **Rich Hover Documentation**:
  - Preview file paths, dynamic params, type signatures, and docstrings.
- 🔗 **Direct Document Links**:
  - Route strings behave as clickable hyperlinks.
- ⚡ **Status Bar & Quick Navigator**:
  - Live route count in status bar.
  - Search all workspace screens with QuickPick fuzzy find.
- ⚠️ **Diagnostics & Route Linting**:
  - Optional warning for typo / non-existent route names.
