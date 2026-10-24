/** Presentation only: the original merchant title and catalog copy stay intact. */
export function shortProductName(title: string): string {
  const clean = title.replace(/[®©™]/g, "").replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s+[|–—]\s*|\s+-\s+|,|\s*\(/).map(part => part.trim());
  const object = /\b(?:mug|cup|shirt|socks?|hat|apron|towel|blanket|vase|statue|figurine|sculpture|tapestry|poster|print|plaque|lamp|light|box|button|toy|game|book|notebook|calendar|spatula|ladle|scraper|holder|bag|ring|toilet paper)\b/i;
  // A keyword-only prefix is not a product name; retain the actual object
  // from the same supplied title rather than inventing a replacement.
  const first = /\bgifts?\b/i.test(parts[0]) && !object.test(parts[0])
    ? parts.find(part => object.test(part)) || parts[0] : parts[0];
  const name = first.length >= 12 ? first : clean;
  if (name.length <= 76) return name;
  return name.slice(0, 73).replace(/\s+\S*$/, "").replace(/[\s:;,.!-]+$/, "") + "…";
}
