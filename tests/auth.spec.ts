import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuthInteraction, AuthPrompt } from '@earendil-works/pi-ai'
import { FileCredentialStore } from '../src/store.js'
import { answerMethodPrompt, login, logout, openUrlInBrowser, status } from '../src/auth.js'

const fakeSpawn = vi.hoisted(() => vi.fn())
const fakeLogin = vi.hoisted(() => vi.fn())
const fakeSetProvider = vi.hoisted(() => vi.fn())
const hoistedStore = vi.hoisted<{ store: FileCredentialStore | undefined }>(() => ({ store: undefined }))

vi.mock('node:child_process', () => ({ spawn: fakeSpawn }))

vi.mock('@earendil-works/pi-ai', () => ({
  createModels: (options: { credentials: FileCredentialStore }) => {
    hoistedStore.store = options.credentials
    return { setProvider: fakeSetProvider, login: fakeLogin }
  },
}))

vi.mock('@earendil-works/pi-ai/providers/openai-codex', () => ({
  openaiCodexProvider: () => ({ id: 'openai-codex' }),
}))

const oauthCredential = {
  type: 'oauth',
  access: 'access-token',
  refresh: 'refresh-token',
  expires: 1_800_000_000_000,
} as const

function selectPrompt(): Extract<AuthPrompt, { type: 'select' }> {
  return {
    type: 'select',
    message: 'Select OpenAI Codex login method:',
    options: [
      { id: 'browser-login', label: 'Browser login (default)' },
      { id: 'device-code', label: 'Device code login (headless)' },
    ],
  }
}

describe('answerMethodPrompt', () => {
  it('matches the device option by label, not id', () => {
    expect(answerMethodPrompt(selectPrompt(), 'device')).toBe('device-code')
  })

  it('matches the browser option by label', () => {
    expect(answerMethodPrompt(selectPrompt(), 'browser')).toBe('browser-login')
  })

  it('falls back to the first option when no label matches', () => {
    const prompt: Extract<AuthPrompt, { type: 'select' }> = {
      type: 'select',
      message: 'pick',
      options: [{ id: 'a', label: 'Method A' }],
    }
    expect(answerMethodPrompt(prompt, 'device')).toBe('a')
  })
})

describe('login', () => {
  let root: string
  let store: FileCredentialStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-auth-'))
    store = new FileCredentialStore(join(root, 'codex-oauth.json'))
    vi.clearAllMocks()
    fakeSpawn.mockReset()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('drives the flow through pi-ai and persists the credential', async () => {
    fakeLogin.mockImplementation(async (providerId: string, _type: string, interaction: AuthInteraction) => {
      interaction.notify({ type: 'info', message: 'Starting login.' })
      interaction.notify({
        type: 'auth_url',
        url: 'https://chatgpt.com/backend-api/auth',
        instructions: 'A browser window should open.',
      })
      interaction.notify({
        type: 'device_code',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://chatgpt.com/device',
        intervalSeconds: 5,
        expiresInSeconds: 900,
      })
      interaction.notify({ type: 'progress', message: 'Waiting for authorization.' })
      const selected = await interaction.prompt(selectPrompt())
      expect(selected).toBe('device-code')
      // pi-ai persists the returned credential through the injected store.
      await hoistedStore.store!.modify(providerId, async () => oauthCredential)
      return oauthCredential
    })
    const lines: string[] = []
    const openUrl = vi.fn()
    await login({
      store,
      method: 'device',
      openBrowser: true,
      reporter: { line: (text: string) => lines.push(text), openUrl },
    })
    expect(fakeSetProvider).toHaveBeenCalledOnce()
    expect(fakeLogin).toHaveBeenCalledWith('openai-codex', 'oauth', expect.anything())
    expect(lines.join('\n')).toContain('https://chatgpt.com/backend-api/auth')
    expect(lines.join('\n')).toContain('ABCD-EFGH')
    expect(lines.join('\n')).toContain('https://chatgpt.com/device')
    expect(lines.join('\n')).toContain('Waiting for authorization.')
    expect(lines.at(-1)).toContain('login complete')
    expect(openUrl).toHaveBeenCalledWith('https://chatgpt.com/backend-api/auth')
    await expect(store.read('openai-codex')).resolves.toEqual(oauthCredential)
  })

  it('contains a missing browser opener and reports the failure', async () => {
    let errorListener: ((error: Error) => void) | undefined
    const unref = vi.fn()
    fakeSpawn.mockReturnValue({
      once: (event: string, listener: (error: Error) => void) => {
        if (event === 'error') errorListener = listener
      },
      unref,
    } as never)
    const lines: string[] = []

    openUrlInBrowser('https://chatgpt.com/login', { line: (text: string) => lines.push(text) })
    errorListener?.(new Error('spawn xdg-open ENOENT'))

    expect(unref).toHaveBeenCalledOnce()
    expect(lines).toEqual([expect.stringContaining('could not open the browser automatically')])
    expect(lines[0]).toContain('ENOENT')
  })

  it('does not open the browser when openBrowser is false', async () => {
    fakeLogin.mockImplementation(async (_providerId: string, _type: string, interaction: AuthInteraction) => {
      interaction.notify({ type: 'auth_url', url: 'https://chatgpt.com/backend-api/auth' })
      return oauthCredential
    })
    const openUrl = vi.fn()
    await login({
      store,
      method: 'browser',
      openBrowser: false,
      reporter: { line: () => {}, openUrl },
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('resolves the manual_code prompt when its signal aborts', async () => {
    let captured: AuthInteraction | undefined
    fakeLogin.mockImplementation(async (_providerId: string, _type: string, interaction: AuthInteraction) => {
      captured = interaction
      return oauthCredential
    })
    await login({ store, method: 'browser', openBrowser: false, reporter: { line: () => {} } })
    const controller = new AbortController()
    const manual = captured!.prompt({
      type: 'manual_code',
      message: 'paste code',
      placeholder: 'redirect',
      signal: controller.signal,
    })
    controller.abort()
    await expect(manual).resolves.toBe('')
  })

  it('cancels a pending manual-code prompt with the whole login', async () => {
    const controller = new AbortController()
    const promptController = new AbortController()
    fakeLogin.mockImplementation(async (_providerId: string, _type: string, interaction: AuthInteraction) => {
      await interaction.prompt({
        type: 'manual_code',
        message: 'paste code',
        signal: promptController.signal,
      })
      return oauthCredential
    })

    const attempt = login({
      store,
      method: 'browser',
      openBrowser: false,
      signal: controller.signal,
      reporter: { line: () => {} },
    })
    controller.abort(new Error('cancelled by caller'))

    await expect(attempt).rejects.toThrow('cancelled by caller')
  })

  it('rejects unsupported prompt kinds loudly', async () => {
    let captured: AuthInteraction | undefined
    fakeLogin.mockImplementation(async (_providerId: string, _type: string, interaction: AuthInteraction) => {
      captured = interaction
      return oauthCredential
    })
    await login({ store, method: 'browser', openBrowser: false, reporter: { line: () => {} } })
    await expect(captured!.prompt({ type: 'text', message: 'answer' })).rejects.toThrow(/unsupported/)
  })

  it('rejects a non-oauth credential from the flow', async () => {
    fakeLogin.mockImplementation(async () => ({ type: 'api_key', key: 'sk-x' }))
    await expect(login({
      store,
      method: 'browser',
      openBrowser: false,
      reporter: { line: () => {} },
    })).rejects.toThrow(/unexpected api_key/)
  })
})

describe('status and logout', () => {
  it('reports the stored credential and clears it on logout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-codex-status-'))
    const store = new FileCredentialStore(join(root, 'codex-oauth.json'))
    try {
      await expect(status(store)).resolves.toEqual([
        expect.stringContaining('No Codex credential stored'),
      ])
      await store.modify('openai-codex', async () => oauthCredential)
      const lines = await status(store)
      expect(lines[0]).toContain('logged in')
      expect(lines[0]).toContain('expires')
      await logout(store)
      await expect(store.read('openai-codex')).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
