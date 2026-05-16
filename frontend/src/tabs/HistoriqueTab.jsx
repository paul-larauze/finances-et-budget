import { useState, useEffect, useCallback } from 'react'
import { apiFetch, fmt, MOIS } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'

export function HistoriqueTab() {
  const showToast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/historique')
      setRows(Array.isArray(data) ? data : [])
    } catch {
      showToast('Erreur de chargement', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  async function handleDelete(row) {
    if (!window.confirm(`Supprimer ${MOIS[row.mois]} ${row.annee} ?`)) return
    try {
      await apiFetch(`/api/month/${row.annee}/${row.mois}`, { method: 'DELETE' })
      showToast('Mois supprimé', 'success')
      load()
    } catch {
      showToast('Erreur lors de la suppression', 'error')
    }
  }

  /* ─── Derived data ─── */
  const last = rows.length > 0 ? rows[rows.length - 1] : null
  const prev = rows.length > 1 ? rows[rows.length - 2] : null

  const lastTotal = last?.total ?? null
  const evolution = last && prev ? (last.total - prev.total) : null

  // Last 12 months for bar chart
  const chartRows = rows.slice(-12)
  const maxTotal = chartRows.length > 0 ? Math.max(...chartRows.map(r => r.total || 0)) : 1

  return (
    <div>
      {/* Summary cards */}
      <div className="card">
        <div className="summary-grid">
          <div className="summary-card blue">
            <div className="card-title">Dernier total</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(lastTotal)}</div>
            {last && (
              <div style={{ fontSize: 12, color: '#888' }}>
                {MOIS[last.mois]} {last.annee}
              </div>
            )}
          </div>
          <div className={`summary-card ${evolution === null ? '' : evolution >= 0 ? 'green' : 'red'}`}>
            <div className="card-title">Évolution</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {evolution === null ? '—' : (evolution >= 0 ? '+' : '') + fmt(evolution)}
            </div>
            {prev && (
              <div style={{ fontSize: 12, color: '#888' }}>
                vs {MOIS[prev.mois]} {prev.annee}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      {!loading && chartRows.length > 0 && (
        <div className="card">
          <p className="card-title">Patrimoine — 12 derniers mois</p>
          <div className="chart-bar-container">
            {chartRows.map((row, i) => {
              const pct = maxTotal > 0 ? Math.round((row.total / maxTotal) * 100) : 0
              return (
                <div className="chart-bar-row" key={i}>
                  <span className="chart-bar-label">
                    {MOIS[row.mois]?.slice(0, 3)} {String(row.annee).slice(2)}
                  </span>
                  <div className="chart-bar-outer">
                    <div
                      className="chart-bar-inner"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="chart-bar-value">{fmt(row.total)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <p className="card-title">Historique détaillé</p>
        {loading && <p style={{ textAlign: 'center', color: '#888' }}>Chargement…</p>}
        {!loading && rows.length === 0 && (
          <p style={{ color: '#888', fontSize: 14 }}>Aucune donnée.</p>
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 4px' }}>Mois</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>Livrets</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>Bourse</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>Total</th>
                  <th style={{ padding: '6px 4px' }}></th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 4px' }}>
                      {MOIS[row.mois]} {row.annee}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 4px' }}>
                      {fmt(row.livrets)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 4px' }}>
                      {fmt(row.bourse)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 600 }}>
                      {fmt(row.total)}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <button
                        className="btn btn-sm btn-danger"
                        title="Supprimer"
                        onClick={() => handleDelete(row)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
