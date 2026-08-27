/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Closing Cost Estimator — pure math for buyer/seller side closing costs.
// -----------------------------------------------------------------------------
// Estimates typical SBA/business-sale closing costs, prorations, and the
// broker success fee split (incl. co-brokerage). Pure functions — unit-tested.
// All figures are estimates for planning; the closing statement governs.
// =============================================================================

export interface ClosingCostInput {
  purchasePrice: number
  /** Broker success-fee rate as a decimal (e.g. 0.10). */
  successFeeRate?: number
  /** Optional minimum success fee (e.g. 15000). */
  successFeeMin?: number
  /** Co-broker share of the success fee as a decimal (e.g. 0.50). */
  coBrokerShare?: number
  /** Sales tax on the deal (PA: 0.06 applies to taxable assets). */
  salesTaxRate?: number
  /** Estimated legal/closing fees (buyer side). */
  buyerLegalFees?: number
  /** Estimated legal fees (seller side). */
  sellerLegalFees?: number
  /** Days remaining to close (proration basis). */
  daysToClose?: number
  /** Annual rent for proration (if lease transfers). */
  annualRent?: number
  /** Inventory value at close (taxable in PA). */
  inventoryValue?: number
  /** FFE value at close (taxable in PA). */
  ffeValue?: number
}

export interface ClosingCostBreakdown {
  successFee: number
  coBrokerFee: number
  sellerNet: number
  salesTax: number
  buyerLegalFees: number
  sellerLegalFees: number
  rentProration: number
  buyerTotalEstimate: number
  sellerTotalEstimate: number
}

/** 10% up to $1M, 8% above — common Main Street success-fee schedule. */
export function tieredSuccessFee(price: number, rate = 0.10, aboveRate = 0.08, min = 0): number {
  const fee = price <= 1000000 ? price * rate : 1000000 * rate + (price - 1000000) * aboveRate
  return Math.max(min, Math.round(fee))
}

/** Estimate all closing costs for a deal. */
export function estimateClosingCosts(input: ClosingCostInput): ClosingCostBreakdown {
  const price = Math.max(0, input.purchasePrice || 0)

  const successFee = tieredSuccessFee(
    price,
    input.successFeeRate ?? 0.10,
    0.08,
    input.successFeeMin ?? 0,
  )
  const coBrokerFee = Math.round(successFee * (input.coBrokerShare ?? 0))

  // PA sales tax applies to taxable tangible assets (inventory + FFE).
  const taxable = (input.inventoryValue || 0) + (input.ffeValue || 0)
  const salesTax = Math.round(taxable * (input.salesTaxRate ?? 0.06))

  const buyerLegalFees = input.buyerLegalFees ?? Math.round(price * 0.005)
  const sellerLegalFees = input.sellerLegalFees ?? Math.round(price * 0.005)

  // Rent proration: buyer owes the seller for days already paid past close.
  let rentProration = 0
  if (input.annualRent && input.daysToClose !== undefined && input.daysToClose > 0 && input.daysToClose < 30) {
    rentProration = Math.round((input.annualRent / 365) * input.daysToClose)
  }

  const sellerNet = price - successFee - coBrokerFee - salesTax - sellerLegalFees - rentProration
  const buyerTotalEstimate = price + buyerLegalFees + salesTax + rentProration
  const sellerTotalEstimate = sellerNet

  return {
    successFee,
    coBrokerFee,
    sellerNet,
    salesTax,
    buyerLegalFees,
    sellerLegalFees,
    rentProration,
    buyerTotalEstimate,
    sellerTotalEstimate,
  }
}

export const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`
