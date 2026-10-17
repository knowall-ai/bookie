/** Case-insensitive "any of these fields contains the search", for sources without server-side search. */
export function matchesSearch(text: (string | undefined)[], search?: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return text.some((t) => t?.toLowerCase().includes(needle));
}
