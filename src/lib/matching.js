// === Phase 1: ghép phòng ===
// - Phòng DOUBLE: danh sách cố định, nạp qua "Import Excel ghép phòng" (không tự động).
// - Phòng TWIN: tự động ghép theo ưu tiên giới tính (bắt buộc cùng giới) -> lớp,
//   hoặc admin chỉnh tay trên app.
//
// Mỗi member: { name, class, registrant_id|null, is_companion }

function member(name, klass = '', registrant_id = null, is_companion = false) {
  return { name, class: klass || '', registrant_id, is_companion }
}

// Tự động ghép TWIN cho những người chưa được xếp (không nằm trong assignedIds).
// Quy tắc: cùng giới tính (bắt buộc) -> ưu tiên cùng lớp (sắp theo lớp rồi ghép tuần tự).
export function autoMatchTwins(registrants, assignedIds = new Set()) {
  const rest = registrants.filter((r) => !assignedIds.has(r.id))

  const byGender = {}
  rest.forEach((r) => {
    const g = r.gender || '(chưa có giới tính)'
    ;(byGender[g] ||= []).push(r)
  })

  const rooms = []
  Object.keys(byGender)
    .sort()
    .forEach((g) => {
      const list = byGender[g].sort((a, b) =>
        String(a.class || '').localeCompare(String(b.class || ''), 'vi', { numeric: true }),
      )
      for (let i = 0; i < list.length; i += 2) {
        const pair = list.slice(i, i + 2)
        rooms.push({ type: 'twin', members: pair.map((p) => member(p.full_name, p.class, p.id)) })
      }
    })

  return rooms.map((r, idx) => ({ tempId: idx + 1, ...r }))
}

// Sinh room_code lúc chốt: D01.. cho double, T01.. cho twin (theo thứ tự).
// Mã phòng cũng chính là nội dung QR -> ngắn gọn, đọc/gõ tay được khi không có thẻ.
export function assignRoomCodes(rooms) {
  const counters = { double: 0, twin: 0 }
  const prefix = { double: 'D', twin: 'T' }
  return rooms.map((r) => {
    if (r.room_code) return r // giữ mã đã có sẵn (vd nhập từ Excel)
    counters[r.type] += 1
    const n = String(counters[r.type]).padStart(2, '0')
    return { ...r, room_code: `${prefix[r.type]}${n}` }
  })
}
