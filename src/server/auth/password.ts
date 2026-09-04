/**
 * Password hashing.
 *
 * ## Why scrypt
 *
 * Argon2id is the first recommendation for new applications and scrypt is the
 * accepted second, so this is a deliberate trade rather than a default. scrypt
 * ships inside Node's own `crypto` module, which means the deployed bundle
 * carries no native binary at all. Argon2 for Node is a compiled addon: it
 * works on Vercel, right up until a runtime image or an architecture changes
 * under it, and the failure mode is that nobody can log in. For a platform
 * where being unreachable has real consequences, a memory-hard KDF with zero
 * native dependencies is worth more than the margin Argon2id holds over it.
 *
 * ## Parameters
 *
 * N = 2^16, r = 8, p = 1 — 64 MiB of memory per hash, which is what makes it
 * expensive to attack in parallel on a GPU. `maxmem` has to be raised
 * explicitly: Node caps scrypt at 32 MiB by default and simply throws above it.
 *
 * ## Format
 *
 * `scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>`
 *
 * Self-describing on purpose. Cost parameters have to increase as hardware
 * does, and storing them alongside the hash means an old password still
 * verifies against the parameters it was created with, while new ones use the
 * current values. `needsRehash` reports which is which, so a stored hash can be
 * upgraded on the next successful login — the only moment the plaintext is
 * available to do it with.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * `promisify` cannot be used here: it resolves to Node's three-argument scrypt
 * overload and drops the options object, which is where the cost parameters
 * live — so the hash would silently be computed with the defaults.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

const CURRENT_PARAMS = { N: 65_536, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** 128 MiB, comfortably above the 128 * N * r that N = 2^16, r = 8 requires. */
const MAX_MEMORY = 128 * 1024 * 1024;

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

async function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  // Normalised to NFC first. Two visually identical passwords can be different
  // byte sequences — an accented character typed on macOS decomposes, the same
  // character from a Windows password manager does not — and without this the
  // same password fails to verify depending on where it was typed.
  const normalised = password.normalize("NFC");
  return scrypt(normalised, salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: MAX_MEMORY,
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, CURRENT_PARAMS);
  return [
    "scrypt",
    CURRENT_PARAMS.N,
    CURRENT_PARAMS.r,
    CURRENT_PARAMS.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  // A stored record is not a trusted input if the database is ever tampered
  // with, and absurd parameters would turn one verify into a memory-exhaustion
  // denial of service against our own process.
  if (N < 1024 || N > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  if (128 * N * r > MAX_MEMORY) return null;

  try {
    const salt = Buffer.from(parts[4] as string, "base64");
    const hash = Buffer.from(parts[5] as string, "base64");
    if (salt.length === 0 || hash.length === 0) return null;
    return { N, r, p, salt, hash };
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;

  const candidate = await derive(password, parsed.salt, parsed);
  if (candidate.length !== parsed.hash.length) return false;
  // Length-equal buffers only, and compared in constant time: a byte-by-byte
  // comparison leaks how much of a guess was correct through how long the
  // rejection took.
  return timingSafeEqual(candidate, parsed.hash);
}

/** True when `stored` was made with weaker parameters than the current ones. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return parsed.N < CURRENT_PARAMS.N || parsed.r < CURRENT_PARAMS.r || parsed.p < CURRENT_PARAMS.p;
}

/**
 * A real hash of a value nobody holds, used to spend the same work on a login
 * for an address that does not exist as on one that does.
 *
 * Without it, "no such user" returns in a millisecond and "wrong password"
 * takes a hundred, which turns the login endpoint into an account-enumeration
 * oracle regardless of how carefully the response bodies are made identical.
 * Computed once, lazily, because computing it at import time would add 100ms to
 * every cold start including ones that never see a login.
 */
let decoyHash: string | undefined;

export async function spendVerificationBudget(password: string): Promise<void> {
  decoyHash ??= await hashPassword(randomBytes(32).toString("hex"));
  await verifyPassword(password, decoyHash);
}
