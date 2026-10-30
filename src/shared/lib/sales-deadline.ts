import { formatDateTime } from './date'

const rule =
  'O código Pix vale por 72 horas, mas pagamento recebido depois do fim das vendas do concurso não valida o bilhete: ele fica como não validado e o valor é estornado.'

// Só formata a data vinda do servidor; o prazo nunca é decidido pelo relógio do dispositivo.
export function salesDeadlineMessage(salesEndAt?: string) {
  const first = salesEndAt
    ? `Pague até ${formatDateTime(salesEndAt)} (horário de Fortaleza).`
    : 'Pague antes do fim das vendas do concurso.'
  return `${first} ${rule}`
}
