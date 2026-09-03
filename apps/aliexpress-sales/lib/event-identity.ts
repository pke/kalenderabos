export function normalizeEventName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function eventUidSlug(name: string): string {
  return normalizeEventName(name).replaceAll(" ", "-") || "event";
}
