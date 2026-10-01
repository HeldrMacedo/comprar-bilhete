import { DatabaseSync } from 'node:sqlite'

const dbPath = process.argv[2] ?? 'app.db'

try {
  const db = new DatabaseSync(dbPath)
  const now = new Date().toISOString()

  console.log('🔧 Recuperando posicoes_lote sequenciais para pedidos ja pagos...\n')

  db.exec('BEGIN IMMEDIATE')
  try {
    const raffles = db
      .prepare(
        `SELECT DISTINCT raffle_id FROM orders
       WHERE status = 'paid' AND paid_at IS NOT NULL
       ORDER BY raffle_id`,
      )
      .all() as Array<{ raffle_id: string }>

    let totalUpdated = 0

    for (const { raffle_id } of raffles) {
      console.log(`📋 Sorteio: ${raffle_id}`)

      const orders = db
        .prepare(
          `SELECT id, items_json FROM orders
         WHERE raffle_id = ? AND status = 'paid' AND paid_at IS NOT NULL
         ORDER BY paid_at ASC, created_at ASC`,
        )
        .all(raffle_id) as Array<{ id: string; items_json: string }>

      db.prepare(
        `INSERT OR IGNORE INTO batch_sequences (raffle_id, next_position, updated_at)
       VALUES (?, 1, ?)`,
      ).run(raffle_id, now)

      let position = 1
      for (const { id, items_json } of orders) {
        const items = JSON.parse(items_json)
        const updated = items.map((item: Record<string, unknown>) => ({
          ...item,
          validationBatch: '84734',
          batchPosition: position++,
        }))

        db.prepare('UPDATE orders SET items_json = ? WHERE id = ?').run(JSON.stringify(updated), id)
        totalUpdated++
      }

      db.prepare(
        'UPDATE batch_sequences SET next_position = ?, updated_at = ? WHERE raffle_id = ?',
      ).run(position, now, raffle_id)

      console.log(`  ✅ Atualizados ${orders.length} pedidos. Proxima posicao: ${position}`)
    }

    db.exec('COMMIT')
    console.log(`\n✅ Recuperacao concluida! ${totalUpdated} pedidos atualizados.`)
    console.log(
      '\n⚠️  IMPORTANTE: Verifique se as posicoes sao validas na API externa antes de validar novamente.',
    )
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  db.close()
} catch (error) {
  console.error('❌ Erro durante recuperacao:', error instanceof Error ? error.message : error)
  process.exit(1)
}
