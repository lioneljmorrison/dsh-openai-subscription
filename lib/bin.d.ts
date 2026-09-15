#!/usr/bin/env node
/**
 * dsh-openai-subscription CLI: authenticate the local DSH provider to OpenAI Codex.
 *
 *   dsh-openai-subscription login [--method browser|device] [--no-open] [--store PATH]
 *   dsh-openai-subscription logout [--store PATH]
 *   dsh-openai-subscription status  [--store PATH]
 *
 * The store defaults to `$DSH_HOME/openai-subscription-oauth.json`, the same
 * owner-only document the harness plugin reads.
 *
 * @module dsh-openai-subscription/bin
 */
export {};
