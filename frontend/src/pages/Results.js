import React, { useState, useEffect, useContext } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import config from '../config'
import { ThemeContext } from '../App'

const Legend = ({ color, label, dashed, colors }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{
      width: 18, height: 2, background: dashed ? 'transparent' : color,
      borderTop: dashed ? `2px dashed ${color}` : 'none'
    }} />
    <span style={{ color: colors.text, fontSize: 11 }}>{label}</span>
  </div>
)

// Renders an SVG line chart comparing actual / amdahl / gustafson speedup curves.
// Defined at module level (not inside Results) so it keeps a stable component
// identity across Results' 15s polling re-renders — otherwise hover state would
// reset and the tooltip would flicker every time fresh data comes in.
const SpeedupChart = ({ curves, title, rawResults, COLORS, dark }) => {
  const [hover, setHover] = useState(null)

  if (!curves || !curves.amdahl || curves.amdahl.length === 0) return null

  const W = 640, H = 320, padL = 50, padB = 36, padT = 20, padR = 20
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const maxN = Math.max(...curves.amdahl.map(p => p.nodes))
  const maxSpeedup = Math.max(
    ...curves.amdahl.map(p => p.speedup),
    ...curves.gustafson.map(p => p.speedup),
    ...curves.actual.map(p => p.speedup),
    2
  )

  const xPos = (n) => padL + (innerW * (n - 1)) / (maxN - 1 || 1)
  const yPos = (s) => padT + innerH - (innerH * s) / maxSpeedup

  const linePath = (points) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.nodes)} ${yPos(p.speedup)}`).join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxSpeedup * f * 10) / 10)

  const rawByNode = {}
  ;(rawResults || []).forEach(r => { rawByNode[r.nodes] = r })

  const showHover = (p, label, color, e) => {
    const svgEl = e.currentTarget.closest('svg')
    const rect = svgEl.getBoundingClientRect()
    const scaleX = rect.width / W
    const scaleY = rect.height / H
    const raw = rawByNode[p.nodes]
    setHover({
      screenX: xPos(p.nodes) * scaleX,
      screenY: yPos(p.speedup) * scaleY,
      label,
      nodes: p.nodes,
      speedup: p.speedup,
      rawValue: raw ? raw.value : null,
      rawMetric: raw ? raw.metric : null,
      color,
    })
  }

  const HoverDot = ({ p, label, color }) => (
    <circle
      cx={xPos(p.nodes)} cy={yPos(p.speedup)} r="9"
      fill="transparent"
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => showHover(p, label, color, e)}
      onMouseLeave={() => setHover(null)}
    />
  )

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, position: 'relative' }}>
      <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>
        {title} — Speedup vs Node Count
      </p>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={yPos(t)} y2={yPos(t)} stroke={COLORS.gridLine} strokeWidth="1" />
              <text x={padL - 8} y={yPos(t) + 4} fill={COLORS.dim} fontSize="10" textAnchor="end">{t}</text>
            </g>
          ))}

          {curves.amdahl.map((p, i) => (
            <text key={i} x={xPos(p.nodes)} y={H - padB + 18} fill={COLORS.dim} fontSize="10" textAnchor="middle">
              {p.nodes}
            </text>
          ))}
          <text x={W / 2} y={H - 4} fill={COLORS.dim} fontSize="10" textAnchor="middle">Number of nodes</text>

          <path d={linePath(curves.amdahl)} fill="none" stroke={COLORS.blue} strokeWidth="2" strokeDasharray="4,3" />
          {curves.amdahl.map((p, i) => (
            <HoverDot key={`am-${i}`} p={p} label="Amdahl's Law (theoretical)" color={COLORS.blue} />
          ))}

          <path d={linePath(curves.gustafson)} fill="none" stroke={COLORS.purple} strokeWidth="2" strokeDasharray="4,3" />
          {curves.gustafson.map((p, i) => (
            <HoverDot key={`gu-${i}`} p={p} label="Gustafson's Law (theoretical)" color={COLORS.purple} />
          ))}

          <path d={linePath(curves.actual)} fill="none" stroke={COLORS.green} strokeWidth="2.5" />
          {curves.actual.map((p, i) => (
            <circle key={i} cx={xPos(p.nodes)} cy={yPos(p.speedup)} r="4" fill={COLORS.green} />
          ))}
          {curves.actual.map((p, i) => (
            <HoverDot key={`ac-${i}`} p={p} label="Actual measured speedup" color={COLORS.green} />
          ))}

          {hover && (
            <line
              x1={xPos(hover.nodes)} x2={xPos(hover.nodes)}
              y1={padT} y2={H - padB}
              stroke={COLORS.dim} strokeWidth="1" strokeDasharray="2,2" opacity="0.5"
            />
          )}
        </svg>

        {hover && (
          <div style={{
            position: 'absolute',
            left: `${hover.screenX}px`,
            top: `${Math.max(hover.screenY - 70, 4)}px`,
            transform: 'translateX(-50%)',
            background: dark ? '#000' : '#fff',
            border: `1px solid ${hover.color}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 10,
          }}>
            <p style={{ margin: '0 0 3px', color: hover.color, fontWeight: 'bold' }}>{hover.label}</p>
            <p style={{ margin: 0, color: COLORS.heading }}>
              {hover.nodes} node{hover.nodes > 1 ? 's' : ''} · speedup {hover.speedup.toFixed(2)}×
            </p>
            {hover.rawValue != null && (
              <p style={{ margin: '2px 0 0', color: COLORS.dim }}>
                {hover.rawValue} {hover.rawMetric === 'gflops' ? 'GFLOPS' : 's'}
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
        <Legend color={COLORS.blue}   dashed label="Amdahl's Law (theoretical)" colors={COLORS} />
        <Legend color={COLORS.purple} dashed label="Gustafson's Law (theoretical)" colors={COLORS} />
        <Legend color={COLORS.green}  label="Actual measured speedup" colors={COLORS} />
      </div>
      <p style={{ color: COLORS.dim, fontSize: 11, margin: '10px 0 0' }}>
        Estimated parallel fraction (P): <span style={{ color: COLORS.heading }}>{Math.round(curves.parallel_fraction * 100)}%</span>
      </p>
    </div>
  )
}

const BenchmarkCard = ({ nodes, value, metric, timestamp, COLORS, formatTimestamp }) => (
  <div style={{
    background: COLORS.card, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: '14px 16px', minWidth: 140
  }}>
    <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
      {nodes} node{nodes > 1 ? 's' : ''}
    </p>
    <p style={{ color: COLORS.heading, fontSize: 22, fontWeight: 'bold', margin: '0 0 4px' }}>
      {value}
      <span style={{ fontSize: 12, color: COLORS.dim, marginLeft: 4 }}>
        {metric === 'gflops' ? 'GFLOPS' : 's'}
      </span>
    </p>
    <p style={{ color: COLORS.dim, fontSize: 10, margin: 0 }}>
      {formatTimestamp(timestamp)}
    </p>
  </div>
)

export default function Results() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('mpi') // 'mpi' | 'non_mpi'
  const token   = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }
  const { dark } = useContext(ThemeContext)

  const COLORS = {
    bg:      dark ? '#0f0f0f' : '#f0f2f5',
    card:    dark ? '#1a1a1a' : '#ffffff',
    border:  dark ? '#333' : '#e0e0e0',
    green:   '#1D9E75',
    red:     '#E24B4A',
    orange:  '#EF9F27',
    blue:    '#378ADD',
    purple:  '#9B59B6',
    text:    dark ? '#aaa' : '#555',
    dim:     dark ? '#555' : '#999',
    heading: dark ? 'white' : '#1a1a1a',
    gridLine: dark ? '#222' : '#eee',
  }

  useEffect(() => {
    fetchResults()
    const interval = setInterval(fetchResults, 15000)
    return () => clearInterval(interval)
  }, [])

  const fetchResults = async () => {
    try {
      const res = await axios.get(`${config.API_URL}/api/benchmarks`, { headers })
      setData(res.data)
    } catch (e) {}
    setLoading(false)
  }

  const formatTimestamp = (ts) => {
    if (!ts) return 'never'
    const d = new Date(ts)
    return d.toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg }}>
        <Navbar />
        <div style={{ padding: 20, color: COLORS.dim }}>Loading benchmark results...</div>
      </div>
    )
  }

  const hpl  = data?.hpl || { results: [], curves: null }
  const td   = data?.task_distributor || { results: [], curves: null }
  const mcWeak   = data?.monte_carlo_pi || { results: [], curves: null }
  const mcStrong = data?.monte_carlo_pi_strong || { results: [], curves: null }
  const hplLatest = hpl.results.length ? hpl.results.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)) : null
  const tdLatest   = td.results.length ? td.results.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)) : null
  const mcWeakLatest   = mcWeak.results.length ? mcWeak.results.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)) : null
  const mcStrongLatest = mcStrong.results.length ? mcStrong.results.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)) : null

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'Arial, sans-serif' }}>
      <Navbar />

      <div style={{ padding: 20 }}>
        <h2 style={{ color: COLORS.heading, marginBottom: 8 }}>Results</h2>
        <p style={{ color: COLORS.dim, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
          Parallel scaling benchmarks across MPI-based and non-MPI approaches: custom MPI
          example programs (Task 3), HPL/hpcc (Task 2, GFLOPS), and Task-Distributor (Task 4,
          SSH-based master-worker, non-MPI). All are compared against Amdahl's and Gustafson's
          theoretical speedup laws. Hover over any point on the charts below to see exact values.
        </p>

        {/* Filter toggle */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <button
            onClick={() => setFilter('mpi')}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 'bold',
              borderRadius: 8, cursor: 'pointer',
              border: `2px solid ${COLORS.green}`,
              background: filter === 'mpi' ? COLORS.green : 'transparent',
              color: filter === 'mpi' ? 'white' : COLORS.green,
              transition: 'all 0.15s ease',
            }}
          >
            MPI Based
          </button>
          <button
            onClick={() => setFilter('non_mpi')}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 'bold',
              borderRadius: 8, cursor: 'pointer',
              border: `2px solid ${COLORS.blue}`,
              background: filter === 'non_mpi' ? COLORS.blue : 'transparent',
              color: filter === 'non_mpi' ? 'white' : COLORS.blue,
              transition: 'all 0.15s ease',
            }}
          >
            Non-MPI
          </button>
        </div>

        {filter === 'mpi' && (
        <>
        {/* ============== MPI-BASED RESULTS — Task 3 custom examples ============== */}
        <div style={{
          background: COLORS.card, border: `2px solid ${COLORS.green}`,
          borderRadius: 12, padding: '6px 16px', marginBottom: 18,
          display: 'inline-block'
        }}>
          <p style={{ color: COLORS.green, fontSize: 13, fontWeight: 'bold', margin: '6px 0' }}>
            MPI-BASED RESULTS — Custom MPI Example (Task 3)
          </p>
        </div>

        <p style={{ color: COLORS.text, fontSize: 13, margin: '0 0 18px', lineHeight: 1.6 }}>
          Monte Carlo estimation of π, written from scratch using MPI (<code>MPI_Reduce</code>{' '}
          only — no communication during the actual computation). Tested under two different
          setups to show two different ways of thinking about "scaling":
        </p>

        {/* Setup 1: Weak scaling */}
        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 16
        }}>
          <p style={{ color: COLORS.blue, fontSize: 11, fontWeight: 'bold', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Setup 1 — Weak Scaling (fixed work per rank)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12.5, color: COLORS.text, lineHeight: 1.7 }}>
            <p style={{ margin: 0 }}>Points per rank: <span style={{ color: COLORS.heading }}>20,000,000</span> (fixed, same on every rank)</p>
            <p style={{ margin: 0 }}>Total work: <span style={{ color: COLORS.heading }}>grows</span> with node count (80M → 720M)</p>
            <p style={{ margin: 0 }}>Question asked: <span style={{ color: COLORS.heading }}>"If each worker always does the same amount of work, does total throughput scale with more workers?"</span></p>
            <p style={{ margin: 0 }}>Good result looks like: <span style={{ color: COLORS.heading }}>flat time</span> despite growing total work</p>
          </div>
        </div>
        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Monte Carlo π — Weak Scaling
          {mcWeakLatest && <span style={{ marginLeft: 10, color: COLORS.dim, fontWeight: 'normal', textTransform: 'none' }}>
            Last run: {formatTimestamp(mcWeakLatest.timestamp)}
          </span>}
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {mcWeak.results.sort((a, b) => a.nodes - b.nodes).map((r, i) => (
            <BenchmarkCard key={i} nodes={r.nodes} value={r.value} metric={r.metric} timestamp={r.timestamp} COLORS={COLORS} formatTimestamp={formatTimestamp} />
          ))}
        </div>
        <div style={{ marginBottom: 28 }}>
          <SpeedupChart curves={mcWeak.curves} title="Monte Carlo π — Weak Scaling" rawResults={mcWeak.results} COLORS={COLORS} dark={dark} />
        </div>

        {/* Setup 2: Strong scaling */}
        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 16
        }}>
          <p style={{ color: COLORS.purple, fontSize: 11, fontWeight: 'bold', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Setup 2 — Strong Scaling (fixed total work)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12.5, color: COLORS.text, lineHeight: 1.7 }}>
            <p style={{ margin: 0 }}>Total points: <span style={{ color: COLORS.heading }}>720,000,000</span> (fixed, same total every time)</p>
            <p style={{ margin: 0 }}>Per-rank share: <span style={{ color: COLORS.heading }}>shrinks</span> as node count grows (180M → 20M)</p>
            <p style={{ margin: 0 }}>Question asked: <span style={{ color: COLORS.heading }}>"Does a fixed-size job finish faster with more workers?"</span> (same question HPL asks)</p>
            <p style={{ margin: 0 }}>Good result looks like: <span style={{ color: COLORS.heading }}>time roughly halves</span> each time node count doubles</p>
          </div>
        </div>
        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Monte Carlo π — Strong Scaling
          {mcStrongLatest && <span style={{ marginLeft: 10, color: COLORS.dim, fontWeight: 'normal', textTransform: 'none' }}>
            Last run: {formatTimestamp(mcStrongLatest.timestamp)}
          </span>}
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {mcStrong.results.sort((a, b) => a.nodes - b.nodes).map((r, i) => (
            <BenchmarkCard key={i} nodes={r.nodes} value={r.value} metric={r.metric} timestamp={r.timestamp} COLORS={COLORS} formatTimestamp={formatTimestamp} />
          ))}
        </div>
        <div style={{ marginBottom: 20 }}>
          <SpeedupChart curves={mcStrong.curves} title="Monte Carlo π — Strong Scaling" rawResults={mcStrong.results} COLORS={COLORS} dark={dark} />
        </div>

        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.green}`,
          borderRadius: 10, padding: 18, marginBottom: 32
        }}>
          <p style={{ color: COLORS.green, fontSize: 12, fontWeight: 'bold', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            MPI Example — Key Finding
          </p>
          <p style={{ color: COLORS.text, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Monte Carlo π is "embarrassingly parallel" — every rank works completely
            independently with zero communication until a single <code>MPI_Reduce</code> at the
            very end. Under strong scaling, this produced close-to-ideal speedup: roughly 2x at
            2 nodes, 4x at 4 nodes, and over 7x at 8 nodes, tracking near the theoretical linear
            speedup line. Under weak scaling, total throughput grew 9x while wall-clock time
            stayed essentially flat. Both results point to the same conclusion: with minimal
            communication overhead, this cluster scales very well — a useful contrast against
            HPL, where constant inter-rank communication throughout the run was shown to
            dominate over any parallel compute gain at this problem size.
          </p>
        </div>

        {/* ============== NON-MPI / OTHER RESULTS ============== */}
        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          HPL Benchmark (MPI) — Task 2, GFLOPS
          {hplLatest && <span style={{ marginLeft: 10, color: COLORS.dim, fontWeight: 'normal', textTransform: 'none' }}>
            Last run: {formatTimestamp(hplLatest.timestamp)}
          </span>}
        </p>

        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 16
        }}>
          <p style={{ color: COLORS.blue, fontSize: 11, fontWeight: 'bold', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Test Methodology
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12.5, color: COLORS.text, lineHeight: 1.7 }}>
            <p style={{ margin: 0 }}>Problem size (N): <span style={{ color: COLORS.heading }}>5000</span> (~190MB matrix)</p>
            <p style={{ margin: 0 }}>Block size (NB): <span style={{ color: COLORS.heading }}>128</span></p>
            <p style={{ margin: 0 }}>Processes per node: <span style={{ color: COLORS.heading }}>4</span></p>
            <p style={{ margin: 0 }}>Benchmark tool: <span style={{ color: COLORS.heading }}>hpcc v1.5.0</span> (HPL component) via OpenMPI</p>
            <p style={{ margin: 0 }}>Node ordering: <span style={{ color: COLORS.heading }}>pi3-08 → pi3-01</span> (Pi5 added 9th)</p>
            <p style={{ margin: 0 }}>Cooldown between tests: <span style={{ color: COLORS.heading }}>90 seconds</span></p>
          </div>
          <p style={{ color: COLORS.dim, fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.6 }}>
            P×Q process grids used per node count: 1→2×2, 2→2×4, 3→3×4, 4→4×4, 5→4×5, 6→4×6,
            7→4×7, 8→4×8, 9→6×6. N=7 and N=8 each required one retry due to transient MPI
            communication failures between daemons at higher node counts; both recovered cleanly
            on retry. The N=8 value shown reflects a retry taken after extended natural rest,
            since the immediate in-sequence attempt failed — this is noted here for transparency
            rather than presented as a first-attempt result.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {hpl.results.sort((a, b) => a.nodes - b.nodes).map((r, i) => (
            <BenchmarkCard key={i} nodes={r.nodes} value={r.value} metric={r.metric} timestamp={r.timestamp} COLORS={COLORS} formatTimestamp={formatTimestamp} />
          ))}
        </div>
        <div style={{ marginBottom: 28 }}>
          <SpeedupChart curves={hpl.curves} title="HPL / MPI" rawResults={hpl.results} COLORS={COLORS} dark={dark} />
        </div>

        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: 18, marginBottom: 28
        }}>
          <p style={{ color: COLORS.purple, fontSize: 12, fontWeight: 'bold', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Test Setups Explored
          </p>
          <p style={{ color: COLORS.text, fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
            Several node orderings and cooldown durations were tested before settling on the
            dataset shown above, to understand which factors genuinely affected results versus
            which were noise:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                label: 'Pi5 + ascending Pi3s, fixed cooldown',
                desc: 'Pi5 included from N=1, Pi3 nodes added one by one. Showed a steep drop from N=1 to N=2 every time Pi5 was paired with a Pi3 node.',
              },
              {
                label: 'Pi3-only, descending order, 60s cooldown',
                desc: 'No Pi5 involved. Established the baseline plateau pattern, but two tests failed outright with MPI communication loss at higher node counts.',
              },
              {
                label: 'Pi3-only, descending order, 90s cooldown (shown above)',
                desc: 'Same ordering, longer rest between tests. N=7 and N=8 still needed one retry each, but ultimately produced the most complete, representative dataset — used as the final result.',
              },
              {
                label: 'Pi5-first, descending Pi3s, 180s and 1200s cooldown',
                desc: "Tested whether a much longer rest period would close the gap once Pi5 was involved. It did not — the same steep drop appeared even after 20 minutes of cooldown, confirming the effect is tied to Pi5's involvement itself rather than insufficient rest.",
              },
              {
                label: 'Isolated N=8 retry after extended natural rest',
                desc: 'Re-ran the 8-node Pi3-only case on its own after a longer, unplanned rest period. Succeeded cleanly and produced the best result in the dataset (3.563 GFLOPS), suggesting genuine idle time between high-node-count runs matters more than a short fixed cooldown.',
              },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: COLORS.purple, marginTop: 6, flexShrink: 0
                }} />
                <div>
                  <p style={{ color: COLORS.heading, fontSize: 12.5, fontWeight: 'bold', margin: '0 0 2px' }}>
                    {s.label}
                  </p>
                  <p style={{ color: COLORS.text, fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>
        )}

        {filter === 'non_mpi' && (
        <>
        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Task-Distributor (POV-Ray) — Task 4, Non-MPI (SSH-based)
          {tdLatest && <span style={{ marginLeft: 10, color: COLORS.dim, fontWeight: 'normal', textTransform: 'none' }}>
            Last run: {formatTimestamp(tdLatest.timestamp)}
          </span>}
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {td.results.sort((a, b) => a.nodes - b.nodes).map((r, i) => (
            <BenchmarkCard key={i} nodes={r.nodes} value={r.value} metric={r.metric} timestamp={r.timestamp} COLORS={COLORS} formatTimestamp={formatTimestamp} />
          ))}
        </div>
        <div style={{ marginBottom: 28 }}>
          <SpeedupChart curves={td.curves} title="Task-Distributor" rawResults={td.results} COLORS={COLORS} dark={dark} />
        </div>
        </>
        )}

        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.orange}`,
          borderRadius: 10, padding: 18, marginBottom: 20
        }}>
          <p style={{ color: COLORS.orange, fontSize: 12, fontWeight: 'bold', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Key Insight
          </p>
          <p style={{ color: COLORS.text, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Across 1 to 8 Pi3-only nodes, GFLOPS stayed in a tight plateau (roughly 2.68–3.57),
            with no node count showing a clear, repeatable speedup over a single node — pointing
            to network communication overhead between homogeneous Pi3 workers dominating over
            any parallel compute gain at this problem size. The moment Pi5 was added as a 9th
            node, performance dropped further (2.425 GFLOPS). Pi5 is not a dedicated benchmark
            node in this cluster: it simultaneously runs the production surveillance stack
            (inference service, k3s control plane, monitoring) while also being asked to join
            HPL runs, so its available compute is genuinely reduced compared to the dedicated
            Pi3 workers — a realistic edge-computing tradeoff rather than a measurement error.
            Task-Distributor's render time stayed roughly flat across 1 to 8 nodes — its master
            script dispatches SSH jobs and polls each node's completion sequentially with a
            1-second sleep between checks, so dispatch-order timing and per-node SSH connection
            overhead dominate over the actual parallel compute time. This contrasts with MPI's{' '}
            <code>mpirun</code>, which launches all ranks near-simultaneously through a single
            coordinated mechanism — a useful, concrete illustration of why message-passing and
            naive master-worker scripting behave differently in practice, even on identical hardware.
          </p>
        </div>

        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 30
        }}>
          <p style={{ color: COLORS.dim, fontSize: 11, margin: 0, lineHeight: 1.6 }}>
            Task-Distributor is a research tool by <span style={{ color: COLORS.text }}>Dr. Christian Baun</span>,
            Frankfurt University of Applied Sciences — published in{' '}
            <span style={{ color: COLORS.text }}>SpringerPlus 2016, "Parallel image computation in
            clusters with task-distributor"</span> (DOI 10.1186/s40064-016-2254-x), licensed under GPLv2.{' '}
            <a href="https://github.com/christianbaun/task-distributor" target="_blank" rel="noreferrer"
               style={{ color: COLORS.blue }}>github.com/christianbaun/task-distributor</a>
          </p>
        </div>
      </div>
    </div>
  )
}