import { join } from "node:path";
import * as vscode from "vscode";
import { InlineDecorator } from "./decorator.js";
import { RuntimeBridge } from "./runtime-bridge.js";

let decorator: InlineDecorator;
let bridge: RuntimeBridge;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
	const outputChannel = vscode.window.createOutputChannel("Runtime Lens");
	const agentPath = join(context.extensionPath, "dist", "agent", "index.js");

	decorator = new InlineDecorator();
	decorator.activate(context);

	bridge = new RuntimeBridge(decorator, outputChannel);

	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100,
	);
	statusBarItem.text = "$(eye) Lens";
	statusBarItem.tooltip = "Runtime Lens - Click to toggle";
	statusBarItem.command = "runtimeLens.toggle";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	const port = vscode.workspace
		.getConfiguration("runtimeLens")
		.get("port", 9500);

	context.subscriptions.push(
		vscode.commands.registerCommand("runtimeLens.start", () => {
			bridge.connect();
			updateStatusBar(true);
			vscode.window.showInformationMessage(
				"Runtime Lens: Listening for logs...",
			);
		}),

		vscode.commands.registerCommand("runtimeLens.stop", () => {
			bridge.disconnect();
			decorator.clearAll();
			updateStatusBar(false);
			vscode.window.showInformationMessage("Runtime Lens: Stopped");
		}),

		vscode.commands.registerCommand("runtimeLens.toggle", () => {
			if (bridge.isConnected()) {
				vscode.commands.executeCommand("runtimeLens.stop");
			} else {
				vscode.commands.executeCommand("runtimeLens.start");
			}
		}),

		vscode.commands.registerCommand("runtimeLens.clear", () => {
			decorator.clearAll();
			vscode.window.showInformationMessage("Runtime Lens: Cleared");
		}),

		vscode.commands.registerCommand("runtimeLens.connect", () => {
			bridge.connect();
			updateStatusBar(true);
		}),

		vscode.commands.registerCommand("runtimeLens.showOutput", () => {
			outputChannel.show();
		}),

		vscode.commands.registerCommand("runtimeLens.injectEnv", () => {
			const terminal = vscode.window.activeTerminal;
			if (!terminal) {
				vscode.window.showWarningMessage("Runtime Lens: No active terminal");
				return;
			}
			terminal.sendText(`export NODE_OPTIONS="--require ${agentPath}"`, true);
			terminal.sendText(`export RUNTIME_LENS_PORT="${port}"`, true);
			vscode.window.showInformationMessage(
				"Runtime Lens: Environment injected. Run your app now.",
			);
		}),
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((doc) => {
			decorator.clearFile(doc.uri.fsPath);
		}),
	);

	const autoStart = vscode.workspace
		.getConfiguration("runtimeLens")
		.get("autoStart", false);
	if (autoStart) {
		vscode.commands.executeCommand("runtimeLens.start");
	}

	outputChannel.appendLine("[runtime-lens] Extension activated");
	outputChannel.appendLine(`[runtime-lens] Agent path: ${agentPath}`);
}

function updateStatusBar(active: boolean): void {
	if (active) {
		statusBarItem.text = "$(eye) Lens ●";
		statusBarItem.backgroundColor = new vscode.ThemeColor(
			"statusBarItem.warningBackground",
		);
	} else {
		statusBarItem.text = "$(eye) Lens";
		statusBarItem.backgroundColor = undefined;
	}
}

export function deactivate(): void {
	bridge?.disconnect();
	decorator?.dispose();
}
