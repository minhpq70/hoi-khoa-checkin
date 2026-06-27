import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useSession, LoginCard } from '../../components/Auth.jsx'
import { Container, Button, Spinner, colors } from '../../ui.jsx'
import Import from './Import.jsx'
import Matching from './Matching.jsx'
import Export from './Export.jsx'

// Phase 1 — màn admin: import đăng ký → ghép phòng → xuất QR.
const TABS = [
  { key: 'import', label: '1. Đăng ký' },
  { key: 'matching', label: '2. Ghép phòng' },
  { key: 'export', label: '3. Xuất QR' },
]

export default function AdminPage() {
  const [tab, setTab] = useState('import')
  const session = useSession()

  if (session === undefined)
    return (
      <Container>
        <Spinner />
      </Container>
    )
  if (!session)
    return (
      <Container>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Link to="/" style={{ color: colors.gray, fontSize: 14 }}>
            ← Trang chủ
          </Link>
          <h2 style={{ marginLeft: 16 }}>Admin</h2>
        </div>
        <LoginCard title="Đăng nhập admin" />
      </Container>
    )

  return (
    <Container>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <Link to="/" style={{ color: colors.gray, fontSize: 14 }}>
          ← Trang chủ
        </Link>
        <h2 style={{ marginLeft: 16 }}>Admin — Ghép phòng</h2>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: colors.gray, marginRight: 12 }}>{session.user.email?.split('@')[0]}</span>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
          Đăng xuất
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              color: tab === t.key ? colors.purple : colors.gray,
              borderBottom: tab === t.key ? `2px solid ${colors.purple}` : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'import' && <Import onImported={() => setTab('matching')} />}
      {tab === 'matching' && <Matching onFinalized={() => setTab('export')} />}
      {tab === 'export' && <Export />}
    </Container>
  )
}
