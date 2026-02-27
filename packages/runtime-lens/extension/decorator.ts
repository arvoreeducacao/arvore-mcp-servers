import * as vscode from "vscode";

interface InlineValue {
  file: string;
  line: number;
  column: number;
  text: string;
  type: "log" | "error" | "warn" | "info" | "debug" | "result";
  timestamp: number;
}

const TYPE_COLORS: Record<string, string> = {
  log: "#6A9955",
  info: "#569CD6",
  warn: "#CE9178",
  error: "#F44747",
  debug: "#9CDCFE",
  result: "#DCDCAA",
};

export class InlineDecorator {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private values: Map<string, InlineValue[]> = new Map();
  private disposables: vscode.Disposable[] = [];

  activate(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          this.refresh();
        }
      })
    );
    context.subscriptions.push(...this.disposables);
  }

  addValue(value: InlineValue): void {
    const key = value.file;
    if (!this.values.has(key)) {
      this.values.set(key, []);
    }

    const existing = this.values.get(key)!;
    const idx = existing.findIndex((v) => v.line === value.line);
    if (idx >= 0) {
      existing[idx] = value;
    } else {
      existing.push(value);
    }

    if (existing.length > 1000) {
      existing.splice(0, existing.length - 1000);
    }

    this.refresh();
  }

  clearFile(file: string): void {
    this.values.delete(file);
    this.refresh();
  }

  clearAll(): void {
    this.values.clear();
    this.clearDecorations();
  }

  refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    this.clearDecorations();

    const filePath = editor.document.uri.fsPath;
    const fileValues = this.values.get(filePath);
    if (!fileValues || fileValues.length === 0) return;

    const decorationsByType = new Map<string, vscode.DecorationOptions[]>();

    for (const value of fileValues) {
      const lineIndex = value.line - 1;
      if (lineIndex < 0 || lineIndex >= editor.document.lineCount) continue;

      const lineText = editor.document.lineAt(lineIndex).text;
      const range = new vscode.Range(
        new vscode.Position(lineIndex, lineText.length),
        new vscode.Position(lineIndex, lineText.length)
      );

      const truncated = value.text.length > 80
        ? value.text.slice(0, 80) + "…"
        : value.text;

      const decoration: vscode.DecorationOptions = {
        range,
        hoverMessage: new vscode.MarkdownString(
          `**Runtime Lens** (${value.type})\n\n\`\`\`\n${value.text}\n\`\`\`\n\n*${new Date(value.timestamp).toLocaleTimeString()}*`
        ),
        renderOptions: {
          after: {
            contentText: `  // → ${truncated}`,
            color: TYPE_COLORS[value.type] || "#6A9955",
            fontStyle: "italic",
            margin: "0 0 0 1em",
          },
        },
      };

      const typeKey = value.type;
      if (!decorationsByType.has(typeKey)) {
        decorationsByType.set(typeKey, []);
      }
      decorationsByType.get(typeKey)!.push(decoration);
    }

    for (const [typeKey, decorations] of decorationsByType) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        after: {
          color: TYPE_COLORS[typeKey] || "#6A9955",
          fontStyle: "italic",
        },
        isWholeLine: false,
      });

      this.decorationTypes.set(typeKey, decorationType);
      editor.setDecorations(decorationType, decorations);
    }
  }

  private clearDecorations(): void {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
  }

  dispose(): void {
    this.clearDecorations();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
