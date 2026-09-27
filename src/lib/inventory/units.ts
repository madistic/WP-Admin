/**
 * Unit conversion system for inventory items and recipe ingredients.
 * Supports weight, volume, and count unit conversions.
 */

export interface UnitDefinition {
  label: string
  group: "weight" | "volume" | "count"
  toBaseFactor: number // multiplier to convert to base unit (g for weight, ml for volume, piece for count)
}

export const SUPPORTED_UNITS: Record<string, UnitDefinition> = {
  // Weight (base: gram)
  mg: { label: "mg (Milligram)", group: "weight", toBaseFactor: 0.001 },
  g: { label: "g (Gram)", group: "weight", toBaseFactor: 1 },
  kg: { label: "kg (Kilogram)", group: "weight", toBaseFactor: 1000 },

  // Volume (base: milliliter)
  ml: { label: "ml (Milliliter)", group: "volume", toBaseFactor: 1 },
  l: { label: "L (Liter)", group: "volume", toBaseFactor: 1000 },
  L: { label: "L (Liter)", group: "volume", toBaseFactor: 1000 },

  // Count / Discrete (base: piece)
  piece: { label: "Piece", group: "count", toBaseFactor: 1 },
  pc: { label: "Piece", group: "count", toBaseFactor: 1 },
  pcs: { label: "Pieces", group: "count", toBaseFactor: 1 },
  unit: { label: "Unit", group: "count", toBaseFactor: 1 },
  portion: { label: "Portion", group: "count", toBaseFactor: 1 },
  box: { label: "Box", group: "count", toBaseFactor: 1 },
  pack: { label: "Pack", group: "count", toBaseFactor: 1 },
  dozen: { label: "Dozen (12 pcs)", group: "count", toBaseFactor: 12 },
}

/**
 * Normalizes a unit string (e.g. "Kg" -> "kg", "l" -> "L")
 */
export function normalizeUnit(unit: string): string {
  const trimmed = unit.trim()
  if (trimmed.toLowerCase() === "l") return "L"
  const lower = trimmed.toLowerCase()
  if (SUPPORTED_UNITS[lower]) return lower
  return trimmed
}

/**
 * Checks if two units are compatible for conversion (in the same unit group).
 */
export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  const normA = normalizeUnit(unitA)
  const normB = normalizeUnit(unitB)
  if (normA.toLowerCase() === normB.toLowerCase()) return true

  const defA = SUPPORTED_UNITS[normA] || SUPPORTED_UNITS[normA.toLowerCase()]
  const defB = SUPPORTED_UNITS[normB] || SUPPORTED_UNITS[normB.toLowerCase()]

  if (!defA || !defB) return false
  return defA.group === defB.group
}

/**
 * Converts a quantity from one unit to another.
 * If units are not compatible or unknown, returns the original quantity.
 */
export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  const normFrom = normalizeUnit(fromUnit)
  const normTo = normalizeUnit(toUnit)

  if (normFrom.toLowerCase() === normTo.toLowerCase()) return quantity

  const defFrom = SUPPORTED_UNITS[normFrom] || SUPPORTED_UNITS[normFrom.toLowerCase()]
  const defTo = SUPPORTED_UNITS[normTo] || SUPPORTED_UNITS[normTo.toLowerCase()]

  if (!defFrom || !defTo || defFrom.group !== defTo.group) {
    // Cannot convert between different groups; return as-is
    return quantity
  }

  // Convert to base unit then to target unit
  const inBase = quantity * defFrom.toBaseFactor
  return inBase / defTo.toBaseFactor
}

/**
 * Returns available units for an item's unit group.
 */
export function getCompatibleUnits(baseUnit: string): string[] {
  const norm = normalizeUnit(baseUnit)
  const def = SUPPORTED_UNITS[norm] || SUPPORTED_UNITS[norm.toLowerCase()]
  if (!def) return [baseUnit]

  const matches: string[] = []
  for (const [key, val] of Object.entries(SUPPORTED_UNITS)) {
    if (val.group === def.group && !matches.includes(key)) {
      matches.push(key)
    }
  }
  return matches
}
