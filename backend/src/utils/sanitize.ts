/**
 * Input sanitization utilities.
 *
 * Strips potentially dangerous content from user-provided strings.
 * Prisma already prevents SQL injection via parameterized queries,
 * but we sanitize for XSS and control character injection.
 */

/**
 * Strip HTML tags and control characters from a string.
 * Preserves normal punctuation and unicode text.
 */
export function sanitizeString(input: string): string {
  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove control characters (except newline, tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Collapse multiple spaces
    .replace(/\s{3,}/g, '  ')
    .trim();
}

/**
 * Sanitize all string values in an object (shallow).
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeString(result[key] as string);
    }
  }
  return result;
}
