const TABS = [
  { id: 'saisie', label: 'Saisie', icon: <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/> },
  { id: 'auto',   label: 'Auto',   icon: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/> },
  { id: 'placements', label: 'Placements', icon: <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/> },
  { id: 'historique', label: 'Historique', icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/> },
  { id: 'graphes', label: 'Graphes', icon: <><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></> },
]

export function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(t => (
        <button key={t.id} className={`nav-btn${active === t.id ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{t.icon}</svg>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
