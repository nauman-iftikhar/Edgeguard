import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import config from '../config'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const navigate = useNavigate()

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
      background: '#0f0f0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 12,
        padding: '40px',
        width: 360,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ color: '#1D9E75', fontSize: 28, margin: 0 }}>
            EdgeGuard
          </h1>
          <p style={{ color: '#666', fontSize: 13, margin: '8px 0 0' }}>
            Surveillance System — SS2026
          </p>
        </div>

        {error && (
          <div style={{
            background: '#2a1a1a', border: '1px solid #E24B4A',
            borderRadius: 8, padding: '10px 14px',
            color: '#E24B4A', fontSize: 13, marginBottom: 16
          }}>
            {error}
          </div>
        )}

        <form onSubmit={login}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#aaa', fontSize: 13, display: 'block', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px',
                background: '#111', border: '1px solid #333',
                borderRadius: 8, color: 'white', fontSize: 14,
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ color: '#aaa', fontSize: 13, display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px',
                background: '#111', border: '1px solid #333',
                borderRadius: 8, color: 'white', fontSize: 14,
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

        <p style={{ color: '#444', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
          admin / admin123 · operator / operator123
        </p>
      </div>
    </div>
  )
}