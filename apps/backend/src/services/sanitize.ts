/**
 * Lightweight input sanitizer. For production, consider replacing with `sanitize-html`
 * or `dompurify` for more robust HTML/JS stripping.
 */
export function stripHtmlTags(input: string | undefined | null): string | undefined {
  if (input == null) return undefined;
  return input.replace(/<[^>]*>/g, '').trim();
}

export function sanitizeForLogging(input: string | undefined | null): string | undefined {
  if (input == null) return undefined;
  return input.replace(/[\r\n]/g, ' ').slice(0, 500);
}
