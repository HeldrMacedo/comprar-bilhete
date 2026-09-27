import { z } from 'zod'

// Colunas BIT(1) chegam como boolean, 0/1 ou null conforme o driver da API de bilhetes.
export const bitSchema = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.null()])
  .transform((value) => value === true || value === 1)

// DATETIME da API de bilhetes vem sem fuso, no horário de America/Fortaleza.
export function parseTicketApiDateTime(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}-03:00`)
}
