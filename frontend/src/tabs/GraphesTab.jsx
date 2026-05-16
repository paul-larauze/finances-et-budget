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

  const { labels = [], total = [], livrets_total = [], bourse_total = [], livrets_supports = {}, bourse_supports = {} } = data

  // Readable month labels: "Jan 24"
  const moisLabels = (data.mois_labels || labels).map((l, i) => {
    if (data.mois_labels) return l
    // If raw labels are "YYYY-MM" format
    if (typeof l === 'string' && l.includes('-')) {
      const [y, m] = l.split('-')
      return `${MOIS[parseInt(m)]?.slice(0, 3)} ${String(y).slice(2)}`
    }
    return l
  })

  /* ─── 1. Patrimoine total ─── */
  const patrimoineData = {
    labels: moisLabels,
    datasets: [
      {
        label: 'Total',
        data: total,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: 'Livrets',
        data: livrets_total,
        borderColor: '#16a34a',
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: 'Bourse',
        data: bourse_total,
        borderColor: '#7c3aed',
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  }

  /* ─── 2. Livrets vs Bourse stacked ─── */
  const stackedData = {
    labels: moisLabels,
    datasets: [
      {
        label: 'Livrets',
        data: livrets_total,
        backgroundColor: '#16a34a',
      },
      {
        label: 'Bourse',
        data: bourse_total,
        backgroundColor: '#2563eb',
      },
    ],
  }

  /* ─── 3. Répartition actuelle (last month) ─── */
  const lastIdx = total.length - 1
  const allSupports = { ...livrets_supports, ...bourse_supports }
  const doughnutLabels = Object.keys(allSupports)
  const doughnutValues = doughnutLabels.map(name => {
    const series = allSupports[name]
    return series[lastIdx] ?? 0
  })
  const doughnutColors = doughnutLabels.map((name, i) => {
    const isLivret = name in livrets_supports
    const palette = isLivret ? PALETTE_LIVRETS : PALETTE_BOURSE
    return palette[i % palette.length]
  })
  const doughnutData = {
    labels: doughnutLabels,
    datasets: [{
      data: doughnutValues,
      backgroundColor: doughnutColors,
      borderWidth: 2,
    }],
  }

  /* ─── 4. Évolution livrets per support ─── */
  const livretsSupportNames = Object.keys(livrets_supports)
  const livretsEvolutionData = {
    labels: moisLabels,
    datasets: livretsSupportNames.map((name, i) => ({
      label: name,
      data: livrets_supports[name],
      borderColor: PALETTE_LIVRETS[i % PALETTE_LIVRETS.length],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
    })),
  }

  /* ─── 5. Évolution bourse per support ─── */
  const bourseSupportNames = Object.keys(bourse_supports)
  const bourseEvolutionData = {
    labels: moisLabels,
    datasets: bourseSupportNames.map((name, i) => ({
      label: name,
      data: bourse_supports[name],
      borderColor: PALETTE_BOURSE[i % PALETTE_BOURSE.length],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
    })),
  }

  const hasData = total.length > 0

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

      {livretsSupportNames.length > 0 && (
        <ChartCard title="Évolution livrets">
          <Line data={livretsEvolutionData} options={LINE_OPTIONS} />
        </ChartCard>
      )}

      {bourseSupportNames.length > 0 && (
        <ChartCard title="Évolution bourse & épargne">
          <Line data={bourseEvolutionData} options={LINE_OPTIONS} />
        </ChartCard>
      )}
    </div>
  )
}
