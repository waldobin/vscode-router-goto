export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position;
  public end: Position;
  constructor(start: Position, end: Position);
  constructor(startLine: number, startChar: number, endLine: number, endChar: number);
  constructor(
    startOrStartLine: Position | number,
    endOrStartChar: Position | number,
    endLine?: number,
    endChar?: number
  ) {
    if (typeof startOrStartLine === 'number') {
      this.start = new Position(startOrStartLine, endOrStartChar as number);
      this.end = new Position(endLine!, endChar!);
    } else {
      this.start = startOrStartLine;
      this.end = endOrStartChar as Position;
    }
  }
}

export class Uri {
  public fsPath: string;
  constructor(public path: string) {
    this.fsPath = path;
  }
  static file(path: string) {
    return new Uri(path);
  }
  toString() {
    return `file://${this.path}`;
  }
  with(change: any) {
    return this;
  }
}

export class Location {
  constructor(public uri: Uri, public range: Range) {}
}

export enum CompletionItemKind {
  Property = 9,
  Folder = 18,
  Class = 6,
}

export class CompletionItem {
  public detail?: string;
  public documentation?: any;
  public insertText?: any;
  public sortText?: string;
  public range?: Range;
  constructor(public label: string, public kind?: CompletionItemKind) {}
}

export class SnippetString {
  constructor(public value: string) {}
}

export class MarkdownString {
  public value = '';
  public isTrusted = false;
  public supportHtml = false;
  appendMarkdown(str: string) {
    this.value += str;
  }
}

export class Hover {
  constructor(public contents: MarkdownString, public range?: Range) {}
}

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: (key: string, defaultValue?: any) => defaultValue,
  }),
  asRelativePath: (uri: Uri) => uri.fsPath,
  findFiles: async () => [],
  createFileSystemWatcher: () => ({
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
};

export class EventEmitter {
  private listeners: Function[] = [];
  event = (listener: Function) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data?: any) {
    this.listeners.forEach((l) => l(data));
  }
  dispose() {}
}
