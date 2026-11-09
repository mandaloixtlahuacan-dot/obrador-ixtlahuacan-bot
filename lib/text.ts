/** Fold accents and punctuation so command matching is stable. */
export function norm(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[¡!¿?.,;:"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fold(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function clipLines(text: string, maxLines = 3): string {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(0, maxLines).join("\n");
}
