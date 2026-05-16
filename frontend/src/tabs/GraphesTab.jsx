import { useState, useEffect, useCallback } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { apiFetch, MOIS } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const PALETTE_LIVRETS = ['#16a34a', '#4ade80', '#86efac', '#bbf7d0', '#a7f3d0']
const PALETTE_BOURSE = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2', '#dc2626', '#059669']

const CHART_OPTIONS_BASE = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { position: 'bottom' },
  },
}

const LINE_OPTIONS = {
  ...CHART_OPTIONS_BASE,
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: false },
  },
}

const STACKED_OPTIONS = {
  ...CHART_OPTIONS_BASE,
  scales: {
    x: { stacked: true, grid: { display: false } },
    y: { stacked: true, beginAtZero: true },
  },
}

const DOUGHNUT_OPTIONS = {
  ...CHART_OPTIONS_BASE,
  plugins: {
    ...CHART_OPTIONS_BASE.plugins,
    legend: { position: 'bottom' },
  },
}

function ChartCard({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="card-title">{title}</p>
      {children}
    </div>
  )
}

export function GraphesTab() {
  const showToast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/graphes/evolution')
      setData(res)
    } catch {
      showToast('Erreur de chargement des graphes', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <p style={{ textAlign: 'center', color: '#888', padding: 32 }}>Chargement des graphes…</p>
  }

  if (!data) {
    return <p style={{ textAlign: 'center', color: '#888', padding: 32 }}>Aucune donnée.</p>
  }

  const {
    labels = [],
    totals = [],
    livrets_totals = [],
    bourse_totals = [],
    livrets_supports = [],
    bourse_supports = [],
  } = data

  /* ─── 1. Patrimoine total ─── */
  const patrimoineData = {
    labels,
    datasets: [
      {
        label: 'Total',
        data: totals,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: 'Livrets',
        data: livrets_totals,
        borderColor: '#16a34a',
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: 'Bourse',
        data: bourse_totals,
        borderColor: '#7c3aed',
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  }

  /* ─── 2. Livrets vs Bourse stacked ─── */
  const stackedData = {
    labels,
    datasets: [
      { label: 'Livrets', data: livrets_totals, backgroundColor: '#16a34a' },
      { label: 'Bourse', data: bourse_totals, backgroundColor: '#2563eb' },
    ],
  }

  /* ─── 3. Répartition actuelle (last month) ─── */
  const lastIdx = totals.length - 1
  const allSupports = [...livrets_supports, ...bourse_supports]
  const doughnutLabels = allSupports.map(s => s.support)
  const doughnutValues = allSupports.map(s => s.data[lastIdx] ?? 0)
  const doughnutColors = allSupports.map((s, i) => {
    const isLivret = livrets_supports.includes(s)
    return (isLivret ? PALETTE_LIVRETS : PALETTE_BOURSE)[i % (isLivret ? PALETTE_LIVRETS : PALETTE_BOURSE).length]
  })
  const doughnutData = {
    labels: doughnutLabels,
    datasets: [{ data: doughnutValues, backgroundColor: doughnutColors, borderWidth: 2 }],
  }

  /* ─── 4. Évolution livrets per support ─── */
  const livretsEvolutionData = {
    labels,
    datasets: livrets_supports.map((s, i) => ({
      label: s.support,
      data: s.data,
      borderColor: PALETTE_LIVRETS[i % PALETTE_LIVRETS.length],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
    })),
  }

  /* ─── 5. Évolution bourse per support ─── */
  const bourseEvolutionData = {
    labels,
    datasets: bourse_supports.map((s, i) => ({
      label: s.support,
      data: s.data,
      borderColor: PALETTE_BOURSE[i % PALETTE_BOURSE.length],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
    })),
  }

  const hasData = totals.length > 0

  if (!hasData) {
    return (
      <div className="card">
        <p style={{ textAlign: 'center', color: '#888' }}>
          Aucune donnée de placement enregistrée.
        </p>
      </div>
    )
  }

  return (
    <div>
      <ChartCard title="Patrimoine total">
        <Line data={patrimoineData} options={LINE_OPTIONS} />
      </ChartCard>

      <ChartCard title="Livrets vs Bourse">
        <Bar data={stackedData} options={STACKED_OPTIONS} />
      </ChartCard>

      <ChartCard title="Répartition actuelle">
        {doughnutValues.some(v => v > 0) ? (
          <Doughnut data={doughnutData} options={DOUGHNUT_OPTIONS} />
        ) : (
          <p style={{ color: '#888', fontSize: 14 }}>Aucune répartition disponible.</p>
        )}
      </ChartCard>

      {livrets_supports.length > 0 && (
        <ChartCard title="Évolution livrets">
          <Line data={livretsEvolutionData} options={LINE_OPTIONS} />
        </ChartCard>
      )}

      {bourse_supports.length > 0 && (
        <ChartCard title="Évolution bourse & épargne">
          <Line data={bourseEvolutionData} options={LINE_OPTIONS} />
        </ChartCard>
      )}
    </div>
  )
}
