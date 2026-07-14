import React, { useState, useEffect, useContext } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import config from '../config'
import { ThemeContext } from '../App'

export default function Dashboard() {
  const [status,         setStatus]         = useState(null)
  const [events,         setEvents]         = useState([])
  const [totalAlerts,    setTotalAlerts]    = useState(0)
  const [services,       setServices]       = useState([])
  const [cameraSettings, setCameraSettings] = useState({ resolution: '1280x720', fps: 20, quality: 80 })
  const token = localStorage.getItem('token')
  const { dark } = useContext(ThemeContext)

  const headers = { Authorization: `Bearer ${token}` }

  const COLORS = {
    bg:       dark ? '#0f0f0f' : '#f0f2f5',
    card:     dark ? '#1a1a1a' : '#ffffff',
    border:   dark ? '#333' : '#e0e0e0',
    text:     dark ? '#aaa' : '#555',
    dim:      dark ? '#555' : '#999',
    dimmer:   dark ? '#444' : '#bbb',
    heading:  dark ? 'white' : '#1a1a1a',
    safeBg:   dark ? '#0a1f0a' : '#e6f7ef',
    dangerBg: dark ? '#2a0a0a' : '#fdecec',
  }

  useEffect(() => {
    fetchEvents()
    fetchServices()
    fetchStatus()
    fetchCameraSettings()

    const statusInterval   = setInterval(fetchStatus, 1000)
    const eventsInterval   = setInterval(fetchEvents, 5000)
    const servicesInterval = setInterval(fetchServices, 15000)

    return () => {
      clearInterval(statusInterval)
      clearInterval(eventsInterval)
      clearInterval(servicesInterval)
    }
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await axios.get(config.STATUS_URL)
      setStatus(res.data)
    } catch (e) {}
  }

  const fetchEvents = async () => {
    try {
      const res = await axios.get(
        `${config.API_URL}/api/events?limit=5`,
        { headers }
      )
      setEvents(res.data.events)
      setTotalAlerts(res.data.total || 0)
    } catch (e) {
      console.error('fetchEvents failed:', e.response?.status, e.message)
    }
  }

  const fetchServices = async () => {
    try {
      const res = await axios.get(
        `${config.API_URL}/api/system/services`,
        { headers }
      )
      setServices(res.data.services)
    } catch (e) {}
  }

  const fetchCameraSettings = async () => {
    try {
      const res = await axios.get(`${config.API_URL}/api/camera/settings`, { headers })
      setCameraSettings(res.data)
    } catch (e) {}
  }

  const suspicious = status?.suspicious
  const label      = status?.label

  const resolutionLabel = cameraSettings.resolution
    ? cameraSettings.resolution.split('x')[1] + 'p'
    : '—'

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'Arial, sans-serif' }}>
      <Navbar />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0, height: 'calc(100vh - 52px)' }}>

        {/* Main */}
        <div style={{ padding: 16, overflowY: 'auto' }}>

          {/* Status bar */}
          <div style={{
            background:   suspicious ? COLORS.dangerBg : label === 'non_covered_face' ? COLORS.safeBg : COLORS.card,
            border:       `1px solid ${suspicious ? '#E24B4A' : label === 'non_covered_face' ? '#1D9E75' : COLORS.border}`,
            borderRadius: 10,
            padding:      '12px 16px',
            marginBottom: 12,
            display:      'flex',
            justifyContent: 'space-between',
            alignItems:   'center',
          }}>
            <span style={{
              fontSize:   20,
              fontWeight: 'bold',
              color:      suspicious ? '#E24B4A' : label === 'non_covered_face' ? '#1D9E75' : '#EF9F27',
            }}>
              {suspicious ? '🚨 SUSPICIOUS — Face Covered!'
                : label === 'non_covered_face' ? '✅ SAFE — Face Visible'
                : '🔍 Scanning...'}
            </span>
            <span style={{ color: COLORS.dim, fontSize: 13 }}>
              FPS: {status?.fps || '--'} | Hailo: {status?.hailo_ms || '--'}ms | Alerts: {totalAlerts}
            </span>
          </div>

          {/* Video feed */}
          <div style={{ marginBottom: 12 }}>
            <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Live feed — Pi 4 camera
            </p>
            <img
              src={config.STREAM_URL}
              alt="Live stream"
              style={{
                width:        '100%',
                borderRadius: 10,
                border:       `1px solid ${COLORS.border}`,
                display:      'block',
              }}
            />
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Total alerts', value: totalAlerts, color: '#E24B4A' },
              { label: 'Inference',     value: `${status?.hailo_ms || 0}ms`, color: '#1D9E75' },
              { label: 'Stream FPS',    value: status?.fps || 0, color: '#378ADD' },
              { label: 'Resolution',    value: resolutionLabel, color: '#9B59B6' },
            ].map((s, i) => (
              <div key={i} style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: '12px 16px'
              }}>
                <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 4px' }}>{s.label}</p>
                <p style={{ color: s.color, fontSize: 24, fontWeight: 'bold', margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Recent alerts */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ color: COLORS.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
              Recent alerts (last 5 of {totalAlerts})
            </p>
            <a href="/alerts" style={{ color: COLORS.dim, fontSize: 11, textDecoration: 'underline' }}>
              View all in Alert History →
            </a>
          </div>
          {events.length === 0 ? (
            <p style={{ color: COLORS.dimmer, fontSize: 13 }}>No alerts yet</p>
          ) : events.map(e => {
            const fixedImageUrl = e.image_url
              ? e.image_url.replace('10.10.10.1:30900', '10.100.47.201:30900')
              : null
            return (
              <div key={e.id} style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: '10px 14px',
                marginBottom: 8, display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                gap: 12,
              }}>
                {fixedImageUrl && (
                  <a href={fixedImageUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                    <img
                      src={fixedImageUrl}
                      alt="Alert snapshot"
                      style={{
                        width: 64, height: 64, objectFit: 'cover',
                        borderRadius: 8, border: `1px solid ${COLORS.border}`,
                        display: 'block',
                      }}
                      onError={ev => ev.target.style.display = 'none'}
                    />
                  </a>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#E24B4A', fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                    {e.reason}
                  </p>
                  <p style={{ color: COLORS.dim, fontSize: 11, margin: 0 }}>
                    {new Date(e.timestamp).toLocaleString()} · {e.camera_id}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ color: '#E24B4A', fontWeight: 'bold', margin: 0 }}>
                    {(e.confidence * 100).toFixed(0)}%
                  </p>
                  {fixedImageUrl && (
                    <a href={fixedImageUrl} target="_blank" rel="noreferrer"
                      style={{ color: '#378ADD', fontSize: 11 }}>
                      View full size
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Sidebar */}
        <div style={{
          background:   COLORS.card,
          borderLeft:   `1px solid ${COLORS.border}`,
          padding:      16,
          overflowY:    'auto',
        }}>
          <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            Services
          </p>
          {services.map((s, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 10
            }}>
              <span style={{ color: COLORS.text, fontSize: 13 }}>{s.name}</span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: s.status === 'running' ? COLORS.safeBg : COLORS.dangerBg,
                color:      s.status === 'running' ? '#1D9E75' : '#E24B4A',
                border:     `1px solid ${s.status === 'running' ? '#1D9E75' : '#E24B4A'}`,
              }}>
                {s.status}
              </span>
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 16, paddingTop: 16 }}>
            <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Camera Settings
            </p>
            <CameraControls headers={headers} onSettingsChange={setCameraSettings} dark={dark} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CameraControls({ headers, onSettingsChange, dark }) {
  const [settings, setSettings] = useState({ resolution: '1280x720', fps: 20, quality: 80 })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const COLORS = {
    inputBg: dark ? '#111' : '#f5f5f5',
    border:  dark ? '#333' : '#ddd',
    text:    dark ? '#aaa' : '#555',
    dim:     dark ? '#444' : '#999',
    white:   dark ? 'white' : '#1a1a1a',
  }

  useEffect(() => {
    axios.get(`${config.API_URL}/api/camera/settings`, { headers })
      .then(r => setSettings(r.data))
      .catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await axios.post(`${config.API_URL}/api/camera/settings`, settings, { headers })
      setMsg('✅ Applied')
      onSettingsChange?.(settings)
      setTimeout(() => setMsg(''), 3000)
      // Force stream to reload with new settings
      const img = document.querySelector('img[alt="Live stream"]')
      if (img) {
        const src = img.src
        img.src = ''
        setTimeout(() => { img.src = src + '?t=' + Date.now() }, 500)
      }
    } catch (e) {
      setMsg('❌ Failed')
    }
    setSaving(false)
  }

  const resolutions = ['640x480', '1280x720', '1920x1080']

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Resolution */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ color: COLORS.text, fontSize: 12, margin: '0 0 6px' }}>Resolution</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {resolutions.map(r => (
            <button
              key={r}
              onClick={() => setSettings(s => ({ ...s, resolution: r }))}
              style={{
                flex: 1, padding: '4px 0', fontSize: 10,
                background: settings.resolution === r ? '#1D9E75' : COLORS.inputBg,
                border: `1px solid ${settings.resolution === r ? '#1D9E75' : COLORS.border}`,
                borderRadius: 6, color: settings.resolution === r ? 'white' : COLORS.text,
                cursor: 'pointer'
              }}
            >
              {r.split('x')[1]}p
            </button>
          ))}
        </div>
      </div>

      {/* FPS */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ color: COLORS.text, fontSize: 12, margin: 0 }}>FPS</p>
          <span style={{ color: '#1D9E75', fontSize: 12 }}>{settings.fps}</span>
        </div>
        <input
          type="range" min="5" max="30" step="5"
          value={settings.fps}
          onChange={e => setSettings(s => ({ ...s, fps: parseInt(e.target.value) }))}
          style={{ width: '100%', accentColor: '#1D9E75' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: COLORS.dim, fontSize: 10 }}>5</span>
          <span style={{ color: COLORS.dim, fontSize: 10 }}>30</span>
        </div>
      </div>

      {/* Quality */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ color: COLORS.text, fontSize: 12, margin: 0 }}>JPEG Quality</p>
          <span style={{ color: '#1D9E75', fontSize: 12 }}>{settings.quality}%</span>
        </div>
        <input
          type="range" min="30" max="95" step="5"
          value={settings.quality}
          onChange={e => setSettings(s => ({ ...s, quality: parseInt(e.target.value) }))}
          style={{ width: '100%', accentColor: '#1D9E75' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: COLORS.dim, fontSize: 10 }}>30%</span>
          <span style={{ color: COLORS.dim, fontSize: 10 }}>95%</span>
        </div>
      </div>

      {msg && (
        <p style={{ color: msg.includes('✅') ? '#1D9E75' : '#E24B4A', fontSize: 12, margin: '0 0 8px' }}>
          {msg}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        style={{
          width: '100%', padding: '8px',
          background: saving ? '#0d6e52' : '#1D9E75',
          border: 'none', borderRadius: 8,
          color: 'white', fontSize: 13,
          fontWeight: 'bold', cursor: 'pointer'
        }}
      >
        {saving ? 'Applying...' : 'Apply Settings'}
      </button>
    </div>
  )
}