import type { Order } from '../domain/types'

// Menor fim de vendas entre os concursos do pedido; ISO em UTC ordena como texto.
export function earliestSalesEnd(items: Order['items']): string | undefined {
  return items
    ?.map((item) => item.salesEndAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0]
}
