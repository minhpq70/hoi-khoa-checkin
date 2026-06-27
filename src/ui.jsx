// Bộ UI dùng chung cho cả 3 màn — giữ style inline gọn, không thêm thư viện.

export const colors = {
  blue: '#2563eb',
  green: '#16a34a',
  purple: '#7c3aed',
  red: '#dc2626',
  amber: '#d97706',
  gray: '#6b7280',
  border: '#e5e7eb',
  bg: '#f5f5f5',
}

export function Container({ children, width = 900 }) {
  return (
    <div style={{ maxWidth: width, margin: '0 auto', padding: '24px 16px 64px' }}>
      {children}
    </div>
  )
}

export function Card({ children, style }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Button({ children, onClick, variant = 'primary', disabled, type = 'button', style }) {
  const bg = {
    primary: colors.blue,
    green: colors.green,
    purple: colors.purple,
    danger: colors.red,
    ghost: '#fff',
  }[variant]
  const fg = variant === 'ghost' ? '#1a1a1a' : '#fff'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 16px',
        background: bg,
        color: fg,
        border: variant === 'ghost' ? `1px solid ${colors.border}` : 'none',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function Input({ label, value, onChange, type = 'text', placeholder, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      {label && <div style={{ fontSize: 13, color: colors.gray, marginBottom: 4 }}>{label}</div>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          fontSize: 15,
        }}
      />
    </label>
  )
}

export function Select({ label, value, onChange, options, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      {label && <div style={{ fontSize: 13, color: colors.gray, marginBottom: 4 }}>{label}</div>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          fontSize: 15,
          background: '#fff',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

const badgeColors = {
  pending: { bg: '#f3f4f6', fg: colors.gray, text: 'Chưa check-in' },
  waiting: { bg: '#fef3c7', fg: colors.amber, text: 'Đang chờ' },
  checked_in: { bg: '#dcfce7', fg: colors.green, text: 'Đã check-in' },
  not_ready: { bg: '#f3f4f6', fg: colors.gray, text: 'Chưa dọn' },
  available: { bg: '#dbeafe', fg: colors.blue, text: 'Trống' },
  occupied: { bg: '#dcfce7', fg: colors.green, text: 'Đã có khách' },
  double: { bg: '#ede9fe', fg: colors.purple, text: 'Double' },
  twin: { bg: '#dbeafe', fg: colors.blue, text: 'Twin' },
}

export function Badge({ status, label }) {
  const c = badgeColors[status] || { bg: '#f3f4f6', fg: colors.gray, text: status }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {label || c.text}
    </span>
  )
}

export function Alert({ kind = 'info', children }) {
  const map = {
    info: { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' },
    error: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
    success: { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
    warn: { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' },
  }
  const c = map[kind]
  return (
    <div
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: '12px 14px',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  )
}

export function Spinner({ label = 'Đang tải…' }) {
  return <div style={{ color: colors.gray, fontSize: 14, padding: 16 }}>{label}</div>
}
