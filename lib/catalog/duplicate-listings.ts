/** Exact-title duplicate review, October24. Unlike the old broad-family flags,
 * these pairs have the same normalized listing title. Keep identities/history,
 * but prevent routine refresh from accidentally re-admitting the second ASIN. */
export const EXACT_DUPLICATE_LISTINGS: Readonly<Record<string, string>> = Object.freeze({
  B008B3OOXC: 'B004181YKM',
  B0CRPBCSNP: 'B0BJV3G33Q',
  B0D9BP7CRJ: 'B0D9BPFD17',
  B0DQVNVN1Z: 'B0DQVM1XXT',
});
