import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Monitoring from './pages/Monitoring'
import Cluster from './pages/Cluster'
import Admin from './pages/Admin'
import Pods from './pages/Pods'
import Results from './pages/Results'
const ProtectedRoute = ({ children, adminOnly }) => {
  const token = localStorage.getItem('token')
  const role  = localStorage.getItem('role')
  if (!token) return <Navigate to="/login" />
  if (adminOnly && role !== 'admin') return <Navigate to="/dashboard" />
  return children
}

export function useTheme() {
  const [dark, setDark] = React.useState(
    localStorage.getItem('theme') !== 'light'
  )
  const toggle = () => {
  const next = !dark
  setDark(next)
  localStorage.setItem('theme', next ? 'dark' : 'light')
  document.body.setAttribute('data-theme', next ? 'dark' : 'light')
}
  return { dark, toggle }
}

export const ThemeContext = React.createContext({ dark: true, toggle: () => {} })

function App() {
  const theme = useTheme()

  return (
    <ThemeContext.Provider value={theme}>
      <div style={{
        background: theme.dark ? '#0f0f0f' : '#f0f2f5',
        minHeight: '100vh',
        transition: 'background 0.3s ease'
      }}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/alerts" element={
              <ProtectedRoute><Alerts /></ProtectedRoute>
            } />
            <Route path="/monitoring" element={
              <ProtectedRoute><Monitoring /></ProtectedRoute>
            } />
            <Route path="/cluster" element={
              <ProtectedRoute><Cluster /></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute adminOnly={true}><Admin /></ProtectedRoute>
            } />
            <Route path="/pods" element={
  <ProtectedRoute><Pods /></ProtectedRoute>
} />
            <Route path="/results" element={
  <ProtectedRoute><Results /></ProtectedRoute>
} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </BrowserRouter>
        <div style={{
          textAlign: 'center',
          padding: '12px',
          fontSize: 12,
          color: theme.dark ? '#555' : '#999',
          borderTop: theme.dark ? '1px solid #333' : '1px solid #e0e0e0',
          background: theme.dark ? '#0f0f0f' : '#f0f2f5'
        }}>
          EdgeGuard SS2026 — Frankfurt University of Applied Sciences &nbsp;|&nbsp;
          <a href="https://nauman-iftikhar.github.io/Edgeguard" target="_blank" rel="noreferrer" style={{ color: '#1D9E75', textDecoration: 'none' }}>📖 Documentation</a>
          &nbsp;|&nbsp;
          <a href="https://github.com/nauman-iftikhar/Edgeguard" target="_blank" rel="noreferrer" style={{ color: '#378ADD', textDecoration: 'none' }}>GitHub ↗</a>
        </div>
      </div>
    </ThemeContext.Provider>
  )
}

export default App