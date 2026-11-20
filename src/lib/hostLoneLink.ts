/**
 * Same rule as Web HostAnonymousChat hostLoneLinkUrl.
 * Returns an http(s) href when the whole message is one link, otherwise null.
 */
const FILEISH_TLDS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'html', 'htm',
  'js', 'zip', 'exe',
]);

const SCHEMELESS_LINK =
  /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:[/?#]\S*)?$/i;

export function hostLoneLinkUrl(raw: string | null | undefined): string | null {
  const text = String(raw || '').trim();
  if (!text || /\s/.test(text)) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    if (!/^https?:\/\//i.test(text)) return null;
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      if (!parsed.hostname) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  if (!SCHEMELESS_LINK.test(text)) return null;
  const host = text.split(/[/?#]/)[0];
  const tld = String(host.split('.').pop() || '').toLowerCase();
  const hasPath = /[/?#]/.test(text);
  const isWww = /^www\./i.test(text);
  if (!hasPath && !isWww && FILEISH_TLDS.has(tld)) return null;

  try {
    const parsed = new URL(`https://${text}`);
    if (parsed.protocol !== 'https:' || !parsed.hostname || !parsed.hostname.includes('.')) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}
