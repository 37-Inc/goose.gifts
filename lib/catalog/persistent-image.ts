/** Permanent imagery can be local or independently licensed remote imagery.
 * Exact clearance still comes from the existing per-field rights contract.
 */
export function isPersistentImagePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (/^\/(?!\/)[a-zA-Z0-9/_\-.]+\.(?:svg|png|jpg|jpeg|webp|avif)$/.test(value))
    return !value.split('/').some(part => part === '.' || part === '..');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch { return false; }
}
