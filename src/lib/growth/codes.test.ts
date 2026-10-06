import { describe, expect, it } from "vitest";

import { CODE_ALPHABET, CODE_LENGTH } from "@/config/growth";
import {
  emailFingerprint,
  fingerprint,
  generateCode,
  ipFingerprint,
  isWellFormedCode,
  normaliseCode,
  normaliseEmail,
  slugify,
} from "./codes";

const SECRET = "test-secret";

describe("generated codes", () => {
  it("are the configured length, from the configured alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it("contain no two characters that are confusable with each other", () => {
    // Dropping one of each pair is enough and keeps the code space larger. A
    // code nobody can transcribe is a referral nobody gets credit for.
    for (const pair of ["0O", "1I", "1L", "IL", "5S", "8B"]) {
      const present = [...pair].filter((c) => CODE_ALPHABET.includes(c));
      expect(present.length, pair).toBeLessThanOrEqual(1);
    }
  });

  it("do not repeat across a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) seen.add(generateCode());
    expect(seen.size).toBe(2_000);
  });

  it("use the whole alphabet rather than favouring its start", () => {
    // Rejection sampling instead of a modulo: a biased code space is a
    // smaller one than it appears.
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) for (const c of generateCode(16)) seen.add(c);
    expect(seen.size).toBe(CODE_ALPHABET.length);
  });
});

describe("codes are read the way people type them", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(normaliseCode("  ac-de fg2 ")).toBe("ACDEFG2");
  });

  it("refuses something too short to be a code", () => {
    expect(normaliseCode("ab")).toBeNull();
    expect(normaliseCode("   ")).toBeNull();
    expect(normaliseCode(null)).toBeNull();
  });

  it("recognises a well-formed code", () => {
    expect(isWellFormedCode(generateCode())).toBe(true);
    expect(isWellFormedCode("ABC0")).toBe(false);
  });
});

describe("email identity folding", () => {
  it("folds a plus tag", () => {
    expect(normaliseEmail("sam+promo@example.com")).toBe("sam@example.com");
  });

  it("folds dots only where the provider ignores them", () => {
    // Gmail ignores dots; most corporate domains do not, and first.last and
    // firstlast really can be two employees.
    expect(normaliseEmail("s.a.m@gmail.com")).toBe("sam@gmail.com");
    expect(normaliseEmail("first.last@acme.com")).toBe("first.last@acme.com");
  });

  it("gives two disguises of one mailbox the same fingerprint", () => {
    expect(emailFingerprint("S.a.m+ref@googlemail.com", SECRET)).toBe(
      emailFingerprint("sam@googlemail.com", SECRET),
    );
  });

  it("keeps genuinely different people apart", () => {
    expect(emailFingerprint("sam@example.com", SECRET)).not.toBe(
      emailFingerprint("alex@example.com", SECRET),
    );
  });

  it("refuses something that is not an address", () => {
    expect(normaliseEmail("not-an-email")).toBeNull();
    expect(normaliseEmail("@example.com")).toBeNull();
    expect(normaliseEmail("sam@")).toBeNull();
    expect(emailFingerprint("nonsense", SECRET)).toBeNull();
  });
});

describe("fingerprints do not leak what they describe", () => {
  it("is salted, so the same value differs between deployments", () => {
    expect(fingerprint("sam@example.com", "secret-a")).not.toBe(
      fingerprint("sam@example.com", "secret-b"),
    );
  });

  it("does not contain the value it was made from", () => {
    const hash = fingerprint("sam@example.com", SECRET);
    expect(hash).not.toContain("sam");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("address fingerprints identify a household, not a person", () => {
  it("matches two signups from one home network", () => {
    expect(ipFingerprint("203.0.113.7", SECRET)).toBe(
      ipFingerprint("203.0.113.209", SECRET),
    );
  });

  it("does not match two different networks", () => {
    expect(ipFingerprint("203.0.113.7", SECRET)).not.toBe(
      ipFingerprint("198.51.100.7", SECRET),
    );
  });

  it("truncates IPv6 to its routing prefix", () => {
    expect(ipFingerprint("2001:db8:1:2:aaaa:bbbb:cccc:dddd", SECRET)).toBe(
      ipFingerprint("2001:db8:1:2:1111:2222:3333:4444", SECRET),
    );
  });

  it("is null when there is no address to fingerprint", () => {
    expect(ipFingerprint(null, SECRET)).toBeNull();
    expect(ipFingerprint("   ", SECRET)).toBeNull();
    expect(ipFingerprint("nonsense", SECRET)).toBeNull();
  });
});

describe("slugs", () => {
  it("makes a URL segment from a title", () => {
    expect(slugify("Cedar Bakery — Ordering System")).toBe(
      "cedar-bakery-ordering-system",
    );
  });

  it("strips accents rather than dropping the word", () => {
    expect(slugify("Café Noir")).toBe("cafe-noir");
  });

  it("never starts or ends with a hyphen", () => {
    expect(slugify("  !! hello !!  ")).toBe("hello");
  });

  it("stays short enough for a URL", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(72);
  });
});
