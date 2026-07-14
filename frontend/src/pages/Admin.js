import React, { useState, useEffect, useContext } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import config from '../config'
import { ThemeContext } from '../App'

export default function Admin() {
  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [newUser,  setNewUser]  = useState({ username: '', password: '', role: 'operator' })
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')
  const token   = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }
  const { dark } = useContext(ThemeContext)

  const COLORS = {
    bg:       dark ? '#0f0f0f' : '#f0f2f5',
    card:     dark ? '#1a1a1a' : '#ffffff',
    inputBg:  dark ? '#111' : '#f5f5f5',
    border:   dark ? '#333' : '#e0e0e0',
    text:     dark ? '#aaa' : '#555',
    dim:      dark ? '#555' : '#999',
    heading:  dark ? 'white' : '#1a1a1a',
    safeBg:   dark ? '#0a1f0a' : '#e6f7ef',
    dangerBg: dark ? '#2a0a0a' : '#fdecec',
    avatarAdmin: dark ? '#1a2a1a' : '#dff3e8',
    avatarOp:    dark ? '#1a1a2a' : '#e3e6fa',
  }

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${config.API_URL}/api/users`, { headers })
      setUsers(res.data.users)
    } catch (e) {}
    finally { setLoading(false) }
  }

  const createUser = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await axios.post(`${config.API_URL}/api/auth/register`, newUser, { headers })
      setSuccess(`User ${newUser.username} created`)
      setNewUser({ username: '', password: '', role: 'operator' })
      setShowForm(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user')
    }
  }

  const toggleUser = async (user) => {
    try {
      await axios.put(
        `${config.API_URL}/api/users/${user.id}`,
        { is_active: !user.is_active },
        { headers }
      )
      fetchUsers()
    } catch (e) {}
  }

  const deleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return
    try {
      await axios.delete(`${config.API_URL}/api/users/${id}`, { headers })
      fetchUsers()
    } catch (e) {}
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'Arial, sans-serif' }}>
      <Navbar />

      <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: COLORS.heading, margin: 0, fontSize: 20 }}>Admin Panel</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: '#1D9E75', border: 'none',
              borderRadius: 8, color: 'white',
              padding: '8px 16px', cursor: 'pointer', fontSize: 13
            }}
          >
            + New User
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div style={{
            background: COLORS.dangerBg, border: '1px solid #E24B4A',
            borderRadius: 8, padding: '10px 14px',
            color: '#E24B4A', fontSize: 13, marginBottom: 16
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            background: COLORS.safeBg, border: '1px solid #1D9E75',
            borderRadius: 8, padding: '10px 14px',
            color: '#1D9E75', fontSize: 13, marginBottom: 16
          }}>
            {success}
          </div>
        )}

        {/* Create user form */}
        {showForm && (
          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, padding: 20, marginBottom: 20
          }}>
            <h3 style={{ color: COLORS.heading, margin: '0 0 16px', fontSize: 16 }}>
              Create New User
            </h3>
            <form onSubmit={createUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={{ color: COLORS.text, fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                    required
                    style={{
                      width: '100%', padding: '8px 12px',
                      background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, color: COLORS.heading, fontSize: 13,
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ color: COLORS.text, fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    required
                    style={{
                      width: '100%', padding: '8px 12px',
                      background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, color: COLORS.heading, fontSize: 13,
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ color: COLORS.text, fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Role
                  </label>
                  <select
                    value={newUser.role}
                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px',
                      background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, color: COLORS.heading, fontSize: 13,
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  >
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  style={{
                    background: '#1D9E75', border: 'none',
                    borderRadius: 8, color: 'white',
                    padding: '8px 16px', cursor: 'pointer', fontSize: 13
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users table */}
        <p style={{ color: COLORS.dim, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Users — {users.length} total
        </p>

        {loading ? (
          <p style={{ color: COLORS.dim }}>Loading...</p>
        ) : (
          <div>
            {users.map(user => (
              <div key={user.id} style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: '12px 16px', marginBottom: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: user.role === 'admin' ? COLORS.avatarAdmin : COLORS.avatarOp,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: user.role === 'admin' ? '#1D9E75' : '#378ADD',
                    fontSize: 14, fontWeight: 'bold'
                  }}>
                    {user.username[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ color: COLORS.heading, fontSize: 14, fontWeight: 'bold', margin: '0 0 2px' }}>
                      {user.username}
                    </p>
                    <p style={{ color: COLORS.dim, fontSize: 11, margin: 0 }}>
                      {user.last_login
                        ? `Last login: ${new Date(user.last_login).toLocaleString()}`
                        : 'Never logged in'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, padding: '2px 10px', borderRadius: 20,
                    background: user.role === 'admin' ? COLORS.safeBg : COLORS.avatarOp,
                    color:      user.role === 'admin' ? '#1D9E75' : '#378ADD',
                    border:     `1px solid ${user.role === 'admin' ? '#1D9E75' : '#378ADD'}`,
                  }}>
                    {user.role}
                  </span>

                  <span style={{
                    fontSize: 11, padding: '2px 10px', borderRadius: 20,
                    background: user.is_active ? COLORS.safeBg : COLORS.dangerBg,
                    color:      user.is_active ? '#1D9E75' : '#E24B4A',
                    border:     `1px solid ${user.is_active ? '#1D9E75' : '#E24B4A'}`,
                  }}>
                    {user.is_active ? 'active' : 'inactive'}
                  </span>

                  <button
                    onClick={() => toggleUser(user)}
                    style={{
                      background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, color: COLORS.text,
                      padding: '4px 10px', cursor: 'pointer', fontSize: 12
                    }}
                  >
                    {user.is_active ? 'Disable' : 'Enable'}
                  </button>

                  <button
                    onClick={() => deleteUser(user.id)}
                    style={{
                      background: COLORS.dangerBg, border: '1px solid #E24B4A',
                      borderRadius: 8, color: '#E24B4A',
                      padding: '4px 10px', cursor: 'pointer', fontSize: 12
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}