/**
 * dsh-openai-subscription: use your OpenAI Codex (ChatGPT Plus/Pro) subscription in
 * DeepSeek Harness through OAuth.
 *
 * The plugin registers one `LlmAdapter` for a `codex` provider route backed
 * by pi-ai's `openai-codex` provider, whose OAuth credential lives in a
 * `0600` JSON store under the Harness home. When the composition mounts the
 * commands service, it also registers the `/codex` human command; headless
 * users authenticate through the `dsh-openai-subscription` CLI bin instead.
 *
 * @module dsh-openai-subscription
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { createModels } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { CodexAdapter } from './adapter.js'
import { codexCommand } from './command.js'
import { FileCredentialStore } from './store.js'

export const name = 'dsh-openai-subscription'
export const settingsNamespace = name

/** The LLM seam is the one required service; the adapter works in every composition. */
export const inject = ['llm']

/** Default maximum interval without a Codex stream event while a read is pending. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000

export interface Config {
  /** Provider route this adapter registers (the id models and sessions name). */
  provider: string
  /** Credential store path; defaults to `$DSH_HOME/openai-subscription-oauth.json`. */
  storePath?: string
  /**
   * Codex Responses transport. The cached WebSocket transport is the default:
   * it reuses the session and sends only the incremental input after the first
   * request. Use `sse` only when compatibility with a proxy requires it.
   */
  transport: 'sse' | 'websocket' | 'websocket-cached' | 'auto'
  /** Prompt-cache retention preference for session-cached Codex requests. */
  cacheRetention: 'none' | 'short' | 'long'
  /** Maximum interval with no provider stream event while a read is pending. */
  streamIdleTimeoutMs: number
}

export const Config: Schema<Config> = Schema.object({
  provider: Schema.string().default('codex'),
  storePath: Schema.string(),
  transport: Schema.union(['sse', 'websocket', 'websocket-cached', 'auto']).default('websocket-cached'),
  cacheRetention: Schema.union(['none', 'short', 'long']).default('long'),
  streamIdleTimeoutMs: Schema.number()
    .min(Number.MIN_VALUE)
    .max(MAX_TIMER_DELAY_MS)
    .default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
})

export function apply(ctx: Context, config: Config): void {
  const store = new FileCredentialStore(config.storePath ?? dshHomePath('openai-subscription-oauth.json'))
  const models = createModels({ credentials: store })
  models.setProvider(openaiCodexProvider())
  const adapter = new CodexAdapter(models, config.provider, {
    transport: config.transport,
    cacheRetention: config.cacheRetention,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
  })

  // Registrations are effects: HMR and fiber teardown unwind both.
  // The configurable directory is what makes this provider appear in
  // Settings > Models; listModels() alone only powers model selection after
  // a provider card already exists.
  const unregisterDirectory = ctx.llm.registerConfigurableProviders([{
    provider: config.provider,
    displayName: 'OpenAI Codex',
    settingsNs: settingsNamespace,
    settingsPath: [],
  }])
  // Keep the directory registration in the same lifecycle as DSH's built-in
  // LLM providers. The LLM registry owns its removal with the plugin context.
  void unregisterDirectory
  ctx.effect(() => ctx.llm.registerAdapter([config.provider], adapter))
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.get('settings').installSection(ctx, settingsNamespace, Config, config, {
      setSource: () => {},
      onChange: () => {},
    })
  })
  const commands = ctx.get('commands')
  if (commands !== undefined) {
    ctx.effect(() => commands.register(codexCommand(store)))
  }
}
