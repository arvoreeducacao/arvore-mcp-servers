# @arvoretech/slack-advanced-mcp

Advanced Slack MCP server: semantic user search, smart DMs, style analysis, thread extraction, audio transcription and image analysis. Every call runs as the authenticated user (`SLACK_USER_TOKEN`, an `xoxp-` token).

## Text formatting

Every tool that carries text takes a `format`:

| format | what happens |
| --- | --- |
| `markdown` | `**bold**`, `*italic*`, `[label](url)`, lists and quotes are converted to Slack mrkdwn |
| `mrkdwn` | the text reaches Slack exactly as written, for callers that already speak `*bold*` and `<url\|label>` |

The default is `markdown` for the text-only tools (`send_dm`, `send_channel_message`, `edit_message`, `create_group_dm`) and `mrkdwn` for the caption of the upload tools (`send_image`, `send_file`, `send_audio`), which is the behaviour each of them already had.

Two things the markdown converter protects that a plain markdown-to-mrkdwn pass destroys:

- **links with a scheme other than http, https or mailto.** `[RFC](hive://shelf/x)` used to come out as the bare word `RFC`, with the address dropped and nothing to notice it by.
- **links already written in mrkdwn.** `<https://x|PR>` used to be converted a second time into `<https://x%7CPR|https://x|PR>`, which renders as a link to a 404.

`send_dm`, `send_channel_message` and `edit_message` echo `sent_text`: the exact string Slack stored, so a caller can check the result without reading the channel back.

`content_type` is still accepted on `send_channel_message` and maps to `format` (`text/plain` to `mrkdwn`, `text/markdown` to `markdown`).

## Reading messages back

Slack rewrites a message's top-level `text` field into a single flat line whenever the message carries blocks, which is every message this server sends. The readers (`get_dm_history`, `list_channel_messages`, `get_thread_from_link`) therefore return the text of the message block instead, so line breaks survive the round trip.

## Drafts

`create_draft` leaves a message in the user's Slack composer instead of sending it. Bold, italic, strikethrough, inline code, code blocks, links, lists and quotes are carried over as real formatting.

Slack's API only lets a user token create a draft. Reading, editing and deleting one are not available, so a draft can only be changed from the Slack app, and Slack keeps at most one draft per conversation.

## Environment

| variable | required | what for |
| --- | --- | --- |
| `SLACK_USER_TOKEN` | yes | Slack user token (`xoxp-...`) |
| `ELEVENLABS_API_KEY` | no | audio transcription and text to speech |
| `ELEVENLABS_DEFAULT_VOICE_ID` | no | default voice for `send_audio` |
| `SLACK_USERS_CACHE_PATH` | no | where the user directory is cached |
| `SLACK_USERS_CACHE_TTL_MINUTES` | no | cache lifetime, 240 by default |
