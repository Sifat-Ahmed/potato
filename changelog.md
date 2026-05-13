# Changelog

## Unreleased

- Renamed the extension to Potato.
- Refined the webview into a chat-first layout with a fixed bottom composer, history icon, and compact settings menu for secondary sections.
- Added a composer footer and a permission-gated file attachment picker with removable attachment chips.
- Improved chat debugging and composer behavior: run errors now appear in the transcript, Enter sends, Shift+Enter inserts a newline, and the send button shows a loading state.
- Fixed endpoint testing to save the current API key before testing, added API key reveal/hide, added local key-file fallback storage, and aligned APIM `/openai` bases with Cline-style OpenAI-compatible routing.
- Added a Codex-style Azure Responses preset, agent reasoning effort, and Responses request mapping for `instructions`, `input`, and `reasoning.effort`.
- Added endpoint testing, optional streaming, and run cancellation.
- Added a local conversation database with reopenable conversation history.
- Added persisted run history and an approval queue for agent-proposed file writes, file deletes, and terminal commands.
- Added provider-neutral JSON tool calls for web search, URL fetch, file listing, file reading, workspace search, and approval-queued file write/delete.
- Added config import/export without API keys.
- Added Azure/OpenAI endpoint presets in the endpoint form.
- Added local VSIX packaging script and source-build troubleshooting for missing `out/extension.js`.
