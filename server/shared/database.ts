import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function createDatabase(databasePath: string) {
  const resolvedPath = databasePath === ':memory:' ? databasePath : resolve(databasePath)
  if (resolvedPath !== ':memory:') mkdirSync(dirname(resolvedPath), { recursive: true })

  const database = new DatabaseSync(resolvedPath)
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      raffle_id TEXT NOT NULL,
      raffle_title TEXT NOT NULL,
      status TEXT NOT NULL,
      total_in_cents INTEGER NOT NULL,
      customer_json TEXT NOT NULL,
      items_json TEXT NOT NULL,
      checkout_url TEXT,
      receipt_url TEXT,
      transaction_nsu TEXT,
      invoice_slug TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reservations (
      ticket_key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events(status, id);
  `)
  return database
}

export type AppDatabase = ReturnType<typeof createDatabase>
