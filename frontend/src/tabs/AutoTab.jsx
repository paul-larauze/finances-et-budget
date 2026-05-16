import { useState, useEffect, useCallback } from 'react'
import { apiFetch, fmt, MOIS } from '../api/client.js'
import { Modal } from '../components/Modal.jsx'
import { useToast } from '../components/Toast.jsx'

const MOIS_OPTIONS = MOIS.slice(1).map((label, i) => ({ value: i + 1, label }))

const EMPTY_PREL = { libelle: '', banque: '', montant: '', mois_specifique: '' }
const EMPTY_VCJ = { libelle: '', banque: '', montant: '', mois_specifique: '' }
const EMPTY_VF = { libelle: '', banque: '', montant: '' }

/* ─── Reusable row ─── */
function ItemRow({ libelle, banque, montant, mois_specifique, onEdit, onDelete }) {
  const label = mois_specifique ? ` (${MOIS[mois_specifique]})` : ''
  return (
    <li className="row-edit">
      <div style={{ flex: 1 }}>
        <span className="transfer-name">{libelle}{label}</span>
        {banque && <span className="transfer-bank">{banque}</span>}
      </div>
      <span className={`transfer-amount ${montant >= 0 ? 'positive' : 'negative'}`}>
        {fmt(montant)}
      </span>
      <button className="btn btn-sm btn-outline" title="Modifier" onClick={onEdit}>✎</button>
      <button className="btn btn-sm btn-danger" title="Supprimer" onClick={onDelete}>✕</button>
    </li>
  )
}

/* ─── Generic edit modal ─── */
function EditModal({ open, onClose, title, form, onChange, onSave, hasMoisSpecifique }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="input-group">
        <input
          placeholder="Libellé"
          value={form.libelle}
          onChange={e => onChange('libelle', e.target.value)}
        />
      </div>
      <div className="input-group">
        <input
          placeholder="Banque"
          value={form.banque}
          onChange={e => onChange('banque', e.target.value)}
        />
      </div>
      <div className="input-group">
        <input
          type="number"
          placeholder="Montant"
          value={form.montant}
          onChange={e => onChange('montant', e.target.value)}
        />
        <span className="input-suffix">€</span>
      </div>
      {hasMoisSpecifique && (
        <div className="input-group">
          <select
            value={form.mois_specifique}
            onChange={e => onChange('mois_specifique', e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">Tous les mois</option>
            {MOIS_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSave}>Enregistrer</button>
      </div>
    </Modal>
  )
}

/* ─── Generic section ─── */
function Section({ title, items, onAdd, onEdit, onDelete, hasMoisSpecifique, modalOpen, modalTitle, modalForm, onModalChange, onModalSave, onModalClose }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="card-title">{title}</p>
      {items.length === 0 ? (
        <p style={{ color: '#888', fontSize: 14 }}>Aucun élément.</p>
      ) : (
        <ul className="transfer-list">
          {items.map((item, i) => (
            <ItemRow
              key={item.id ?? i}
              {...item}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </ul>
      )}
      <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={onAdd}>
        + Ajouter
      </button>
      <EditModal
        open={modalOpen}
        onClose={onModalClose}
        title={modalTitle}
        form={modalForm}
        onChange={onModalChange}
        onSave={onModalSave}
        hasMoisSpecifique={hasMoisSpecifique}
      />
    </div>
  )
}

/* ─── Hook for a CRUD section ─── */
function useCrudSection(endpoint, emptyForm, hasMoisSpecifique) {
  const showToast = useToast()
  const [items, setItems] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(endpoint)
      setItems(Array.isArray(data) ? data : [])
    } catch {
      showToast('Erreur de chargement', 'error')
    }
  }, [endpoint, showToast])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      libelle: item.libelle ?? '',
      banque: item.banque ?? '',
      montant: item.montant != null ? String(item.montant) : '',
      ...(hasMoisSpecifique ? { mois_specifique: item.mois_specifique ?? '' } : {}),
    })
    setModalOpen(true)
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.libelle.trim()) {
      showToast('Libellé requis', 'error')
      return
    }
    const body = {
      libelle: form.libelle.trim(),
      banque: form.banque.trim(),
      montant: parseFloat(form.montant) || 0,
      ...(hasMoisSpecifique ? { mois_specifique: form.mois_specifique ? parseInt(form.mois_specifique) : null } : {}),
    }
    try {
      if (editing) {
        await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, id: editing.id }),
        })
        showToast('Modifié !', 'success')
      } else {
        await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        showToast('Ajouté !', 'success')
      }
      setModalOpen(false)
      load()
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error')
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer "${item.libelle}" ?`)) return
    try {
      await apiFetch(`${endpoint}/${item.id}`, { method: 'DELETE' })
      showToast('Supprimé', 'success')
      load()
    } catch {
      showToast('Erreur lors de la suppression', 'error')
    }
  }

  return {
    items,
    modalOpen,
    form,
    openAdd,
    openEdit,
    handleChange,
    handleSave,
    handleDelete,
    closeModal: () => setModalOpen(false),
  }
}

/* ─── Main component ─── */
export function AutoTab() {
  const prel = useCrudSection('/api/prelevements', EMPTY_PREL, true)
  const vcj = useCrudSection('/api/virements-cj', EMPTY_VCJ, true)
  const vf = useCrudSection('/api/virements-fixes', EMPTY_VF, false)

  return (
    <div>
      <Section
        title="Prélèvements automatiques"
        items={prel.items}
        hasMoisSpecifique={true}
        onAdd={prel.openAdd}
        onEdit={prel.openEdit}
        onDelete={prel.handleDelete}
        modalOpen={prel.modalOpen}
        modalTitle={prel.form.id ? 'Modifier prélèvement' : 'Ajouter un prélèvement'}
        modalForm={prel.form}
        onModalChange={prel.handleChange}
        onModalSave={prel.handleSave}
        onModalClose={prel.closeModal}
      />
      <Section
        title="Virements comptes joints"
        items={vcj.items}
        hasMoisSpecifique={true}
        onAdd={vcj.openAdd}
        onEdit={vcj.openEdit}
        onDelete={vcj.handleDelete}
        modalOpen={vcj.modalOpen}
        modalTitle={vcj.form.id ? 'Modifier virement CJ' : 'Ajouter un virement CJ'}
        modalForm={vcj.form}
        onModalChange={vcj.handleChange}
        onModalSave={vcj.handleSave}
        onModalClose={vcj.closeModal}
      />
      <Section
        title="Virements fixes mensuels"
        items={vf.items}
        hasMoisSpecifique={false}
        onAdd={vf.openAdd}
        onEdit={vf.openEdit}
        onDelete={vf.handleDelete}
        modalOpen={vf.modalOpen}
        modalTitle={vf.form.id ? 'Modifier virement fixe' : 'Ajouter un virement fixe'}
        modalForm={vf.form}
        onModalChange={vf.handleChange}
        onModalSave={vf.handleSave}
        onModalClose={vf.closeModal}
      />
    </div>
  )
}
