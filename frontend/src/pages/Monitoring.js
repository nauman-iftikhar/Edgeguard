import React, { useState, useEffect, useContext } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import config from '../config'
import { ThemeContext } from '../App'

export default function Monitoring() {
  const [nodes,   setNodes]   = useState([])
  const [loading, setLoading] = useState(false)
  const token   = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }
  const { dark } = useContext(ThemeContext)

  const COLORS = {
    bg:      dark ? '#0f0f0f' : '#f0f2f5',
    card:    dark ? '#1a1a1a' : '#ffffff',
    border:  dark ? '#333' : '#e0e0e0',
    text:    dark ? '#aaa' : '#555',
    dim:     dark ? '#555' : '#999',
    dimmer:  dark ? '#444' : '#bbb',
    dimmest: dark ? '#333' : '#ccc',
    heading: dark ? 'white' : '#1a1a1a',
    safeBg:  dark ? '#0a1f0a' : '#e6f7ef',
    dangerBg:dark ? '#2a0a0a' : '#fdecec',
  }

  useEffect(() => {
    fetchNodes()
    const interval = setInterval(fetchNodes, 15000)
    return () => clearInterval(interval)
  }, [])

  const fetchNodes = async () => {
    setLoading(true)
    try {
      const res = await axios.get(
        `${config.API_URL}/api/system/status`,
        { headers }
      )
      setNodes(res.data.nodes)
    } catch (e) {}
    finally { setLoading(false) }
  }

  const onlineCount  = nodes.filter(n => n.online).length
  const offlineCount = nodes.filter(n => !n.online).length

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'Arial, sans-serif' }}>
      <Navbar />

      <div style={{ padding: 20 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: COLORS.heading, margin: 0, fontSize: 20 }}>
            Cluster Monitoring
          </h2>
          <button
            onClick={fetchNodes}
            style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, color: COLORS.text, padding: '6px 14px',
              cursor: 'pointer', fontSize: 13
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total nodes', value: nodes.length,  color: '#378ADD' },
            { label: 'Online',      value: onlineCount,   color: '#1D9E75' },
            { label: 'Offline',     value: offlineCount,  color: '#E24B4A' },
          ].map((s, i) => (
            <div key={i} style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 10, padding: '14px 16px'
            }}>
              <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 4px' }}>{s.label}</p>
              <p style={{ color: s.color, fontSize: 28, fontWeight: 'bold', margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>

        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Node status
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 24 }}>
          {nodes.map((node, i) => (
            <div key={i} style={{
              background: COLORS.card,
              border: `1px solid ${node.online ? '#1D9E75' : '#E24B4A'}`,
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: COLORS.heading, fontSize: 13, fontWeight: 'bold' }}>
                  {node.name}
                </span>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 20,
                  background: node.online ? COLORS.safeBg : COLORS.dangerBg,
                  color: node.online ? '#1D9E75' : '#E24B4A',
                  border: `1px solid ${node.online ? '#1D9E75' : '#E24B4A'}`,
                }}>
                  {node.online ? 'online' : 'offline'}
                </span>
              </div>
              <p style={{ color: COLORS.dim, fontSize: 11, margin: 0 }}>{node.ip}</p>
            </div>
          ))}
        </div>

        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Grafana dashboards
        </p>

        {config.GRAFANA_URL ? (
          <div style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: 30,
            textAlign: 'center'
          }}>
            <p style={{ color: COLORS.text, fontSize: 15, margin: '0 0 6px', fontWeight: 'bold' }}>
              Grafana Monitoring Dashboard
            </p>
            <p style={{ color: COLORS.dim, fontSize: 12, margin: '0 0 20px' }}>
              CPU, RAM, Network, Disk, Temperature - all nodes live
            </p>
            <a
              href={config.GRAFANA_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#F46800',
                color: 'white',
                padding: '10px 28px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 'bold',
                display: 'inline-block'
              }}
            >
              Open Grafana Dashboard
            </a>
          </div>
        ) : (
          <div style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: 40,
            textAlign: 'center'
          }}>
            <p style={{ color: COLORS.dimmer, fontSize: 16, margin: '0 0 8px' }}>
              Grafana monitoring coming soon
            </p>
            <p style={{ color: COLORS.dimmest, fontSize: 13, margin: 0 }}>
              Set GRAFANA_URL in src/config.js after Task 5 is complete
            </p>
          </div>
        )}

      </div>
    </div>
  )
}