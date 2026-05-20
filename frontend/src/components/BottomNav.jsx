const TABS = [
  { id: 'depenses',  label: 'Dépenses',  icon: <><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 000-8H4"/><path d="M5 14h11a4 4 0 010 8H4"/></> },
  { id: 'epargne',   label: 'Épargne',   icon: <><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></> },
  { id: 'virements', label: 'Virements', icon: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/> },
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
