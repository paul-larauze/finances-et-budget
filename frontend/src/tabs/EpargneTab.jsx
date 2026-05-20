import { useState } from 'react'
import { PlacementsTab } from './PlacementsTab.jsx'
import { GraphesTab } from './GraphesTab.jsx'
import { HistoriqueTab } from './HistoriqueTab.jsx'

const VIEWS = [
  { id: 'placements', label: '💰 Placements' },
  { id: 'graphes',    label: '📈 Graphes' },
  { id: 'historique', label: '🗂 Historique' },
]

export function EpargneTab() {
  const [view, setView] = useState('placements')

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

      {view === 'placements' && <PlacementsTab />}
      {view === 'graphes'    && <GraphesTab />}
      {view === 'historique' && <HistoriqueTab />}
    </div>
  )
}
