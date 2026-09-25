import { describe, expect, it } from 'vitest'
import { parseCurrentContests } from './current-contests.js'

const currentResponse = {
  concurso_id_sorteiocap: 2026041,
  data_sorteiocap: '2026-09-27',
  data_fim_sorteiocap: '2026-09-27 19:00:00',
  hora_sorteiocap: '20:00:00',
  qte_premios_sorteiocap: 4,
  qtd_giros_sorteiocap: 20,
  giros_sorteiocap: 'R$: 500,00',
  valor_bilhete_sorteiocap: 6,
  concurso_id_sorteioesp: 2026040,
  data_sorteioesp: '2026-09-23',
  data_fim_sorteioesp: '2026-09-23 07:35:00',
  hora_sorteioesp: '09:00:00',
  qte_premios_sorteioesp: 4,
  qtd_giros_sorteioesp: 0,
  giros_sorteioesp: '0',
  premio_01_sorteioesp: 'R$: 3 MIL REAIS',
  valor_bilhete_sorteioesp: 3,
}

describe('parseCurrentContests', () => {
  it('aceita a resposta real como lista com um objeto de concursos', () => {
    expect(
      parseCurrentContests([currentResponse], new Date('2026-09-25T12:00:00Z')).map(
        (raffle) => raffle.id,
      ),
    ).toEqual(['2026041'])
  })

  it('normaliza CAP e ESP da mesma resposta com preços em centavos', () => {
    expect(parseCurrentContests(currentResponse, new Date('2026-09-22T00:00:00Z'))).toEqual([
      expect.objectContaining({
        id: '2026041',
        source: 'cap',
        priceInCents: 600,
        drawDate: '2026-09-27T23:00:00.000Z',
      }),
      expect.objectContaining({
        id: '2026040',
        source: 'esp',
        priceInCents: 300,
        drawDate: '2026-09-23T12:00:00.000Z',
      }),
    ])
  })

  it('ignora concurso terminado em 000 sem exigir os outros campos desse bloco', () => {
    expect(
      parseCurrentContests(
        {
          ...currentResponse,
          concurso_id_sorteiocap: 2026000,
          data_sorteiocap: null,
        },
        new Date('2026-09-22T00:00:00Z'),
      ).map((raffle) => raffle.id),
    ).toEqual(['2026040'])
  })

  it('retorna lista vazia quando os dois concursos são sentinelas', () => {
    expect(
      parseCurrentContests({
        concurso_id_sorteiocap: 2026000,
        concurso_id_sorteioesp: 2026000,
      }),
    ).toEqual([])
  })

  it('oculta um concurso assim que a data e o horário de venda terminam', () => {
    expect(
      parseCurrentContests(currentResponse, new Date('2026-09-23T10:35:00Z')).map(
        (raffle) => raffle.id,
      ),
    ).toEqual(['2026041'])
  })

  it('ignora campos incompletos de um concurso cujo prazo terminou', () => {
    expect(
      parseCurrentContests(
        { ...currentResponse, valor_bilhete_sorteioesp: null },
        new Date('2026-09-25T12:00:00Z'),
      ).map((raffle) => raffle.id),
    ).toEqual(['2026041'])
  })
})
