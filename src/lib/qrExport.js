import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

// QR CHỈ chứa logical_room.id (UUID trần), KHÔNG bọc URL.
// -> Camera điện thoại quét chỉ ra 1 chuỗi vô nghĩa, không tự mở link/check-in.
//    Việc check-in chỉ thực hiện ở màn lễ tân (đã đăng nhập) qua trình quét app.
export function qrUrl(logicalRoomId) {
  return `${window.location.origin}/checkin?r=${logicalRoomId}`
}

// === Phase 1 mục 12.2: PDF — mỗi phòng 1 thẻ A6 (QR + mã phòng + người ở + loại) ===
export async function exportRoomsPdf(rooms) {
  // rooms: [{ room_code, type, members:[name], qr_id }]
  const doc = new jsPDF({ unit: 'mm', format: 'a6' })
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]
    if (i > 0) doc.addPage()
    const dataUrl = await QRCode.toDataURL(r.qr_id, { width: 400, margin: 1 })
    doc.addImage(dataUrl, 'PNG', 35, 12, 35, 35)
    doc.setFontSize(18)
    doc.text(r.room_code, 52, 56, { align: 'center' })
    doc.setFontSize(11)
    doc.text(r.type === 'double' ? 'Phòng Double' : 'Phòng Twin', 52, 64, { align: 'center' })
    doc.setFontSize(10)
    doc.text(r.members.join('  &  '), 52, 74, { align: 'center', maxWidth: 90 })
  }
  doc.save('the-QR-cac-phong.pdf')
}

// Ảnh QR dạng dataURL để hiện trên màn (preview / in lẻ).
export function qrDataUrl(text, opts = {}) {
  return QRCode.toDataURL(text, { width: 240, margin: 1, ...opts })
}
