import { randomBytes, scrypt as nodeScrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'scrypt';
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

const OPTIONS: ScryptOptions = {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELIZATION,
  maxmem: MAX_MEMORY,
};

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, KEY_LENGTH, OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('密码长度必须为 12 至 256 个字符');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('密码必须同时包含字母和数字');
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt);
  return [
    ALGORITHM,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = encoded.split('$');
  if (
    algorithm !== ALGORITHM ||
    Number(cost) !== COST ||
    Number(blockSize) !== BLOCK_SIZE ||
    Number(parallelization) !== PARALLELIZATION ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await derive(password, Buffer.from(saltValue, 'base64url'));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function burnPasswordVerification(password: string): Promise<void> {
  await derive(password, Buffer.alloc(SALT_LENGTH, 0));
}
