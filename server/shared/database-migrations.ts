import type { DatabaseSync } from 'node:sqlite'

const CURRENT_SCHEMA_VERSION = 3

export function migrateDatabase(database: DatabaseSync) {
  const versionRow = database.prepare('PRAGMA user_version').get() as
    | { user_version: number }
    | undefined
  const version = versionRow?.user_version ?? 0

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Versao de banco nao suportada: ${version}.`)
  }
  if (version === CURRENT_SCHEMA_VERSION) return

  const hasOrders = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'orders'")
    .get()

  database.exec('BEGIN IMMEDIATE')
  try {
    if (!hasOrders) {
      createLatestSchema(database)
    } else {
      if (version < 2) migrateToVersion2(database)
      if (version < 3) migrateToVersion3(database)
    }

    database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function createLatestSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      raffle_id TEXT NOT NULL,
      raffle_title TEXT NOT NULL,
      selection_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      unit_price_in_cents INTEGER NOT NULL,
      total_in_cents INTEGER NOT NULL,
      customer_json TEXT NOT NULL,
      items_json TEXT NOT NULL,
      checkout_url TEXT,
      receipt_url TEXT,
      transaction_nsu TEXT,
      invoice_slug TEXT,
      paid_amount_in_cents INTEGER,
      capture_method TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE reservations (
      ticket_key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      transaction_nsu TEXT NOT NULL,
      invoice_slug TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_payment_events_status ON payment_events(status, id);
    CREATE UNIQUE INDEX idx_payment_events_reference
      ON payment_events(transaction_nsu, invoice_slug);
  `)
}

function migrateToVersion2(database: DatabaseSync) {
  const columns = tableColumns(database, 'orders')

  if (!columns.has('selection_mode')) {
    database.exec("ALTER TABLE orders ADD COLUMN selection_mode TEXT NOT NULL DEFAULT 'manual'")
  }
  if (!columns.has('unit_price_in_cents')) {
    database.exec('ALTER TABLE orders ADD COLUMN unit_price_in_cents INTEGER NOT NULL DEFAULT 0')
    database.exec(`
      UPDATE orders
      SET unit_price_in_cents = CASE
        WHEN json_array_length(items_json) > 0
          THEN total_in_cents / json_array_length(items_json)
        ELSE total_in_cents
      END
    `)
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events(status, id);
  `)
}

function migrateToVersion3(database: DatabaseSync) {
  const orderColumns = tableColumns(database, 'orders')
  if (!orderColumns.has('paid_amount_in_cents')) {
    database.exec('ALTER TABLE orders ADD COLUMN paid_amount_in_cents INTEGER')
  }
  if (!orderColumns.has('capture_method')) {
    database.exec('ALTER TABLE orders ADD COLUMN capture_method TEXT')
  }

  const eventColumns = tableColumns(database, 'payment_events')
  if (!eventColumns.has('transaction_nsu')) {
    database.exec('ALTER TABLE payment_events ADD COLUMN transaction_nsu TEXT')
  }
  if (!eventColumns.has('invoice_slug')) {
    database.exec('ALTER TABLE payment_events ADD COLUMN invoice_slug TEXT')
  }

  database.exec(`
    UPDATE payment_events
    SET transaction_nsu = COALESCE(transaction_nsu, json_extract(payload_json, '$.transaction_nsu')),
        invoice_slug = COALESCE(invoice_slug, json_extract(payload_json, '$.invoice_slug'));

    DELETE FROM payment_events
    WHERE transaction_nsu IS NOT NULL
      AND invoice_slug IS NOT NULL
      AND id NOT IN (
        SELECT MIN(id)
        FROM payment_events
        WHERE transaction_nsu IS NOT NULL AND invoice_slug IS NOT NULL
        GROUP BY transaction_nsu, invoice_slug
      );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_reference
      ON payment_events(transaction_nsu, invoice_slug)
      WHERE transaction_nsu IS NOT NULL AND invoice_slug IS NOT NULL;
  `)
}

function tableColumns(database: DatabaseSync, table: string) {
  return new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      ({ name }) => name,
    ),
  )
}
