import { describe, expect, it } from "vitest";
import { AstHelper } from "../src/utils/astHelper";
import { Position } from "./vscodeMock";

function createMockDocument(lineTexts: string[]) {
  return {
    lineCount: lineTexts.length,
    lineAt: (line: number) => ({
      text: lineTexts[line],
      lineNumber: line,
    }),
    getText: () => lineTexts.join("\n"),
  } as any;
}

describe("AstHelper", () => {
  it("extracts string literal at cursor position in navigation.navigate", () => {
    const doc = createMockDocument([
      "navigation.navigate('UserProfile', { userId: 123 });",
    ]);

    // Cursor on 'UserProfile'
    const match = AstHelper.getStringLiteralAtPosition(
      doc,
      new Position(0, 25),
    );
    expect(match).not.toBeNull();
    expect(match?.routeString).toBe("UserProfile");
    expect(match?.frameworkHint).toBe("react-navigation");
  });

  it("extracts expo router path from router.push", () => {
    const doc = createMockDocument(["router.push('/profile/settings');"]);

    // Cursor on '/profile/settings'
    const match = AstHelper.getStringLiteralAtPosition(
      doc,
      new Position(0, 18),
    );
    expect(match).not.toBeNull();
    expect(match?.routeString).toBe("/profile/settings");
    expect(match?.frameworkHint).toBe("expo-router");
  });

  it('extracts route from <Link href="..." />', () => {
    const doc = createMockDocument(['<Link href="/modal">Open Modal</Link>']);

    const match = AstHelper.getStringLiteralAtPosition(
      doc,
      new Position(0, 15),
    );
    expect(match).not.toBeNull();
    expect(match?.routeString).toBe("/modal");
    expect(match?.frameworkHint).toBe("expo-router");
  });

  it("detects completion context for route name", () => {
    const doc = createMockDocument(["navigation.navigate('"]);

    const ctx = AstHelper.getCompletionContext(doc, new Position(0, 21));
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe("route-name");
    expect(ctx?.frameworkHint).toBe("react-navigation");
  });

  it("detects completion context for expo router.push", () => {
    const doc = createMockDocument(["router.push('/"]);

    const ctx = AstHelper.getCompletionContext(doc, new Position(0, 14));
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe("route-name");
    expect(ctx?.frameworkHint).toBe("expo-router");
  });

  it("detects completion context for params object in navigation.navigate", () => {
    const doc = createMockDocument(["navigation.navigate('UserProfile', { "]);

    const ctx = AstHelper.getCompletionContext(doc, new Position(0, 37));
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe("param-key");
    expect(ctx?.currentRouteName).toBe("UserProfile");
  });

  it("detects all route strings in a line", () => {
    const doc = createMockDocument([
      "navigation.navigate('Home'); router.push('/settings');",
    ]);

    const matches = AstHelper.getAllRouteStringsInLine(doc, 0);
    expect(matches).toHaveLength(2);
    expect(matches[0].routeString).toBe("Home");
    expect(matches[1].routeString).toBe("/settings");
  });

  it("detects route string when pathname is on previous line (multiline object)", () => {
    const doc = createMockDocument([
      "router.navigate({",
      "  pathname:",
      '    "/clients/[clientId]/clinicalImpressions/[clinicalImpressionId]",',
      "  params: { clientId, clinicalImpressionId },",
      "});",
    ]);

    const matches = AstHelper.getAllRouteStringsInLine(doc, 2);
    expect(matches).toHaveLength(1);
    expect(matches[0].routeString).toBe(
      "/clients/[clientId]/clinicalImpressions/[clinicalImpressionId]",
    );
    expect(matches[0].frameworkHint).toBe("expo-router");
    expect(matches[0].range.start.line).toBe(2);
    expect(matches[0].range.start.character).toBe(5);
  });

  it("detects route string when pathname has intermediate comments and newlines", () => {
    const doc = createMockDocument([
      "router.navigate({",
      "  pathname:",
      "    // Navigate to clinical impression details",
      '    "/clients/[clientId]/clinicalImpressions/[clinicalImpressionId]",',
      "});",
    ]);

    const matches = AstHelper.getAllRouteStringsInLine(doc, 3);
    expect(matches).toHaveLength(1);
    expect(matches[0].routeString).toBe(
      "/clients/[clientId]/clinicalImpressions/[clinicalImpressionId]",
    );
    expect(matches[0].frameworkHint).toBe("expo-router");
  });

  it("detects route string when router.push is on previous line", () => {
    const doc = createMockDocument(["router.push(", '  "/user/[id]"', ");"]);

    const matches = AstHelper.getAllRouteStringsInLine(doc, 1);
    expect(matches).toHaveLength(1);
    expect(matches[0].routeString).toBe("/user/[id]");
    expect(matches[0].frameworkHint).toBe("expo-router");
  });

  it("detects route string when navigation.navigate is on previous line", () => {
    const doc = createMockDocument([
      "navigation.navigate(",
      '  "UserProfile",',
      "  { userId: 123 }",
      ");",
    ]);

    const matches = AstHelper.getAllRouteStringsInLine(doc, 1);
    expect(matches).toHaveLength(1);
    expect(matches[0].routeString).toBe("UserProfile");
    expect(matches[0].frameworkHint).toBe("react-navigation");
  });

  it("detects route string in multiline Stack.Screen", () => {
    const doc = createMockDocument([
      "<Stack.Screen",
      '  options={{ title: "Home" }}',
      "  name=",
      '    "HomeScreen"',
      "/>",
    ]);

    const matches = AstHelper.getAllRouteStringsInLine(doc, 3);
    expect(matches).toHaveLength(1);
    expect(matches[0].routeString).toBe("HomeScreen");
    expect(matches[0].frameworkHint).toBe("react-navigation");
  });

  it("does not match non-navigation strings", () => {
    const doc = createMockDocument([
      'const title = "HomeScreen";',
      '<input name="HomeScreen" />',
      'const user = { name: "HomeScreen" };',
    ]);

    expect(AstHelper.getAllRouteStringsInLine(doc, 0)).toHaveLength(0);
    expect(AstHelper.getAllRouteStringsInLine(doc, 1)).toHaveLength(0);
    expect(AstHelper.getAllRouteStringsInLine(doc, 2)).toHaveLength(0);
  });

  it("detects completion context for multiline pathname", () => {
    const doc = createMockDocument([
      "router.navigate({",
      "  pathname:",
      '    "',
    ]);

    const ctx = AstHelper.getCompletionContext(doc, new Position(2, 5));
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe("route-name");
    expect(ctx?.frameworkHint).toBe("expo-router");
  });
});
