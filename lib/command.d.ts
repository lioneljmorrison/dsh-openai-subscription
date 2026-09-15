/**
 * The `/codex` human command provides browser `login`, `logout`, and `status`.
 * Registered only when the composition mounts the commands service (the
 * shipped base bundle does).
 *
 * The command plane renders one result only after its handler completes, so it
 * cannot conduct device login: the user must see the code while authentication
 * is still pending. Device login therefore returns immediate CLI guidance;
 * the CLI bin prints provider progress as it arrives.
 *
 * @module dsh-openai-subscription/command
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { FileCredentialStore } from './store.js';
import { CODEX_PROVIDER_ID } from './auth.js';
/**
 * Build the `/codex` command definition.
 * @param store - the credential store the command operates on.
 * @returns the command definition.
 */
export declare function codexCommand(store: FileCredentialStore): CommandDefinition;
export { CODEX_PROVIDER_ID };
