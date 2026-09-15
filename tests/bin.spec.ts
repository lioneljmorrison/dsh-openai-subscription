/**
 * Built-entry-path smoke for the CLI bin: runs `node lib/bin.js` as a child
 * process against a scratch store, proving the published artifact loads under
 * plain Node without a bundler or test hooks.
 */

import type { spawnSync as SpawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileCredentialStore } from '../src/store.js'

vi.unmock('node:child_process')
const { spawnSync } = process.getBuiltinModule('node:child_process') as { spawnSync: typeof SpawnSync }

let root: string | undefined
let storePath: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-codex-bin-'))
  storePath = join(root, 'codex-oauth.json')
})

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

function bin(args: readonly string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST')))
  const stdoutPath = join(root!, 'stdout.txt')
  const stderrPath = join(root!, 'stderr.txt')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  try {
    const result = spawnSync(process.execPath, [join(process.cwd(), 'lib', 'bin.js'), ...args, '--store', storePath], {
      env,
      stdio: ['ignore', stdoutFd, stderrFd],
    })
    return Promise.resolve({
      stdout: readFileSync(stdoutPath, 'utf8'),
      stderr: readFileSync(stderrPath, 'utf8'),
      code: result.status ?? 1,
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
}

describe('dsh-openai-subscription bin', () => {
  it('reports no credential before login', async () => {
    const { stdout, code } = await bin(['status'])
    expect(code).toBe(0)
    expect(stdout).toContain('No Codex credential stored')
  })

  it('reports the credential after it is stored', async () => {
    const store = new FileCredentialStore(storePath)
    await store.modify('openai-codex', async () => ({
      type: 'oauth',
      access: 'a',
      refresh: 'r',
      expires: 1_800_000_000_000,
    }))
    const { stdout, code } = await bin(['status'])
    expect(code).toBe(0)
    expect(stdout).toContain('Codex logged in')
  })

  it('clears the credential on logout', async () => {
    const store = new FileCredentialStore(storePath)
    await store.modify('openai-codex', async () => ({
      type: 'oauth',
      access: 'a',
      refresh: 'r',
      expires: 1_800_000_000_000,
    }))
    const { stdout, code } = await bin(['logout'])
    expect(code).toBe(0)
    expect(stdout).toContain('Codex logged out')
    await expect(store.read('openai-codex')).resolves.toBeUndefined()
  })

  it('rejects unknown verbs with the usage exit code', async () => {
    const { code } = await bin(['frobnicate'])
    expect(code).toBe(2)
  })
})
