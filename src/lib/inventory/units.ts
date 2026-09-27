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
  milligram: { label: "Milligram", group: "weight", toBaseFactor: 0.001 },
  milligrams: { label: "Milligrams", group: "weight", toBaseFactor: 0.001 },
  g: { label: "g (Gram)", group: "weight", toBaseFactor: 1 },
  gm: { label: "Gram", group: "weight", toBaseFactor: 1 },
  gms: { label: "Grams", group: "weight", toBaseFactor: 1 },
  gram: { label: "Gram", group: "weight", toBaseFactor: 1 },
  grams: { label: "Grams", group: "weight", toBaseFactor: 1 },
  kg: { label: "kg (Kilogram)", group: "weight", toBaseFactor: 1000 },
  kgs: { label: "Kilograms", group: "weight", toBaseFactor: 1000 },
  kilogram: { label: "Kilogram", group: "weight", toBaseFactor: 1000 },
  kilograms: { label: "Kilograms", group: "weight", toBaseFactor: 1000 },

  // Volume (base: milliliter)
  ml: { label: "ml (Millilitre)", group: "volume", toBaseFactor: 1 },
  milliliter: { label: "Millilitre", group: "volume", toBaseFactor: 1 },
  millilitre: { label: "Millilitre", group: "volume", toBaseFactor: 1 },
  milliliters: { label: "Millilitres", group: "volume", toBaseFactor: 1 },
  millilitres: { label: "Millilitres", group: "volume", toBaseFactor: 1 },
  l: { label: "L (Litre)", group: "volume", toBaseFactor: 1000 },
  L: { label: "L (Litre)", group: "volume", toBaseFactor: 1000 },
  liter: { label: "Litre", group: "volume", toBaseFactor: 1000 },
  litre: { label: "Litre", group: "volume", toBaseFactor: 1000 },
  liters: { label: "Litres", group: "volume", toBaseFactor: 1000 },
  litres: { label: "Litres", group: "volume", toBaseFactor: 1000 },
  ltr: { label: "Litre", group: "volume", toBaseFactor: 1000 },
  ltrs: { label: "Litres", group: "volume", toBaseFactor: 1000 },
  cl: { label: "Centilitre", group: "volume", toBaseFactor: 10 },
  dl: { label: "Decilitre", group: "volume", toBaseFactor: 100 },

  // Count / Discrete (base: piece)
  piece: { label: "Piece", group: "count", toBaseFactor: 1 },
  pc: { label: "Piece", group: "count", toBaseFactor: 1 },
  pcs: { label: "Pieces", group: "count", toBaseFactor: 1 },
  unit: { label: "Unit", group: "count", toBaseFactor: 1 },
  portion: { label: "Portion", group: "count", toBaseFactor: 1 },
  packet: { label: "Packet", group: "count", toBaseFactor: 1 },
  pack: { label: "Pack", group: "count", toBaseFactor: 1 },
  pkt: { label: "Packet", group: "count", toBaseFactor: 1 },
  pkts: { label: "Packets", group: "count", toBaseFactor: 1 },
  bottle: { label: "Bottle", group: "count", toBaseFactor: 1 },
  bottles: { label: "Bottles", group: "count", toBaseFactor: 1 },
  btl: { label: "Bottle", group: "count", toBaseFactor: 1 },
  box: { label: "Box", group: "count", toBaseFactor: 1 },
  boxes: { label: "Boxes", group: "count", toBaseFactor: 1 },
  can: { label: "Can / Tin", group: "count", toBaseFactor: 1 },
  cans: { label: "Cans", group: "count", toBaseFactor: 1 },
  tin: { label: "Tin", group: "count", toBaseFactor: 1 },
  tins: { label: "Tins", group: "count", toBaseFactor: 1 },
  dozen: { label: "Dozen (12 pcs)", group: "count", toBaseFactor: 12 },
  dozens: { label: "Dozens", group: "count", toBaseFactor: 12 },
  dz: { label: "Dozen", group: "count", toBaseFactor: 12 },
}

/**
 * Normalizes a unit string (e.g. "Kg" -> "kg", "l" -> "L", "ltr" -> "L")
 */
export function normalizeUnit(unit: string): string {
  if (!unit) return ""
  const trimmed = unit.trim()
  const lower = trimmed.toLowerCase()
  if (
    lower === "l" ||
    lower === "liter" ||
    lower === "litre" ||
    lower === "ltr" ||
    lower === "liters" ||
    lower === "litres" ||
    lower === "ltrs"
  ) {
    return "L"
  }
  if (lower === "kg" || lower === "kgs" || lower === "kilogram" || lower === "kilograms") return "kg"
  if (lower === "g" || lower === "gm" || lower === "gms" || lower === "gram" || lower === "grams") return "g"
  if (lower === "mg" || lower === "milligram" || lower === "milligrams") return "mg"
  if (lower === "ml" || lower === "milliliter" || lower === "millilitre" || lower === "milliliters" || lower === "millilitres") return "ml"
  if (lower === "piece" || lower === "pc" || lower === "pcs" || lower === "pieces") return "piece"
  if (lower === "packet" || lower === "pkt" || lower === "pkts" || lower === "packets" || lower === "pack" || lower === "packs") return "packet"
  if (lower === "bottle" || lower === "btl" || lower === "btls" || lower === "bottles") return "bottle"
  if (lower === "box" || lower === "boxes") return "box"
  if (lower === "dozen" || lower === "dozens" || lower === "dz") return "dozen"
  if (lower === "can" || lower === "cans" || lower === "tin" || lower === "tins") return "can"
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

  const primaryUnitsByGroup: Record<string, string[]> = {
    weight: ["kg", "g", "mg"],
    volume: ["L", "ml"],
    count: ["piece", "packet", "box", "bottle", "dozen", "can", "portion"],
  }

  return primaryUnitsByGroup[def.group] || [baseUnit]
}
