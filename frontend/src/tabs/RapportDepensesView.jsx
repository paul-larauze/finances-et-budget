import { useState, useEffect, useCallback } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { apiFetch, fmt } from '../api/client.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const PERIODS = [
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '12 mois', value: 12 },
]

const PALETTE = [
  '#16a34a', '#0891b2', '#7c3aed', '#db2777',
  '#ea580c', '#d97706', '#0d9488', '#2563eb',
  '#65a30d', '#dc2626', '#c026d3', '#0369a1',
  '#4f46e5', '#059669', '#9333ea',
]

function catColor(index) {
  return PALETTE[index % PALETTE.length]
}

export function RapportDepensesView({ accountType }) {
  const [months, setMonths] = useState(6)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiFetch(`/api/transactions/rapport?account_type=${accountType}&months=${months}`)
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [accountType, months])

  useEffect(() => { load() }, [load])

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: 24 }}>Chargement…</p>
  if (!data || data.by_category.length === 0) {
    return (
      <div className="card">
        <p style={{ textAlign: 'center', color: '#888', fontSize: 14, padding: 16 }}>
          Aucune dépense sur la période.<br />Importez des transactions pour voir les rapports.
        </p>
      </div>
    )
  }

  const grandTotal = data.by_category.reduce((s, c) => s + c.total, 0)

  // Horizontal bar chart — répartition
  const repartitionData = {
    labels: data.by_category.map(c => c.category),
    datasets: [{
      data: data.by_category.map(c => c.total),
      backgroundColor: data.by_category.map((_, i) => catColor(i)),
      borderRadius: 4,
      borderSkipped: false,
    }],
  }
  const repartitionOpts = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${fmt(ctx.parsed.x)}  (${data.by_category[ctx.dataIndex].pct} %)`,
        },
      },
    },
    scales: {
      x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: v => fmt(v) } },
      y: { ticks: { font: { size: 11 } } },
    },
  }

  // Stacked bar — évolution
  const evolutionData = {
    labels: data.labels,
    datasets: data.monthly_series.map((s, i) => ({
      label: s.category,
      data: s.data,
      backgroundColor: catColor(
        data.by_category.findIndex(c => c.category === s.category) >= 0
          ? data.by_category.findIndex(c => c.category === s.category)
          : data.by_category.length + i
      ),
      stack: 'expenses',
      borderRadius: i === 0 ? 4 : 0,
    })),
  }
  const evolutionOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { font: { size: 10 }, boxWidth: 12, padding: 8 },
      },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: v => fmt(v) } },
    },
  }

  const barH = Math.max(200, data.by_category.length * 34)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6 }}>
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setMonths(p.value)}
            className={`cat-chip${months === p.value ? ' active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary totals */}
      <div className="summary-grid">
        <div className="summary-card red">
          <div className="label">Total dépenses</div>
          <div className="value" style={{ fontSize: 18 }}>{fmt(grandTotal)}</div>
        </div>
        <div className="summary-card blue">
          <div className="label">Moy. / mois</div>
          <div className="value" style={{ fontSize: 18 }}>
            {fmt(data.labels.length > 0 ? grandTotal / data.labels.length : 0)}
          </div>
        </div>
      </div>

      {/* Répartition */}
      <div className="card">
        <p className="card-title">Répartition des dépenses</p>
        <div style={{ height: barH }}>
          <Bar data={repartitionData} options={repartitionOpts} />
        </div>

        {/* Detail list */}
        <ul className="transfer-list" style={{ marginTop: 16, fontSize: 13 }}>
          {data.by_category.map((c, i) => (
            <li key={c.category}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: catColor(i), flexShrink: 0 }} />
                <span className="transfer-name">{c.category}</span>
              </span>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#888' }}>{c.pct} %</span>
                <span className="transfer-amount negative">{fmt(c.total)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Évolution */}
      {data.monthly_series.length > 0 && data.labels.length > 1 && (
        <div className="card">
          <p className="card-title">Évolution mensuelle</p>
          <div style={{ height: 260 }}>
            <Bar data={evolutionData} options={evolutionOpts} />
          </div>
        </div>
      )}
    </div>
  )
}
