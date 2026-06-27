import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { readExcel, transform } from '../../lib/excel.js'
import { Card, Button, Select, Alert, colors } from '../../ui.jsx'

const FIELD_LABELS = {
  full_name: 'Họ và tên *',
  class: 'Lớp',
  companion_name: 'Người đi cùng',
}

export default function Import({ onImported }) {
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file) {
    if (!file) return
    setMsg(null)
    try {
      const res = await readExcel(file)
      if (!res.rows.length) {
        setMsg({ kind: 'error', text: 'File không có dòng dữ liệu nào.' })
        return
      }
      setHeaders(res.headers)
      setRows(res.rows)
      setMapping(res.mapping)
    } catch (e) {
      setMsg({ kind: 'error', text: 'Không đọc được file: ' + e.message })
    }
  }

  const { valid, errors } = rows.length && mapping.full_name ? transform(rows, mapping) : { valid: [], errors: [] }

  async function doImport() {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('registrant').insert(valid)
    setBusy(false)
    if (error) {
      setMsg({ kind: 'error', text: 'Lỗi import: ' + error.message })
    } else {
      setMsg({ kind: 'success', text: `Đã import ${valid.length} người vào danh sách.` })
      setHeaders([])
      setRows([])
      setMapping({})
      onImported?.()
    }
  }

  const headerOptions = [{ value: '', label: '— không map —' }, ...headers.map((h) => ({ value: h, label: h }))]

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h3 style={{ marginBottom: 12 }}>1. Tải file Excel đăng ký (.xlsx)</h3>
        <p style={{ fontSize: 13, color: colors.gray, marginBottom: 12 }}>
          Chỉ <b>họ tên, lớp, người đi cùng</b> được đọc vào hệ thống. Cột CCCD / năm sinh (nếu có) bị bỏ qua —
          không bao giờ vào database.
        </p>
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFile(e.dataTransfer.files?.[0])
          }}
          style={{
            display: 'block',
            border: `2px dashed ${dragOver ? colors.blue : colors.border}`,
            borderRadius: 10,
            padding: 32,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? '#eff6ff' : '#fafafa',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 14, color: colors.gray }}>Kéo thả file vào đây hoặc bấm để chọn</div>
          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      </Card>

      {headers.length > 0 && (
        <Card>
          <h3 style={{ marginBottom: 12 }}>2. Map cột</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {Object.keys(FIELD_LABELS).map((field) => (
              <Select
                key={field}
                label={FIELD_LABELS[field]}
                value={mapping[field] || ''}
                onChange={(v) => setMapping((m) => ({ ...m, [field]: v || undefined }))}
                options={headerOptions}
              />
            ))}
          </div>
          <p style={{ fontSize: 13, color: colors.gray, marginTop: 12 }}>
            Đọc được <b>{rows.length}</b> dòng → <b style={{ color: colors.green }}>{valid.length}</b> hợp lệ
            {errors.length > 0 && (
              <>
                {' · '}
                <b style={{ color: colors.red }}>{errors.length}</b> lỗi
              </>
            )}
          </p>
        </Card>
      )}

      {errors.length > 0 && (
        <Card>
          <h3 style={{ marginBottom: 12, color: colors.red }}>Dòng lỗi (không được import)</h3>
          <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 13 }}>
            {errors.map((e, i) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
                Dòng {e.row}: {e.error}
              </div>
            ))}
          </div>
        </Card>
      )}

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {valid.length > 0 && (
        <div>
          <Button variant="purple" disabled={busy} onClick={doImport}>
            {busy ? 'Đang import…' : `Import ${valid.length} người vào danh sách`}
          </Button>
        </div>
      )}
    </div>
  )
}
