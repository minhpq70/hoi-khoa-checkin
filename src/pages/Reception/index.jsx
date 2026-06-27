import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useSession, LoginCard } from '../../components/Auth.jsx'
import { norm, roomsTemplateXlsx, readRoomsExcel, exportGuestListXlsx } from '../../lib/excel.js'
import { Container, Card, Button, Input, Badge, Alert, Spinner, colors } from '../../ui.jsx'

// Phase 2 — màn lễ tân: đăng nhập, nhập/import phòng, dashboard, xuất danh sách khách.
export default function ReceptionPage() {
  const session = useSession()

  return (
    <Container width={820}>
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
      <ImportRooms />
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
        <Input label="Số phòng" value={roomNumber} onChange={setRoomNumber} placeholder="vd 301" style={{ flex: '1 1 160px' }} />
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

function ImportRooms() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [summary, setSummary] = useState(null)
  const [errors, setErrors] = useState([])

  async function handleFile(file) {
    if (!file) return
    setBusy(true)
    setSummary(null)
    setErrors([])
    setProgress(null)
    try {
      const { valid, errors } = await readRoomsExcel(file)
      setErrors(errors)
      let added = 0
      let assigned = 0
      let failed = 0
      for (let i = 0; i < valid.length; i++) {
        setProgress(`Đang nhập ${i + 1}/${valid.length}…`)
        const { data, error } = await supabase.rpc('add_available_room', {
          p_room_number: valid[i].room_number,
          p_type: valid[i].type,
        })
        if (error) failed++
        else if (data?.[0]?.result === 'assigned_to_waiting') assigned++
        else added++
      }
      setProgress(null)
      setSummary(
        `Xong: ${added} phòng vào pool trống, ${assigned} gán ngay cho khách đang chờ${failed ? `, ${failed} lỗi` : ''}.`,
      )
    } catch (e) {
      setProgress(null)
      setSummary('Lỗi đọc file: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <h3>Import danh sách phòng từ Excel</h3>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={roomsTemplateXlsx}>
          ⬇ Tải file mẫu
        </Button>
        <label>
          <span
            style={{
              display: 'inline-block',
              padding: '10px 16px',
              background: busy ? colors.gray : colors.blue,
              color: '#fff',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Đang import…' : '📥 Chọn file Excel'}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p style={{ fontSize: 13, color: colors.gray }}>
        File chỉ cần 2 cột: <b>Số phòng</b> và <b>Loại phòng</b> (Double / Twin). Mỗi dòng là 1 phòng đã sẵn sàng — sẽ vào
        pool trống hoặc gán ngay cho khách đang chờ.
      </p>
      {progress && <div style={{ marginTop: 10, fontSize: 14, color: colors.gray }}>{progress}</div>}
      {summary && (
        <div style={{ marginTop: 10 }}>
          <Alert kind={summary.startsWith('Lỗi') ? 'error' : 'success'}>{summary}</Alert>
        </div>
      )}
      {errors.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13, color: colors.red, maxHeight: 140, overflow: 'auto' }}>
          {errors.map((e, i) => (
            <div key={i}>Dòng {e.row}: {e.error}</div>
          ))}
        </div>
      )}
    </Card>
  )
}

function Dashboard() {
  const [physical, setPhysical] = useState([])
  const [logical, setLogical] = useState([])
  const [classByName, setClassByName] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // phòng vật lý đang xem chi tiết

  async function load() {
    const [{ data: phys }, { data: logi }, { data: regs }] = await Promise.all([
      supabase.from('physical_room').select('id, room_number, type, status, logical_room_id').order('room_number'),
      supabase
        .from('logical_room')
        .select('id, room_code, type, status, physical_room_id, waiting_since, room_member(display_name, is_companion)')
        .order('room_code'),
      supabase.from('registrant').select('full_name, class'),
    ])
    const cmap = new Map()
    ;(regs || []).forEach((r) => {
      const k = norm(r.full_name)
      if (!cmap.has(k)) cmap.set(k, r.class || '')
    })
    setClassByName(cmap)
    setPhysical(phys || [])
    setLogical(logi || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('reception-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_room' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logical_room' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  if (loading) return <Spinner />

  const membersOf = (logicalId) => {
    const lr = logical.find((x) => x.id === logicalId)
    return (lr?.room_member || []).map((m) => ({
      name: m.display_name,
      class: m.is_companion ? '' : classByName.get(norm(m.display_name)) || '',
    }))
  }

  const waiting = logical
    .filter((lr) => lr.status === 'waiting')
    .sort((a, b) => new Date(a.waiting_since) - new Date(b.waiting_since))
  const counts = physical.reduce((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {})
  const allDone = logical.length > 0 && logical.every((lr) => lr.status === 'checked_in')

  function exportGuests() {
    const physById = new Map(physical.map((p) => [p.id, p]))
    const rows = []
    logical
      .filter((lr) => lr.status === 'checked_in' && lr.physical_room_id)
      .forEach((lr) => {
        const room_number = physById.get(lr.physical_room_id)?.room_number || ''
        ;(lr.room_member || []).forEach((m) =>
          rows.push({
            name: m.display_name,
            class: m.is_companion ? '' : classByName.get(norm(m.display_name)) || '',
            room_number,
          }),
        )
      })
    rows.sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), 'vi', { numeric: true }))
    exportGuestListXlsx(rows)
  }

  const checkedInCount = logical.filter((lr) => lr.status === 'checked_in').length

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {allDone ? (
        <Card style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ color: colors.green }}>🎉 Đã xếp phòng đầy đủ cho tất cả!</h3>
              <p style={{ fontSize: 14, color: colors.gray, marginTop: 4 }}>
                Cả {logical.length} phòng đều đã có khách nhận phòng.
              </p>
            </div>
            <div style={{ flex: 1 }} />
            <Button variant="green" onClick={exportGuests}>
              📊 Xuất Excel danh sách khách
            </Button>
          </div>
        </Card>
      ) : (
        checkedInCount > 0 && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, color: colors.gray }}>
                Đã nhận phòng: <b>{checkedInCount}</b>/{logical.length} phòng
              </span>
              <div style={{ flex: 1 }} />
              <Button variant="ghost" onClick={exportGuests}>
                📊 Xuất danh sách khách (hiện tại)
              </Button>
            </div>
          </Card>
        )
      )}

      <Card style={{ background: waiting.length ? '#fffbeb' : '#fff', borderColor: waiting.length ? '#fde68a' : colors.border }}>
        <h3 style={{ marginBottom: 12 }}>Hàng đợi ({waiting.length})</h3>
        {waiting.length === 0 ? (
          <div style={{ fontSize: 14, color: colors.gray }}>Không có ai đang chờ phòng.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {waiting.map((w) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {physical.map((p) => {
              const occupied = p.status === 'occupied'
              return (
                <div
                  key={p.id}
                  onClick={occupied ? () => setSelected({ ...p, members: membersOf(p.logical_room_id) }) : undefined}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: 10,
                    cursor: occupied ? 'pointer' : 'default',
                    background: occupied ? '#f0fdf4' : '#fff',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Phòng {p.room_number}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    <Badge status={p.type} />
                    <Badge status={p.status} />
                  </div>
                  {occupied && <div style={{ fontSize: 12, color: colors.green, marginTop: 6 }}>Bấm xem khách →</div>}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {selected && <RoomDetailModal room={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function RoomDetailModal({ room, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 380, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3>Phòng {room.room_number}</h3>
          <Badge status={room.type} />
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', color: colors.gray }}>
            ×
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {room.members.length === 0 ? (
            <div style={{ fontSize: 14, color: colors.gray }}>Không có thông tin khách.</div>
          ) : (
            room.members.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontWeight: 600 }}>{m.name}</span>
                {m.class && <span style={{ fontSize: 13, color: colors.gray }}>· {m.class}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
