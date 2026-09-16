# dsh-openai-subscription

[![GitHub release](https://img.shields.io/github/v/release/lioneljmorrison/dsh-openai-subscription?style=flat-square)](https://github.com/lioneljmorrison/dsh-openai-subscription/releases/latest)
[![Tests](https://img.shields.io/github/actions/workflow/status/lioneljmorrison/dsh-openai-subscription/ci.yml?branch=main&style=flat-square&label=tests)](https://github.com/lioneljmorrison/dsh-openai-subscription/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/lioneljmorrison/dsh-openai-subscription/codeql.yml?branch=main&style=flat-square&label=CodeQL)](https://github.com/lioneljmorrison/dsh-openai-subscription/security/code-scanning)
[![Coverage threshold](https://img.shields.io/badge/coverage-%E2%89%A570%25-brightgreen?style=flat-square)](https://github.com/lioneljmorrison/dsh-openai-subscription/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/lioneljmorrison/dsh-openai-subscription?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24.0.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

Local DeepSeek Harness LLM provider for a ChatGPT/Codex subscription.

This repository is intentionally local and auditable. OAuth credentials are stored with
owner-only permissions and are sent only to OpenAI authentication and Codex service
endpoints. It registers Codex subscription models on DSH's primary LLM seam, allowing
selection from the Web model picker.

## Security boundary

- OAuth: `https://auth.openai.com`
- Inference: `https://chatgpt.com/backend-api/codex`
- No analytics or telemetry endpoints
- No API key
- Credential contents are never logged

This uses an OpenAI product protocol implemented by the official Codex client but not
documented as a stable third-party API. OpenAI may change it without notice.

Long-running agent sessions use the cached WebSocket transport by default. It keeps a
session-scoped connection and sends only new input after the initial request, including
tool results. Set `transport: sse` only for environments where WebSockets are blocked;
SSE requests rebuild the full conversation context on every agent step.

## Setup

Clone the repository to a directory of your choice and reference it from a DSH profile
with a `file:` dependency. The plugin registers the provider name `codex`; it does not
change DSH's default model.

Authenticate or inspect authentication without displaying credential contents:

```sh
cd /path/to/dsh-openai-subscription
pnpm run build
node lib/bin.js login
node lib/bin.js status
```

After login, restart DSH and refresh the browser. Start a new conversation, open the
model picker, and select one of the models under the `codex` provider. Existing
conversations retain the model they were created with.

```sh
systemctl --user restart dsh.service
systemctl --user status dsh.service
```

The credential file is `$DSH_HOME/openai-subscription-oauth.json` and is created with
mode `0600`.

## Verification

```sh
cd /path/to/dsh-openai-subscription
pnpm run build
pnpm run typecheck
node scripts/smoke.mjs

cd "$DSH_HOME/profiles/web"
npx --offline @deepseek-ai/dsh --profile web --dump-config
```

The smoke test makes one small inference request and prints only the model response
and finish reason. It never prints the stored credential.
