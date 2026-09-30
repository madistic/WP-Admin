// Core shared RFM (Recency, Frequency, Monetary) Segmentation Engine
// Shared by Customer Analytics and Customer Offers (CRM) to ensure a single source of truth.

export type RFMSegmentKey =
  | "CHAMPIONS"
  | "LOYAL_CUSTOMERS"
  | "POTENTIAL_LOYALISTS"
  | "NEW_CUSTOMERS"
  | "PROMISING"
  | "NEED_ATTENTION"
  | "ABOUT_TO_SLEEP"
  | "AT_RISK"
  | "CANT_LOSE_THEM"
  | "LOW_MONETARY"
  | "LOST"

export interface RFMSegmentMeta {
  key: RFMSegmentKey
  label: string
  description: string
  action: string
  color: string
  badgeBg: string
  badgeText: string
}

export const RFM_SEGMENT_DEFINITIONS: Record<RFMSegmentKey, RFMSegmentMeta> = {
  CHAMPIONS: {
    key: "CHAMPIONS",
    label: "Champions",
    description: "Ordered recently, order often, and spend the most.",
    action: "Reward with VIP perks, early menu access, and personal appreciation.",
    color: "#10B981",
    badgeBg: "bg-emerald-50 border-emerald-200",
    badgeText: "text-emerald-700",
  },
  LOYAL_CUSTOMERS: {
    key: "LOYAL_CUSTOMERS",
    label: "Loyal Customers",
    description: "Consistent diners with solid frequency and good order totals.",
    action: "Upsell premium combos and invite to join loyalty points program.",
    color: "#6366F1",
    badgeBg: "bg-indigo-50 border-indigo-200",
    badgeText: "text-indigo-700",
  },
  POTENTIAL_LOYALISTS: {
    key: "POTENTIAL_LOYALISTS",
    label: "Potential Loyalists",
    description: "Recent diners with repeat orders and growing average check.",
    action: "Encourage 3rd order with bonus loyalty points or free beverage.",
    color: "#3B82F6",
    badgeBg: "bg-blue-50 border-blue-200",
    badgeText: "text-blue-700",
  },
  NEW_CUSTOMERS: {
    key: "NEW_CUSTOMERS",
    label: "New Customers",
    description: "First-time diners who ordered within the past 14 days.",
    action: "Send welcome coupon for 15% off their second dining experience.",
    color: "#06B6D4",
    badgeBg: "bg-cyan-50 border-cyan-200",
    badgeText: "text-cyan-700",
  },
  PROMISING: {
    key: "PROMISING",
    label: "Promising",
    description: "Recent buyers with potential for higher spend and frequency.",
    action: "Recommend bestselling appetizers and popular combos.",
    color: "#8B5CF6",
    badgeBg: "bg-purple-50 border-purple-200",
    badgeText: "text-purple-700",
  },
  NEED_ATTENTION: {
    key: "NEED_ATTENTION",
    label: "Need Attention",
    description: "Above average recency and frequency, but risk drifting away.",
    action: "Send time-limited weekend special offers.",
    color: "#F59E0B",
    badgeBg: "bg-amber-50 border-amber-200",
    badgeText: "text-amber-700",
  },
  ABOUT_TO_SLEEP: {
    key: "ABOUT_TO_SLEEP",
    label: "About to Sleep",
    description: "Below-average recency and order frequency; risk of losing them.",
    action: "Share weekend specials or chef's signature recommendations.",
    color: "#F97316",
    badgeBg: "bg-orange-50 border-orange-200",
    badgeText: "text-orange-700",
  },
  AT_RISK: {
    key: "AT_RISK",
    label: "At-Risk Customers",
    description: "Spent good money & ordered frequently, but haven't visited recently.",
    action: "Reactivate with targeted 'We miss you' offer and signature dish voucher.",
    color: "#EF4444",
    badgeBg: "bg-rose-50 border-rose-200",
    badgeText: "text-rose-700",
  },
  CANT_LOSE_THEM: {
    key: "CANT_LOSE_THEM",
    label: "Can't Lose Them",
    description: "Past power regulars and high spenders who haven't returned recently.",
    action: "Urgent win-back: Call or send personalized 25% discount voucher.",
    color: "#DC2626",
    badgeBg: "bg-red-50 border-red-200",
    badgeText: "text-red-700",
  },
  LOW_MONETARY: {
    key: "LOW_MONETARY",
    label: "Low-Monetary Customers",
    description: "Price-sensitive diners with smaller basket sizes.",
    action: "Target with value meal combos and lunch-hour budget deals.",
    color: "#64748B",
    badgeBg: "bg-slate-100 border-slate-200",
    badgeText: "text-slate-700",
  },
  LOST: {
    key: "LOST",
    label: "Lost Customers",
    description: "Longest period of inactivity, single small order.",
    action: "Occasional broad re-engagement campaign during festive seasons.",
    color: "#94A3B8",
    badgeBg: "bg-slate-50 border-slate-200",
    badgeText: "text-slate-500",
  },
}

export interface CustomerRFMInput {
  id: string
  name?: string | null
  phone?: string | null
  firstOrder?: Date | string | null
  lastOrder?: Date | string | null
  ordersCount?: number
  totalSpend?: number
  orders?: Array<{
    id?: string
    created_at: Date | string
    total: number
    status?: string
  }>
}

export interface CustomerRFMResult {
  id: string
  name: string
  phone: string
  // Recency
  recencyDays: number
  recencyScore: number // 1 to 5
  // Frequency
  frequencyCount: number
  frequencyScore: number // 1 to 5
  // Monetary
  monetarySpend: number
  monetaryScore: number // 1 to 5
  // Combined
  rfmScore: string // e.g. "5-4-5"
  rfmAverage: number // e.g. 4.7
  rfmCompositeIndex: number // e.g. 545
  // Segment
  rfmSegment: string // e.g. "Champions"
  rfmSegmentKey: RFMSegmentKey
  rfmSegmentMeta: RFMSegmentMeta
  suggestedAction: string
}

export interface RFMAnalysisSummary {
  totalScoredCustomers: number
  segmentDistribution: Array<{
    key: RFMSegmentKey
    label: string
    count: number
    percent: number
    avgSpend: number
    color: string
    badgeBg: string
    badgeText: string
    action: string
  }>
}

/**
 * Maps R, F, M scores (1-5 each) to a business segment
 */
export function mapRfmToSegment(r: number, f: number, m: number): RFMSegmentMeta {
  // 1. Champions: High recency, high frequency, high spend
  if (r >= 4 && f >= 4 && m >= 4) {
    return RFM_SEGMENT_DEFINITIONS.CHAMPIONS
  }

  // 2. Can't Lose Them: High spenders & frequent in past, but haven't ordered in a long time (r === 1)
  if (r === 1 && (f >= 4 || m >= 4)) {
    return RFM_SEGMENT_DEFINITIONS.CANT_LOSE_THEM
  }

  // 3. At-Risk Customers: r <= 2, f >= 3, m >= 3
  if (r <= 2 && f >= 3 && m >= 3) {
    return RFM_SEGMENT_DEFINITIONS.AT_RISK
  }

  // 4. Loyal Customers: r >= 3, f >= 3, m >= 3
  if (r >= 3 && f >= 3 && m >= 3) {
    return RFM_SEGMENT_DEFINITIONS.LOYAL_CUSTOMERS
  }

  // 5. Potential Loyalists: r >= 4, f >= 2, m >= 2
  if (r >= 4 && f >= 2 && m >= 2) {
    return RFM_SEGMENT_DEFINITIONS.POTENTIAL_LOYALISTS
  }

  // 6. New Customers: r >= 4, f === 1
  if (r >= 4 && f === 1) {
    return RFM_SEGMENT_DEFINITIONS.NEW_CUSTOMERS
  }

  // 7. Promising: r >= 3, f <= 2, m >= 2
  if (r >= 3 && f <= 2 && m >= 2) {
    return RFM_SEGMENT_DEFINITIONS.PROMISING
  }

  // 8. Need Attention: r >= 2, f >= 2, m >= 2
  if (r >= 2 && f >= 2 && m >= 2) {
    return RFM_SEGMENT_DEFINITIONS.NEED_ATTENTION
  }

  // 9. About to Sleep: r === 2, f <= 2
  if (r === 2 && f <= 2) {
    return RFM_SEGMENT_DEFINITIONS.ABOUT_TO_SLEEP
  }

  // 10. Low-Monetary Customers: m <= 2
  if (m <= 2 && (r >= 2 || f <= 2)) {
    return RFM_SEGMENT_DEFINITIONS.LOW_MONETARY
  }

  // 11. Lost Customers
  return RFM_SEGMENT_DEFINITIONS.LOST
}

/**
 * Calculates RFM rankings and segmentation for a given customer set.
 * Single source of truth across Analytics and CRM offers.
 */
export function calculateRFM(
  customers: CustomerRFMInput[],
  referenceDate: Date = new Date()
): {
  customerScores: CustomerRFMResult[]
  customerScoreMap: Map<string, CustomerRFMResult>
  summary: RFMAnalysisSummary
} {
  const nowMs = referenceDate.getTime()

  // First pass: extract raw R, F, M values
  const prepared = customers.map((c) => {
    let lastOrderTime = c.lastOrder ? new Date(c.lastOrder).getTime() : 0
    let ordersCount = c.ordersCount ?? (c.orders ? c.orders.length : 0)
    let totalSpend = c.totalSpend ?? 0

    if (c.orders && c.orders.length > 0) {
      if (!lastOrderTime) {
        const sorted = [...c.orders].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        lastOrderTime = new Date(sorted[0].created_at).getTime()
      }
      if (!totalSpend) {
        totalSpend = c.orders.reduce((sum, o) => sum + (o.total || 0), 0)
      }
      if (!ordersCount) {
        ordersCount = c.orders.length
      }
    }

    const recencyDays = lastOrderTime > 0
      ? Math.max(0, Math.floor((nowMs - lastOrderTime) / (1000 * 60 * 60 * 24)))
      : 999

    return {
      raw: c,
      id: c.id,
      name: c.name || "Customer",
      phone: c.phone || "",
      recencyDays,
      ordersCount,
      totalSpend: Math.max(0, totalSpend),
    }
  })

  // Calculate Monetary spend quintile thresholds across customers with spend > 0
  const spendValues = prepared.map((p) => p.totalSpend).filter((s) => s > 0).sort((a, b) => a - b)
  const getPercentile = (pct: number): number => {
    if (spendValues.length === 0) return 0
    const idx = Math.floor((pct / 100) * spendValues.length)
    return spendValues[Math.min(idx, spendValues.length - 1)]
  }

  const p20 = Math.max(400, getPercentile(20))
  const p40 = Math.max(1000, getPercentile(40))
  const p60 = Math.max(2000, getPercentile(60))
  const p80 = Math.max(4000, getPercentile(80))

  const customerScores: CustomerRFMResult[] = prepared.map((c) => {
    // 1. Recency Score (1-5)
    let rScore = 1
    if (c.recencyDays <= 7) rScore = 5
    else if (c.recencyDays <= 21) rScore = 4
    else if (c.recencyDays <= 45) rScore = 3
    else if (c.recencyDays <= 90) rScore = 2
    else rScore = 1

    // 2. Frequency Score (1-5)
    let fScore = 1
    if (c.ordersCount >= 8) fScore = 5
    else if (c.ordersCount >= 4) fScore = 4
    else if (c.ordersCount >= 2) fScore = 3
    else if (c.ordersCount === 2) fScore = 2
    else fScore = 1

    // 3. Monetary Score (1-5)
    let mScore = 1
    if (c.totalSpend >= p80) mScore = 5
    else if (c.totalSpend >= p60) mScore = 4
    else if (c.totalSpend >= p40) mScore = 3
    else if (c.totalSpend >= p20) mScore = 2
    else mScore = 1

    const meta = mapRfmToSegment(rScore, fScore, mScore)
    const rfmAverage = parseFloat(((rScore + fScore + mScore) / 3).toFixed(1))

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      recencyDays: c.recencyDays,
      recencyScore: rScore,
      frequencyCount: c.ordersCount,
      frequencyScore: fScore,
      monetarySpend: Math.round(c.totalSpend),
      monetaryScore: mScore,
      rfmScore: `${rScore}-${fScore}-${mScore}`,
      rfmAverage,
      rfmCompositeIndex: rScore * 100 + fScore * 10 + mScore,
      rfmSegment: meta.label,
      rfmSegmentKey: meta.key,
      rfmSegmentMeta: meta,
      suggestedAction: meta.action,
    }
  })

  const customerScoreMap = new Map<string, CustomerRFMResult>()
  for (const cs of customerScores) {
    customerScoreMap.set(cs.id, cs)
  }

  // Summary aggregation
  const segmentCounts = new Map<RFMSegmentKey, { count: number; spendSum: number }>()
  for (const key of Object.keys(RFM_SEGMENT_DEFINITIONS) as RFMSegmentKey[]) {
    segmentCounts.set(key, { count: 0, spendSum: 0 })
  }

  for (const cs of customerScores) {
    const existing = segmentCounts.get(cs.rfmSegmentKey)!
    existing.count++
    existing.spendSum += cs.monetarySpend
  }

  const total = Math.max(1, customerScores.length)
  const segmentDistribution = (Object.keys(RFM_SEGMENT_DEFINITIONS) as RFMSegmentKey[]).map((key) => {
    const meta = RFM_SEGMENT_DEFINITIONS[key]
    const data = segmentCounts.get(key) || { count: 0, spendSum: 0 }
    return {
      key,
      label: meta.label,
      count: data.count,
      percent: parseFloat(((data.count / total) * 100).toFixed(1)),
      avgSpend: data.count > 0 ? Math.round(data.spendSum / data.count) : 0,
      color: meta.color,
      badgeBg: meta.badgeBg,
      badgeText: meta.badgeText,
      action: meta.action,
    }
  })

  return {
    customerScores,
    customerScoreMap,
    summary: {
      totalScoredCustomers: customerScores.length,
      segmentDistribution,
    },
  }
}
