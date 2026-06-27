import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import QRCode from 'qrcode'

// === Phase 1: import danh sách đăng ký từ .xlsx ===
// CHỈ map 3 cột vào DB: full_name, class, companion_name.
// CCCD / năm sinh cố tình KHÔNG đọc vào DB (xem spec mục 11).

const COLUMN_HINTS = {
  full_name: ['ho va ten', 'ho ten', 'hoten', 'name'],
  class: ['lop', 'class'],
  gender: ['gioi tinh', 'gioi', 'sex', 'gender'],
  companion_name: ['nguoi di cung', 'ten nguoi di cung', 'companion'],
}

// Chuẩn hoá giới tính -> 'Nam' | 'Nữ' | null (ưu tiên nhận diện Nữ trước vì 'female' chứa 'male').
export function normalizeGender(s) {
  const n = norm(s)
  if (!n) return null
  if (n.startsWith('nu') || n.startsWith('f') || n.includes('female') || n.includes('gai')) return 'Nữ'
  if (n.startsWith('na') || n.startsWith('m') || n.includes('male') || n.includes('trai')) return 'Nam'
  return s.toString().trim()
}

export const norm = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()

export function guessMapping(headers) {
  const map = {}
  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    const hit = headers.find((h) => hints.some((k) => norm(h).includes(k)))
    if (hit) map[field] = hit
  }
  return map
}

export async function readExcel(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
  const headers = rows.length ? Object.keys(rows[0]) : []
  return { rows, headers, mapping: guessMapping(headers) }
}

// Tách dòng OK / dòng lỗi theo mapping admin đã chốt.
export function transform(rows, mapping) {
  const valid = []
  const errors = []
  rows.forEach((r, i) => {
    const rec = {
      full_name: (r[mapping.full_name] ?? '').toString().trim(),
      class: (r[mapping.class] ?? '').toString().trim() || null,
      gender: normalizeGender(r[mapping.gender]),
      companion_name: (r[mapping.companion_name] ?? '').toString().trim() || null,
    }
    if (!rec.full_name) errors.push({ row: i + 2, error: 'thiếu họ tên', data: r })
    else valid.push(rec)
  })
  return { valid, errors }
}

// === Phase 1 mục 12.1: xuất Excel danh sách phòng (kèm ảnh QR mỗi phòng) ===
export async function exportRoomsXlsx(rooms) {
  // rooms: [{ room_code, type, members:[{ name, class }] }]
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Danh sách phòng')

  ws.columns = [
    { header: 'Mã phòng', key: 'code', width: 12 },
    { header: 'Loại', key: 'type', width: 10 },
    { header: 'Họ tên', key: 'names', width: 28 },
    { header: 'Lớp', key: 'classes', width: 14 },
    { header: 'QR code', key: 'qr', width: 16 },
  ]
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle', horizontal: 'center' }

  for (const r of rooms) {
    // mỗi thành viên 1 dòng trong ô (Họ tên & Lớp khớp dòng với nhau)
    const row = ws.addRow({
      code: r.room_code,
      type: r.type === 'double' ? 'Double' : 'Twin',
      names: r.members.map((m) => m.name).join('\n'),
      classes: r.members.map((m) => m.class || '').join('\n'),
      qr: '',
    })
    row.height = 90
    row.alignment = { vertical: 'middle', wrapText: true }
    ws.getCell(`A${row.number}`).alignment = { vertical: 'middle', horizontal: 'center' }
    ws.getCell(`B${row.number}`).alignment = { vertical: 'middle', horizontal: 'center' }

    // ảnh QR (nội dung = mã phòng) đặt vào ô cột E
    const dataUrl = await QRCode.toDataURL(r.room_code, { width: 200, margin: 1 })
    const imgId = wb.addImage({ base64: dataUrl, extension: 'png' })
    ws.addImage(imgId, {
      tl: { col: 4.2, row: row.number - 1 + 0.1 }, // E = cột index 4, hàng 0-based
      ext: { width: 80, height: 80 },
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'danh-sach-phong-QR.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// === Phase 2: lễ tân import danh sách phòng vật lý từ Excel ===

// Tải file mẫu: chỉ 2 cột Số phòng + Loại phòng (Double/Twin).
export function roomsTemplateXlsx() {
  const data = [
    { 'Số phòng': '301', 'Loại phòng': 'Double' },
    { 'Số phòng': '302', 'Loại phòng': 'Twin' },
  ]
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Phòng')
  XLSX.writeFile(wb, 'mau-nhap-phong.xlsx')
}

function normalizeRoomType(s) {
  const n = norm(s)
  if (n.includes('double')) return 'double'
  if (n.includes('twin')) return 'twin'
  return null
}

// Đọc file phòng -> { valid:[{room_number, type}], errors:[{row, error}] }.
export async function readRoomsExcel(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
  const headers = rows.length ? Object.keys(rows[0]) : []
  const numCol = headers.find((h) => ['so phong', 'phong', 'room'].some((k) => norm(h).includes(k)))
  const typeCol = headers.find((h) => ['loai', 'type'].some((k) => norm(h).includes(k)))

  const valid = []
  const errors = []
  rows.forEach((r, i) => {
    const room_number = (r[numCol] ?? '').toString().trim()
    const type = normalizeRoomType(r[typeCol])
    if (!room_number) errors.push({ row: i + 2, error: 'thiếu số phòng' })
    else if (!type) errors.push({ row: i + 2, error: 'loại phòng phải là Double hoặc Twin' })
    else valid.push({ room_number, type })
  })
  return { valid, errors }
}

// === Phase 2: xuất danh sách khách theo phòng (mỗi người 1 dòng) ===
// rows: [{ name, class, room_number }]  -> 2 dòng cho 1 phòng đôi.
export function exportGuestListXlsx(rows) {
  const data = rows.map((r) => ({
    'Họ và tên': r.name,
    Lớp: r.class || '',
    'Số phòng': r.room_number,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách khách')
  XLSX.writeFile(wb, 'danh-sach-khach-phong.xlsx')
}

// === Phase 1: ghép phòng bằng Excel (xuất / mẫu / import) ===
// Quy tắc: có người đi cùng -> phòng double, 1 dòng (cột "Họ tên người đi cùng").
//          không có người đi cùng -> mỗi mã phòng 2 dòng (2 người).
const MATCH_HINTS = {
  room_code: ['ma phong', 'maphong', 'room code', 'room_code', 'ma'],
  type: ['loai', 'type'],
  full_name: ['ho va ten', 'ho ten', 'hoten', 'name'],
  class: ['lop', 'class'],
  companion_name: ['nguoi di cung', 'companion'],
}

// rooms: [{ room_code, type, members:[{name, class, is_companion}] }] (đã gán mã)
export function exportMatchingXlsx(rooms) {
  const rows = []
  rooms.forEach((r) => {
    const typeLabel = r.type === 'double' ? 'Double' : 'Twin'
    const companion = r.members.find((m) => m.is_companion)
    if (companion) {
      const main = r.members.find((m) => !m.is_companion) || {}
      rows.push({
        'Mã phòng': r.room_code,
        'Loại phòng': 'Double',
        'Họ và tên': main.name || '',
        Lớp: main.class || '',
        'Họ tên người đi cùng': companion.name,
      })
    } else {
      r.members.forEach((m) => {
        rows.push({
          'Mã phòng': r.room_code,
          'Loại phòng': typeLabel,
          'Họ và tên': m.name,
          Lớp: m.class || '',
          'Họ tên người đi cùng': '',
        })
      })
    }
  })
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['Mã phòng', 'Loại phòng', 'Họ và tên', 'Lớp', 'Họ tên người đi cùng'],
  })
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 26 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ghép phòng')
  XLSX.writeFile(wb, 'ghep-phong.xlsx')
}

export function matchingTemplateXlsx() {
  const rows = [
    { 'Mã phòng': 'D01', 'Loại phòng': 'Double', 'Họ và tên': 'Nguyễn Văn A', Lớp: 'A1', 'Họ tên người đi cùng': 'Trần Thị B' },
    { 'Mã phòng': 'T01', 'Loại phòng': 'Twin', 'Họ và tên': 'Lê Văn C', Lớp: 'A2', 'Họ tên người đi cùng': '' },
    { 'Mã phòng': 'T01', 'Loại phòng': 'Twin', 'Họ và tên': 'Phạm Thị D', Lớp: 'A3', 'Họ tên người đi cùng': '' },
  ]
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['Mã phòng', 'Loại phòng', 'Họ và tên', 'Lớp', 'Họ tên người đi cùng'],
  })
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 26 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ghép phòng')
  XLSX.writeFile(wb, 'mau-ghep-phong.xlsx')
}

// Đọc file ghép phòng -> { rooms:[{tempId, room_code, type, members}], errors }
export async function readMatchingExcel(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
  const headers = rows.length ? Object.keys(rows[0]) : []
  const col = {}
  for (const [field, hints] of Object.entries(MATCH_HINTS)) {
    col[field] = headers.find((h) => hints.some((k) => norm(h).includes(k)))
  }

  const errors = []
  const byCode = new Map() // room_code -> { type, members }
  rows.forEach((r, i) => {
    const room_code = (r[col.room_code] ?? '').toString().trim()
    const full_name = (r[col.full_name] ?? '').toString().trim()
    const klass = (r[col.class] ?? '').toString().trim()
    const companion = (r[col.companion_name] ?? '').toString().trim()
    const typeRaw = normalizeRoomType(r[col.type])
    if (!room_code) return errors.push({ row: i + 2, error: 'thiếu mã phòng' })
    if (!full_name) return errors.push({ row: i + 2, error: 'thiếu họ tên' })

    if (!byCode.has(room_code)) byCode.set(room_code, { type: typeRaw || 'twin', members: [] })
    const room = byCode.get(room_code)
    room.members.push({ name: full_name, class: klass, registrant_id: null, is_companion: false })
    if (companion) {
      room.type = 'double' // có người đi cùng -> double
      room.members.push({ name: companion, class: '', registrant_id: null, is_companion: true })
    } else if (typeRaw) {
      room.type = typeRaw
    }
  })

  const matchRooms = [...byCode.entries()].map(([room_code, v], idx) => ({
    tempId: idx + 1,
    room_code,
    type: v.type,
    members: v.members,
  }))
  return { rooms: matchRooms, errors }
}
