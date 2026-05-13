# Potato Contracts

## Endpoint Types

Endpoints support three OpenAI-compatible request styles:

- `chat-completions`: appends `/chat/completions` unless the base URL or path override already supplies a route.
- `responses`: appends `/responses`.
- `completions`: appends `/completions`.

Authentication modes are `bearer`, `api-key`, or `none`. API keys are stored in VS Code `SecretStorage` with a plaintext local extension-storage fallback and are not exported.

Endpoint records own model execution settings:

- `model`: request body model/deployment value.
- `reasoningEffort`: optional Responses `reasoning.effort`.
- `temperature`: optional request temperature.

Agents only choose a role, endpoint, enabled state, and system prompt. The assigned endpoint supplies the model.

For OpenAI-compatible APIM/Azure-style bases, paste the base URL through `/openai` and leave the path override blank. Potato then uses the standard OpenAI-compatible route:

```text
https://apim.example.com/team/openai
resolved route: /chat/completions
```

If a gateway requires a deployment route, use the path override field, for example `/deployments/gpt-5.2/chat/completions` or `/deployments/gpt-5.2/completions`. If the base URL already includes `/chat/completions`, `/responses`, or `/completions`, Potato uses it as-is.

For Codex-style Azure Responses configs, use:

```text
base URL: https://apim.example.com/team/openai/
API kind: responses
auth: api-key
API version: 2025-04-01-preview
resolved route: /responses?api-version=2025-04-01-preview
endpoint model: gpt-5.1-codex
endpoint reasoning effort: medium
```

Potato maps the agent system prompt to the Responses `instructions` field, sends the user request as `input`, sends endpoint `reasoning.effort` when configured, and omits `temperature` for Codex/GPT-5/o-series Responses calls.

Endpoint Test saves the current form and API key, sends `hello` to the endpoint model, and displays the resolved URL plus the raw success or error response in the endpoint form.

## Manager Delegation

Delegation is controlled by the `orchestrator.autoDelegate` setting and is enabled by default.

At run time Potato:

1. Picks the enabled `manager` agent, or the first enabled agent if no manager exists.
2. Finds every other enabled agent that has an assigned endpoint with a model/deployment.
3. Asks the manager for a JSON delegation plan:

```json
{
  "tasks": [
    {
      "agentId": "agent id from the available list",
      "title": "short title",
      "instructions": "specific task instructions"
    }
  ]
}
```

4. Calls those specialist agents in parallel, up to `orchestrator.maxParallelAgents`.
5. Sends the specialist results back to the manager for final synthesis.

The live chat transcript only shows `Thinking...` while this happens, then the final manager response. Detailed plan, status, tool, and agent-result updates remain in local run history for debugging.

## Provider-Neutral Tool Calls

Models that do not support native function calling can request local tools by returning only valid JSON:

```json
{
  "toolCalls": [
    { "name": "web_search", "arguments": { "query": "search text" } },
    { "name": "fetch_url", "arguments": { "url": "https://example.com" } },
    { "name": "list_files", "arguments": { "glob": "src/**/*.ts" } },
    { "name": "read_file", "arguments": { "path": "src/file.ts", "maxBytes": 12000 } },
    { "name": "search_workspace", "arguments": { "query": "needle" } },
    { "name": "write_file", "arguments": { "path": "src/file.ts", "content": "full file content", "description": "why" } },
    { "name": "delete_file", "arguments": { "path": "src/old.ts", "description": "why" } }
  ]
}
```

The extension executes read-only tools locally, returns results to the agent, and asks for the final response. Mutating tools queue approval actions instead of changing files directly.

## Approval Actions

Agents can propose file edits, file deletes, and terminal commands. These are never applied automatically.

```json
{
  "fileEdits": [
    {
      "path": "relative/path.ts",
      "content": "full file content",
      "description": "why this edit is needed"
    }
  ],
  "fileDeletes": [
    {
      "path": "relative/old-file.ts",
      "description": "why this file should be deleted"
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

## Conversation Database

Conversation history is stored in a plaintext local JSON database named `conversation-db.v1.json` under VS Code extension global storage. The active conversation is loaded into the chat transcript and recent conversation messages are included as context for new runs.

Run history remains capped at 50 entries and stores the detailed status/tool/action updates for each run.

## Attachment Permissions

Chat attachments are selected through VS Code's native file picker. The webview does not get raw filesystem access.

- Up to 8 files can be attached to a single run.
- All file types can be selected.
- Text-like files are embedded into the prompt up to a capped preview size.
- Binary files are attached as metadata only until multimodal endpoint support is added.
- Attachments are cleared after a run completes.
