import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { exportRoomsXlsx } from '../../lib/excel.js'
import { exportRoomsPdf, qrUrl, qrDataUrl } from '../../lib/qrExport.js'
import { Card, Button, Badge, Alert, Spinner, colors } from '../../ui.jsx'

export default function Export() {
  const [rooms, setRooms] = useState(null)
  const [previews, setPreviews] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('logical_room')
        .select('id, room_code, type, room_member(display_name, is_companion)')
        .order('room_code')
      const mapped = (data || []).map((r) => ({
        room_code: r.room_code,
        type: r.type,
        members: (r.room_member || []).map((m) => m.display_name),
        qr_id: r.id,
        qr_url: qrUrl(r.id),
      }))
      setRooms(mapped)
      // sinh ảnh QR preview — QR chứa UUID trần (không phải URL)
      const pv = {}
      for (const r of mapped) pv[r.qr_id] = await qrDataUrl(r.qr_id, { width: 160 })
      setPreviews(pv)
    })()
  }, [])

  async function downloadPdf() {
    setBusy(true)
    try {
      await exportRoomsPdf(rooms)
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
          <Button variant="green" onClick={() => exportRoomsXlsx(rooms)}>
            📊 Xuất Excel danh sách
          </Button>
          <Button variant="purple" disabled={busy} onClick={downloadPdf}>
            {busy ? 'Đang tạo PDF…' : '🪪 Xuất PDF thẻ QR'}
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
            <div style={{ fontSize: 13, color: colors.gray }}>{r.members.join(' & ')}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
