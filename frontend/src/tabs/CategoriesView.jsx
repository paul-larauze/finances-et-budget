import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'

function SubcategoryRow({ sub, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(sub.nom)

  const save = async () => {
    if (!val.trim() || val === sub.nom) { setEditing(false); return }
    await onRename(sub.id, val.trim())
    setEditing(false)
  }

  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0 7px 16px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', flexShrink: 0 }} />
      {editing ? (
        <>
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            autoFocus
            style={{ flex: 1, fontSize: 14, padding: '4px 8px', height: 30 }}
          />
          <button className="btn-sm btn-primary" onClick={save} style={{ padding: '4px 10px' }}>✓</button>
          <button className="btn-sm btn-outline" onClick={() => { setEditing(false); setVal(sub.nom) }} style={{ padding: '4px 8px' }}>✕</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 14 }}>{sub.nom}</span>
          <button
            className="btn-sm btn-outline"
            onClick={() => setEditing(true)}
            style={{ fontSize: 11, padding: '3px 8px' }}
          >Renommer</button>
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

function CategoryCard({ cat, onRenameParent, onDeleteParent, onAddSub, onRenameSub, onDeleteSub }) {
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
              onRename={onRenameSub}
              onDelete={onDeleteSub}
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
          onRenameParent={renameCategory}
          onDeleteParent={deleteParent}
          onAddSub={addSub}
          onRenameSub={renameCategory}
          onDeleteSub={deleteSub}
        />
      ))}

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
