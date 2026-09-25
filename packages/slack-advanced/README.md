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

## Searching and scheduling

`search_messages` runs Slack's own search (modifiers such as `in:#channel`, `from:@user`, `after:2026-01-01` work) and needs the `search:read` scope. `list_channels` lists channels with id, privacy, membership and topic, paginated by `next_cursor`.

`schedule_message` posts later, up to 120 days ahead. `post_at` is Unix seconds or an ISO 8601 date with a timezone; a date without one is refused, because it would be read in the server's clock zone. `delete_scheduled_message` cancels it with the returned `scheduled_message_id`.

## Safety

- **The token only goes to Slack.** `analyze_image`, `transcribe_audio` and `download_file` accept a `file_url`, and the token is sent with it only when it is https on `slack.com` or `slack-edge.com`. A redirect off Slack is refused too. Any other address fails with `UNTRUSTED_FILE_URL`.
- **Local files.** `send_image`, `send_file` and `send_audio` read `file_path`, and `download_file` writes `output_path`. Without `SLACK_FILE_ALLOWED_DIRS`, credential and system locations are refused (`~/.ssh`, `~/.aws`, `~/.config`, `~/.kube`, `.env*`, private keys, `/etc` and others), symlinks included. With it, only the listed folders are allowed.
- **No guessing people.** A name that matches more than one user returns `AMBIGUOUS_USER` with the candidates, and nothing is sent. `create_group_dm` opens nothing if any name fails.
- **Errors are errors.** A failed call comes back with `isError: true` and a `code`, so the agent never reads a failure as a sent message.
- **Retries never duplicate.** Rate limits (429) are retried on every call. Network errors and 5xx are retried only on reads; a write that fails that way is reported as possibly applied instead of being sent again. Every call has a timeout (30 s, 120 s for file transfers).

## Environment

| variable | required | what for |
| --- | --- | --- |
| `SLACK_USER_TOKEN` | yes | Slack user token (`xoxp-...`) |
| `ELEVENLABS_API_KEY` | no | audio transcription and text to speech |
| `ELEVENLABS_DEFAULT_VOICE_ID` | no | default voice for `send_audio` |
| `SLACK_USERS_CACHE_PATH` | no | where the user directory is cached |
| `SLACK_USERS_CACHE_TTL_MINUTES` | no | cache lifetime, 240 by default |
| `SLACK_FILE_ALLOWED_DIRS` | no | folders (separated by `:` or `,`) that file tools may read and write; when unset, only credential and system locations are refused |
| `SLACK_AI_ATTRIBUTION` | no | `false` removes the "Mensagem gerada e enviada por um agente de IA" line from sent messages; on by default |
