import { useEffect } from 'react'

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.target === e.currentTarget) onClose() }
    return () => {}
  }, [open, onClose])

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  )
}
