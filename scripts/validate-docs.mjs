import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const required = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/PRODUCT.md',
  'docs/FRONTEND.md',
  'docs/BACKEND.md',
  'docs/API_CONTRACTS.md',
  'docs/SECURITY.md',
  'docs/RELIABILITY.md',
  'docs/QUALITY_SCORE.md',
  'docs/exec-plans/tech-debt-tracker.md',
]

for (const file of required) await access(path.join(root, file))

for (const file of ['README.md', 'AGENTS.md', 'ARCHITECTURE.md']) {
  const absolute = path.join(root, file)
  const content = await readFile(absolute, 'utf8')
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)) {
    await access(path.resolve(path.dirname(absolute), match[1]))
  }
}

console.log('Documentação validada.')
