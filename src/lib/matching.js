import { norm } from './excel.js'

// === Phase 1: ghép phòng bán tự động (spec mục 9) ===
// (1) ép double cho ai có người đi cùng / các cặp đôi
// (2) gợi ý twin cho phần còn lại (gom theo lớp)
// (3) admin chỉnh tay rồi mới chốt
//
// Mỗi member: { name, class, registrant_id|null, is_companion }
// (companion ngoài danh sách đăng ký -> registrant_id=null, is_companion=true, chỉ hiển thị)

function member(name, klass = '', registrant_id = null, is_companion = false) {
  return { name, class: klass || '', registrant_id, is_companion }
}

export function autoMatch(registrants) {
  const byNorm = new Map()
  registrants.forEach((r) => byNorm.set(norm(r.full_name), r))

  const used = new Set()
  const rooms = []

  // 1. Doubles từ companion_name
  for (const r of registrants) {
    if (used.has(r.id) || !r.companion_name) continue
    const compReg = byNorm.get(norm(r.companion_name))
    if (compReg && compReg.id !== r.id && !used.has(compReg.id)) {
      // cả hai đều là người đăng ký -> 1 phòng double duy nhất
      rooms.push({
        type: 'double',
        members: [member(r.full_name, r.class, r.id), member(compReg.full_name, compReg.class, compReg.id)],
      })
      used.add(r.id)
      used.add(compReg.id)
    } else if (!compReg) {
      // companion là người ngoài danh sách -> double, companion chỉ hiển thị
      rooms.push({
        type: 'double',
        members: [member(r.full_name, r.class, r.id), member(r.companion_name, '', null, true)],
      })
      used.add(r.id)
    }
    // compReg tồn tại nhưng đã dùng -> để r rơi xuống nhóm twin bên dưới
  }

  // 2. Twin cho phần còn lại, gom theo lớp rồi ghép đôi tuần tự
  const rest = registrants.filter((r) => !used.has(r.id))
  const groups = {}
  rest.forEach((r) => {
    const key = r.class || '(không lớp)'
    ;(groups[key] ||= []).push(r)
  })
  for (const list of Object.values(groups)) {
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2)
      rooms.push({ type: 'twin', members: pair.map((p) => member(p.full_name, p.class, p.id)) })
    }
  }

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
