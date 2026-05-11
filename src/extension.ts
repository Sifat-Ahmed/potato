import * as vscode from 'vscode';
import { ConversationDatabase } from './conversationDatabase';
import { OrchestratorStorage } from './storage';
import { OrchestratorWebviewProvider } from './webviewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Potato');
  output.appendLine('Activating Potato.');

  const storage = new OrchestratorStorage(context);
  const conversationDatabase = new ConversationDatabase(context);
  const provider = new OrchestratorWebviewProvider(context, storage, conversationDatabase, output);

  context.subscriptions.push(
    output,
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

  output.appendLine('Potato activated.');
}

export function deactivate(): void {}
