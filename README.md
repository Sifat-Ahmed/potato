# Potato

A personal VS Code extension for coordinating private OpenAI-compatible endpoints as a small agent workforce.

This extension is intentionally local-first:

- Endpoint API keys are stored locally in VS Code SecretStorage with a plaintext extension-storage fallback and can be revealed from the endpoint form when needed.
- Endpoint records own the model/deployment, reasoning effort, temperature, API kind, auth, API version, and test connection flow.
- Agent and endpoint metadata are stored in VS Code global state.
- Conversations are stored in a plaintext local JSON database under VS Code extension global storage and can be reopened from History.
- Chat Completions, Responses, and legacy Completions style endpoints are supported.
- It is not prepared for Marketplace publishing.
- File writes, file deletes, and terminal commands proposed by agents require explicit approval.
- Configuration import/export intentionally excludes API keys.
- Chat attachments use the VS Code file picker, support all file types, and cap embedded file content before sending it to a model.
- Chat run errors are shown in the transcript. Press Enter to send and Shift+Enter for a new line.
- For OpenAI-compatible APIM/Azure-style URLs, paste the endpoint base through `/openai`; Potato uses the standard `/chat/completions` route like Cline unless you add a path override.
- For Codex-style Azure Responses endpoints, choose the Azure Responses preset, paste the base through `/openai`, set API version `2025-04-01-preview`, and set the endpoint model/reasoning effort.
- Local tools support web search, URL fetch, file listing, file reading, workspace search, and approval-queued file write/delete actions.

## Development

```powershell
npm install
npm run compile
npm test
```

Open this folder in VS Code, press `F5`, and use the Potato activity bar icon in the extension host window.

On macOS or Linux:

```bash
npm install
npm run compile
```

If VS Code reports `Cannot find module .../out/extension.js`, the source folder has not been compiled yet. Run the two commands above from the repo root, then reload the Extension Development Host.

## Local Package

```powershell
npm run package:vsix
```

The generated `.vsix` is for local installation only and is ignored by git.

Install the generated `potato.vsix` on another machine when you want to use Potato without opening the source repo.
