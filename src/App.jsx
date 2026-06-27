import { Component } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import AdminPage from './pages/Admin/index.jsx'
import ReceptionPage from './pages/Reception/index.jsx'
import CheckInPage from './pages/CheckIn/index.jsx'

// Bắt lỗi render để không bị trắng màn cả app; cho phép tải lại.
class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Có lỗi xảy ra</h2>
          <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>{String(this.state.error?.message || this.state.error)}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600 }}
          >
            Tải lại trang
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="/reception/*" element={<ReceptionPage />} />
          <Route path="/checkin" element={<CheckInPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

function Home() {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Hội khoá — Check-in</h1>
      <p style={{ color: '#666', marginBottom: 40 }}>Chọn chức năng</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link to="/checkin" style={btnStyle('#2563eb')}>📷 Check-in (quét QR)</Link>
        <Link to="/reception" style={btnStyle('#16a34a')}>🏨 Lễ tân</Link>
        <Link to="/admin" style={btnStyle('#7c3aed')}>⚙️ Admin</Link>
      </div>
    </div>
  )
}

const btnStyle = (bg) => ({
  display: 'block',
  padding: '16px',
  background: bg,
  color: '#fff',
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 600,
})
