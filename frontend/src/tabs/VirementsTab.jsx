import { useState } from 'react'
import { SaisieTab } from './SaisieTab.jsx'
import { AutoTab } from './AutoTab.jsx'

const VIEWS = [
  { id: 'saisie',     label: '📅 Saisie' },
  { id: 'recurrents', label: '🔄 Récurrents' },
]

export function VirementsTab({ annee, mois, onMonthChange, virementsFixesData, prelevementsData }) {
  const [view, setView] = useState('saisie')

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`cat-chip${view === v.id ? ' active' : ''}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'saisie' && (
        <SaisieTab
          annee={annee}
          mois={mois}
          onMonthChange={onMonthChange}
          virementsFixesData={virementsFixesData}
          prelevementsData={prelevementsData}
        />
      )}
      {view === 'recurrents' && <AutoTab />}
    </div>
  )
}
