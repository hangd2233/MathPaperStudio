export function sourcePdfView(
  key: string,
): { scale: number; page: number } | null {
  try {
    const v = JSON.parse(
      localStorage.getItem(`mps-source-pdf:${key}`) ?? "null",
    );
    return v &&
      Number.isFinite(v.scale) &&
      v.scale >= 0.25 &&
      v.scale <= 4 &&
      Number.isInteger(v.page) &&
      v.page >= 1
      ? { scale: v.scale, page: v.page }
      : null;
  } catch {
    return null;
  }
}
export function saveSourcePdfView(key: string, scale: number, page: number) {
  if (!key) return;
  try {
    localStorage.setItem(
      `mps-source-pdf:${key}`,
      JSON.stringify({ scale, page }),
    );
  } catch {
    /* Full or unavailable local preferences must not interrupt reading. */
  }
}
