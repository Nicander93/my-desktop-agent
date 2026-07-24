export function filterVisible(items, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) => item.name.toLowerCase().startsWith(normalizedQuery));
}
