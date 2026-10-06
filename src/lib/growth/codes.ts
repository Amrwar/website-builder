import { createHash } from "node:crypto";

import { CODE_ALPHABET, CODE_LENGTH } from "@/config/growth";

/**
 * Referral codes, slugs, and the hashes used to spot duplicate accounts.
 *
 * Pure and dependency-free so the anti-abuse rules that depend on it can be
 * tested exhaustively without a database.
 */

/**
 * Generates a code from an unambiguous alphabet.
 *
 * Uses `crypto.getRandomValues` rather than `Math.random`: a code that can be
 * predicted from an earlier one is a code somebody can claim before the person
 * who earned it shares it.
 *
 * Rejection sampling rather than a modulo, so every character is equally
 * likely. A modulo over a 27-letter alphabet biases the first few letters, and
 * a biased code space is a smaller one.
 */
export function generateCode(length: number = CODE_LENGTH): string {
  const alphabet = CODE_ALPHABET;
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;

  let out = "";
  const buffer = new Uint8Array(length * 2);

  while (out.length < length) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (out.length === length) break;
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
    }
  }

  return out;
}

/** Codes are compared upper-case and stripped of anything decorative. */
export function normaliseCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned.length >= 4 && cleaned.length <= 32 ? cleaned : null;
}

/** True when every character is from the alphabet codes are generated from. */
export function isWellFormedCode(value: string): boolean {
  return (
    value.length >= 4 &&
    [...value].every((character) => CODE_ALPHABET.includes(character))
  );
}

/* -------------------------------------------------------------------------
 * Identity hashing
 * ---------------------------------------------------------------------- */

/**
 * Normalises an email the way a person trying to look like two people would
 * not expect.
 *
 * `a.b+promo@gmail.com` and `ab@gmail.com` are one mailbox. Gmail ignores dots
 * in the local part and everything after a `+`, and so do most providers for
 * the `+` tag. Folding both before hashing is what makes the duplicate-account
 * check worth running at all -- without it, creating a second "person" costs
 * one keystroke.
 *
 * Deliberately conservative: dots are only stripped for domains that actually
 * ignore them, because `first.last@acme.com` and `firstlast@acme.com` really
 * can be two different employees.
 */
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normaliseEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replaceAll(".", "");

  return local.length > 0 ? `${local}@${domain}` : null;
}

/**
 * A one-way identity fingerprint.
 *
 * Hashed with a server-side secret so the stored value is useless to anybody
 * who obtains the table: an unsalted hash of an email address is an email
 * address to anyone with a word list. The secret is the one already used for
 * the application's other hashing, passed in rather than read here so this
 * module stays pure and testable.
 */
export function fingerprint(value: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

/** Convenience: normalise an email, then fingerprint it. Null if unparseable. */
export function emailFingerprint(email: string, secret: string): string | null {
  const normalised = normaliseEmail(email);
  return normalised ? fingerprint(normalised, secret) : null;
}

/**
 * Fingerprints a caller's address.
 *
 * The last octet of an IPv4 address, and everything below the /64 of an IPv6
 * one, are dropped before hashing. Two signups from one household share a
 * prefix; two from one city do not. Keeping the full address would make this a
 * tracking record rather than an abuse signal.
 */
export function ipFingerprint(ip: string | null, secret: string): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    const groups = trimmed.split(":").slice(0, 4);
    return fingerprint(`v6:${groups.join(":")}`, secret);
  }

  const octets = trimmed.split(".");
  if (octets.length !== 4) return null;
  return fingerprint(`v4:${octets.slice(0, 3).join(".")}`, secret);
}

/* -------------------------------------------------------------------------
 * Slugs
 * ---------------------------------------------------------------------- */

/** A URL segment for a build-wall entry. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
