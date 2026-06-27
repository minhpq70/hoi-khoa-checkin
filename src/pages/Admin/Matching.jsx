import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { autoMatch, assignRoomCodes } from '../../lib/matching.js'
import { Card, Button, Badge, Alert, Spinner, colors } from '../../ui.jsx'

const DRAFT_KEY = 'checkin.matching.draft'

export default function Matching({ onFinalized }) {
  const [registrants, setRegistrants] = useState(null)
  const [existingCount, setExistingCount] = useState(0)
  const [draft, setDraft] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY)) || []
    } catch {
      return []
    }
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function load() {
    const [{ data: regs }, { count }] = await Promise.all([
      supabase.from('registrant').select('id, full_name, class, companion_name').order('created_at'),
      supabase.from('logical_room').select('id', { count: 'exact', head: true }),
    ])
    setRegistrants(regs || [])
    setExistingCount(count || 0)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])

  const assignedIds = useMemo(() => {
    const s = new Set()
    draft.forEach((r) => r.members.forEach((m) => m.registrant_id && s.add(m.registrant_id)))
    return s
  }, [draft])

  const unassigned = useMemo(
    () => (registrants || []).filter((r) => !assignedIds.has(r.id)),
    [registrants, assignedIds],
  )

  function runAuto() {
    setMsg(null)
    setDraft(autoMatch(registrants || []))
  }

  function nextTempId() {
    return draft.reduce((mx, r) => Math.max(mx, r.tempId), 0) + 1
  }

  function addRoom(type) {
    setDraft((d) => [...d, { tempId: nextTempId(), type, members: [] }])
  }

  function setRoomType(tempId, type) {
    setDraft((d) => d.map((r) => (r.tempId === tempId ? { ...r, type } : r)))
  }

  function removeRoom(tempId) {
    setDraft((d) => d.filter((r) => r.tempId !== tempId))
  }

  function removeMember(tempId, idx) {
    setDraft((d) =>
      d.map((r) => (r.tempId === tempId ? { ...r, members: r.members.filter((_, i) => i !== idx) } : r)),
    )
  }

  function addMember(tempId, registrant) {
    setDraft((d) =>
      d.map((r) =>
        r.tempId === tempId
          ? { ...r, members: [...r.members, { name: registrant.full_name, registrant_id: registrant.id, is_companion: false }] }
          : r,
      ),
    )
  }

  async function finalize() {
    const empty = draft.filter((r) => r.members.length === 0)
    if (empty.length) {
      setMsg({ kind: 'warn', text: `Có ${empty.length} phòng trống chưa có người. Xoá hoặc thêm người trước khi chốt.` })
      return
    }
    if (!window.confirm(`Chốt ${draft.length} phòng? Sau khi chốt sẽ sinh mã phòng + QR. Không nên chốt lại nhiều lần.`))
      return

    setBusy(true)
    setMsg(null)
    try {
      const coded = assignRoomCodes(draft)
      // 1. chèn logical_room, lấy lại id theo room_code
      const { data: inserted, error: e1 } = await supabase
        .from('logical_room')
        .insert(coded.map((r) => ({ room_code: r.room_code, type: r.type, status: 'pending' })))
        .select('id, room_code')
      if (e1) throw e1

      // 2. chèn room_member
      const byCode = new Map(inserted.map((r) => [r.room_code, r.id]))
      const memberRows = []
      coded.forEach((r) => {
        const lid = byCode.get(r.room_code)
        r.members.forEach((m) => memberRows.push({ logical_room_id: lid, display_name: m.name, is_companion: !!m.is_companion }))
      })
      const { error: e2 } = await supabase.from('room_member').insert(memberRows)
      if (e2) throw e2

      setDraft([])
      localStorage.removeItem(DRAFT_KEY)
      setMsg({ kind: 'success', text: `Đã chốt ${coded.length} phòng. Sang tab "Xuất QR" để tải file.` })
      load()
      onFinalized?.()
    } catch (e) {
      setMsg({ kind: 'error', text: 'Lỗi khi chốt: ' + e.message })
    } finally {
      setBusy(false)
    }
  }

  async function resetExisting() {
    if (
      !window.confirm(
        'XOÁ toàn bộ phòng đã chốt (logical_room + room_member)? Phòng vật lý đang gán sẽ được trả về "trống". Chỉ làm khi muốn ghép lại từ đầu.',
      )
    )
      return
    setBusy(true)
    setMsg(null)
    // 1. gỡ liên kết phòng vật lý (FK) + trả về pool available, nếu không sẽ vướng FK khi xoá
    const { error: e0 } = await supabase
      .from('physical_room')
      .update({ logical_room_id: null, status: 'available' })
      .not('logical_room_id', 'is', null)
    if (e0) {
      setBusy(false)
      setMsg({ kind: 'error', text: 'Lỗi gỡ phòng vật lý: ' + e0.message })
      return
    }
    // 2. xoá logical_room (room_member tự cascade)
    const { error } = await supabase.from('logical_room').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: 'Lỗi xoá: ' + error.message })
    else {
      setMsg({ kind: 'success', text: 'Đã xoá phòng đã chốt.' })
      load()
    }
  }

  if (registrants === null) return <Spinner />

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {existingCount > 0 && (
        <Alert kind="warn">
          Đã có <b>{existingCount}</b> phòng được chốt trong DB. Nếu muốn ghép lại từ đầu, hãy xoá trước.{' '}
          <Button variant="danger" style={{ marginLeft: 8, padding: '4px 10px' }} disabled={busy} onClick={resetExisting}>
            Xoá phòng đã chốt
          </Button>
        </Alert>
      )}

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <b>{registrants.length}</b> người đăng ký · <b>{draft.length}</b> phòng nháp · còn{' '}
          <b style={{ color: unassigned.length ? colors.amber : colors.green }}>{unassigned.length}</b> người chưa xếp
          <div style={{ flex: 1 }} />
          <Button variant="purple" onClick={runAuto} disabled={!registrants.length}>
            ⚡ Tự động ghép
          </Button>
          <Button variant="ghost" onClick={() => addRoom('double')}>
            + Phòng double
          </Button>
          <Button variant="ghost" onClick={() => addRoom('twin')}>
            + Phòng twin
          </Button>
        </div>
      </Card>

      {unassigned.length > 0 && (
        <Card style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <h4 style={{ marginBottom: 8 }}>Chưa xếp phòng ({unassigned.length})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unassigned.map((r) => (
              <span
                key={r.id}
                style={{ fontSize: 13, padding: '4px 10px', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8 }}
              >
                {r.full_name} {r.class && <span style={{ color: colors.gray }}>· {r.class}</span>}
              </span>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {draft.map((room, i) => (
          <RoomCard
            key={room.tempId}
            room={room}
            index={i + 1}
            unassigned={unassigned}
            onType={(t) => setRoomType(room.tempId, t)}
            onRemoveRoom={() => removeRoom(room.tempId)}
            onRemoveMember={(idx) => removeMember(room.tempId, idx)}
            onAddMember={(reg) => addMember(room.tempId, reg)}
          />
        ))}
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {draft.length > 0 && (
        <div>
          <Button variant="green" disabled={busy} onClick={finalize}>
            {busy ? 'Đang chốt…' : `✅ Chốt ghép phòng (${draft.length} phòng)`}
          </Button>
        </div>
      )}
    </div>
  )
}

function RoomCard({ room, index, unassigned, onType, onRemoveRoom, onRemoveMember, onAddMember }) {
  const cap = room.type === 'double' ? 2 : 2 // cả 2 loại đều 2 người; double = 1 giường đôi, twin = 2 giường
  const over = room.members.length > cap
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: colors.gray }}>#{index}</span>
        <select
          value={room.type}
          onChange={(e) => onType(e.target.value)}
          style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${colors.border}` }}
        >
          <option value="double">Double</option>
          <option value="twin">Twin</option>
        </select>
        <Badge status={room.type} />
        <div style={{ flex: 1 }} />
        <button onClick={onRemoveRoom} title="Xoá phòng" style={{ color: colors.red, fontSize: 18, cursor: 'pointer', background: 'none', border: 'none' }}>
          ×
        </button>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {room.members.map((m, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              {m.name}
              {m.is_companion && <span style={{ color: colors.gray, fontSize: 12 }}> (đi cùng)</span>}
            </span>
            <button onClick={() => onRemoveMember(idx)} style={{ color: colors.red, cursor: 'pointer', background: 'none', border: 'none' }}>
              ✕
            </button>
          </div>
        ))}
        {room.members.length === 0 && <div style={{ fontSize: 13, color: colors.gray }}>Chưa có người</div>}
      </div>

      {over && <div style={{ fontSize: 12, color: colors.red, marginTop: 6 }}>⚠ Hơn 2 người trong 1 phòng</div>}

      {unassigned.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const reg = unassigned.find((r) => r.id === e.target.value)
            if (reg) onAddMember(reg)
          }}
          style={{ marginTop: 10, width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${colors.border}` }}
        >
          <option value="">+ thêm người…</option>
          {unassigned.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name} {r.class ? `· ${r.class}` : ''}
            </option>
          ))}
        </select>
      )}
    </Card>
  )
}
