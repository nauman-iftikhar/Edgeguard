import React, { useState, useEffect, useRef, useContext } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import config from '../config'
import { ThemeContext } from '../App'

const POD_COLORS_DARK = {
  backend:  { bg: '#0d2a4a', border: '#378ADD', text: '#378ADD' },
  minio:    { bg: '#0a1f14', border: '#1D9E75', text: '#1D9E75' },
  frontend: { bg: '#1f0a2a', border: '#9B59B6', text: '#9B59B6' },
}

const POD_COLORS_LIGHT = {
  backend:  { bg: '#e3f0fc', border: '#378ADD', text: '#1e5e9c' },
  minio:    { bg: '#e3f7ee', border: '#1D9E75', text: '#0d6e52' },
  frontend: { bg: '#f3e6fa', border: '#9B59B6', text: '#6b3a82' },
}

const POD_LABELS = {
  backend:  'Backend API',
  minio:    'MinIO Storage',
  frontend: 'Frontend',
}

const normalizeNodeName = (name) => {
  if (name === 'master-node') return 'pi5-master'
  const match = name.match(/^pi3-0?(\d+)$/)
  if (match) return `pi3-node${match[1]}`
  return name
}

export default function Pods() {
  const [nodes,     setNodes]     = useState([])
  const [pods,      setPods]      = useState([])
  const [lines,     setLines]     = useState([])
  const [pi4Status, setPi4Status] = useState('standby')
  const svgRef  = useRef(null)
  const token   = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }
  const { dark } = useContext(ThemeContext)

  const POD_COLORS = dark ? POD_COLORS_DARK : POD_COLORS_LIGHT

  const COLORS = {
    bg:       dark ? '#0f0f0f' : '#f0f2f5',
    card:     dark ? '#1a1a1a' : '#ffffff',
    inputBg:  dark ? '#111' : '#eef0f3',
    border:   dark ? '#333' : '#e0e0e0',
    border2:  dark ? '#2a2a2a' : '#e6e6e6',
    text:     dark ? '#aaa' : '#555',
    text2:    dark ? '#ccc' : '#333',
    dim:      dark ? '#555' : '#999',
    heading:  dark ? '#fff' : '#1a1a1a',
    safeBg:   dark ? '#0a1f0a' : '#e6f7ef',
    dangerBg: dark ? '#2a0a0a' : '#fdecec',
    pi4StandbyBg: dark ? '#0d1f2a' : '#e3f0fc',
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (nodes.length && pods.length) {
      setTimeout(drawLines, 100)
    }
  }, [nodes, pods])

  const fetchData = async () => {
    try {
      const [nodesRes, podsRes, scalerRes] = await Promise.all([
        axios.get(`${config.API_URL}/api/system/status`, { headers }),
        axios.get(`${config.API_URL}/api/cluster/pods`, { headers }),
        axios.get(`${config.API_URL}/api/autoscaler/status`, { headers }),
      ])
      setNodes(nodesRes.data.nodes || [])
      setPods(podsRes.data.pods || [])
      setPi4Status(scalerRes.data.pi4_status || 'standby')
    } catch (e) {}
  }

  const drawLines = () => {
    if (!svgRef.current) return
    const newLines = []
    pods.forEach(pod => {
      const normalizedNode = normalizeNodeName(pod.node)
      const nodeEl = document.getElementById(`node-${normalizedNode}`)
      const podEl  = document.getElementById(`podtype-${pod.type}`)
      if (!nodeEl || !podEl || !svgRef.current) return

      const svgRect  = svgRef.current.getBoundingClientRect()
      const nodeRect = nodeEl.getBoundingClientRect()
      const podRect  = podEl.getBoundingClientRect()

      const x1 = nodeRect.right - svgRect.left
      const y1 = nodeRect.top + nodeRect.height / 2 - svgRect.top
      const x2 = podRect.left  - svgRect.left
      const y2 = podRect.top  + podRect.height / 2 - svgRect.top

      newLines.push({ x1, y1, x2, y2, color: POD_COLORS[pod.type]?.border || '#555' })
    })
    setLines(newLines)
  }

  // Build pod map
  const podsByNode = {}
  pods.forEach(pod => {
    const normalized = normalizeNodeName(pod.node)
    if (!podsByNode[normalized]) podsByNode[normalized] = []
    podsByNode[normalized].push(pod.type)
  })

  const podTypes       = [...new Set(pods.map(p => p.type))]
  const pi4Node        = nodes.find(n => n.ip === '10.10.10.40')
  const clusterNodes   = nodes.filter(n => n.ip !== '10.10.10.40')
  const assignedNodes  = clusterNodes.filter(n => podsByNode[n.name])
  const unassignedNodes= clusterNodes.filter(n => !podsByNode[n.name])
  const pi4Active      = pi4Status === 'active'

  const NodeCard = ({ n, id }) => (
    <div id={id || `node-${n.name}`} style={{
      background: COLORS.inputBg, border: `1px solid ${COLORS.border2}`,
      borderRadius: 10, padding: '10px 14px', minWidth: 160
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: COLORS.text2, fontSize: 13, fontWeight: 'bold' }}>{n.name}</span>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 20,
          background: n.online ? COLORS.safeBg : COLORS.dangerBg,
          color:      n.online ? '#1D9E75' : '#E24B4A',
          border:     `1px solid ${n.online ? '#1D9E75' : '#E24B4A'}`
        }}>
          {n.online ? 'online' : 'offline'}
        </span>
      </div>
      <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 4px' }}>{n.ip}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ color: COLORS.text, fontSize: 11 }}>CPU <span style={{ color: '#1D9E75' }}>{n.cpu}%</span></span>
        <span style={{ color: COLORS.text, fontSize: 11 }}>RAM <span style={{ color: '#378ADD' }}>{n.ram}%</span></span>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.1; }
          50%       { opacity: 0.4; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'Arial, sans-serif' }}>
        <Navbar />
        <div style={{ padding: 24 }}>
          <h2 style={{ color: COLORS.heading, marginBottom: 8 }}>Pod Distribution</h2>
          <p style={{ color: COLORS.dim, fontSize: 13, marginBottom: 24 }}>
            Live view of how k3s has distributed pods across cluster nodes. Updates every 10 seconds.
          </p>

          {/* Unassigned Nodes */}
          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: 16, marginBottom: 24
          }}>
            <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Unassigned Nodes — {unassignedNodes.length + (pi4Active ? 1 : 0)} idle
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {unassignedNodes.map(n => <NodeCard key={n.name} n={n} />)}

              {/* Pi4 slides in when active */}
              {pi4Active && pi4Node && (
                <div style={{
                  background: COLORS.pi4StandbyBg, border: '1px solid #378ADD',
                  borderRadius: 10, padding: '10px 14px', minWidth: 160,
                  animation: 'slideIn 0.5s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ color: COLORS.heading, fontSize: 13, fontWeight: 'bold' }}>🚑 pi4-camera</span>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 20,
                      background: COLORS.pi4StandbyBg, color: '#378ADD', border: '1px solid #378ADD'
                    }}>
                      MPI Worker
                    </span>
                  </div>
                  <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 4px' }}>{pi4Node.ip}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: COLORS.text, fontSize: 11 }}>CPU <span style={{ color: '#1D9E75' }}>{pi4Node.cpu}%</span></span>
                    <span style={{ color: COLORS.text, fontSize: 11 }}>RAM <span style={{ color: '#378ADD' }}>{pi4Node.ram}%</span></span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pod Assignment Bipartite Graph */}
          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: 24, marginBottom: 24,
            position: 'relative'
          }}>
            <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Pod Assignment
            </p>

            <div style={{ display: 'flex', alignItems: 'center', position: 'relative', minHeight: 200 }}>

              {/* SVG Lines */}
              <svg ref={svgRef} style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%',
                pointerEvents: 'none', zIndex: 1
              }}>
                {lines.map((l, i) => {
                  const cx1 = l.x1 + (l.x2 - l.x1) * 0.4
                  const cx2 = l.x1 + (l.x2 - l.x1) * 0.6
                  return (
                    <path
                      key={i}
                      d={`M ${l.x1} ${l.y1} C ${cx1} ${l.y1} ${cx2} ${l.y2} ${l.x2} ${l.y2}`}
                      fill="none"
                      stroke={l.color}
                      strokeWidth="1.5"
                      strokeOpacity="0.6"
                      markerEnd={`url(#arrow-${i})`}
                    />
                  )
                })}
                <defs>
                  {lines.map((l, i) => (
                    <marker key={i} id={`arrow-${i}`} markerWidth="6" markerHeight="6"
                      refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill={l.color} opacity="0.6" />
                    </marker>
                  ))}
                </defs>
              </svg>

              {/* Left — Nodes */}
              <div style={{ flex: 1, zIndex: 2 }}>
                <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Nodes
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {assignedNodes.map(n => <NodeCard key={n.name} n={n} />)}
                </div>
              </div>

              {/* Right — Pod Types */}
              <div style={{ flex: 1, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-end' }}>
                <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 0px', textTransform: 'uppercase', letterSpacing: 1, alignSelf: 'flex-end' }}>
                  Pods
                </p>
                {podTypes.map(type => {
                  const c     = POD_COLORS[type] || { bg: COLORS.card, border: COLORS.dim, text: COLORS.text }
                  const count = pods.filter(p => p.type === type).length
                  return (
                    <div key={type} id={`podtype-${type}`} style={{
                      background: c.bg, border: `1px solid ${c.border}`,
                      borderRadius: 8, padding: '12px 20px',
                      width: 160, textAlign: 'center'
                    }}>
                      <p style={{ color: c.text, fontSize: 14, fontWeight: 'bold', margin: '0 0 4px' }}>
                        {POD_LABELS[type]}
                      </p>
                      <p style={{ color: c.text, fontSize: 11, margin: 0, opacity: 0.7 }}>
                        {count} replica{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Emergency Node — standby mode */}
          {pi4Node && !pi4Active && (
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: 16, marginBottom: 24
            }}>
              <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
                Emergency Node — Pi 4
              </p>
              <div style={{
                background: COLORS.inputBg, border: '2px solid #378ADD',
                borderRadius: 12, padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 20,
                position: 'relative', overflow: 'hidden'
              }}>
                <div style={{ fontSize: 64, lineHeight: 1, filter: 'drop-shadow(0 0 8px #378ADD)' }}>
                  🚑
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ color: COLORS.heading, fontSize: 16, fontWeight: 'bold' }}>Pi 4 — Sensor Node</span>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 20,
                      background: COLORS.safeBg, color: '#1D9E75', border: '1px solid #1D9E75'
                    }}>online</span>
                  </div>
                  <p style={{ color: COLORS.dim, fontSize: 12, margin: '0 0 10px' }}>
                    {pi4Node.ip} · Camera stream always active · Emergency compute node
                  </p>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div>
                      <p style={{ color: COLORS.dim, fontSize: 10, margin: '0 0 2px', textTransform: 'uppercase' }}>CPU</p>
                      <p style={{ color: '#1D9E75', fontSize: 18, fontWeight: 'bold', margin: 0 }}>{pi4Node.cpu}%</p>
                    </div>
                    <div>
                      <p style={{ color: COLORS.dim, fontSize: 10, margin: '0 0 2px', textTransform: 'uppercase' }}>RAM</p>
                      <p style={{ color: '#378ADD', fontSize: 18, fontWeight: 'bold', margin: 0 }}>{pi4Node.ram}%</p>
                    </div>
                    <div>
                      <p style={{ color: COLORS.dim, fontSize: 10, margin: '0 0 2px', textTransform: 'uppercase' }}>Uptime</p>
                      <p style={{ color: '#EF9F27', fontSize: 18, fontWeight: 'bold', margin: 0 }}>
                        {Math.floor(pi4Node.uptime / 3600)}h
                      </p>
                    </div>
                    <div>
                      <p style={{ color: COLORS.dim, fontSize: 10, margin: '0 0 2px', textTransform: 'uppercase' }}>Role</p>
                      <p style={{ color: COLORS.text, fontSize: 13, fontWeight: 'bold', margin: 0 }}>Camera + Compute</p>
                    </div>
                  </div>
                </div>
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: 6, height: '100%',
                  background: 'linear-gradient(to bottom, #378ADD, transparent)',
                  opacity: 0.3, animation: 'pulse 2s infinite'
                }} />
              </div>
            </div>
          )}

          {/* Emergency Node — active mode */}
          {pi4Node && pi4Active && (
            <div style={{
              background: COLORS.pi4StandbyBg, border: '1px solid #378ADD',
              borderRadius: 12, padding: 16, marginBottom: 24,
              display: 'flex', alignItems: 'center', gap: 16,
              animation: 'fadeIn 0.5s ease'
            }}>
              <span style={{ fontSize: 40 }}>🚑</span>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#378ADD', fontSize: 14, fontWeight: 'bold', margin: '0 0 4px' }}>
                  Pi 4 — Active in cluster as MPI Worker
                </p>
                <p style={{ color: COLORS.dim, fontSize: 12, margin: 0 }}>
                  Emergency node pulled in — helping distribute compute load across 10 nodes
                </p>
              </div>
              <div style={{
                background: '#378ADD', borderRadius: 20,
                padding: '4px 14px', fontSize: 12,
                color: '#fff', fontWeight: 'bold'
              }}>
                ACTIVE
              </div>
            </div>
          )}

          {/* Grafana Button */}
          <button
            onClick={() => window.open(config.GRAFANA_URL, '_blank')}
            style={{
              background: '#EF9F27', border: 'none', borderRadius: 10,
              color: 'white', fontSize: 14, fontWeight: 'bold',
              padding: '12px 24px', cursor: 'pointer', width: '100%'
            }}
          >
            Open Grafana Dashboard
          </button>
        </div>
      </div>
    </>
  )
}