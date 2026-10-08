import { z } from 'zod'

export const adminUserSchema = z.object({
  id: z.string(),
  login: z.string(),
  name: z.string(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const adminUserResponseSchema = z.object({ user: adminUserSchema })
export const adminUsersResponseSchema = z.object({ users: z.array(adminUserSchema) })
export const noContentSchema = z.undefined()

const orderStatusSchema = z.enum([
  'pending',
  'processing',
  'paid',
  'expired',
  'cancelled',
  'manual_review',
])

export const adminOrderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  paidAt: z.string().optional(),
  totalInCents: z.number().int(),
  paidAmountInCents: z.number().int().optional(),
  captureMethod: z.string().optional(),
  lastError: z.string().optional(),
  customer: z.object({
    name: z.string(),
    cpf: z.string(),
    phone: z.string(),
    beneficiaryName: z.string().optional(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      raffleId: z.string(),
      raffleTitle: z.string(),
      unitPriceInCents: z.number().int(),
    }),
  ),
})

const pageFields = {
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
}

export const adminOrdersPageSchema = z.object({ ...pageFields, orders: z.array(adminOrderSchema) })
export const adminOrderResponseSchema = z.object({ order: adminOrderSchema })

export const customerSummarySchema = z.object({
  cpf: z.string(),
  name: z.string(),
  phone: z.string(),
  address: z
    .object({
      zipCode: z.string(),
      street: z.string(),
      number: z.string(),
      complement: z.string().optional(),
      neighborhood: z.string(),
      city: z.string(),
      state: z.string(),
    })
    .optional(),
  orderCount: z.number().int(),
  paidOrderCount: z.number().int(),
  paidTotalInCents: z.number().int(),
  ticketCount: z.number().int(),
  firstOrderAt: z.string(),
  lastOrderAt: z.string(),
})

export const customersPageSchema = z.object({
  ...pageFields,
  customers: z.array(customerSummarySchema),
})

export const dashboardSummarySchema = z.object({
  generatedAt: z.string(),
  totals: z.object({
    customers: z.number().int(),
    paidTickets: z.number().int(),
    paidOrders: z.number().int(),
    revenueInCents: z.number().int(),
    pendingTickets: z.number().int(),
    pendingOrders: z.number().int(),
    manualReviewOrders: z.number().int(),
  }),
  dailySales: z.array(
    z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      revenueInCents: z.number().int(),
      tickets: z.number().int(),
    }),
  ),
  ordersByStatus: z.array(z.object({ status: orderStatusSchema, orders: z.number().int() })),
  ticketsByRaffle: z.array(
    z.object({
      raffleId: z.string(),
      raffleTitle: z.string(),
      tickets: z.number().int(),
      revenueInCents: z.number().int(),
    }),
  ),
  upcomingRaffles: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        drawDate: z.string(),
        salesEndAt: z.string().optional(),
        priceInCents: z.number().int(),
        prizes: z.array(z.string()),
        paidTickets: z.number().int(),
        revenueInCents: z.number().int(),
      }),
    )
    .nullable(),
  upcomingRafflesError: z.string().optional(),
})

export const contestSlotSchema = z.object({
  source: z.enum(['cap', 'esp']),
  contestId: z.string(),
  salesStartAt: z.string(),
  salesEndAt: z.string(),
  drawDate: z.string(),
  drawTime: z.string(),
  priceInCents: z.number().int(),
  prizes: z.array(z.string()),
  luckySpinsCount: z.number().int(),
  luckySpinsLabel: z.string(),
  doubleChance: z.boolean(),
})

export const contestListSchema = z.object({ raffles: z.array(contestSlotSchema) })
export const contestResponseSchema = z.object({ raffle: contestSlotSchema })

export const adminSettingsSchema = z.object({
  youtubeVideoId: z.string().nullable(),
  youtubeUrl: z.string(),
})
