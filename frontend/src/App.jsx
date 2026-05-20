import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { ToastContainer, useToast } from './components/Toast'
import { DepensesTab } from './tabs/DepensesTab'
import { EpargneTab } from './tabs/EpargneTab'
import { VirementsTab } from './tabs/VirementsTab'
import { apiFetch } from './api/client'

// ── LOGIN ──────────────────────────────────────────────────────────────────────

function LoginPage({ onLogin, onNeedRegister }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      onLogin({ username: data.username, is_admin: data.is_admin })
    } catch {
      setError('Identifiants incorrects')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <h1>Finances & Budget</h1>
          <p>Gestion financière personnelle</p>
        </div>
        <form onSubmit={submit}>
          {error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="input-group">
            <label>Nom d'utilisateur</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="votre_nom"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="input-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        {onNeedRegister && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
            Vous avez un lien d'invitation ?{' '}
            <button
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0 }}
              onClick={onNeedRegister}
            >
              Créer un compte
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

// ── REGISTER ───────────────────────────────────────────────────────────────────

function RegisterPage({ token, isFirstUser, onLogin, onBack }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return }
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, token }),
      })
      onLogin({ username: data.username, is_admin: data.is_admin })
    } catch {
      setError('Erreur lors de la création du compte. Le nom d\'utilisateur est peut-être déjà pris.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <h1>Finances & Budget</h1>
          <p>{isFirstUser ? 'Créer le compte administrateur' : 'Créer votre compte'}</p>
        </div>
        {isFirstUser && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            Aucun compte n'existe encore. Ce premier compte sera administrateur.
          </div>
        )}
        <form onSubmit={submit}>
          {error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="input-group">
            <label>Nom d'utilisateur</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="votre_nom"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="input-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <div className="input-group">
            <label>Confirmer le mot de passe</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
        {onBack && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
            <button
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}
              onClick={onBack}
            >
              ← Retour à la connexion
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

// ── ADMIN PANEL ────────────────────────────────────────────────────────────────

function AdminPanel({ onClose, currentUsername }) {
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [adminTab, setAdminTab] = useState('users')
  const [generatedLink, setGeneratedLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  useEffect(() => {
    loadUsers()
    loadInvites()
  }, [])

  const loadUsers = () => apiFetch('/api/auth/users').then(setUsers).catch(() => {})
  const loadInvites = () => apiFetch('/api/auth/invites').then(setInvites).catch(() => {})

  const generateInvite = async () => {
    try {
      const data = await apiFetch('/api/auth/invite', { method: 'POST' })
      const link = `${window.location.origin}/?token=${data.token}`
      setGeneratedLink(link)
      loadInvites()
      // Clipboard API requires HTTPS — fallback to showing the link manually
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
        toast('Lien copié dans le presse-papier !', 'success')
      } else {
        toast('Lien généré — copiez-le ci-dessous', 'success')
      }
    } catch {
      toast('Erreur lors de la génération du lien', 'error')
    }
  }

  const deleteUser = async (uid, username) => {
    if (!window.confirm(`Supprimer l'utilisateur "${username}" et toutes ses données ?`)) return
    try {
      await apiFetch(`/api/auth/users/${uid}`, { method: 'DELETE' })
      loadUsers()
      toast(`Utilisateur "${username}" supprimé`, 'success')
    } catch {
      toast('Erreur lors de la suppression', 'error')
    }
  }

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Administration</span>
          <button className="btn-sm btn-outline" onClick={onClose}>Fermer</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={`btn-sm ${adminTab === 'users' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setAdminTab('users')}
          >Utilisateurs</button>
          <button
            className={`btn-sm ${adminTab === 'invites' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setAdminTab('invites')}
          >Invitations</button>
        </div>

        {adminTab === 'users' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <button className="btn-sm btn-success" onClick={generateInvite}>
                {copied ? '✓ Lien copié !' : '+ Générer un lien d\'invitation'}
              </button>
              {generatedLink && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Lien d'invitation :</div>
                  <input
                    readOnly
                    value={generatedLink}
                    onFocus={e => e.target.select()}
                    style={{ width: '100%', fontSize: 11, padding: '4px 6px', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>
                    {u.username}
                    {u.is_admin ? <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: 4 }}>admin</span> : null}
                    {u.username === currentUsername ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>(vous)</span> : null}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(u.created_at)}</span>
                  {u.username !== currentUsername && (
                    <button className="btn-sm btn-danger" onClick={() => deleteUser(u.id, u.username)}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {adminTab === 'invites' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {invites.length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Aucune invitation générée</p>
            )}
            {invites.map(inv => (
              <div key={inv.token} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <code style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.token.slice(0, 8)}…</code>
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    background: inv.used_at ? '#f0fdf4' : inv.expired ? '#fef2f2' : '#fffbeb',
                    color: inv.used_at ? 'var(--success)' : inv.expired ? 'var(--danger)' : '#92400e',
                  }}>
                    {inv.used_at ? `Utilisé par ${inv.used_by_username}` : inv.expired ? 'Expiré' : 'En attente'}
                  </span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                  Créé le {fmtDate(inv.created_at)} · Expire le {fmtDate(inv.expires_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── APP ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState('depenses')
  // null=loading, false=not authenticated, { username, is_admin }=authenticated
  const [user, setUser] = useState(null)
  const [firstUser, setFirstUser] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [mois, setMois] = useState(() => new Date().getMonth() + 1)
  const [virementsFixesData, setVirementsFixesData] = useState([])
  const [prelevementsData, setPrelevementsData] = useState([])

  const urlToken = new URLSearchParams(window.location.search).get('token')

  useEffect(() => {
    apiFetch('/api/auth/status')
      .then(d => {
        if (d.authenticated) {
          setUser({ username: d.username, is_admin: d.is_admin })
        } else {
          setFirstUser(!!d.first_user)
          setUser(false)
          if (d.first_user || urlToken) setShowRegister(true)
        }
      })
      .catch(() => setUser(false))

    const handler = () => { setUser(false); setShowRegister(false) }
    window.addEventListener('unauthorized', handler)
    return () => window.removeEventListener('unauthorized', handler)
  }, [])

  useEffect(() => {
    if (!user) return
    Promise.all([
      apiFetch('/api/virements-fixes'),
      apiFetch('/api/prelevements'),
    ]).then(([fixes, prels]) => {
      setVirementsFixesData(fixes)
      setPrelevementsData(prels)
    }).catch(() => {})
  }, [user])

  const handleLogin = (userData) => {
    setUser(userData)
    setShowRegister(false)
    if (urlToken) window.history.replaceState({}, '', '/')
  }

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(false)
    setVirementsFixesData([])
    setPrelevementsData([])
  }

  const handleMonthChange = (delta) => {
    setMois(prev => {
      let m = prev + delta
      if (m > 12) { setAnnee(a => a + 1); return 1 }
      if (m < 1)  { setAnnee(a => a - 1); return 12 }
      return m
    })
  }

  if (user === null) return null

  if (user === false) {
    if (showRegister) {
      return (
        <RegisterPage
          token={urlToken}
          isFirstUser={firstUser}
          onLogin={handleLogin}
          onBack={firstUser ? null : () => setShowRegister(false)}
        />
      )
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onNeedRegister={() => setShowRegister(true)}
      />
    )
  }

  return (
    <>
      <Header
        annee={annee}
        mois={tab === 'virements' ? mois : null}
        user={user}
        onLogout={handleLogout}
        onAdmin={user.is_admin ? () => setShowAdmin(true) : null}
      />
      <div className="main">
        {tab === 'depenses'  && <DepensesTab />}
        {tab === 'epargne'   && <EpargneTab />}
        {tab === 'virements' && (
          <VirementsTab
            annee={annee}
            mois={mois}
            onMonthChange={handleMonthChange}
            virementsFixesData={virementsFixesData}
            prelevementsData={prelevementsData}
          />
        )}
      </div>
      <BottomNav active={tab} onChange={setTab} />
      <ToastContainer />
      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          currentUsername={user.username}
        />
      )}
    </>
  )
}
