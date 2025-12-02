import argon2, { type Options as Argon2Options } from 'argon2';

const PASSWORD_ALGORITHM = 'argon2id';
const PASSWORD_VERSION = 1;
const MIN_PASSWORD_LENGTH = 12;

const DEFAULT_HASH_OPTIONS: Argon2Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

export type PasswordHashRecord = {
  hash: string;
  algorithm: typeof PASSWORD_ALGORITHM;
  version: typeof PASSWORD_VERSION;
};

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

function assertPasswordMeetsPolicy(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

export async function hashPassword(
  plaintext: string,
  options: { skipPolicy?: boolean } = {}
): Promise<PasswordHashRecord> {
  if (!options.skipPolicy) {
    assertPasswordMeetsPolicy(plaintext);
  }

  const hash = await argon2.hash(plaintext, DEFAULT_HASH_OPTIONS);

  return {
    hash,
    algorithm: PASSWORD_ALGORITHM,
    version: PASSWORD_VERSION
  };
}

export type VerifyPasswordInput = {
  hash: string;
  algorithm: string;
  version: number;
};

export type VerifyPasswordResult = {
  valid: boolean;
  needsRehash: boolean;
};

export async function verifyPassword(
  stored: VerifyPasswordInput,
  candidate: string
): Promise<VerifyPasswordResult> {
  if (stored.algorithm !== PASSWORD_ALGORITHM) {
    return { valid: false, needsRehash: true };
  }

  const valid = await argon2.verify(stored.hash, candidate, {
    ...DEFAULT_HASH_OPTIONS,
    type: argon2.argon2id
  });

  return {
    valid,
    needsRehash: valid && stored.version < PASSWORD_VERSION
  };
}

export function getPasswordPolicy() {
  return {
    minLength: MIN_PASSWORD_LENGTH
  };
}
