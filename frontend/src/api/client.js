export const MOIS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts })
  if (res.status === 401) {
    window.dispatchEvent(new Event('unauthorized'))
    throw new Error('Non authentifié')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
