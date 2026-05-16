import { useState, useEffect, useCallback } from 'react'

let _show = null
export function useToast() {
  return useCallback((msg, type = 'success') => _show?.(msg, type), [])
}

export function ToastContainer() {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    _show = (msg, type) => {
      setToast({ msg, type })
      setTimeout(() => setToast(null), 2800)
    }
    return () => { _show = null }
  }, [])

  if (!toast) return null
  const bg = toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#dc2626' : '#d97706'
  return <div className="toast" style={{ background: bg }}>{toast.msg}</div>
}
