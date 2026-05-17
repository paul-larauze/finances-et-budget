import { MOIS } from '../api/client'

export function Header({ annee, mois, user, onLogout, onAdmin }) {
  return (
    <div className="header">
      <div>
        <div className="header-title">Finances & Budget</div>
        <div className="header-subtitle">{mois ? `${MOIS[mois]} ${annee}` : 'Gestion financière'}</div>
      </div>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onAdmin && (
            <button
              onClick={onAdmin}
              title="Administration"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}
            >⚙</button>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user.username}</div>
            {user.is_admin && <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>ADMIN</div>}
          </div>
          <button
            onClick={onLogout}
            className="btn-sm btn-outline"
            style={{ fontSize: 12 }}
          >Déco.</button>
        </div>
      )}
    </div>
  )
}
