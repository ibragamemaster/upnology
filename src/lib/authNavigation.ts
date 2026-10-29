// Only destinations belonging to the authenticated application are accepted.
export function accountDestination(value: string | null | undefined): string {
 if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/account'
 try {
  const url = new URL(value, 'https://upnology.invalid')
  if (url.origin !== 'https://upnology.invalid' || !['/account', '/admin'].includes(url.pathname.replace(/\/$/, ''))) return '/account'
  return `${url.pathname}${url.search}${url.hash}`
 } catch { return '/account' }
}
export const loginHref = (destination: string) => `/login?next=${encodeURIComponent(accountDestination(destination))}`
