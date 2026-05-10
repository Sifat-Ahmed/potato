# Potato Contracts

## Endpoint Types

Endpoints support three OpenAI-compatible request styles:

- `chat-completions`: appends `/chat/completions` unless the base URL or path override already supplies a route.
- `responses`: appends `/responses`.
- `completions`: appends `/completions`.

Authentication modes are `bearer`, `api-key`, or `none`. API keys are stored in VS Code `SecretStorage` and are not exported.

## Provider-Neutral Tool Calls

Models that do not support native function calling can request local tools by returning only valid JSON:

```json
{
  "toolCalls": [
    { "name": "web_search", "arguments": { "query": "search text" } },
    { "name": "list_files", "arguments": { "glob": "src/**/*.ts" } },
    { "name": "read_file", "arguments": { "path": "src/file.ts" } },
    { "name": "search_workspace", "arguments": { "query": "needle" } }
  ]
}
```

The extension executes those tools locally, returns results to the agent, and asks for the final response.

## Approval Actions

Agents can propose file edits and terminal commands. These are never applied automatically.

```json
{
  "fileEdits": [
    {
      "path": "relative/path.ts",
      "content": "full file content",
      "description": "why this edit is needed"
    }
  ],
  "terminalCommands": [
    {
      "command": "npm test",
      "cwd": "optional/path",
      "description": "why this command is needed"
    }
  ]
}
```

The user must approve or reject each action from the Actions tab.

## Attachment Permissions

Chat attachments are selected through VS Code's native file picker. The webview does not get raw filesystem access.

- Up to 8 files can be attached to a single run.
- All file types can be selected.
- Text-like files are embedded into the prompt up to a capped preview size.
- Binary files are attached as metadata only until multimodal endpoint support is added.
- Attachments are cleared after a run completes.
