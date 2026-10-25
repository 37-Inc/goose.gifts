import descriptions from "../../content/catalog-card-descriptions.json";

const copy: Readonly<Record<string, { title: string; description: string }>> = descriptions;
export const LEGACY_DESCRIPTION_PLACEHOLDER = "A strange little catalog find.";

/** Site-authored presentation only. Retain the original catalog/native inputs,
 * prefer genuinely refreshed copy, and never reuse a note for a changed item. */
export function factualCardDescription(input: {
  source: string; id: string; title?: string; description?: string;
}): string | undefined {
  const note = Object.hasOwn(copy, input.id) ? copy[input.id] : undefined;
  return input.source === "amazon" && input.description?.trim() === LEGACY_DESCRIPTION_PLACEHOLDER
    && note && note.title === input.title ? note.description : input.description;
}
