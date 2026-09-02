/**
 * Concord Deal Platform
 * P&L digest finance — pure computation helpers (testable, no DB here).
 * The cron route passes raw rows; these reduce them into statement lines.
 */

export interface FinanceLine {
  label: string
  amount: number // dollars, positive = revenue, negative = expense
}

export interface FinanceStatement {
  revenueLines: FinanceLine[]
  expenseLines: FinanceLine[]
  revenueTotal: number
  expenseTotal: number
  net: number
  /** Rows that were paid/final in the window (activity detail). */
  activityCount: number
}

export interface FinanceRaw {
  ordersPaidCents: number // seller listing orders
  valuationsPaidCents: number
  featuredPaidCents: number
  invoicesPaid: number // dollars
  commissionsPaid: number // dollars
  storeProfit: number // dollars
  expensesCents: number // expenses table (paid)
  contractorPaid: number // dollars
  paidCount: number
}

const dollars = (cents: number) => Math.round(cents) / 100
const round2 = (n: number) => Math.round(n * 100) / 100

/** Reduce raw finance rows into a P&L statement. */
export function buildFinanceStatement(raw: FinanceRaw): FinanceStatement {
  const orders = dollars(raw.ordersPaidCents || 0)
  const valuations = dollars(raw.valuationsPaidCents || 0)
  const featured = dollars(raw.featuredPaidCents || 0)
  const invoices = Number(raw.invoicesPaid || 0)
  const commissions = Number(raw.commissionsPaid || 0)
  const store = Number(raw.storeProfit || 0)
  const expenses = dollars(raw.expensesCents || 0)
  const contractor = Number(raw.contractorPaid || 0)

  const revenueLines: FinanceLine[] = []
  if (orders > 0) revenueLines.push({ label: 'Listing orders', amount: round2(orders) })
  if (valuations > 0) revenueLines.push({ label: 'Valuation reports', amount: round2(valuations) })
  if (featured > 0) revenueLines.push({ label: 'Featured slots', amount: round2(featured) })
  if (invoices > 0) revenueLines.push({ label: 'Subscriptions & invoices', amount: round2(invoices) })
  if (commissions > 0) revenueLines.push({ label: 'Commissions earned', amount: round2(commissions) })
  if (store > 0) revenueLines.push({ label: 'Store profit', amount: round2(store) })

  const expenseLines: FinanceLine[] = []
  if (expenses > 0) expenseLines.push({ label: 'Operating expenses', amount: round2(expenses) })
  if (contractor > 0) expenseLines.push({ label: 'Contractor (1099) payouts', amount: round2(contractor) })

  const revenueTotal = round2(revenueLines.reduce((s, l) => s + l.amount, 0))
  const expenseTotal = round2(expenseLines.reduce((s, l) => s + l.amount, 0))
  return {
    revenueLines,
    expenseLines,
    revenueTotal,
    expenseTotal,
    net: round2(revenueTotal - expenseTotal),
    activityCount: Number(raw.paidCount || 0),
  }
}

/** Merge two raw windows into one (hourly window + today roll-up display). */
export function emptyFinanceRaw(): FinanceRaw {
  return {
    ordersPaidCents: 0, valuationsPaidCents: 0, featuredPaidCents: 0,
    invoicesPaid: 0, commissionsPaid: 0, storeProfit: 0,
    expensesCents: 0, contractorPaid: 0, paidCount: 0,
  }
}
