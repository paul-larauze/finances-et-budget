import { useState, useEffect, useCallback } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { apiFetch, fmt } from '../api/client.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const MOIS_ABBR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const PALETTE = [
  '#16a34a', '#0891b2', '#7c3aed', '#db2777',
  '#ea580c', '#d97706', '#0d9488', '#2563eb',
  '#65a30d', '#dc2626', '#c026d3', '#0369a1',
  '#4f46e5', '#059669', '#9333ea',
]

const GROUP_MODES = [
  { label: 'Par catégorie',      value: 'parent' },
  { label: 'Par sous-catégorie', value: 'subcategory' },
]

function catColor(index) {
  return PALETTE[index % PALETTE.length]
}

export function RapportDepensesView({ accountType }) {
  const now = new Date()
  const [year, setYear]               = useState(now.getFullYear())
  const [selectedMonths, setSelected] = useState(new Set([now.getMonth() + 1]))
  const [groupBy, setGroupBy]         = useState('parent')
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(false)

  const toggleMonth = (m) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(m)) {
        if (next.size > 1) next.delete(m) // keep at least one
      } else {
        next.add(m)
      }
      return next
    })
  }

  const allSelected = selectedMonths.size === 12
  const toggleAll = () => setSelected(allSelected ? new Set([now.getMonth() + 1]) : new Set([1,2,3,4,5,6,7,8,9,10,11,12]))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const monthsParam = Array.from(selectedMonths).sort((a, b) => a - b).join(',')
      const d = await apiFetch(
        `/api/transactions/rapport?account_type=${accountType}&year=${year}&months=${monthsParam}&group_by=${groupBy}`
      )
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [accountType, year, selectedMonths, groupBy])

  useEffect(() => { load() }, [load])

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: 24 }}>Chargement…</p>

  const grandTotal = data?.by_category?.reduce((s, c) => s + c.total, 0) ?? 0

  // Horizontal bar chart — répartition
  const repartitionData = data && {
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
  const evolutionData = data && {
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
        onClick: (_e, legendItem, legend) => {
          const chart = legend.chart
          const idx = legendItem.datasetIndex
          const allOthersHidden = chart.data.datasets.every((_, i) =>
            i === idx || !chart.isDatasetVisible(i)
          )
          chart.data.datasets.forEach((_, i) => {
            allOthersHidden ? chart.show(i) : (i === idx ? chart.show(i) : chart.hide(i))
          })
          chart.update()
        },
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

  const barH = data ? Math.max(200, data.by_category.length * 34) : 200

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Sélecteur année ── */}
      <div className="card" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button
            onClick={() => setYear(y => y - 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--primary)', padding: '0 8px', lineHeight: 1 }}
          >◀</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--primary)', padding: '0 8px', lineHeight: 1 }}
          >▶</button>
        </div>

        {/* ── Sélecteur mois ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            onClick={toggleAll}
            className={`cat-chip${allSelected ? ' active' : ''}`}
            style={{ minWidth: 42 }}
          >Tout</button>
          {MOIS_ABBR.map((label, idx) => {
            const m = idx + 1
            return (
              <button
                key={m}
                onClick={() => toggleMonth(m)}
                className={`cat-chip${selectedMonths.has(m) ? ' active' : ''}`}
                style={{ minWidth: 42 }}
              >{label}</button>
            )
          })}
        </div>
      </div>

      {/* ── Toggle groupe ── */}
      <div style={{ display: 'flex', gap: 6 }}>
        {GROUP_MODES.map(g => (
          <button
            key={g.value}
            onClick={() => setGroupBy(g.value)}
            className={`cat-chip${groupBy === g.value ? ' active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
          >{g.label}</button>
        ))}
      </div>

      {(!data || data.by_category.length === 0) ? (
        <div className="card">
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14, padding: 16 }}>
            Aucune dépense sur la période sélectionnée.
          </p>
        </div>
      ) : (
        <>
          {/* ── Totaux ── */}
          <div className="summary-grid">
            <div className="summary-card red">
              <div className="label">Total dépenses</div>
              <div className="value" style={{ fontSize: 18 }}>{fmt(grandTotal)}</div>
            </div>
            <div className="summary-card blue">
              <div className="label">Moy. / mois</div>
              <div className="value" style={{ fontSize: 18 }}>
                {fmt(selectedMonths.size > 0 ? grandTotal / selectedMonths.size : 0)}
              </div>
            </div>
          </div>

          {/* ── Répartition ── */}
          <div className="card">
            <p className="card-title">Répartition des dépenses</p>
            <div style={{ height: barH }}>
              <Bar data={repartitionData} options={repartitionOpts} />
            </div>
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

          {/* ── Évolution ── */}
          {data.monthly_series.length > 0 && data.labels.length > 1 && (
            <div className="card">
              <p className="card-title">Évolution mensuelle</p>
              <div style={{ height: 260 }}>
                <Bar data={evolutionData} options={evolutionOpts} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
