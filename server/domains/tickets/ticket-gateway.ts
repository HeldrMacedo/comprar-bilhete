import type { Order, Ticket } from '../orders/order-types.js'

export type Raffle = {
  id: string
  title: string
  description: string
  prize: string
  drawDate: string
  priceInCents: number
}

export interface TicketGateway {
  getActiveRaffle(): Promise<Raffle>
  getAvailableTickets(raffleId: string): Promise<Ticket[]>
  getAvailableTicket(raffleId: string, ticketId: string): Promise<Ticket | null>
  fulfillOrder(order: Order): Promise<void>
}
