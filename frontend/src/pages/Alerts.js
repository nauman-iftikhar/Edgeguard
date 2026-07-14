import React, { useState, useEffect, useContext } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import config from '../config'
import { ThemeContext } from '../App'

export default function Alerts() {
  const [events,  setEvents]  = useState([])
  const [total,   setTotal]   = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [selected,setSelected]= useState(null)
  const token   = localStorage.getItem('token')
  const role    = localStorage.getItem('role')
  const headers = { Authorization: `Bearer ${token}` }
  const { dark } = useContext(ThemeContext)

  const COLORS = {
    bg:        dark ? '#0f0f0f' : '#f0f2f5',
    card:      dark ? '#1a1a1a' : '#ffffff',
    cardHover: dark ? '#1f2a1f' : '#eaf7f1',
    border:    dark ? '#333' : '#e0e0e0',
    text:      dark ? '#aaa' : '#555',
    dim:       dark ? '#555' : '#999',
    heading:   dark ? 'white' : '#1a1a1a',
    inputBg:   dark ? '#111' : '#f5f5f5',
    overlay:   'rgba(0,0,0,0.85)',
    dangerBg:  dark ? '#2a0a0a' : '#fdecec',
  }

  useEffect(() => { fetchEvents() }, [page])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const res = await axios.get(
        `${config.API_URL}/api/events?page=${page}&limit=10`,
        { headers }
      )
      setEvents(res.data.events)
      setTotal(res.data.total)
      // Use backend's `pages` field if present, otherwise derive it
      // from total/limit as a safe fallback.
      const computedPages = res.data.pages || Math.max(1, Math.ceil((res.data.total || 0) / 10))
      setTotalPages(computedPages)
    } catch (e) {}
    finally { setLoading(false) }
  }

  const deleteEvent = async (id) => {
    try {
      await axios.delete(
        `${config.API_URL}/api/events/${id}`,
        { headers }
      )
      setSelected(null)
      fetchEvents()
    } catch (e) {}
  }

  const fixUrl = (url) => url ? url.replace('10.10.10.1:30900', '10.100.47.201:30900') : null

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'Arial, sans-serif' }}>
      <Navbar />

      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: COLORS.heading, margin: 0, fontSize: 20 }}>
            Alert History
          </h2>
          <span style={{ color: COLORS.dim, fontSize: 13 }}>
            {total} total alerts
          </span>
        </div>

        {loading ? (
          <p style={{ color: COLORS.dim }}>Loading...</p>
        ) : events.length === 0 ? (
          <p style={{ color: COLORS.dim }}>No alerts recorded yet</p>
        ) : (
          <div>
            {events.map(e => {
              const thumb = fixUrl(e.image_url)
              return (
                <div
                  key={e.id}
                  onClick={() => setSelected(e)}
                  style={{
                    background:    selected?.id === e.id ? COLORS.cardHover : COLORS.card,
                    border:        `1px solid ${selected?.id === e.id ? '#1D9E75' : COLORS.border}`,
                    borderRadius:  10,
                    padding:       '12px 16px',
                    marginBottom:  8,
                    cursor:        'pointer',
                    display:       'flex',
                    justifyContent:'space-between',
                    alignItems:    'center',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt="Snapshot thumbnail"
                        style={{
                          width: 44, height: 44, objectFit: 'cover',
                          borderRadius: 6, border: `1px solid ${COLORS.border}`,
                          flexShrink: 0,
                        }}
                        onError={ev => ev.target.style.display = 'none'}
                      />
                    ) : (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#E24B4A', flexShrink: 0
                      }} />
                    )}
                    <div>
                      <p style={{ color: '#E24B4A', fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                        {e.reason} <span style={{ color: COLORS.text, fontWeight: 'normal' }}>#{e.id}</span>
                      </p>
                      <p style={{ color: COLORS.dim, fontSize: 11, margin: 0 }}>
                        {new Date(e.timestamp).toLocaleString()} · {e.camera_id}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: '#E24B4A', fontWeight: 'bold', fontSize: 16, margin: 0 }}>
                      {(e.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              )
            })}

            {/* Pagination */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.text, padding: '6px 14px',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                « First
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.text, padding: '6px 14px',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                Previous
              </button>
              <span style={{ color: COLORS.dim, fontSize: 13, padding: '0 6px' }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.text, padding: '6px 14px',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages ? 0.5 : 1,
                }}
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.text, padding: '6px 14px',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages ? 0.5 : 1,
                }}
              >
                Last »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal — snapshot view */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: COLORS.overlay,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: 24, width: 500, maxWidth: '90vw'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ color: COLORS.heading, margin: 0 }}>Alert #{selected.id}</h3>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: COLORS.dim, cursor: 'pointer', fontSize: 20 }}
              >
                ✕
              </button>
            </div>

            {fixUrl(selected.image_url) && (
              <img
                src={fixUrl(selected.image_url)}
                alt="Snapshot"
                style={{ width: '100%', borderRadius: 8, marginBottom: 16 }}
                onError={e => e.target.style.display = 'none'}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Type',       value: selected.type },
                { label: 'Confidence', value: `${(selected.confidence * 100).toFixed(0)}%` },
                { label: 'Camera',     value: selected.camera_id },
                { label: 'Time',       value: new Date(selected.timestamp).toLocaleString() },
              ].map((item, i) => (
                <div key={i} style={{
                  background: COLORS.inputBg, borderRadius: 8, padding: '8px 12px'
                }}>
                  <p style={{ color: COLORS.dim, fontSize: 11, margin: '0 0 2px' }}>{item.label}</p>
                  <p style={{ color: COLORS.heading, fontSize: 13, margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {role === 'admin' && (
              <button
                onClick={() => deleteEvent(selected.id)}
                style={{
                  width: '100%', padding: '10px',
                  background: COLORS.dangerBg, border: '1px solid #E24B4A',
                  borderRadius: 8, color: '#E24B4A', cursor: 'pointer', fontSize: 13
                }}
              >
                Delete Alert
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}



