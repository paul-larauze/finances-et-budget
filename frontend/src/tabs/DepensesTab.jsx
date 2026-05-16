import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch, fmt, MOIS } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'
import { RapportDepensesView } from './RapportDepensesView.jsx'

const now = new Date()

function shortLabel(label) {
  return (label.split('|')[0] || label).trim()
}

export function DepensesTab() {
  const showToast = useToast()
  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois] = useState(now.getMonth() + 1)
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [accountType, setAccountType] = useState('perso')
  const [view, setView] = useState('mouvements')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [editingCat, setEditingCat] = useState(null)
  const [editCatVal, setEditCatVal] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [amountFilter, setAmountFilter] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const [newRuleCat, setNewRuleCat] = useState('')
  const [recategorizing, setRecategorizing] = useState(false)
  const fileRef = useRef()

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/transactions?annee=${annee}&mois=${mois}&account_type=${accountType}`)
      setTransactions(data)
    } catch {
      showToast('Erreur de chargement', 'error')
    } finally {
      setLoading(false)
    }
  }, [annee, mois, accountType])

  const loadMeta = useCallback(async () => {
    try {
      const [cats, rls] = await Promise.all([
        apiFetch('/api/categories'),
        apiFetch('/api/categorization-rules'),
      ])
      setCategories(cats)
      setRules(rls)
      if (cats.length > 0 && !newRuleCat) setNewRuleCat(cats[0])
    } catch {}
  }, [])

  useEffect(() => { loadTransactions() }, [loadTransactions])
  useEffect(() => { loadMeta() }, [loadMeta])

  function switchAccount(id) {
    setAccountType(id)
    setCatFilter('')
    setAmountFilter('')
    setImportResult(null)
  }

  function changeMonth(delta) {
    setMois(prev => {
      let m = prev + delta
      if (m > 12) { setAnnee(a => a + 1); return 1 }
      if (m < 1)  { setAnnee(a => a - 1); return 12 }
      return m
    })
    setImportResult(null)
    setCatFilter('')
    setAmountFilter('')
  }

  async function deleteTransaction(id) {
    try {
      await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' })
      setTransactions(prev => prev.filter(t => t.id !== id))
    } catch {
      showToast('Erreur lors de la suppression', 'error')
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('account_type', accountType)
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      setImportResult(result)
      if (result.inserted > 0) {
        showToast(`${result.inserted} transaction(s) importée(s)`, 'success')
        loadTransactions()
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

  function startEditCat(t) {
    setEditingCat(t.id)
    setEditCatVal(t.my_category || (categories[0] || ''))
  }

  async function saveCat(t) {
    try {
      await apiFetch(`/api/transactions/${t.id}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: editCatVal }),
      })
      setTransactions(prev => prev.map(tx =>
        tx.id === t.id ? { ...tx, my_category: editCatVal } : tx
      ))
      setEditingCat(null)
      showToast('Catégorie enregistrée', 'success')
    } catch {
      showToast('Erreur', 'error')
    }
  }

  async function handleRecategorize() {
    setRecategorizing(true)
    try {
      await apiFetch('/api/transactions/recategorize', { method: 'POST' })
      showToast('Recatégorisation terminée', 'success')
      loadTransactions()
    } catch {
      showToast('Erreur', 'error')
    } finally {
      setRecategorizing(false)
    }
  }

  async function addRule(e) {
    e.preventDefault()
    if (!newKeyword.trim() || !newRuleCat) return
    try {
      await apiFetch('/api/categorization-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newKeyword.trim(), category: newRuleCat }),
      })
      setNewKeyword('')
      loadMeta()
      showToast('Règle ajoutée', 'success')
    } catch {
      showToast('Erreur', 'error')
    }
  }

  async function deleteRule(id) {
    try {
      await apiFetch(`/api/categorization-rules/${id}`, { method: 'DELETE' })
      loadMeta()
    } catch {
      showToast('Erreur', 'error')
    }
  }

  const filtered = transactions.filter(t => {
    if (catFilter && t.my_category !== catFilter) return false
    if (amountFilter) {
      const needle = amountFilter.replace(',', '.').replace(/\s/g, '')
      const abs = String(Math.abs(t.amount)).replace('.', ',')
      const absStr = String(Math.abs(t.amount))
      if (!abs.startsWith(needle.replace('.', ',')) && !absStr.startsWith(needle)) return false
    }
    return true
  })

  const totalDepenses = filtered.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const totalEntrees = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)

  const byCat = {}
  for (const t of transactions) {
    if (t.amount >= 0) continue
    const cat = t.my_category || '—'
    byCat[cat] = (byCat[cat] || 0) + t.amount
  }
  const catBreakdown = Object.entries(byCat).sort((a, b) => a[1] - b[1])
  const usedCats = [...new Set(transactions.map(t => t.my_category).filter(Boolean))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Account toggle */}
      <div style={{ display: 'flex', background: 'white', borderRadius: 12, padding: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', gap: 4 }}>
        {[{ id: 'perso', label: 'Compte perso' }, { id: 'joint', label: 'Compte joint' }].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => switchAccount(id)}
            style={{
              flex: 1, padding: '10px 0', border: 'none', borderRadius: 8, fontWeight: 600,
              fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
              background: accountType === id ? 'var(--primary)' : 'transparent',
              color: accountType === id ? 'white' : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[{ id: 'mouvements', label: '≡ Mouvements' }, { id: 'rapport', label: '📊 Rapport' }].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`cat-chip${view === id ? ' active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '10px 0', fontSize: 13 }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'rapport' && <RapportDepensesView accountType={accountType} />}

      {view === 'mouvements' && <>

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
          <div className="summary-grid">
            <div className="summary-card red">
              <div className="label">Dépenses</div>
              <div className="value">{fmt(totalDepenses)}</div>
            </div>
            <div className="summary-card green">
              <div className="label">Entrées</div>
              <div className="value">{fmt(totalEntrees)}</div>
            </div>
          </div>

          {catBreakdown.length > 0 && (
            <>
              <p className="card-title" style={{ fontSize: 12, marginBottom: 8 }}>Par catégorie</p>
              <ul className="transfer-list" style={{ fontSize: 13 }}>
                {catBreakdown.map(([cat, total]) => (
                  <li key={cat} onClick={() => setCatFilter(catFilter === cat ? '' : cat)}
                      style={{ cursor: 'pointer', background: catFilter === cat ? '#f0fdf4' : 'transparent', margin: '0 -4px', padding: '8px 4px', borderRadius: 6 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p className="card-title" style={{ margin: 0 }}>
            Mouvements
            {transactions.length > 0 && <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({filtered.length})</span>}
          </p>
          {catFilter && (
            <button className="cat-chip active" onClick={() => setCatFilter('')} style={{ fontSize: 11 }}>
              {catFilter} ✕
            </button>
          )}
        </div>

        {/* Amount filter */}
        <div style={{ marginBottom: 10 }}>
          <div className="input-suffix">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Filtrer par montant…"
              value={amountFilter}
              onChange={e => setAmountFilter(e.target.value)}
              style={{ fontSize: 14, padding: '8px 36px 8px 12px' }}
            />
            {amountFilter && (
              <span style={{ cursor: 'pointer', color: '#888' }} onClick={() => setAmountFilter('')}>✕</span>
            )}
          </div>
        </div>

        {/* Category filter chips */}
        {usedCats.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}>
            <button className={`cat-chip${!catFilter ? ' active' : ''}`} onClick={() => setCatFilter('')}>Tout</button>
            {usedCats.map(c => (
              <button key={c} className={`cat-chip${catFilter === c ? ' active' : ''}`} onClick={() => setCatFilter(catFilter === c ? '' : c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        {loading && <p style={{ textAlign: 'center', color: '#888' }}>Chargement…</p>}
        {!loading && transactions.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14 }}>
            Aucun mouvement pour ce mois.<br />Importez un CSV pour commencer.
          </p>
        )}
        {!loading && filtered.length > 0 && (
          <ul className="transfer-list">
            {filtered.map(t => (
              <li key={t.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 0' }}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{shortLabel(t.label)}</span>
                  <span className={`transfer-amount ${t.amount >= 0 ? 'positive' : 'negative'}`}>
                    {fmt(t.amount)}
                  </span>
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
                    title="Supprimer"
                  >🗑</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>{t.date_op}</span>
                  {editingCat === t.id ? (
                    <>
                      <select
                        value={editCatVal}
                        onChange={e => setEditCatVal(e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', width: 'auto', height: 26, borderRadius: 6 }}
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={() => saveCat(t)} className="cat-chip active" style={{ padding: '2px 8px' }}>✓</button>
                      <button onClick={() => setEditingCat(null)} className="cat-chip" style={{ padding: '2px 8px' }}>✕</button>
                    </>
                  ) : (
                    <span className={`cat-badge${t.my_category ? '' : ' cat-badge-empty'}`} onClick={() => startEditCat(t)}>
                      {t.my_category || 'Catégoriser'} ▾
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Rules section */}
      <div className="card">
        <button
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onClick={() => setShowRules(v => !v)}
        >
          <p className="card-title" style={{ margin: 0 }}>Règles de catégorisation</p>
          <span style={{ color: '#888', fontSize: 18 }}>{showRules ? '▲' : '▼'}</span>
        </button>

        {showRules && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                className="btn btn-outline btn-sm"
                style={{ flex: 1 }}
                onClick={handleRecategorize}
                disabled={recategorizing}
              >
                {recategorizing ? 'En cours…' : '↺ Recatégoriser tout'}
              </button>
            </div>

            <form onSubmit={addRule} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input
                placeholder="Mot-clé (ex: carrefour)"
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', fontSize: 13, height: 36 }}
              />
              <select
                value={newRuleCat}
                onChange={e => setNewRuleCat(e.target.value)}
                style={{ width: 130, fontSize: 13, height: 36, padding: '0 6px' }}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="submit" className="btn btn-primary btn-sm" style={{ height: 36, padding: '0 14px' }}>+</button>
            </form>

            {rules.length > 0 && (
              <ul className="transfer-list" style={{ fontSize: 13 }}>
                {rules.map(r => (
                  <li key={r.id}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{r.keyword}</span>
                    <span style={{ flex: 1, marginLeft: 8, color: '#555' }}>→ {r.category}</span>
                    <button
                      onClick={() => deleteRule(r.id)}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      </> }

    </div>
  )
}
