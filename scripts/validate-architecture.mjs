import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const sourceRoot = path.join(root, 'src')
const violations = []
const layerOrder = ['domain', 'api', 'repository', 'service', 'runtime', 'ui']

for (const file of await walk(sourceRoot)) {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith('.test.ts') || file.endsWith('vite-env.d.ts'))
    continue
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/')
  const source = await readFile(file, 'utf8')
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])

  for (const specifier of imports) {
    if (
      relative.startsWith('features/') &&
      (specifier.includes('/pages/') || specifier.includes('/app/'))
    ) {
      violations.push(`${relative}: features não podem importar app/pages (${specifier})`)
    }

    if (relative.startsWith('pages/') && specifier.includes('shared/api/http-client')) {
      violations.push(`${relative}: páginas não podem acessar HTTP diretamente`)
    }

    const layer = layerOrder.find((candidate) => relative.includes(`/${candidate}/`))
    const importedLayer = layerOrder.find((candidate) => specifier.includes(`/${candidate}/`))
    if (layer && importedLayer && layerOrder.indexOf(importedLayer) > layerOrder.indexOf(layer)) {
      violations.push(`${relative}: camada ${layer} depende da camada posterior ${importedLayer}`)
    }
  }
}

if (violations.length) {
  console.error(`Arquitetura inválida:\n- ${violations.join('\n- ')}`)
  process.exit(1)
}

console.log('Arquitetura validada.')

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? walk(entryPath) : entryPath
    }),
  )
  return files.flat()
}
