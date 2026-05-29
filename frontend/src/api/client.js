import { useState } from 'react'

export const MOIS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

/**
 * Remplace useState avec persistance dans localStorage.
 * La valeur est lue à l'initialisation et sauvegardée à chaque changement.
 * @param {string} key   - clé localStorage (ex: "app.tab")
 * @param {*} defaultValue - valeur par défaut si la clé est absente
 */
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setStored = (next) => {
    const resolved = typeof next === 'function' ? next(value) : next
    setValue(resolved)
    try { localStorage.setItem(key, JSON.stringify(resolved)) } catch {}
  }

  return [value, setStored]
}

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
