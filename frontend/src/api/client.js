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
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const body = await res.json(); if (body?.error) msg = body.error } catch {}
    throw new Error(msg)
  }
  return res.json()
}
