# Security model

The plugin process must hold an OAuth access token long enough to authenticate a Codex
request. Its security promise is therefore about storage and destination control:

1. Credentials are stored in an owner-only file under the DSH home.
2. Login and refresh requests may target only `https://auth.openai.com`.
3. Inference requests may target only `https://chatgpt.com/backend-api/codex`.
4. Tokens, authorization headers, refresh tokens, and credential documents are never
   written to application logs.
5. Runtime dependencies are exact-versioned and locked. The Codex transport source is
   vendored so changes are reviewable locally.

The DSH process runs as the account owner. Any unrestricted code executed as that user
can potentially read the credential file, including model-driven shell tools. Keep the
DSH home outside model workspaces and retain sandbox restrictions.

