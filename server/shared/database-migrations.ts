import type { DatabaseSync } from 'node:sqlite'

const CURRENT_SCHEMA_VERSION = 7

export function migrateDatabase(database: DatabaseSync) {
  const versionRow = database.prepare('PRAGMA user_version').get() as
    { user_version: number } | undefined
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
      if (version < 4) migrateToVersion4(database)
      if (version < 5) migrateToVersion5(database)
      if (version < 6) migrateToVersion6(database)
      if (version < 7) migrateToVersion7(database)
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
  database.exec(REMOTE_RESERVATIONS_SCHEMA)
  database.exec(ORDERS_CUSTOMER_CPF_INDEX)
  database.exec(BATCH_SEQUENCES_SCHEMA)
  database.exec(ADMIN_SCHEMA)
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

const REMOTE_RESERVATIONS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS remote_reservations (
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    raffle_id TEXT NOT NULL,
    ticket_number TEXT NOT NULL,
    token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'held',
    last_error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (order_id, raffle_id, ticket_number)
  );

  CREATE INDEX IF NOT EXISTS idx_remote_reservations_status
    ON remote_reservations(status, updated_at);
`

function migrateToVersion4(database: DatabaseSync) {
  database.exec(REMOTE_RESERVATIONS_SCHEMA)
}

// Consulta "Minhas compras" filtra pedidos pelo CPF guardado no JSON do cliente.
const ORDERS_CUSTOMER_CPF_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_orders_customer_cpf
    ON orders(json_extract(customer_json, '$.cpf'), created_at);
`

function migrateToVersion5(database: DatabaseSync) {
  database.exec(ORDERS_CUSTOMER_CPF_INDEX)
}

const BATCH_SEQUENCES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS batch_sequences (
    raffle_id TEXT PRIMARY KEY,
    next_position INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
`

function migrateToVersion6(database: DatabaseSync) {
  database.exec(BATCH_SEQUENCES_SCHEMA)
}

// Painel administrativo: usuários, sessões por cookie, auditoria e configurações do site.
const ADMIN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);

  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    target_id TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`

function migrateToVersion7(database: DatabaseSync) {
  database.exec(ADMIN_SCHEMA)
}

function tableColumns(database: DatabaseSync, table: string) {
  return new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      ({ name }) => name,
    ),
  )
}
