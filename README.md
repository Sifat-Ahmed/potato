# Potato

A personal VS Code extension for coordinating private OpenAI-compatible endpoints as a small agent workforce.

This extension is intentionally local-first:

- Endpoint API keys are stored locally in VS Code SecretStorage and can be revealed from the endpoint form when needed.
- Agent and endpoint metadata are stored in VS Code global state.
- Chat Completions, Responses, and legacy Completions style endpoints are supported.
- It is not prepared for Marketplace publishing.
- File edits and terminal commands proposed by agents require explicit approval.
- Configuration import/export intentionally excludes API keys.
- Chat attachments use the VS Code file picker, support all file types, and cap embedded file content before sending it to a model.
- Chat run errors are shown in the transcript. Press Enter to send and Shift+Enter for a new line.
- For APIM/Azure-style OpenAI URLs, paste the endpoint base through `/openai` and put the deployment name in the model field; Potato builds the `/deployments/{model}/...` route.

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
