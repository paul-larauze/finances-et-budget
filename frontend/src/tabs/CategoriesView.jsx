import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'

function SubcategoryRow({ sub, currentParentId, allParents, onRename, onDelete, onMove }) {
  const [mode, setMode] = useState(null) // null | 'rename' | 'move'
  const [val, setVal] = useState(sub.nom)
  const [targetParent, setTargetParent] = useState('')

  const save = async () => {
    if (!val.trim() || val === sub.nom) { setMode(null); return }
    await onRename(sub.id, val.trim())
    setMode(null)
  }

  const confirmMove = async () => {
    if (!targetParent) return
    await onMove(sub.id, parseInt(targetParent))
    setMode(null)
    setTargetParent('')
  }

  const otherParents = allParents.filter(p => p.id !== currentParentId)

  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0 7px 16px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', flexShrink: 0 }} />
      {mode === 'rename' ? (
        <>
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setMode(null) }}
            autoFocus
            style={{ flex: 1, fontSize: 14, padding: '4px 8px', height: 30 }}
          />
          <button className="btn-sm btn-primary" onClick={save} style={{ padding: '4px 10px' }}>✓</button>
          <button className="btn-sm btn-outline" onClick={() => { setMode(null); setVal(sub.nom) }} style={{ padding: '4px 8px' }}>✕</button>
        </>
      ) : mode === 'move' ? (
        <>
          <select
            value={targetParent}
            onChange={e => setTargetParent(e.target.value)}
            autoFocus
            style={{ flex: 1, fontSize: 13, padding: '4px 8px', height: 30 }}
          >
            <option value="">— Choisir une catégorie —</option>
            {otherParents.map(p => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>
          <button className="btn-sm btn-primary" onClick={confirmMove} disabled={!targetParent} style={{ padding: '4px 10px' }}>✓</button>
          <button className="btn-sm btn-outline" onClick={() => { setMode(null); setTargetParent('') }} style={{ padding: '4px 8px' }}>✕</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 14 }}>{sub.nom}</span>
          <button
            className="btn-sm btn-outline"
            onClick={() => setMode('rename')}
            style={{ fontSize: 11, padding: '3px 8px' }}
          >Renommer</button>
          <button
            className="btn-sm btn-outline"
            onClick={() => setMode('move')}
            style={{ fontSize: 11, padding: '3px 8px' }}
            title="Déplacer vers une autre catégorie"
          >⇄</button>
          <button
            className="btn-sm btn-danger"
            onClick={() => onDelete(sub.id, sub.nom)}
            style={{ fontSize: 11, padding: '3px 8px' }}
          >✕</button>
        </>
      )}
    </li>
  )
}

function CategoryCard({ cat, allParents, onRenameParent, onDeleteParent, onAddSub, onRenameSub, onDeleteSub, onMoveSub }) {
  const [editing, setEditing] = useState(false)
  const [parentVal, setParentVal] = useState(cat.nom)
  const [showAddSub, setShowAddSub] = useState(false)
  const [newSubName, setNewSubName] = useState('')

  const saveParent = async () => {
    if (!parentVal.trim() || parentVal === cat.nom) { setEditing(false); return }
    await onRenameParent(cat.id, parentVal.trim())
    setEditing(false)
  }

  const submitSub = async (e) => {
    e.preventDefault()
    if (!newSubName.trim()) return
    await onAddSub(cat.id, newSubName.trim())
    setNewSubName('')
    setShowAddSub(false)
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Parent header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#f8fafc' }}>
        {editing ? (
          <>
            <input
              value={parentVal}
              onChange={e => setParentVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveParent(); if (e.key === 'Escape') { setEditing(false); setParentVal(cat.nom) } }}
              autoFocus
              style={{ flex: 1, fontSize: 15, fontWeight: 700, padding: '4px 8px', height: 32 }}
            />
            <button className="btn-sm btn-primary" onClick={saveParent} style={{ padding: '4px 10px' }}>✓</button>
            <button className="btn-sm btn-outline" onClick={() => { setEditing(false); setParentVal(cat.nom) }} style={{ padding: '4px 8px' }}>✕</button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{cat.nom}</span>
            <button className="btn-sm btn-outline" onClick={() => setEditing(true)} style={{ fontSize: 11 }}>Renommer</button>
            <button className="btn-sm btn-danger" onClick={() => onDeleteParent(cat.id, cat.nom)} style={{ fontSize: 11 }}>✕</button>
          </>
        )}
      </div>

      {/* Subcategories */}
      {cat.subcategories.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {cat.subcategories.map(sub => (
            <SubcategoryRow
              key={sub.id}
              sub={sub}
              currentParentId={cat.id}
              allParents={allParents}
              onRename={onRenameSub}
              onDelete={onDeleteSub}
              onMove={onMoveSub}
            />
          ))}
        </ul>
      )}

      {cat.subcategories.length === 0 && !showAddSub && (
        <p style={{ padding: '8px 16px', fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Aucune sous-catégorie
        </p>
      )}

      {/* Add subcategory */}
      <div style={{ padding: '8px 14px', borderTop: cat.subcategories.length > 0 ? '1px solid var(--border)' : 'none' }}>
        {showAddSub ? (
          <form onSubmit={submitSub} style={{ display: 'flex', gap: 6 }}>
            <input
              value={newSubName}
              onChange={e => setNewSubName(e.target.value)}
              placeholder="Nom de la sous-catégorie"
              autoFocus
              style={{ flex: 1, fontSize: 13, padding: '6px 10px', height: 32 }}
            />
            <button type="submit" className="btn-sm btn-primary" style={{ padding: '0 12px', height: 32 }}>Ajouter</button>
            <button type="button" className="btn-sm btn-outline" onClick={() => { setShowAddSub(false); setNewSubName('') }} style={{ height: 32 }}>✕</button>
          </form>
        ) : (
          <button
            className="btn-sm btn-outline"
            onClick={() => setShowAddSub(true)}
            style={{ fontSize: 12, color: 'var(--primary)', borderColor: 'var(--primary)' }}
          >
            + Sous-catégorie
          </button>
        )}
      </div>
    </div>
  )
}

function MigrationPanel({ categories, toast }) {
  const [orphans, setOrphans] = useState(null)
  const [mappings, setMappings] = useState({}) // {oldVal: newVal}
  const [applying, setApplying] = useState(false)
  const [open, setOpen] = useState(false)

  // Flatten valid category names for the dropdown
  const validNames = []
  for (const cat of categories) {
    if (cat.subcategories.length === 0) {
      validNames.push(cat.nom)
    } else {
      for (const sub of cat.subcategories) validNames.push(sub.nom)
    }
  }

  const load = async () => {
    try {
      const data = await apiFetch('/api/categories/orphans')
      setOrphans(data.orphans)
      // Init mappings: keep existing selections, add empty for new orphans
      setMappings(prev => {
        const next = {}
        for (const o of data.orphans) next[o.value] = prev[o.value] || ''
        return next
      })
    } catch {
      toast('Erreur de chargement', 'error')
    }
  }

  const toggle = async () => {
    if (!open) await load()
    setOpen(v => !v)
  }

  const apply = async () => {
    const entries = Object.entries(mappings).filter(([, v]) => v)
    if (!entries.length) { toast('Aucun remapping sélectionné', 'error'); return }
    setApplying(true)
    try {
      const res = await apiFetch('/api/categories/remap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: entries.map(([old, newv]) => ({ old, new: newv })) }),
      })
      toast(`Remapping appliqué — ${res.updated} ligne(s) mises à jour`, 'success')
      await load() // refresh orphans
    } catch {
      toast('Erreur lors du remapping', 'error')
    } finally {
      setApplying(false)
    }
  }

  const pendingCount = Object.values(mappings).filter(Boolean).length

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '12px 14px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          Remapper les catégories existantes
          {orphans && orphans.length > 0 && (
            <span style={{
              marginLeft: 8, background: 'var(--primary)', color: '#fff',
              borderRadius: 10, padding: '2px 7px', fontSize: 11, fontWeight: 700,
            }}>{orphans.length}</span>
          )}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
          {orphans === null ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>
          ) : orphans.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Toutes les catégories sont déjà alignées. Rien à remapper.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0, marginBottom: 12 }}>
                Ces catégories présentes dans vos transactions ne correspondent à aucune sous-catégorie actuelle.
                Choisissez une cible pour chacune.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {orphans.map(o => (
                  <div key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      flex: '0 0 180px', fontSize: 13, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={o.value}>
                      {o.value}
                      <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>
                        ({o.count})
                      </span>
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>→</span>
                    <select
                      value={mappings[o.value] || ''}
                      onChange={e => setMappings(prev => ({ ...prev, [o.value]: e.target.value }))}
                      style={{ flex: 1, fontSize: 13, padding: '5px 8px', height: 34 }}
                    >
                      <option value="">— Ignorer —</option>
                      {categories.map(cat => (
                        cat.subcategories.length > 0
                          ? <optgroup key={cat.id} label={cat.nom}>
                              {cat.subcategories.map(sub => (
                                <option key={sub.id} value={sub.nom}>{sub.nom}</option>
                              ))}
                            </optgroup>
                          : <option key={cat.id} value={cat.nom}>{cat.nom}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-primary"
                onClick={apply}
                disabled={applying || pendingCount === 0}
                style={{ fontSize: 13 }}
              >
                {applying ? 'Application…' : `Appliquer le remapping (${pendingCount} sélectionné${pendingCount > 1 ? 's' : ''})`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function CategoriesView() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddParent, setShowAddParent] = useState(false)
  const [newParentName, setNewParentName] = useState('')
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCategories(await apiFetch('/api/categories'))
    } catch {
      toast('Erreur de chargement', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addParent = async (e) => {
    e.preventDefault()
    if (!newParentName.trim()) return
    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: newParentName.trim(), parent_id: null }),
      })
      setNewParentName('')
      setShowAddParent(false)
      load()
      toast('Catégorie ajoutée', 'success')
    } catch {
      toast('Erreur', 'error')
    }
  }

  const addSub = async (parentId, nom) => {
    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, parent_id: parentId }),
      })
      load()
      toast('Sous-catégorie ajoutée', 'success')
    } catch {
      toast('Erreur', 'error')
    }
  }

  const renameCategory = async (id, nom) => {
    try {
      await apiFetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom }),
      })
      load()
      toast('Renommé', 'success')
    } catch {
      toast('Erreur', 'error')
    }
  }

  const deleteParent = async (id, nom) => {
    const cat = categories.find(c => c.id === id)
    const hasSubs = cat?.subcategories?.length > 0
    const msg = hasSubs
      ? `Supprimer "${nom}" et ses ${cat.subcategories.length} sous-catégorie(s) ?`
      : `Supprimer la catégorie "${nom}" ?`
    if (!window.confirm(msg)) return
    try {
      await apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
      load()
      toast('Catégorie supprimée', 'success')
    } catch {
      toast('Erreur', 'error')
    }
  }

  const moveSub = async (id, newParentId) => {
    try {
      await apiFetch(`/api/categories/${id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: newParentId }),
      })
      load()
      toast('Sous-catégorie déplacée', 'success')
    } catch {
      toast('Erreur', 'error')
    }
  }

  const deleteSub = async (id, nom) => {
    if (!window.confirm(`Supprimer la sous-catégorie "${nom}" ?`)) return
    try {
      await apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
      load()
      toast('Sous-catégorie supprimée', 'success')
    } catch {
      toast('Erreur', 'error')
    }
  }

  if (loading) return <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Chargement…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <p className="card-title" style={{ marginBottom: 6 }}>Catégories & sous-catégories</p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Organisez vos dépenses en catégories et sous-catégories. Les transactions existantes sont mises à jour automatiquement lors d'un renommage.
        </p>
      </div>

      {categories.map(cat => (
        <CategoryCard
          key={cat.id}
          cat={cat}
          allParents={categories}
          onRenameParent={renameCategory}
          onDeleteParent={deleteParent}
          onAddSub={addSub}
          onRenameSub={renameCategory}
          onDeleteSub={deleteSub}
          onMoveSub={moveSub}
        />
      ))}

      <MigrationPanel categories={categories} toast={toast} />

      {/* Add parent category */}
      <div className="card">
        {showAddParent ? (
          <form onSubmit={addParent} style={{ display: 'flex', gap: 8 }}>
            <input
              value={newParentName}
              onChange={e => setNewParentName(e.target.value)}
              placeholder="Nom de la catégorie"
              autoFocus
              style={{ flex: 1, fontSize: 14, padding: '8px 12px' }}
            />
            <button type="submit" className="btn-sm btn-primary" style={{ padding: '0 16px', height: 38 }}>Ajouter</button>
            <button type="button" className="btn-sm btn-outline" onClick={() => { setShowAddParent(false); setNewParentName('') }} style={{ height: 38 }}>✕</button>
          </form>
        ) : (
          <button
            className="btn btn-outline"
            onClick={() => setShowAddParent(true)}
            style={{ color: 'var(--primary)', borderColor: 'var(--primary)', fontWeight: 600 }}
          >
            + Ajouter une catégorie
          </button>
        )}
      </div>
    </div>
  )
}
