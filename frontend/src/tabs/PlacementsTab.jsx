import { useState, useEffect, useCallback } from 'react'
import { apiFetch, fmt, MOIS } from '../api/client.js'
import { Modal } from '../components/Modal.jsx'
import { useToast } from '../components/Toast.jsx'

const CATEGORIES = ['livrets', 'bourse']
const CAT_LABELS = { livrets: 'Livrets', bourse: 'Bourse & Épargne' }

export function PlacementsTab() {
  const showToast = useToast()
  const now = new Date()
  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois] = useState(now.getMonth() + 1)

  // supports list: [{ id, nom, categorie }]
  const [supports, setSupports] = useState([])
  // values for current month: { [support_nom]: montant }
  const [values, setValues] = useState({})
  // previous month values: { [support_nom]: montant }
  const [prevValues, setPrevValues] = useState({})

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  // Modal state
  const [addModal, setAddModal] = useState(false)
  const [addCategory, setAddCategory] = useState('livrets')
  const [newSupportName, setNewSupportName] = useState('')

  /* ─── Load supports ─── */
  const loadSupports = useCallback(async () => {
    try {
      const data = await apiFetch('/api/supports')
      setSupports(Array.isArray(data) ? data : [])
    } catch {
      showToast('Erreur de chargement des supports', 'error')
    }
  }, [showToast])

  /* ─── Load placements for current and previous month ─── */
  const loadPlacements = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/placements?annee=${annee}&mois=${mois}`)
      const all = [...(data.livrets || []), ...(data.bourse || [])]
      const map = {}
      const prevMap = {}
      for (const p of all) {
        map[p.support] = p.montant
        if (p.prev) prevMap[p.support] = p.prev
      }
      setValues(map)
      setPrevValues(prevMap)
    } catch {
      setValues({})
      setPrevValues({})
    } finally {
      setLoading(false)
    }
  }, [annee, mois])

  useEffect(() => { loadSupports() }, [loadSupports])
  useEffect(() => { loadPlacements() }, [loadPlacements])

  function handleMonthChange(delta) {
    let m = mois + delta
    let a = annee
    if (m > 12) { m = 1; a += 1 }
    if (m < 1) { m = 12; a -= 1 }
    setMois(m)
    setAnnee(a)
  }

  function handleValueChange(nom, val) {
    setValues(v => ({ ...v, [nom]: val === '' ? '' : parseFloat(val) }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const placements = supports.map(s => ({
        support: s.nom,
        categorie: s.categorie,
        montant: parseFloat(values[s.nom]) || 0,
      }))
      await apiFetch('/api/placements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annee, mois, placements }),
      })
      showToast('Placements enregistrés !', 'success')
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSupport(support) {
    if (!window.confirm(`Supprimer le support "${support.nom}" ?`)) return
    try {
      await apiFetch(`/api/supports/${support.id}`, { method: 'DELETE' })
      showToast('Support supprimé', 'success')
      loadSupports()
    } catch {
      showToast('Erreur lors de la suppression', 'error')
    }
  }

  async function handleAddSupport() {
    if (!newSupportName.trim()) {
      showToast('Nom requis', 'error')
      return
    }
    try {
      await apiFetch('/api/supports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: newSupportName.trim(), categorie: addCategory }),
      })
      showToast('Support ajouté', 'success')
      setAddModal(false)
      setNewSupportName('')
      loadSupports()
    } catch {
      showToast('Erreur lors de l\'ajout', 'error')
    }
  }

  function openAddModal(cat) {
    setAddCategory(cat)
    setNewSupportName('')
    setAddModal(true)
  }

  /* ─── Totals ─── */
  const totalLivrets = supports
    .filter(s => s.categorie === 'livrets')
    .reduce((sum, s) => sum + (parseFloat(values[s.nom]) || 0), 0)

  const totalBourse = supports
    .filter(s => s.categorie === 'bourse')
    .reduce((sum, s) => sum + (parseFloat(values[s.nom]) || 0), 0)

  const totalPatrimoine = totalLivrets + totalBourse

  return (
    <div>
      {/* Month navigation */}
      <div className="card">
        <div className="month-nav">
          <button className="btn btn-outline btn-sm" onClick={() => handleMonthChange(-1)}>‹</button>
          <span>{MOIS[mois]} {annee}</span>
          <button className="btn btn-outline btn-sm" onClick={() => handleMonthChange(1)}>›</button>
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#888' }}>Chargement…</p>}

      {!loading && CATEGORIES.map(cat => {
        const catSupports = supports.filter(s => s.categorie === cat)
        return (
          <div className="card" key={cat} style={{ marginBottom: 16 }}>
            <p className="card-title">{CAT_LABELS[cat]}</p>
            {catSupports.length === 0 ? (
              <p style={{ color: '#888', fontSize: 14 }}>Aucun support.</p>
            ) : (
              catSupports.map(s => (
                <div className="placement-row" key={s.id}>
                  <span className="placement-name">{s.nom}</span>
                  <span className="placement-prev">{fmt(prevValues[s.nom] ?? null)}</span>
                  <div className="input-group placement-input">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={values[s.nom] ?? ''}
                      onChange={e => handleValueChange(s.nom, e.target.value)}
                    />
                    <span className="input-suffix">€</span>
                  </div>
                  <button
                    className="btn btn-sm btn-danger"
                    title="Supprimer le support"
                    onClick={() => handleDeleteSupport(s)}
                  >✕</button>
                </div>
              ))
            )}
            <button
              className="btn btn-outline btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => openAddModal(cat)}
            >
              + Ajouter
            </button>
          </div>
        )
      })}

      {/* Totals */}
      {!loading && (
        <div className="card">
          <div className="summary-grid">
            <div className="summary-card green">
              <div className="card-title">Livrets</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(totalLivrets)}</div>
            </div>
            <div className="summary-card blue">
              <div className="card-title">Bourse</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(totalBourse)}</div>
            </div>
            <div className="summary-card orange" style={{ gridColumn: '1 / -1' }}>
              <div className="card-title">Total patrimoine</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(totalPatrimoine)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Save button */}
      {!loading && (
        <div style={{ padding: '0 0 24px' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer les placements'}
          </button>
        </div>
      )}

      {/* Add support modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title={`Ajouter un support — ${CAT_LABELS[addCategory]}`}
      >
        <div className="input-group">
          <input
            placeholder="Nom du support"
            value={newSupportName}
            onChange={e => setNewSupportName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSupport()}
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setAddModal(false)}>Annuler</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddSupport}>Ajouter</button>
        </div>
      </Modal>
    </div>
  )
}
