import React, { useState, useContext } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import config from '../config'
import { ThemeContext } from '../App'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const navigate = useNavigate()
  const { dark, toggle } = useContext(ThemeContext)

  const C = {
    bg:      dark ? '#0f0f0f' : '#f0f2f5',
    card:    dark ? '#1a1a1a' : '#ffffff',
    border:  dark ? '#333'    : '#e0e0e0',
    input:   dark ? '#111'    : '#f5f5f5',
    text:    dark ? 'white'   : '#1a1a1a',
    label:   dark ? '#aaa'    : '#555',
    dim:     dark ? '#444'    : '#999',
    error:   dark ? '#2a1a1a' : '#fff0f0',
  }

  const login = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await axios.post(`${config.API_URL}/api/auth/login`, {
        username, password
      })
      localStorage.setItem('token',    res.data.token)
      localStorage.setItem('role',     res.data.role)
      localStorage.setItem('username', res.data.username)
      navigate('/dashboard')
    } catch (err) {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      position: 'relative',
    }}>

      {/* Dark/Light toggle */}
      <button
        onClick={toggle}
        style={{
          position: 'absolute', top: 20, right: 20,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: '6px 14px',
          cursor: 'pointer', fontSize: 13,
          color: C.label, fontWeight: 600,
        }}
      >
        {dark ? '☀️ Light' : '🌙 Dark'}
      </button>

      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '40px',
        width: 360,
        boxShadow: dark ? 'none' : '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ color: '#1D9E75', fontSize: 28, margin: 0 }}>
            EdgeGuard
          </h1>
          <p style={{ color: C.dim, fontSize: 13, margin: '8px 0 0' }}>
            Surveillance System — SS2026
          </p>
        </div>

        {error && (
          <div style={{
            background: C.error, border: '1px solid #E24B4A',
            borderRadius: 8, padding: '10px 14px',
            color: '#E24B4A', fontSize: 13, marginBottom: 16
          }}>
            {error}
          </div>
        )}

        <form onSubmit={login}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: C.label, fontSize: 13, display: 'block', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px',
                background: C.input, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text, fontSize: 14,
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ color: C.label, fontSize: 13, display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px',
                background: C.input, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text, fontSize: 14,
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: loading ? '#0d6e52' : '#1D9E75',
              border: 'none', borderRadius: 8,
              color: 'white', fontSize: 15,
              fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ color: C.dim, fontSize: 12, textAlign: 'center', marginTop: 24 }}>
          admin / admin123 · operator / operator123
        </p>
      </div>
    </div>
  )
}
