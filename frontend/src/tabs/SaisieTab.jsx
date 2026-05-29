import { useState, useEffect, useCallback } from 'react'
import { apiFetch, fmt, MOIS } from '../api/client.js'
import { Modal } from '../components/Modal.jsx'
import { useToast } from '../components/Toast.jsx'

const PLACEMENTS_KEYS = ['pea', 'livret_a', 'cto', 'crypto']
const PLACEMENTS_LABELS = { pea: 'PEA', livret_a: 'Livret A', cto: 'CTO', crypto: 'Cryptos' }

const DEFAULT_REPARTITION = { pea: 0, livret_a: 0, cto: 0, crypto: 0, compte_courant: 100 }

export function SaisieTab({ annee, mois, onMonthChange, virementsFixesData, prelevementsData }) {
  const showToast = useToast()
  const [step, setStep] = useState(1)
  const [salaire, setSalaire] = useState('')
  const [repartition, setRepartition] = useState(DEFAULT_REPARTITION)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const totalPct = PLACEMENTS_KEYS.reduce((s, k) => s + (repartition[k] || 0), 0)

  // Virements fixes déduits du disponible (tous positifs, pas les prélèvements)
  const totalFixes = (virementsFixesData || []).reduce((s, v) => s + (v.montant || 0), 0)

  const compteCourant = parseFloat(repartition.compte_courant) || 0
  const aaPlacer = Math.max(0, (parseFloat(salaire) || 0) - totalFixes - compteCourant)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/monthly?annee=${annee}&mois=${mois}`)
      setSalaire(data.salaire != null ? String(data.salaire) : '')
      setRepartition({
        pea:            data.repartition?.pea            ?? 0,
        livret_a:       data.repartition?.livret_a       ?? 0,
        cto:            data.repartition?.cto            ?? 0,
        crypto:         data.repartition?.crypto         ?? 0,
        compte_courant: data.repartition?.compte_courant ?? 100,
      })
    } catch {
      setSalaire('')
      setRepartition(DEFAULT_REPARTITION)
    } finally {
      setLoading(false)
    }
  }, [annee, mois])

  useEffect(() => {
    load()
    setStep(1)
  }, [load])

  function goStep2() {
    const s = parseFloat(salaire)
    if (!s || s <= 0) {
      showToast('Veuillez saisir un salaire valide', 'error')
      return
    }
    setStep(2)
  }

  function goStep3() {
    if (totalPct !== 100) {
      showToast('La répartition doit totaliser 100 %', 'error')
      return
    }
    setStep(3)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await apiFetch('/api/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annee,
          mois,
          salaire: parseFloat(salaire),
          repartition,
        }),
      })
      showToast('Mois enregistré !', 'success')
      setStep(1)
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleSlider(key, val) {
    setRepartition(r => ({ ...r, [key]: Number(val) }))
  }

  // Compute virements list for step 3
  const virementsList = (() => {
    const list = []
    for (const v of (virementsFixesData || [])) {
      list.push({ libelle: v.libelle, banque: v.banque, montant: v.montant })
    }
    // Compte courant — montant mensuel variable
    if (compteCourant > 0) {
      list.push({ libelle: 'Compte courant', banque: '—', montant: compteCourant })
    }
    for (const key of PLACEMENTS_KEYS) {
      const pct = repartition[key] || 0
      if (pct > 0) {
        list.push({
          libelle: PLACEMENTS_LABELS[key],
          banque: '—',
          montant: Math.round(aaPlacer * pct / 100),
        })
      }
    }
    return list
  })()

  const prelevementsList = (prelevementsData || []).filter(p => {
    if (p.mois_specifique && p.mois_specifique !== mois) return false
    return true
  })

  return (
    <div className="card">
      {/* Month navigation */}
      <div className="month-nav">
        <button className="btn btn-outline btn-sm" onClick={() => { onMonthChange(-1); setStep(1) }}>‹</button>
        <span>{MOIS[mois]} {annee}</span>
        <button className="btn btn-outline btn-sm" onClick={() => { onMonthChange(1); setStep(1) }}>›</button>
      </div>

      {/* Step indicator */}
      <div className="steps">
        {[1, 2, 3].map(n => (
          <div
            key={n}
            className={`step${step === n ? ' active' : ''}${step > n ? ' done' : ''}`}
            onClick={() => step > n && setStep(n)}
          />
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#888' }}>Chargement…</p>}

      {/* Step 1 — Salaire */}
      {!loading && step === 1 && (
        <div>
          <p className="card-title">Étape 1 — Salaire du mois</p>
          <div className="input-group">
            <div className="input-suffix">
              <input
                type="number"
                min="0"
                step="10"
                placeholder="Salaire net"
                value={salaire}
                onChange={e => setSalaire(e.target.value)}
              />
              <span>€</span>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={goStep2}>
            Suivant →
          </button>
        </div>
      )}

      {/* Step 2 — Répartition */}
      {!loading && step === 2 && (
        <div>
          <p className="card-title">Étape 2 — Répartition des placements</p>
          <div className="alert alert-info" style={{ marginBottom: 12 }}>
            {fmt(parseFloat(salaire) || 0)} − {fmt(totalFixes)} fixes − {fmt(compteCourant)} CC = <strong>{fmt(aaPlacer)}</strong> à placer
          </div>

          {/* Compte courant — montant mensuel variable */}
          <div className="slider-row" style={{ marginBottom: 12 }}>
            <span className="slider-label">Compte courant</span>
            <div className="input-suffix" style={{ flex: 1 }}>
              <input
                type="number"
                min="0"
                step="10"
                value={repartition.compte_courant}
                onChange={e => setRepartition(r => ({ ...r, compte_courant: Number(e.target.value) }))}
                style={{ textAlign: 'right' }}
              />
              <span>€</span>
            </div>
          </div>

          {PLACEMENTS_KEYS.map(key => (
            <div className="slider-row" key={key}>
              <span className="slider-label">{PLACEMENTS_LABELS[key]}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={repartition[key]}
                onChange={e => handleSlider(key, e.target.value)}
              />
              <span className="slider-val">{repartition[key]} %</span>
            </div>
          ))}
          <div className={`slider-total ${totalPct === 100 ? 'ok' : 'err'}`}>
            Total : {totalPct} %{totalPct === 100 ? ' ✓' : ' (doit être 100 %)'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep(1)}>← Retour</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={goStep3}>
              Voir les virements →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Virements */}
      {!loading && step === 3 && (
        <div>
          <p className="card-title">Étape 3 — Virements à effectuer</p>
          <ul className="transfer-list">
            {virementsList.map((v, i) => (
              <li key={i}>
                <span className="transfer-name">{v.libelle}</span>
                <span className="transfer-bank">{v.banque}</span>
                <span className={`transfer-amount ${v.montant >= 0 ? 'positive' : 'negative'}`}>
                  {fmt(v.montant)}
                </span>
              </li>
            ))}
          </ul>

          {prelevementsList.length > 0 && (
            <>
              <p className="card-title" style={{ marginTop: 16 }}>Prélèvements du mois</p>
              <ul className="transfer-list">
                {prelevementsList.map((p, i) => (
                  <li key={i}>
                    <span className="transfer-name">{p.libelle}</span>
                    <span className="transfer-bank">{p.banque || '—'}</span>
                    <span className="transfer-amount negative">{fmt(p.montant)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep(2)}>← Retour</button>
            <button
              className="btn btn-success"
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : '✓ Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
