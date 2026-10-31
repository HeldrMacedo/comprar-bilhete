// Trechos SQL sobre `orders.items_json`, usados pelo painel e pela lista de clientes.

// Bilhetes do pedido que não foram marcados como não validados.
export const VALID_ITEMS = `(SELECT COUNT(*) FROM json_each(orders.items_json) AS item
  WHERE json_extract(item.value, '$.validationStatus') IS NULL)`

// Soma, em centavos, dos bilhetes não validados do pedido.
export const REFUND_DUE = `(SELECT COALESCE(SUM(COALESCE(json_extract(item.value, '$.unitPriceInCents'),
    orders.unit_price_in_cents)), 0)
  FROM json_each(orders.items_json) AS item
  WHERE json_extract(item.value, '$.validationStatus') = 'not_validated')`
