/** Individually reviewed same-product pairs, never broad-family suppression.
 * The original four have exact normalized titles. October25 adds two
 * identical-photo/model crown sets;
 * see docs/ops/evidence/2026-10-25-photo-identity-audit.json. Preserve all source
 * identities/history and prevent routine refresh from re-admitting duplicates. */
export const EXACT_DUPLICATE_LISTINGS: Readonly<Record<string, string>> = Object.freeze({
  B008B3OOXC: 'B004181YKM',
  B0CRPBCSNP: 'B0BJV3G33Q',
  B0D9BP7CRJ: 'B0D9BPFD17',
  B0DQVNVN1Z: 'B0DQVM1XXT',
  B0F45GMFH3: 'B0DJ8QSZZ7',
  B0F912SZ4M: 'B0DJ8QSZZ7',
});
