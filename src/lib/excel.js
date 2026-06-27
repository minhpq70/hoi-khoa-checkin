import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import QRCode from 'qrcode'

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
