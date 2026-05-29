import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch, fmt, MOIS, useLocalStorage } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'
import { RapportDepensesView } from './RapportDepensesView.jsx'
import { CategoriesView } from './CategoriesView.jsx'

// Returns a flat list of selectable category names from the hierarchy
function flatCategoryNames(categories) {
  return categories.flatMap(cat =>
    cat.subcategories.length > 0
      ? cat.subcategories.map(s => s.nom)
      : [cat.nom]
  )
}

// <select> with optgroups for hierarchical categories
function CategorySelect({ categories, value, onChange, style }) {
  return (
    <select value={value} onChange={onChange} style={style}>
      {categories.map(cat =>
        cat.subcategories.length === 0
          ? <option key={cat.id} value={cat.nom}>{cat.nom}</option>
          : <optgroup key={cat.id} label={cat.nom}>
              {cat.subcategories.map(sub =>
                <option key={sub.id} value={sub.nom}>{sub.nom}</option>
              )}
            </optgroup>
      )}
    </select>
  )
}

function AccountTabsBar({ accountType, onSwitch, onTabsChange }) {
  const showToast = useToast()
  const [tabs, setTabs] = useState([])
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTabs = useCallback(async () => {
    try {
      const data = await apiFetch('/api/account-tabs')
      setTabs(data)
      if (onTabsChange) onTabsChange(data)
    } catch {
      showToast('Erreur chargement des onglets', 'error')
    }
  }, [])

  useEffect(() => { loadTabs() }, [loadTabs])

  const addTab = async (e) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setSaving(true)
    try {
      await apiFetch('/api/account-tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      setNewLabel('')
      setAdding(false)
      await loadTabs()
      showToast('Onglet ajouté', 'success')
    } catch (err) {
      showToast(err?.message || 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteTab = async (tab) => {
    if (!window.confirm(`Supprimer l'onglet "${tab.label}" ?`)) return
    try {
      await apiFetch(`/api/account-tabs/${tab.id}`, { method: 'DELETE' })
      const remaining = tabs.filter(t => t.id !== tab.id)
      setTabs(remaining)
      if (onTabsChange) onTabsChange(remaining)
      if (accountType === tab.account_type && remaining.length > 0) {
        onSwitch(remaining[0].account_type)
      }
      showToast('Onglet supprimé', 'success')
    } catch (err) {
      // Server returns error message when transactions exist
      showToast(err?.message || 'Impossible de supprimer cet onglet', 'error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', background: 'white', borderRadius: 12, padding: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', gap: 4, flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 4,
              borderRadius: 8, padding: '0 4px 0 0',
              background: accountType === tab.account_type ? 'var(--primary)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <button
              onClick={() => onSwitch(tab.account_type)}
              style={{
                flex: 1, padding: '10px 8px', border: 'none', background: 'transparent',
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
                color: accountType === tab.account_type ? 'white' : 'var(--muted)',
              }}
            >
              {tab.label}
            </button>
            {tabs.length > 1 && (
              <button
                onClick={() => deleteTab(tab)}
                title="Supprimer cet onglet"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1,
                  color: accountType === tab.account_type ? 'rgba(255,255,255,0.7)' : '#cbd5e1',
                  padding: '2px 2px',
                }}
              >✕</button>
            )}
          </div>
        ))}

        {/* Add button */}
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              padding: '10px 10px', border: 'none', background: 'transparent',
              color: 'var(--primary)', fontWeight: 700, fontSize: 16, cursor: 'pointer', borderRadius: 8,
            }}
            title="Ajouter un onglet"
          >+</button>
        )}
      </div>

      {adding && (
        <form onSubmit={addTab} style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Nom du compte (ex: Livret A)"
            style={{ flex: 1, fontSize: 13, padding: '8px 10px', height: 36 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" style={{ height: 36, padding: '0 14px' }} disabled={saving}>
            {saving ? '…' : 'Ajouter'}
          </button>
          <button type="button" className="btn btn-outline btn-sm" style={{ height: 36 }} onClick={() => { setAdding(false); setNewLabel('') }}>✕</button>
        </form>
      )}
    </div>
  )
}

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
  const [accountType, setAccountType] = useLocalStorage('depenses.accountType', 'perso')
  const [view, setView] = useLocalStorage('depenses.view', 'mouvements')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [editingCat, setEditingCat] = useState(null)
  const [editCatVal, setEditCatVal] = useState('')
  const [labelFilter, setLabelFilter]     = useState('')
  const [parentFilter, setParentFilter]   = useState('')
  const [catFilter, setCatFilter]         = useState('')
  const [amountFilter, setAmountFilter]   = useState('')
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
      const flat = flatCategoryNames(cats)
      if (flat.length > 0 && !newRuleCat) setNewRuleCat(flat[0])
    } catch {}
  }, [])

  useEffect(() => { loadTransactions() }, [loadTransactions])
  useEffect(() => { loadMeta() }, [loadMeta])

  function resetFilters() {
    setLabelFilter('')
    setParentFilter('')
    setCatFilter('')
    setAmountFilter('')
  }

  function switchAccount(id) {
    setAccountType(id)
    resetFilters()
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
    resetFilters()
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
    const flat = flatCategoryNames(categories)
    setEditCatVal(t.my_category || flat[0] || '')
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

  // Map subcategory name → parent name
  const subToParent = {}
  for (const cat of categories) {
    for (const sub of cat.subcategories) subToParent[sub.nom] = cat.nom
  }

  const hasFilters = labelFilter || parentFilter || catFilter || amountFilter

  const filtered = transactions.filter(t => {
    if (labelFilter && !shortLabel(t.label).toLowerCase().includes(labelFilter.toLowerCase())) return false
    if (parentFilter) {
      const parent = subToParent[t.my_category] || (categories.find(c => c.nom === t.my_category) ? t.my_category : null)
      if (parent !== parentFilter) return false
    }
    if (catFilter && t.my_category !== catFilter) return false
    if (amountFilter) {
      const needle = amountFilter.replace(',', '.').replace(/\s/g, '')
      const absStr = String(Math.abs(t.amount))
      if (!absStr.startsWith(needle)) return false
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Account tabs */}
      <AccountTabsBar
        accountType={accountType}
        onSwitch={switchAccount}
      />

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { id: 'mouvements', label: '≡ Mouvements' },
          { id: 'rapport', label: '📊 Rapport' },
          { id: 'categories', label: '🏷 Catégories' },
        ].map(({ id, label }) => (
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
      {view === 'categories' && <CategoriesView />}

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
          {importing ? 'Import en cours…' : '↑ Importer un CSV de relevés de comptes'}
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
                  <li key={cat} onClick={() => { setCatFilter(catFilter === cat ? '' : cat); setParentFilter('') }}
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
          {hasFilters && (
            <button className="btn-sm btn-outline" onClick={resetFilters} style={{ fontSize: 11 }}>
              Réinitialiser ✕
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {/* Libellé */}
          <div className="input-suffix">
            <input
              type="text"
              placeholder="🔍 Rechercher un libellé…"
              value={labelFilter}
              onChange={e => setLabelFilter(e.target.value)}
              style={{ fontSize: 13, padding: '7px 32px 7px 10px' }}
            />
            {labelFilter && <span style={{ cursor: 'pointer', color: '#888' }} onClick={() => setLabelFilter('')}>✕</span>}
          </div>

          {/* Catégorie + Sous-catégorie */}
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={parentFilter}
              onChange={e => { setParentFilter(e.target.value); setCatFilter('') }}
              style={{ flex: 1, fontSize: 13, padding: '7px 8px', height: 36, borderRadius: 8, border: '1px solid var(--border)' }}
            >
              <option value="">Toutes catégories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.nom}>{cat.nom}</option>
              ))}
            </select>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              style={{ flex: 1, fontSize: 13, padding: '7px 8px', height: 36, borderRadius: 8, border: '1px solid var(--border)' }}
            >
              <option value="">Toutes sous-catégories</option>
              {categories
                .filter(cat => !parentFilter || cat.nom === parentFilter)
                .flatMap(cat => cat.subcategories.length > 0 ? cat.subcategories : [{ id: cat.id, nom: cat.nom }])
                .map(sub => <option key={sub.id} value={sub.nom}>{sub.nom}</option>)
              }
            </select>
          </div>

          {/* Montant */}
          <div className="input-suffix">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Filtrer par montant…"
              value={amountFilter}
              onChange={e => setAmountFilter(e.target.value)}
              style={{ fontSize: 13, padding: '7px 32px 7px 10px' }}
            />
            {amountFilter && <span style={{ cursor: 'pointer', color: '#888' }} onClick={() => setAmountFilter('')}>✕</span>}
          </div>
        </div>

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
                      <CategorySelect
                        categories={categories}
                        value={editCatVal}
                        onChange={e => setEditCatVal(e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', width: 'auto', height: 26, borderRadius: 6 }}
                      />
                      <button onClick={() => saveCat(t)} className="cat-chip active" style={{ padding: '2px 8px' }}>✓</button>
                      <button onClick={() => setEditingCat(null)} className="cat-chip" style={{ padding: '2px 8px' }}>✕</button>
                    </>
                  ) : (
                    <span
                      className={`cat-badge${t.my_category ? '' : ' cat-badge-empty'}`}
                      onClick={() => startEditCat(t)}
                      style={t.my_category ? (
                        t.amount >= 0
                          ? { background: '#f0fdf4', color: 'var(--success)', borderColor: '#bbf7d0' }
                          : { background: '#fef2f2', color: 'var(--danger)',  borderColor: '#fecaca' }
                      ) : {}}
                    >
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
              <CategorySelect
                categories={categories}
                value={newRuleCat}
                onChange={e => setNewRuleCat(e.target.value)}
                style={{ width: 130, fontSize: 13, height: 36, padding: '0 6px' }}
              />
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
