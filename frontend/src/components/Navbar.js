import React, { useContext } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ThemeContext } from '../App'

export default function Navbar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const role      = localStorage.getItem('role')
  const username  = localStorage.getItem('username')
  const { dark, toggle } = useContext(ThemeContext)

  const logout = () => {
    localStorage.clear()
    navigate('/login')
  }

  const navItem = (label, path, icon) => {
    const active = location.pathname === path
    return (
      <button
        onClick={() => navigate(path)}
        style={{
          background:   active ? '#1D9E75' : 'transparent',
          border:       active ? 'none' : `1px solid ${dark ? '#333' : '#ddd'}`,
          borderRadius: 8,
          color:        active ? 'white' : dark ? '#aaa' : '#555',
          padding:      '6px 14px',
          cursor:       'pointer',
          fontSize:     13,
          display:      'flex',
          alignItems:   'center',
          gap:          6,
        }}
      >
        {icon} {label}
      </button>
    )
  }

  return (
    <div style={{
      background:     dark ? '#1a1a1a' : '#ffffff',
      borderBottom:   `1px solid ${dark ? '#333' : '#e0e0e0'}`,
      padding:        '10px 20px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      fontFamily:     'Arial, sans-serif',
      transition:     'background 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#1D9E75', fontWeight: 'bold', fontSize: 18 }}>
          EdgeGuard
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {navItem('Dashboard',  '/dashboard',  '🖥')}
          {navItem('Alerts',     '/alerts',     '🚨')}
          {navItem('Monitoring', '/monitoring', '📊')}
          {navItem('Auto Scaler', '/cluster', '⚡')}
          {navItem('Pods', '/pods', '🔲')}
          {navItem('Results', '/results', '📈')}
          {role === 'admin' && navItem('Admin', '/admin', '⚙️')}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: dark ? '#555' : '#999', fontSize: 13 }}>
          {username} · {role}
        </span>

        {/* Theme toggle */}
        <div
          onClick={toggle}
          style={{
            width:        44,
            height:       24,
            borderRadius: 12,
            background:   dark ? '#333' : '#ddd',
            position:     'relative',
            cursor:       'pointer',
            transition:   'background 0.3s ease',
          }}
        >
          <div style={{
            width:      20,
            height:     20,
            borderRadius: '50%',
            background:   dark ? '#aaa' : '#1D9E75',
            position:     'absolute',
            top:          2,
            left:         dark ? 2 : 22,
            transition:   'left 0.3s ease',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontSize:     11,
          }}>
            {dark ? '🌙' : '☀️'}
          </div>
        </div>

        <button
          onClick={logout}
          style={{
            background:   'transparent',
            border:       `1px solid ${dark ? '#333' : '#ddd'}`,
            borderRadius: 8,
            color:        dark ? '#aaa' : '#555',
            padding:      '6px 14px',
            cursor:       'pointer',
            fontSize:     13,
          }}
        >
          Logout
        </button>
      </div>
    </div>
  )
}