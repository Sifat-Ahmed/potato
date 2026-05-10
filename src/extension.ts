import * as vscode from 'vscode';
import { OrchestratorStorage } from './storage';
import { OrchestratorWebviewProvider } from './webviewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const storage = new OrchestratorStorage(context);
  const provider = new OrchestratorWebviewProvider(context, storage);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(OrchestratorWebviewProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.commands.registerCommand('orchestrator.open', () => provider.reveal()),
    vscode.commands.registerCommand('orchestrator.resetDemoData', async () => {
      await storage.resetStarterAgents();
      await provider.refresh();
      vscode.window.showInformationMessage('Starter agents were reset.');
    })
  );
}

export function deactivate(): void {}
