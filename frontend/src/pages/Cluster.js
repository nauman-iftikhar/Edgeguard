import React, { useState, useEffect, useRef, useContext } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import config from '../config'
import { ThemeContext } from '../App'

const STATUS_COLORS = {
  standby:   '#378ADD',
  preparing: '#EF9F27',
  prepared:  '#9B59B6',
  joining:   '#EF9F27',
  active:    '#1D9E75',
  leaving:   '#EF9F27',
  error:     '#E24B4A',
}

const STATUS_LABELS = {
  standby:   'Standby — Camera duty only',
  preparing: 'Pre-warming — Registering with cluster...',
  prepared:  'Ready — Waiting for activation',
  joining:   'Joining cluster...',
  active:    'Active in cluster',
  leaving:   'Leaving cluster...',
  error:     'Error',
}

export default function Cluster() {
  const [nodes,     setNodes]     = useState([])
  const [scaler,    setScaler]    = useState(null)
  const [stressing, setStressing] = useState(false)
  const [msg,       setMsg]       = useState('')
  const [msgType,   setMsgType]   = useState('success')
  const token   = localStorage.getItem('token')
  const role    = localStorage.getItem('role')
  const headers = { Authorization: `Bearer ${token}` }
  const logRef  = useRef(null)
  const { dark } = useContext(ThemeContext)

  const COLORS = {
    bg:      dark ? '#0f0f0f' : '#f0f2f5',
    card:    dark ? '#1a1a1a' : '#ffffff',
    inputBg: dark ? '#111' : '#eef0f3',
    border:  dark ? '#333' : '#e0e0e0',
    text:    dark ? '#aaa' : '#555',
    dim:     dark ? '#555' : '#999',
    dimmer:  dark ? '#444' : '#bbb',
    heading: dark ? 'white' : '#1a1a1a',
    heading2:dark ? '#fff' : '#1a1a1a',
    safeBg:  dark ? '#0a1f0a' : '#e6f7ef',
    dangerBg:dark ? '#2a0a0a' : '#fdecec',
    pi4Bg:   dark ? '#071a07' : '#eafbf2',
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [scaler])

  const fetchAll = async () => {
    try {
      const [nodesRes, scalerRes] = await Promise.all([
        axios.get(`${config.API_URL}/api/system/status`, { headers }),
        axios.get(`${config.API_URL}/api/autoscaler/status`, { headers }),
      ])
      setNodes(nodesRes.data.nodes)
      setScaler(scalerRes.data)
    } catch (e) {}
  }

  const showMsg = (text, type = 'success') => {
    setMsg(text)
    setMsgType(type)
    setTimeout(() => setMsg(''), 5000)
  }

  const triggerStress = async () => {
    setStressing(true)
    try {
      const res = await axios.post(
        `${config.API_URL}/api/autoscaler/trigger`,
        {}, { headers }
      )
      showMsg(res.data.message, 'success')
    } catch (e) {
      showMsg('Failed to start stress test', 'error')
      setStressing(false)
    }
  }

  const stopStress = async () => {
    try {
      const res = await axios.post(
        `${config.API_URL}/api/autoscaler/stop`,
        {}, { headers }
      )
      showMsg(res.data.message, 'success')
      setStressing(false)
    } catch (e) {
      showMsg('Failed to stop stress test', 'error')
    }
  }

  const forcePi4 = async (action) => {
    try {
      const res = await axios.post(
        `${config.API_URL}/api/autoscaler/force`,
        { action }, { headers }
      )
      showMsg(res.data.message, 'success')
      setTimeout(fetchAll, 3000)
    } catch (e) {
      showMsg('Action failed — check Pi4 connectivity', 'error')
    }
  }

  const formatUptime = (seconds) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
    return `${h}h ${m}m`
  }

  const cpuColor = (cpu) => {
    if (cpu > 80) return '#E24B4A'
    if (cpu > 50) return '#EF9F27'
    return '#1D9E75'
  }

  const pi4Node      = nodes.find(n => n.name === 'pi4-camera')
  const pi4Status    = scaler?.pi4_status || 'standby'
  const clusterCpu   = scaler?.cluster_cpu || 0
  const pi4InCluster = pi4Status === 'active'

  // When Pi4 is active — include it in cluster grid with special tag
  const clearLog = async () => {
    try {
        await axios.post(
            `${config.API_URL}/api/autoscaler/clear`,
            {}, { headers }
        )
        fetchAll()
    } catch (e) {}
}
  const clusterNodes = nodes
    .filter(n => n.name !== 'pi4-camera')
    .concat(
      pi4InCluster && pi4Node
        ? [{ ...pi4Node, name: 'pi4-node', isPi4: true }]
        : []
    )

  const NodeCard = ({ node }) => (
    <div style={{
      background:   node.isPi4 ? COLORS.pi4Bg : COLORS.card,
      border:       `1px solid ${node.isPi4 ? '#1D9E75' : node.online ? COLORS.border : '#E24B4A'}`,
      borderRadius: 10,
      padding:      '14px 16px',
      position:     'relative',
      animation:    node.isPi4 ? 'slideIn 0.6s ease' : 'none',
      boxShadow:    node.isPi4 ? '0 0 12px rgba(29,158,117,0.3)' : 'none',
    }}>
      {node.isPi4 && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 9, color: '#1D9E75',
          background: dark ? '#0a2a0a' : '#d7f3e6', padding: '2px 6px',
          borderRadius: 10, border: '1px solid #1D9E75',
          fontWeight: 'bold'
        }}>
          EMERGENCY
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: node.isPi4 ? '#1D9E75' : COLORS.heading, fontSize: 13, fontWeight: 'bold' }}>
          {node.isPi4 ? 'pi4-node' : node.name}
        </span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 20,
          background: node.online ? COLORS.safeBg : COLORS.dangerBg,
          color:      node.online ? '#1D9E75' : '#E24B4A',
          border:     `1px solid ${node.online ? '#1D9E75' : '#E24B4A'}`,
        }}>
          {node.online ? 'online' : 'offline'}
        </span>
      </div>

      <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 8px' }}>{node.ip}</p>

      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: COLORS.dim, fontSize: 10 }}>CPU</span>
          <span style={{ color: cpuColor(node.cpu), fontSize: 10, fontWeight: 'bold' }}>
            {node.cpu}%
          </span>
        </div>
        <div style={{ height: 5, background: COLORS.inputBg, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(node.cpu, 100)}%`,
            background: cpuColor(node.cpu), borderRadius: 3, transition: 'width 0.5s ease'
          }} />
        </div>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: COLORS.dim, fontSize: 10 }}>RAM</span>
          <span style={{ color: '#378ADD', fontSize: 10, fontWeight: 'bold' }}>
            {node.ram}%
          </span>
        </div>
        <div style={{ height: 5, background: COLORS.inputBg, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(node.ram, 100)}%`,
            background: '#378ADD', borderRadius: 3, transition: 'width 0.5s ease'
          }} />
        </div>
      </div>

      <p style={{ color: COLORS.dimmer, fontSize: 10, margin: '6px 0 0' }}>
        Uptime: {formatUptime(node.uptime)}
      </p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'Arial, sans-serif' }}>
      <Navbar />

      <div style={{ padding: 20 }}>
        <h2 style={{ color: COLORS.heading2, marginBottom: 8 }}>Auto Scaler</h2>
<p style={{ color: COLORS.dim, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
  Monitors cluster CPU in real time. When load exceeds 80% Pi4 is automatically 
  pulled into the k3s cluster as an emergency compute node and added to the MPI 
  workload. When load drops below 50% Pi4 gracefully leaves and returns to camera duty only.
</p>

        {/* Cluster CPU bar */}
        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 20
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Cluster avg CPU (Pi3 workers)
            </p>
            <div style={{ height: 12, background: COLORS.inputBg, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.min(clusterCpu, 100)}%`,
                background: cpuColor(clusterCpu), borderRadius: 6, transition: 'width 0.5s ease'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: COLORS.dim, fontSize: 11 }}>0%</span>
              <span style={{ color: cpuColor(clusterCpu), fontSize: 14, fontWeight: 'bold' }}>
                {clusterCpu}%
              </span>
              <span style={{ color: COLORS.dim, fontSize: 11 }}>100%</span>
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 140 }}>
            <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 4px' }}>Auto scale threshold</p>
            <p style={{ color: '#EF9F27', fontSize: 13, margin: 0 }}>
              High: {scaler?.threshold_high || 80}% / Low: {scaler?.threshold_low || 50}%
            </p>
          </div>
          {pi4InCluster && (
            <div style={{
              background: COLORS.safeBg, border: '1px solid #1D9E75',
              borderRadius: 8, padding: '8px 14px', textAlign: 'center',
              animation: 'pulse 2s infinite'
            }}>
              <p style={{ color: '#1D9E75', fontSize: 11, margin: 0, fontWeight: 'bold' }}>
                Pi4 ACTIVE
              </p>
              <p style={{ color: COLORS.dim, fontSize: 10, margin: '2px 0 0' }}>
                helping cluster
              </p>
            </div>
          )}
        </div>

        {/* Cluster nodes grid — Pi4 slides in here when active */}
        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Cluster nodes — {clusterNodes.filter(n => n.online).length} online
          {pi4InCluster && (
            <span style={{ color: '#1D9E75', marginLeft: 8 }}>
              (Pi4 assisting)
            </span>
          )}
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10, marginBottom: 20
        }}>
          {clusterNodes.map((node, i) => (
            <NodeCard key={node.isPi4 ? 'pi4' : i} node={node} />
          ))}
        </div>

        {/* Pi4 Emergency node — hidden when active in cluster */}
        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Emergency node — Pi 4
        </p>

        {pi4InCluster ? (
          <div style={{
            background: COLORS.pi4Bg,
            border: '2px solid #1D9E75',
            borderRadius: 10, padding: 20, marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 16,
            animation: 'slideIn 0.5s ease'
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: '#1D9E75',
              boxShadow: '0 0 12px #1D9E75',
              animation: 'pulse 1s infinite'
            }} />
            <div>
              <p style={{ color: '#1D9E75', fontSize: 14, fontWeight: 'bold', margin: '0 0 2px' }}>
                Pi 4 has joined the cluster
              </p>
              <p style={{ color: COLORS.dim, fontSize: 12, margin: 0 }}>
                Camera stream still active · Helping distribute load
              </p>
            </div>
            {role === 'admin' && (
              <button
                onClick={() => forcePi4('leave')}
                style={{
                  marginLeft: 'auto',
                  background: COLORS.dangerBg, border: '1px solid #E24B4A',
                  borderRadius: 8, color: '#E24B4A', padding: '8px 16px',
                  cursor: 'pointer', fontSize: 12, fontWeight: 'bold'
                }}
              >
                Force Leave
              </button>
            )}
          </div>
        ) : (
          <div style={{
            background: COLORS.card,
            border: `2px solid ${STATUS_COLORS[pi4Status]}`,
            borderRadius: 10, padding: 20, marginBottom: 20,
            display: 'grid', gridTemplateColumns: '1fr 1fr auto',
            gap: 20, alignItems: 'center',
            animation: pi4Status === 'leaving' ? 'slideOut 0.5s ease' : 'none'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: STATUS_COLORS[pi4Status],
                  boxShadow: `0 0 8px ${STATUS_COLORS[pi4Status]}`,
                  animation: pi4Status === 'joining' ? 'pulse 0.8s infinite' : 'none'
                }} />
                <span style={{ color: COLORS.heading, fontSize: 15, fontWeight: 'bold' }}>
                  Pi 4 — Camera Node
                </span>
              </div>
              <p style={{ color: STATUS_COLORS[pi4Status], fontSize: 13, margin: '0 0 4px', fontWeight: 'bold' }}>
                {STATUS_LABELS[pi4Status]}
              </p>
              <p style={{ color: COLORS.dim, fontSize: 12, margin: 0 }}>
                {pi4Node?.ip || '10.10.10.40'} · Camera stream always active
              </p>
            </div>

            {pi4Node && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: COLORS.dim, fontSize: 11 }}>CPU</span>
                    <span style={{ color: cpuColor(pi4Node.cpu), fontSize: 11, fontWeight: 'bold' }}>
                      {pi4Node.cpu}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: COLORS.inputBg, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(pi4Node.cpu, 100)}%`,
                      background: cpuColor(pi4Node.cpu), borderRadius: 3
                    }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: COLORS.dim, fontSize: 11 }}>RAM</span>
                    <span style={{ color: '#378ADD', fontSize: 11, fontWeight: 'bold' }}>
                      {pi4Node.ram}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: COLORS.inputBg, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(pi4Node.ram, 100)}%`,
                      background: '#378ADD', borderRadius: 3
                    }} />
                  </div>
                </div>
              </div>
            )}

            {role === 'admin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => forcePi4('join')}
                  disabled={pi4Status === 'joining'}
                  style={{
                    background: '#1D9E75', border: 'none',
                    borderRadius: 8, color: 'white', padding: '8px 16px',
                    cursor: pi4Status === 'joining' ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 'bold',
                    opacity: pi4Status === 'joining' ? 0.5 : 1
                  }}
                >
                  {pi4Status === 'joining' ? 'Joining...' : 'Force Join'}
                </button>
                <button
                  onClick={() => forcePi4('leave')}
                  disabled={pi4Status === 'standby' || pi4Status === 'leaving'}
                  style={{
                    background: COLORS.dangerBg, border: '1px solid #E24B4A',
                    borderRadius: 8, color: '#E24B4A', padding: '8px 16px',
                    cursor: (pi4Status === 'standby' || pi4Status === 'leaving') ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 'bold',
                    opacity: (pi4Status === 'standby' || pi4Status === 'leaving') ? 0.5 : 1
                  }}
                >
                  {pi4Status === 'leaving' ? 'Leaving...' : 'Force Leave'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stress test + event log */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, padding: 20
          }}>
            <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Load testing
            </p>
            <p style={{ color: COLORS.text, fontSize: 13, margin: '0 0 16px' }}>
              Run HPL benchmark on all nodes. When cluster CPU exceeds {scaler?.threshold_high || 80}%
              the auto scaler will bring Pi4 into the cluster automatically.
            </p>

            {msg && (
              <div style={{
                background: msgType === 'error' ? COLORS.dangerBg : COLORS.safeBg,
                border: `1px solid ${msgType === 'error' ? '#E24B4A' : '#1D9E75'}`,
                borderRadius: 8, padding: '8px 12px',
                color: msgType === 'error' ? '#E24B4A' : '#1D9E75',
                fontSize: 12, marginBottom: 12
              }}>
                {msg}
              </div>
            )}

            {role === 'admin' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={triggerStress}
                  disabled={stressing}
                  style={{
                    flex: 1, padding: '12px',
                    background: stressing ? COLORS.card : '#E24B4A',
                    border: stressing ? '1px solid #E24B4A' : 'none',
                    borderRadius: 8,
                    color: stressing ? '#E24B4A' : 'white',
                    cursor: stressing ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 'bold'
                  }}
                >
                  {stressing ? 'Running...' : 'Start Stress Test'}
                </button>
                <button
                  onClick={stopStress}
                  style={{
                    padding: '12px 20px',
                    background: COLORS.card, border: `1px solid ${COLORS.dim}`,
                    borderRadius: 8, color: COLORS.text,
                    cursor: 'pointer', fontSize: 13, fontWeight: 'bold'
                  }}
                >
                  Stop
                </button>
              </div>
            )}
          </div>

          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, padding: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
    <p style={{ color: COLORS.dim, fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
        Auto scaler event log
    </p>
    {role === 'admin' && (
        <button
            onClick={clearLog}
            style={{
                background: 'transparent', border: `1px solid ${COLORS.border}`,
                borderRadius: 6, color: COLORS.dim, padding: '2px 10px',
                cursor: 'pointer', fontSize: 11
            }}
        >
            Clear
        </button>
    )}
</div>
            <div
              ref={logRef}
              style={{
                height: 200, overflowY: 'auto',
                background: COLORS.inputBg, borderRadius: 8, padding: 10,
                fontFamily: 'monospace'
              }}
            >
              {(!scaler?.events || scaler.events.length === 0) ? (
                <p style={{ color: COLORS.dimmer, fontSize: 12, margin: 0 }}>
                  No events yet — auto scaler monitoring cluster...
                </p>
              ) : scaler.events.map((e, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <span style={{ color: COLORS.dimmer, fontSize: 10 }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                  <span style={{
                    color: STATUS_COLORS[e.pi4_status] || COLORS.text,
                    fontSize: 11, marginLeft: 8
                  }}>
                    {e.message}
                  </span>
                  {e.cpu > 0 && (
                    <span style={{ color: COLORS.dim, fontSize: 10, marginLeft: 6 }}>
                      (CPU: {e.cpu}%)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes slideOut {
          from { opacity: 1; transform: translateY(0)   scale(1);    }
          to   { opacity: 0; transform: translateY(30px) scale(0.95); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}