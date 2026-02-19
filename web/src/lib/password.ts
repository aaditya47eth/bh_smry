import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(input: string, stored: string | null | undefined): boolean {
  const raw = String(stored ?? "");
  if (!raw) return false;

  if (raw.startsWith("scrypt$")) {
    const parts = raw.split("$");
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const actual = scryptSync(input, salt, expected.length);
    return timingSafeEqual(actual, expected);
  }

  // Legacy plain-text fallback; route upgrades to hashed on success.
  return raw === input;
}

export function isPasswordHashed(stored: string | null | undefined): boolean {
  return String(stored ?? "").startsWith("scrypt$");
}

