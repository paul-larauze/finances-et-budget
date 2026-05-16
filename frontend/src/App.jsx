import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { ToastContainer, useToast } from './components/Toast'
import { SaisieTab } from './tabs/SaisieTab'
import { AutoTab } from './tabs/AutoTab'
import { PlacementsTab } from './tabs/PlacementsTab'
import { HistoriqueTab } from './tabs/HistoriqueTab'
import { GraphesTab } from './tabs/GraphesTab'
import { apiFetch } from './api/client'

function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      onLogin()
    } catch {
      setError('Mot de passe incorrect')
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
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoFocus />
          </div>
          <button type="submit" className="btn btn-primary">Se connecter</button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('saisie')
  const [auth, setAuth] = useState(null) // null=loading, true=ok, false=needs login
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [mois, setMois] = useState(() => new Date().getMonth() + 1)
  const [virementsFixesData, setVirementsFixesData] = useState([])
  const [prelevementsData, setPrelevementsData] = useState([])

  useEffect(() => {
    apiFetch('/api/auth/status')
      .then(d => setAuth(d.authenticated))
      .catch(() => setAuth(false))

    const handler = () => setAuth(false)
    window.addEventListener('unauthorized', handler)
    return () => window.removeEventListener('unauthorized', handler)
  }, [])

  useEffect(() => {
    if (!auth) return
    Promise.all([
      apiFetch('/api/virements-fixes'),
      apiFetch('/api/prelevements'),
    ]).then(([fixes, prels]) => {
      setVirementsFixesData(fixes)
      setPrelevementsData(prels)
    }).catch(() => {})
  }, [auth])

  const handleMonthChange = (delta) => {
    setMois(prev => {
      let m = prev + delta
      if (m > 12) { setAnnee(a => a + 1); return 1 }
      if (m < 1)  { setAnnee(a => a - 1); return 12 }
      return m
    })
  }

  if (auth === null) return null
  if (auth === false) return <LoginPage onLogin={() => setAuth(true)} />

  return (
    <>
      <Header annee={annee} mois={tab === 'saisie' ? mois : null} />
      <div className="main">
        {tab === 'saisie' && (
          <SaisieTab
            annee={annee} mois={mois}
            onMonthChange={handleMonthChange}
            virementsFixesData={virementsFixesData}
            prelevementsData={prelevementsData}
          />
        )}
        {tab === 'auto' && <AutoTab />}
        {tab === 'placements' && <PlacementsTab />}
        {tab === 'historique' && <HistoriqueTab />}
        {tab === 'graphes' && <GraphesTab />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
      <ToastContainer />
    </>
  )
}
