<p align="center">
  <img src="./assets/icon.png" width="128" height="128" alt="Router Goto Logo" />
</p>

<h1 align="center">React Navigation & Expo Router IntelliSense</h1>
<p align="center"><code>vscode-router-goto</code></p>

<p align="center">
  <a href="https://marketplace.visualstudio.com"><img src="https://img.shields.io/badge/version-0.2.0-blue.svg" alt="Version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-^1.80.0-007ACC.svg" alt="VS Code"></a>
</p>

**The ultimate navigation companion for React Native and Expo developers.**

Turn plain string routes like `navigation.navigate('UserProfile', { userId: 123 })` or `router.push('/profile/settings')` into rich, typed, and navigable links with full autocomplete and instant **Click-to-Definition** (Cmd/Ctrl + Click).

---

## 💥 The Real-World Pain Point

When developing with **Expo Router** or **React Navigation**, developers frequently write navigation targets as bare strings:

```tsx
// Expo Router
router.push('/user/42');
<Link href="/profile/settings">Settings</Link>

// React Navigation (String literal or Enum / Constants)
navigation.navigate('UserProfile', { userId: 123 });

navigation.navigate(ScreenEnum.AccountSetting, {
  screen: MenuTabEnum.Policy,
  params: {
    stage: stage || PolicyStageEnum.Active,
    policyNumber: '',
  },
});
```

In default VS Code:
1. ❌ **No Click-to-Definition:** Holding `Cmd` (or `Ctrl`) and clicking on `'UserProfile'` or `'/user/42'` does nothing because it's just a raw string!
2. ❌ **Clicking `navigate` jumps to library .d.ts:** Holding `Cmd` and clicking `navigate(...)` jumps you into `@react-navigation/core/lib/types.d.ts` instead of your actual screen component!
3. ❌ **No Enum / Constant Screen Resolution:** Clicking `ScreenEnum.AccountSetting` or `MenuTabEnum.Policy` only jumps to the enum definition file, not the Screen Component file.
4. ❌ **No Nested Navigation Support:** Deeply nested targets (`screen: MenuTabEnum.Policy`) are ignored.
5. ❌ **No Param Hinting:** You don't know what parameters the target screen expects without digging through files.

---

## 🚀 Key Features

### 1. 🔍 Click-to-Definition (Cmd + Click / F12)
Hold `Cmd` (macOS) or `Ctrl` (Windows/Linux) and click on any route string:
- **Expo Router:** Automatically navigates to the target screen file (e.g. `app/(tabs)/explore.tsx` or `app/user/[id].tsx`), even resolving dynamic URL parameters like `/user/42` ➔ `app/user/[id].tsx` and route groups `(tabs)`!
- **React Navigation:** Resolves `<Stack.Screen name="UserProfile" component={UserProfileScreen} />` imports and jumps directly to the `UserProfileScreen.tsx` Component file!

### 2. ⚡ Autocomplete Route Names & Dynamic Params
- **Expo Router:** Intelligently scans `app/` and `src/app/`. As you type `router.push('` or `<Link href="`, it provides autocomplete for all route paths.
  - Dynamic routes like `/user/[id]` provide snippet tab-stops (`/user/${1:id}`) for instant parameter input!
- **React Navigation:** Scans `RootStackParamList` and JSX `<Stack.Screen name="..." />` definitions. As you type `navigation.navigate('`, it autocompletes screen names.
- **Parameter Autocomplete:** Inside the second argument `{ | }`, it autocompletes expected parameter keys and their types (e.g. `userId: number`).

### 3. 💡 Rich Hover Documentation
Hover over any route string to view:
- 📱 Framework badge (Expo Router / React Navigation)
- 📂 Target screen file path with clickable hyperlink
- 📝 Expected parameters, data types, and required/optional flags
- 🧩 Component name and type definition source location

### 4. 🧭 Quick Navigator (Status Bar & Command Palette)
- Status Bar item showing the real-time indexed route count: `$(compass) 14 Routes`.
- Click the status bar item or run `Router Goto: Show All Registered Routes` (`Cmd+Shift+P`) to open a QuickPick fuzzy search to jump to any screen instantly!

### 5. 🛡️ Route Diagnostics & Typo Detection (Optional)
Catches typos early before runtime! Highlights non-existent route names with gentle warnings in the editor.

---

## 📸 Usage Examples

### Expo Router
```tsx
import { useRouter } from 'expo-router';
import { Link } from 'expo-router';

export function HomeScreen() {
  const router = useRouter();

  const handleOpen = () => {
    // 💡 Autocompletes route paths & Cmd+Click opens app/profile/settings.tsx!
    router.push('/profile/settings');

    // 💡 Dynamic parameters: matches app/user/[id].tsx
    router.push('/user/108');
  };

  return (
    // 💡 Cmd+Click on href opens app/modal.tsx!
    <Link href="/modal">Open Modal</Link>
  );
}
```

### React Navigation
```tsx
import { useNavigation } from '@react-navigation/native';

export function FeedScreen() {
  const navigation = useNavigation();

  return (
    <Button
      title="View Profile"
      // 💡 Autocompletes 'UserProfile' and parameters { userId: 123 }
      // 💡 Cmd+Click on 'UserProfile' jumps directly to UserProfileScreen.tsx!
      onPress={() => navigation.navigate('UserProfile', { userId: 123 })}
    />
  );
}
```

---

## ⚙️ Configuration Settings

Customize `vscode-router-goto` in your VS Code `settings.json`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `routerGoto.enable` | `true` | Enable or disable all Router Goto features. |
| `routerGoto.enableExpoRouter` | `true` | Enable Expo Router file scanning and navigation. |
| `routerGoto.enableReactNavigation` | `true` | Enable React Navigation AST scanning (ParamList & Screens). |
| `routerGoto.appDirectories` | `["app", "src/app"]` | Directories to scan for Expo Router route files. |
| `routerGoto.preferComponentDefinition` | `true` | When jumping to definition in React Navigation, jump directly to Screen Component rather than type definition. |
| `routerGoto.enableHover` | `true` | Show rich screen info & parameters on hover. |
| `routerGoto.enableDocumentLinks` | `true` | Turn route strings into direct clickable links. |
| `routerGoto.enableDiagnostics` | `false` | Highlight non-existent route strings with warnings. |

---

## ⌨️ Available Commands

- `routerGoto.rescan`: **Router Goto: Rescan Navigation Routes & ParamLists** — Force an immediate re-scan of the workspace.
- `routerGoto.showRegisteredRoutes`: **Router Goto: Show All Registered Routes** — Search and jump to any route in the workspace.

---

## 📦 Supported Environments & Frameworks

- **Expo Router:** v2, v3, v4+ (`app/` and `src/app/` structures, groups `(group)`, dynamic `[id]`, catch-all `[...slug]`).
- **React Navigation:** v5, v6, v7+ (Native Stack, Stack, Bottom Tabs, Drawer, Material Top Tabs).
- **Languages:** TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`).

---

## 📄 License

MIT © [Router Goto Contributors](LICENSE)
