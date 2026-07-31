/**
 * Chip denominations and how an amount breaks down into them.
 *
 * The pot on the felt is drawn as the chips that actually make it up — 3,000 is
 * three 1K discs, not a decorative stack — so the shape of the pot carries its
 * size before the number is read.
 */

/** Face values in the shipped chip set, largest first for greedy breakdown. */
export const CHIP_DENOMINATIONS = [5000, 1000, 500, 100, 25, 5, 1] as const

export type ChipDenomination = (typeof CHIP_DENOMINATIONS)[number]

export interface ChipPile {
  value: ChipDenomination
  count: number
}

/**
 * Greedy breakdown, exactly as a dealer would cut it: as many of the largest
 * denomination as fit, then down the list. Every denomination divides the next
 * one up except 25 into 100 (which still resolves through 5 and 1), so the
 * result is always exact for whole amounts.
 */
export function chipBreakdown(amount: number): ChipPile[] {
  let rest = Math.max(0, Math.floor(amount))
  const piles: ChipPile[] = []
  for (const value of CHIP_DENOMINATIONS) {
    const count = Math.floor(rest / value)
    if (count > 0) {
      piles.push({ value, count })
      rest -= count * value
    }
  }
  return piles
}

/** Largest denomination that fits, for places that show a single chip. */
export function largestChip(amount: number): ChipDenomination {
  return CHIP_DENOMINATIONS.find((value) => value <= amount) ?? 1
}

export function chipAssetUrl(theme: string, value: number): string {
  return `${import.meta.env.BASE_URL}assets/chips/${theme}/chip-${value}.svg`
}

/** File names a chip theme has to ship for the table to render a pot. */
export function chipAssetFiles(): string[] {
  return ['chips.svg', ...CHIP_DENOMINATIONS.map((value) => `chip-${value}.svg`)]
}
