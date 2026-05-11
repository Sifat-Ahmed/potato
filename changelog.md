# Changelog

## Unreleased

- Renamed the extension to Potato.
- Refined the webview into a chat-first layout with a fixed bottom composer, history icon, and compact settings menu for secondary sections.
- Added a composer footer and a permission-gated file attachment picker with removable attachment chips.
- Improved chat debugging and composer behavior: run errors now appear in the transcript, Enter sends, Shift+Enter inserts a newline, and the send button shows a loading state.
- Fixed endpoint testing to save the current API key before testing, added API key reveal/hide, and added APIM `/openai` deployment-route handling.
- Added endpoint testing, optional streaming, and run cancellation.
- Added persisted run history and an approval queue for agent-proposed file edits and terminal commands.
- Added provider-neutral JSON tool calls for web search, file listing, file reading, and workspace search.
- Added config import/export without API keys.
- Added Azure/OpenAI endpoint presets in the endpoint form.
- Added local VSIX packaging script and source-build troubleshooting for missing `out/extension.js`.
