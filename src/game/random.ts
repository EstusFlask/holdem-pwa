import type { RandomInt } from './types'

const UINT32_RANGE = 0x1_0000_0000

/**
 * 无偏浏览器加密随机整数。拒绝采样避免 `% max` 引入模偏差。
 */
export const browserCryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new RangeError('maxExclusive must be an integer between 1 and 2^32')
  }

  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive)
  const bucket = new Uint32Array(1)
  do {
    crypto.getRandomValues(bucket)
  } while (bucket[0] >= limit)
  return bucket[0] % maxExclusive
}

export function cryptoShuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function browserToken(bytes = 16): string {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  return Array.from(value, (part) => part.toString(16).padStart(2, '0')).join('')
}
