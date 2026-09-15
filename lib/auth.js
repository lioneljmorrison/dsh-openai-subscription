/**
 * Codex OAuth operations: login, status, and logout, driven through pi-ai's
 * provider-owned OAuth flows. The CLI bin and the `/codex` slash command both
 * call these; only the reporter differs.
 *
 * pi-ai owns the wire protocol (authorization-code flow with a local callback
 * server, device-code flow for headless machines, and refresh-token exchange).
 * This module owns the human interaction: selecting the login method and
 * rendering progress. Tokens land in the {@link FileCredentialStore} through
 * `Models.login`, and pi-ai refreshes them automatically on request paths.
 *
 * @module dsh-openai-subscription/auth
 */
import { spawn } from 'node:child_process';
import { createModels } from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
/** pi-ai's provider id for OpenAI Codex (ChatGPT Plus/Pro). */
export const CODEX_PROVIDER_ID = 'openai-codex';
/** Describe a browser-opener failure without hiding the manual URL printed by the caller. */
function reportOpenFailure(reporter, error) {
    const detail = error instanceof Error ? error.message : String(error);
    reporter?.line(`dsh-openai-subscription: could not open the browser automatically: ${detail}`);
}
/** Open `url` in the desktop browser, containing both synchronous and emitted spawn failures. */
export function openUrlInBrowser(url, reporter) {
    // Only provider-issued https URLs are ever candidates; refuse anything else
    // rather than handing an untrusted string to the shell.
    if (!url.startsWith('https://')) {
        reporter?.line('dsh-openai-subscription: refusing to open non-https URL');
        return;
    }
    // Embedders supply their own opener; standalone callers spawn the OS one.
    if (reporter?.openUrl !== undefined) {
        try {
            reporter.openUrl(url);
        }
        catch (error) {
            reportOpenFailure(reporter, error);
        }
        return;
    }
    const command = process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try {
        const child = spawn(command, args, { stdio: 'ignore', detached: true });
        child.once('error', (error) => { reportOpenFailure(reporter, error); });
        child.unref();
    }
    catch (error) {
        reportOpenFailure(reporter, error);
    }
}
/**
 * Answer one login-method prompt from the configured method, tolerating
 * label renames in later pi-ai versions by matching text rather than ids.
 * @param prompt - the select prompt pi-ai issued.
 * @param method - the configured method.
 * @returns the matching option id, falling back to the first option.
 */
export function answerMethodPrompt(prompt, method) {
    const wanted = method === 'device' ? /device/i : /browser/i;
    const option = prompt.options.find(entry => wanted.test(entry.label));
    return option?.id ?? prompt.options[0]?.id ?? '';
}
/** Translate pi-ai's notify events into human-facing lines. */
function notify(event, reporter, openBrowser) {
    switch (event.type) {
        case 'info':
            reporter.line(event.message);
            for (const link of event.links ?? [])
                reporter.line(`${link.label ?? 'More information'}: ${link.url}`);
            break;
        case 'auth_url':
            if (openBrowser)
                openUrlInBrowser(event.url, reporter);
            reporter.line(`Complete the login in your browser window.`);
            reporter.line(`If no window opened, open this URL yourself: ${event.url}`);
            break;
        case 'device_code':
            reporter.line(`Open ${event.verificationUri} on any device and enter this code: ${event.userCode}`);
            reporter.line(`The code expires in ${event.expiresInSeconds} seconds.`);
            break;
        case 'progress':
            reporter.line(event.message);
            break;
    }
}
/**
 * Run the Codex OAuth login flow and persist the credential.
 *
 * The `manual_code` prompt is answered by waiting on its signal: the browser
 * flow races that prompt against pi-ai's local callback server, and nothing
 * in a single-shot command plane can collect a pasted code interactively. The
 * callback server wins when the user completes the browser login; a prompt
 * whose signal fires without a callback resolves empty and the flow fails
 * with its own error. Cancelling the whole login rejects the pending prompt so
 * pi-ai can close its callback server instead of leaving detached work behind.
 *
 * @param options - store, method, and reporter for this login.
 * @returns the credential, for the caller to summarize.
 */
export async function login(options) {
    const { store, method, openBrowser, signal, reporter } = options;
    const models = createModels({ credentials: store });
    models.setProvider(openaiCodexProvider());
    const interaction = {
        ...signal === undefined ? {} : { signal },
        notify: (event) => notify(event, reporter, openBrowser),
        prompt: async (prompt) => {
            switch (prompt.type) {
                case 'select':
                    return answerMethodPrompt(prompt, method);
                case 'manual_code':
                    await new Promise((resolve, reject) => {
                        if (prompt.signal === undefined) {
                            reject(new Error('dsh-openai-subscription: browser login supplied no callback-completion signal'));
                            return;
                        }
                        const cleanup = () => {
                            prompt.signal?.removeEventListener('abort', onPromptAbort);
                            signal?.removeEventListener('abort', onLoginAbort);
                        };
                        const onPromptAbort = () => {
                            cleanup();
                            resolve();
                        };
                        const onLoginAbort = () => {
                            cleanup();
                            const reason = signal?.reason;
                            reject(reason instanceof Error ? reason : new Error('dsh-openai-subscription: login cancelled'));
                        };
                        if (signal?.aborted) {
                            onLoginAbort();
                            return;
                        }
                        if (prompt.signal.aborted) {
                            onPromptAbort();
                            return;
                        }
                        prompt.signal.addEventListener('abort', onPromptAbort, { once: true });
                        signal?.addEventListener('abort', onLoginAbort, { once: true });
                    });
                    return '';
                default:
                    throw new Error(`dsh-openai-subscription: Codex login issued an unsupported "${prompt.type}" prompt`);
            }
        },
    };
    const credential = await models.login(CODEX_PROVIDER_ID, 'oauth', interaction);
    if (credential.type !== 'oauth') {
        throw new Error(`dsh-openai-subscription: Codex login produced an unexpected ${credential.type} credential`);
    }
    reporter.line('Codex login complete; the token is stored and refreshes automatically.');
}
/**
 * Describe the current Codex credential without resolving it.
 * @param store - the credential store to inspect.
 * @returns human-facing status lines.
 */
export async function status(store) {
    const credential = await store.read(CODEX_PROVIDER_ID);
    if (credential === undefined) {
        return ['No Codex credential stored. Run `dsh-openai-subscription login` (or `/codex login`) first.'];
    }
    if (credential.type !== 'oauth') {
        return [`Stored Codex credential has unexpected type "${credential.type}"; log out and in again.`];
    }
    const expires = new Date(credential.expires).toISOString();
    return [`Codex logged in; access token expires ${expires}. pi-ai refreshes it automatically.`];
}
/**
 * Remove the stored Codex credential.
 * @param store - the credential store to clear.
 */
export async function logout(store) {
    await store.delete(CODEX_PROVIDER_ID);
}
//# sourceMappingURL=auth.js.map