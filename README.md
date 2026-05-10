# Potato

A personal VS Code extension for coordinating private OpenAI-compatible endpoints as a small agent workforce.

This extension is intentionally local-first:

- Endpoint API keys are stored in VS Code SecretStorage.
- Agent and endpoint metadata are stored in VS Code global state.
- Chat Completions, Responses, and legacy Completions style endpoints are supported.
- It is not prepared for Marketplace publishing.
- File edits and terminal commands proposed by agents require explicit approval.
- Configuration import/export intentionally excludes API keys.

## Development

```powershell
npm install
npm run compile
npm test
```

Open this folder in VS Code, press `F5`, and use the Potato activity bar icon in the extension host window.

## Local Package

```powershell
npm run package:vsix
```

The generated `.vsix` is for local installation only and is ignored by git.
