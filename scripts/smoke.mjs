import { createModels } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { CodexAdapter } from '../lib/adapter.js'
import { FileCredentialStore } from '../lib/store.js'

const store = new FileCredentialStore(dshHomePath('openai-subscription-oauth.json'))
const models = createModels({ credentials: store })
models.setProvider(openaiCodexProvider())
const adapter = new CodexAdapter(models, 'codex', {
  transport: 'sse',
  cacheRetention: 'none',
  streamIdleTimeoutMs: 60_000,
})

const chunks = []
for await (const chunk of adapter.stream({
  provider: 'codex',
  model: 'gpt-5.6-luna',
  messages: [createUserMessage({
    content: [{ type: 'text', text: 'Reply with exactly: DSH OpenAI subscription provider works' }],
    source: { kind: 'user' },
  })],
  maxTokens: 64,
})) chunks.push(chunk)

const text = chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('')
const finish = chunks.findLast(chunk => chunk.type === 'finish')
console.log(text)
console.log(JSON.stringify(finish))
