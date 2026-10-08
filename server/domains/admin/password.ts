import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const KEY_LENGTH = 64
const COST = 16_384
const BLOCK_SIZE = 8
const PARALLELIZATION = 1

function deriveKey(password: string, salt: Buffer, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

// Formato: scrypt$N$r$p$sal$hash (base64url). Parâmetros ficam no hash para permitir ajuste futuro.
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION })
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, cost, blockSize, parallelization, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const key = await deriveKey(password, Buffer.from(salt, 'base64url'), {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}
