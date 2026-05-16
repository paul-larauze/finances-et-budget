import { useState, useEffect, useRef } from 'react'
import { apiFetch, fmt, MOIS } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'

const now = new Date()

export function DepensesTab() {
  const showToast = useToast()
  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois] = useState(now.getMonth() + 1)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/transactions?annee=${annee}&mois=${mois}`)
      setTransactions(data)
    } catch {
      showToast('Erreur de chargement', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [annee, mois])

  function changeMonth(delta) {
    setMois(prev => {
      let m = prev + delta
      if (m > 12) { setAnnee(a => a + 1); return 1 }
      if (m < 1)  { setAnnee(a => a - 1); return 12 }
      return m
    })
    setImportResult(null)
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      setImportResult(result)
      if (result.inserted > 0) {
        showToast(`${result.inserted} transaction(s) importée(s)`, 'success')
        load()
      } else {
        showToast('Aucune nouvelle transaction', 'info')
      }
    } catch {
      showToast("Erreur lors de l'import", 'error')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const totalDepenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const totalEntrees = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)

  const byCategory = {}
  for (const t of transactions) {
    if (t.amount >= 0) continue
    const cat = t.category_parent || t.category || 'Non catégorisé'
    byCategory[cat] = (byCategory[cat] || 0) + t.amount
  }
  const categories = Object.entries(byCategory).sort((a, b) => a[1] - b[1])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Month nav + import */}
      <div className="card">
        <div className="month-nav">
          <button className="btn btn-outline btn-sm" onClick={() => changeMonth(-1)}>‹</button>
          <span>{MOIS[mois]} {annee}</span>
          <button className="btn btn-outline btn-sm" onClick={() => changeMonth(1)}>›</button>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => fileRef.current.click()}
          disabled={importing}
        >
          {importing ? 'Import en cours…' : '↑ Importer un CSV BoursoBank'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {importResult && (
          <div className="alert alert-info" style={{ marginTop: 10, fontSize: 13 }}>
            ✓ {importResult.inserted} importée(s) · {importResult.skipped} doublon(s) ignoré(s)
            {importResult.errors > 0 && ` · ${importResult.errors} erreur(s)`}
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && transactions.length > 0 && (
        <div className="card">
          <p className="card-title">Résumé — {MOIS[mois]} {annee}</p>
          <div className="summary-grid" style={{ marginBottom: 12 }}>
            <div className="summary-card red">
              <div className="label">Dépenses</div>
              <div className="value">{fmt(totalDepenses)}</div>
            </div>
            <div className="summary-card green">
              <div className="label">Entrées</div>
              <div className="value">{fmt(totalEntrees)}</div>
            </div>
          </div>

          {categories.length > 0 && (
            <>
              <p className="card-title" style={{ fontSize: 13, marginBottom: 6 }}>Par catégorie</p>
              <ul className="transfer-list" style={{ fontSize: 13 }}>
                {categories.map(([cat, total]) => (
                  <li key={cat}>
                    <span className="transfer-name">{cat}</span>
                    <span className="transfer-amount negative">{fmt(total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Transaction list */}
      <div className="card">
        <p className="card-title">
          Mouvements
          {transactions.length > 0 && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({transactions.length})</span>}
        </p>
        {loading && <p style={{ textAlign: 'center', color: '#888' }}>Chargement…</p>}
        {!loading && transactions.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14 }}>
            Aucun mouvement pour ce mois.<br />Importez un CSV pour commencer.
          </p>
        )}
        {!loading && transactions.length > 0 && (
          <ul className="transfer-list">
            {transactions.map(t => (
              <li key={t.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 0' }}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                  <span className="transfer-name" style={{ flex: 1, fontSize: 13 }}>{t.label.split('|')[0].trim()}</span>
                  <span className={`transfer-amount ${t.amount >= 0 ? 'positive' : 'negative'}`} style={{ fontWeight: 600 }}>
                    {fmt(t.amount)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, fontSize: 11, color: '#888' }}>
                  <span>{t.date_op}</span>
                  {t.category_parent && t.category_parent !== 'Non catégorisé' && (
                    <span>· {t.category_parent}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
