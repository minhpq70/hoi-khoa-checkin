import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { exportRoomsXlsx } from '../../lib/excel.js'
import { qrDataUrl } from '../../lib/qrExport.js'
import { Card, Button, Badge, Alert, Spinner, colors } from '../../ui.jsx'

export default function Export() {
  const [rooms, setRooms] = useState(null)
  const [previews, setPreviews] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('logical_room')
        .select('id, room_code, type, room_member(display_name, class, is_companion)')
        .order('room_code')

      const mapped = (data || []).map((r) => ({
        room_code: r.room_code,
        type: r.type,
        qr_id: r.id,
        members: (r.room_member || []).map((m) => ({ name: m.display_name, class: m.class || '' })),
      }))
      setRooms(mapped)
      // ảnh QR preview — QR chứa mã phòng (D01/T01)
      const pv = {}
      for (const r of mapped) pv[r.qr_id] = await qrDataUrl(r.room_code, { width: 160 })
      setPreviews(pv)
    })()
  }, [])

  async function downloadXlsx() {
    setBusy(true)
    try {
      await exportRoomsXlsx(rooms)
    } finally {
      setBusy(false)
    }
  }

  if (rooms === null) return <Spinner />
  if (!rooms.length) return <Alert kind="info">Chưa có phòng nào được chốt. Sang tab "Ghép phòng" để chốt trước.</Alert>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <b>{rooms.length}</b> phòng đã chốt
          <div style={{ flex: 1 }} />
          <Button variant="green" disabled={busy} onClick={downloadXlsx}>
            {busy ? 'Đang tạo Excel…' : '📊 Xuất Excel (kèm ảnh QR)'}
          </Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {rooms.map((r) => (
          <Card key={r.qr_id} style={{ textAlign: 'center', padding: 14 }}>
            {previews[r.qr_id] && <img src={previews[r.qr_id]} alt={r.room_code} style={{ width: 140, height: 140 }} />}
            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 6 }}>{r.room_code}</div>
            <div style={{ margin: '4px 0' }}>
              <Badge status={r.type} />
            </div>
            <div style={{ fontSize: 13, color: colors.gray }}>{r.members.map((m) => m.name).join(' & ')}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
