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
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-openai-subscription";
export declare const settingsNamespace = "dsh-openai-subscription";
/** The LLM seam is the one required service; the adapter works in every composition. */
export declare const inject: string[];
/** Default maximum interval without a Codex stream event while a read is pending. */
export declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
export interface Config {
    /** Provider route this adapter registers (the id models and sessions name). */
    provider: string;
    /** Credential store path; defaults to `$DSH_HOME/openai-subscription-oauth.json`. */
    storePath?: string;
    /**
     * Codex Responses transport. The cached WebSocket transport is the default:
     * it reuses the session and sends only the incremental input after the first
     * request. Use `sse` only when compatibility with a proxy requires it.
     */
    transport: 'sse' | 'websocket' | 'websocket-cached' | 'auto';
    /** Prompt-cache retention preference for session-cached Codex requests. */
    cacheRetention: 'none' | 'short' | 'long';
    /** Maximum interval with no provider stream event while a read is pending. */
    streamIdleTimeoutMs: number;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
