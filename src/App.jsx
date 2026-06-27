import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import AdminPage from './pages/Admin/index.jsx'
import ReceptionPage from './pages/Reception/index.jsx'
import CheckInPage from './pages/CheckIn/index.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/reception/*" element={<ReceptionPage />} />
        <Route path="/checkin" element={<CheckInPage />} />
      </Routes>
    </BrowserRouter>
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
