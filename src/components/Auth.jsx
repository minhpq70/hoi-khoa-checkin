import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Card, Button, Input, Alert } from '../ui.jsx'

// Hook trạng thái phiên. undefined = đang kiểm tra, null = chưa đăng nhập.
export function useSession() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}

// GoTrue bắt buộc email -> nhập username 'admin'/'letan', app tự ghép domain ẩn.
const LOGIN_DOMAIN = 'hoikhoa.local'
const toEmail = (username) =>
  username.includes('@') ? username.trim() : `${username.trim()}@${LOGIN_DOMAIN}`

export function LoginCard({ title = 'Đăng nhập' }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password })
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <Card style={{ maxWidth: 380, margin: '0 auto' }}>
      <h3 style={{ marginBottom: 16 }}>{title}</h3>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <Input label="Tên đăng nhập" value={username} onChange={setUsername} placeholder="admin hoặc letan" />
        <Input label="Mật khẩu" type="password" value={password} onChange={setPassword} />
        {err && <Alert kind="error">{err}</Alert>}
        <Button type="submit" variant="green" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </form>
    </Card>
  )
}
