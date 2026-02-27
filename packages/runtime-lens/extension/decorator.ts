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

const MAX_HISTORY_PER_LINE = 10;

export class InlineDecorator {
	private decorationTypes: Map<string, vscode.TextEditorDecorationType> =
		new Map();
	private values: Map<string, Map<number, InlineValue[]>> = new Map();
	private disposables: vscode.Disposable[] = [];

	activate(context: vscode.ExtensionContext): void {
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (e.document === vscode.window.activeTextEditor?.document) {
					this.refresh();
				}
			}),
		);
		context.subscriptions.push(...this.disposables);
	}

	addValue(value: InlineValue): void {
		const key = value.file;
		if (!this.values.has(key)) {
			this.values.set(key, new Map());
		}
		const lineMap = this.values.get(key)!;
		if (!lineMap.has(value.line)) {
			lineMap.set(value.line, []);
		}

		const history = lineMap.get(value.line)!;
		history.push(value);

		if (history.length > MAX_HISTORY_PER_LINE) {
			history.splice(0, history.length - MAX_HISTORY_PER_LINE);
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
		const lineMap = this.values.get(filePath);
		if (!lineMap || lineMap.size === 0) return;

		const decorationsByType = new Map<string, vscode.DecorationOptions[]>();

		for (const [lineNum, history] of lineMap) {
			if (history.length === 0) continue;

			const lineIndex = lineNum - 1;
			if (lineIndex < 0 || lineIndex >= editor.document.lineCount) continue;

			const lineText = editor.document.lineAt(lineIndex).text;
			const range = new vscode.Range(
				new vscode.Position(lineIndex, lineText.length),
				new vscode.Position(lineIndex, lineText.length),
			);

			const latest = history[history.length - 1];
			const maxLen = vscode.workspace
				.getConfiguration("runtimeLens")
				.get("maxInlineLength", 80);

			let inlineText = latest.text;
			if (inlineText.length > maxLen) {
				inlineText = inlineText.slice(0, maxLen) + "…";
			}
			if (history.length > 1) {
				inlineText = `${inlineText}  (×${history.length})`;
			}

			const hoverLines = history
				.slice()
				.reverse()
				.map((v, i) => {
					const time = new Date(v.timestamp).toLocaleTimeString();
					const prefix = i === 0 ? "▶" : " ";
					return `${prefix} \`[${time}]\` ${v.type}: \`${v.text}\``;
				})
				.join("\n\n");

			const hover = new vscode.MarkdownString(
				`**Runtime Lens** — ${history.length} log(s)\n\n${hoverLines}`,
			);
			hover.isTrusted = true;

			const decoration: vscode.DecorationOptions = {
				range,
				hoverMessage: hover,
				renderOptions: {
					after: {
						contentText: `  // → ${inlineText}`,
						color: TYPE_COLORS[latest.type] || "#6A9955",
						fontStyle: "italic",
						margin: "0 0 0 1em",
					},
				},
			};

			const typeKey = latest.type;
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
