import * as XLSX from 'xlsx'

// === Phase 1: import danh sách đăng ký từ .xlsx ===
// CHỈ map 3 cột vào DB: full_name, class, companion_name.
// CCCD / năm sinh cố tình KHÔNG đọc vào DB (xem spec mục 11).

const COLUMN_HINTS = {
  full_name: ['ho va ten', 'ho ten', 'hoten', 'name'],
  class: ['lop', 'class'],
  companion_name: ['nguoi di cung', 'ten nguoi di cung', 'companion'],
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
      companion_name: (r[mapping.companion_name] ?? '').toString().trim() || null,
    }
    if (!rec.full_name) errors.push({ row: i + 2, error: 'thiếu họ tên', data: r })
    else valid.push(rec)
  })
  return { valid, errors }
}

// === Phase 1 mục 12.1: xuất Excel danh sách tổng các phòng ===
export function exportRoomsXlsx(rooms) {
  // rooms: [{ room_code, type, members:[name], qr_id, qr_url }]
  const data = rooms.map((r) => ({
    'Mã phòng': r.room_code,
    Loại: r.type === 'double' ? 'Double' : 'Twin',
    'Người ở': r.members.join(', '),
    'Mã QR': r.qr_id,
    'Link QR': r.qr_url,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách phòng')
  XLSX.writeFile(wb, 'danh-sach-phong-QR.xlsx')
}
