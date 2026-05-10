# Private Orchestrator

A personal VS Code extension for coordinating private OpenAI-compatible endpoints as a small agent workforce.

This extension is intentionally local-first:

- Endpoint API keys are stored in VS Code SecretStorage.
- Agent and endpoint metadata are stored in VS Code global state.
- Chat Completions, Responses, and legacy Completions style endpoints are supported.
- It is not prepared for Marketplace publishing.

## Development

```powershell
npm install
npm run compile
```

Open this folder in VS Code, press `F5`, and use the Orchestrator activity bar icon in the extension host window.
