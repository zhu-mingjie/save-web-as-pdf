export function sanitizePdfFilename(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  return `${base || "webpage"}.pdf`;
}
