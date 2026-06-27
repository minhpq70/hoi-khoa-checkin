import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useSession, LoginCard } from '../../components/Auth.jsx'
import { Container, Card, Button, Input, Badge, Alert, Spinner, colors } from '../../ui.jsx'

// Phase 2 — màn lễ tân: cần đăng nhập, nhập phòng đã dọn, xem dashboard.
export default function ReceptionPage() {
  const session = useSession()

  return (
    <Container width={760}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <Link to="/" style={{ color: colors.gray, fontSize: 14 }}>
          ← Trang chủ
        </Link>
        <h2 style={{ marginLeft: 16 }}>Lễ tân</h2>
        {session && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: colors.gray, marginRight: 12 }}>{session.user.email?.split('@')[0]}</span>
            <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
              Đăng xuất
            </Button>
          </>
        )}
      </div>

      {session === undefined ? <Spinner /> : session ? <Desk /> : <LoginCard title="Đăng nhập lễ tân" />}
    </Container>
  )
}

function Desk() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <AddRoomForm />
      <Dashboard />
    </div>
  )
}

function AddRoomForm() {
  const [roomNumber, setRoomNumber] = useState('')
  const [type, setType] = useState('twin')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!roomNumber.trim()) return
    setBusy(true)
    setResult(null)
    const { data, error } = await supabase.rpc('add_available_room', {
      p_room_number: roomNumber.trim(),
      p_type: type,
    })
    setBusy(false)
    if (error) {
      setResult({ kind: 'error', text: 'Lỗi: ' + error.message })
      return
    }
    const row = data?.[0]
    if (row?.result === 'assigned_to_waiting') {
      setResult({ kind: 'success', text: `Phòng ${roomNumber} → gán ngay cho khách đang chờ: ${row.assigned_room_code}. Phát chìa cho họ!` })
    } else {
      setResult({ kind: 'info', text: `Phòng ${roomNumber} (${type}) vào pool trống, chờ khách tới quét QR.` })
    }
    setRoomNumber('')
  }

  return (
    <Card>
      <h3 style={{ marginBottom: 12 }}>Nhập phòng đã dọn xong</h3>
      <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <Input
          label="Số phòng"
          value={roomNumber}
          onChange={setRoomNumber}
          placeholder="vd 301"
          style={{ flex: '1 1 160px' }}
        />
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 13, color: colors.gray, marginBottom: 4 }}>Loại</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['twin', 'double'].map((t) => (
              <Button key={t} variant={type === t ? 'primary' : 'ghost'} onClick={() => setType(t)}>
                {t === 'twin' ? 'Twin' : 'Double'}
              </Button>
            ))}
          </div>
        </div>
        <Button type="submit" variant="green" disabled={busy}>
          {busy ? 'Đang ghi…' : 'Thêm phòng'}
        </Button>
      </form>
      {result && (
        <div style={{ marginTop: 12 }}>
          <Alert kind={result.kind}>{result.text}</Alert>
        </div>
      )}
    </Card>
  )
}

function Dashboard() {
  const [physical, setPhysical] = useState([])
  const [waiting, setWaiting] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: phys }, { data: wait }] = await Promise.all([
      supabase.from('physical_room').select('id, room_number, type, status, logical_room_id').order('room_number'),
      supabase
        .from('logical_room')
        .select('room_code, type, waiting_since')
        .eq('status', 'waiting')
        .order('waiting_since'),
    ])
    setPhysical(phys || [])
    setWaiting(wait || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Realtime: phòng/hàng đợi đổi -> tải lại dashboard
    const ch = supabase
      .channel('reception-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_room' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logical_room' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  if (loading) return <Spinner />

  const counts = physical.reduce((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {})

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ background: waiting.length ? '#fffbeb' : '#fff', borderColor: waiting.length ? '#fde68a' : colors.border }}>
        <h3 style={{ marginBottom: 12 }}>Hàng đợi ({waiting.length})</h3>
        {waiting.length === 0 ? (
          <div style={{ fontSize: 14, color: colors.gray }}>Không có ai đang chờ phòng.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {waiting.map((w) => (
              <div key={w.room_code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <b>{w.room_code}</b>
                <Badge status={w.type} />
                <span style={{ color: colors.gray }}>chờ từ {new Date(w.waiting_since).toLocaleTimeString('vi-VN')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3>Phòng vật lý ({physical.length})</h3>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: colors.gray }}>
            Trống: <b>{counts.available || 0}</b> · Đã có khách: <b>{counts.occupied || 0}</b>
          </span>
        </div>
        {physical.length === 0 ? (
          <div style={{ fontSize: 14, color: colors.gray }}>Chưa nhập phòng nào.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {physical.map((p) => (
              <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700 }}>Phòng {p.room_number}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <Badge status={p.type} />
                  <Badge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
