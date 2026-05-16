import { MOIS } from '../api/client'

export function Header({ annee, mois }) {
  return (
    <div className="header">
      <div>
        <div className="header-title">Finances & Budget</div>
        <div className="header-subtitle">{mois ? `${MOIS[mois]} ${annee}` : 'Gestion financière'}</div>
      </div>
    </div>
  )
}
