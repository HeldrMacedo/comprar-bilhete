import { existsSync } from 'node:fs'
import { buildApp } from './app.js'
import { parseServerEnv } from './config/env.js'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
else if (existsSync('.env')) process.loadEnvFile('.env')

const env = parseServerEnv()
const app = await buildApp({ env })

try {
  await app.listen({ port: env.SERVER_PORT, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
