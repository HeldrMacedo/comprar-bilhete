import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migrateDatabase } from './database-migrations.js'

export function createDatabase(databasePath: string) {
  const resolvedPath = databasePath === ':memory:' ? databasePath : resolve(databasePath)
  if (resolvedPath !== ':memory:') mkdirSync(dirname(resolvedPath), { recursive: true })

  const database = new DatabaseSync(resolvedPath)
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA journal_mode = WAL;')
  migrateDatabase(database)
  return database
}

export type AppDatabase = ReturnType<typeof createDatabase>
