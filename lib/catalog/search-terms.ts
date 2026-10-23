// Shared by indexed lookup and result ranking. Conversational filler must not
// turn "a gift for dad who likes golf" into matches for every "gift" or "for".
const FILLER = new Set("a an and are as at be buy can do find for from get gift gifts give good great he her him his i idea ideas in is it like likes looking love loves me my of on or our present presents she some something that the their them they this to want what where who with would you your".split(" "));
const RECIPIENTS: Record<string, string> = { him: "men", her: "women", father: "dad", mother: "mom" };

export function catalogSearchTerms(query: string): string[] {
  const words = [...new Set((query.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .map(word => RECIPIENTS[word] || word))].slice(0, 20);
  const meaningful = words.filter(word => word.length >= 2 && !FILLER.has(word));
  return (meaningful.length ? meaningful : words).map(word => {
    if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
    return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
  });
}
