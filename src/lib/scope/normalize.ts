/**
 * Text normalisation for rule matching.
 *
 * Matching happens on normalised text so that accents, Arabic diacritics and
 * letter variants do not cause a rule to silently miss. The original text is
 * never modified -- only the comparison copy.
 */

/** Arabic diacritics (tashkeel) and tatweel, which are decorative for matching. */
const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      // Decompose, then strip combining marks: handles French accents and
      // leaves Arabic letters intact once diacritics are removed below.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(ARABIC_DIACRITICS, "")
      // Unify Arabic letter variants that users type interchangeably.
      .replace(/[أإآٱ]/g, "ا") // أ إ آ ٱ -> ا
      .replace(/ى/g, "ي") // ى -> ي
      .replace(/ة/g, "ه") // ة -> ه
      // Collapse punctuation and whitespace to single spaces so phrase
      // matching is not defeated by commas or line breaks.
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(" ")
      .map(stripArabicAffixes)
      .join(" ")
  );
}

const ARABIC_WORD = /^[؀-ۿ]+$/;

/**
 * Light Arabic affix folding.
 *
 * Arabic attaches the conjunction "و" directly to the following word, and
 * inflects plurals for case ("الموظفون" / "الموظفين"), so a brief routinely
 * writes a form no reasonable lexicon would list. Without this, Arabic briefs
 * under-detect and get under-scoped.
 *
 * This is folding, not stemming: it is applied identically to the text and to
 * the patterns being matched, so even where it mangles a word (a genuine
 * "و"-initial word such as "وقت") both sides mangle the same way and matching
 * stays correct. It is never shown to anyone.
 */
function stripArabicAffixes(token: string): string {
  if (!ARABIC_WORD.test(token)) return token;

  let folded = token;

  // Leading conjunction, only when enough stem remains to stay meaningful.
  if (folded.startsWith("و") && folded.length > 3) {
    folded = folded.slice(1);
  }

  // Unify the nominative and oblique sound-plural endings.
  if (folded.endsWith("ون") && folded.length > 3) {
    folded = `${folded.slice(0, -2)}ين`;
  }

  return folded;
}

/**
 * True when `phrase` occurs in already-normalised `haystack` as whole words.
 *
 * Both sides are padded with spaces so a match must align to word boundaries,
 * which `String.includes` alone would not guarantee -- without it "order"
 * would match inside "reorder" and "border".
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  return ` ${haystack} `.includes(` ${normalizedPhrase} `);
}

/** Returns the first phrase that matches, for use as displayed evidence. */
export function firstMatch(
  haystack: string,
  phrases: readonly string[],
): string | undefined {
  return phrases.find((phrase) => containsPhrase(haystack, phrase));
}
