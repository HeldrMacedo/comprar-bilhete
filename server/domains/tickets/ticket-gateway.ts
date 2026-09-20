import type { Customer, Order, Ticket } from '../orders/order-types.js'

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
  fulfillOrder(order: Order): Promise<void>
}

export type PersonInput = Customer
