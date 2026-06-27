import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../../lib/supabase.js'
import { useSession, LoginCard } from '../../components/Auth.jsx'
import { Container, Card, Button, Badge, Alert, Spinner, colors } from '../../ui.jsx'

// Phase 3 — màn check-in: CHỈ lễ tân đã đăng nhập mới quét được (tránh người ngoài
// quét nhầm tự vào hàng đợi). QR chứa UUID trần, quét -> check_in -> hiện phòng / "đang chờ".

// QR có thể là URL /checkin?r=<uuid> hoặc uuid trần.
function parseRoomId(text) {
  try {
    const r = new URL(text).searchParams.get('r')
    if (r) return r
  } catch {
    /* không phải URL */
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text.trim())) return text.trim()
  return null
}

export default function CheckInPage() {
  const [params, setParams] = useSearchParams()
  const roomId = params.get('r')
  const session = useSession()

  return (
    <Container width={480}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <Link to="/" style={{ color: colors.gray, fontSize: 14 }}>
          ← Trang chủ
        </Link>
        <h2 style={{ marginLeft: 16 }}>Check-in (lễ tân)</h2>
        {session && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: colors.gray, marginRight: 12 }}>{session.user.email?.split('@')[0]}</span>
            <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
              Đăng xuất
            </Button>
          </>
        )}
      </div>

      {session === undefined ? (
        <Spinner />
      ) : !session ? (
        <LoginCard title="Đăng nhập lễ tân để quét QR" />
      ) : roomId ? (
        <Result roomId={roomId} onReset={() => setParams({})} />
      ) : (
        <Scanner onScan={(id) => setParams({ r: id })} />
      )}
    </Container>
  )
}

function Scanner({ onScan }) {
  const [error, setError] = useState(null)
  const [manual, setManual] = useState('')
  // onScan là hàm mới mỗi render -> giữ qua ref để effect chỉ chạy 1 lần (không restart camera).
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    let done = false // đã quét xong & dọn DOM chưa

    // Dọn html5-qrcode TRƯỚC khi React unmount #qr-reader, tránh lỗi removeChild -> trắng màn.
    const cleanup = async () => {
      try {
        if (qr.isScanning) await qr.stop()
      } catch {
        /* đã dừng rồi */
      }
      try {
        qr.clear()
      } catch {
        /* noop */
      }
    }

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 240 },
      async (text) => {
        const id = parseRoomId(text)
        if (!id || done) return
        done = true
        await cleanup()
        onScanRef.current(id)
      },
      () => {}, // bỏ qua lỗi quét từng frame
    ).catch((e) => setError('Không mở được camera: ' + e.message + '. Nhập mã thủ công bên dưới.'))

    return () => {
      if (!done) cleanup()
    }
  }, [])

  function submitManual(e) {
    e.preventDefault()
    const id = parseRoomId(manual)
    if (id) onScan(id)
    else setError('Mã không hợp lệ.')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <p style={{ fontSize: 14, color: colors.gray, marginBottom: 12 }}>Đưa mã QR của phòng vào khung camera.</p>
        <div id="qr-reader" style={{ width: '100%' }} />
      </Card>
      {error && <Alert kind="warn">{error}</Alert>}
      <Card>
        <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: colors.gray, marginBottom: 4 }}>Hoặc nhập mã QR / link thủ công</div>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="uuid hoặc .../checkin?r=…"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: 8 }}
            />
          </label>
          <Button type="submit">Check-in</Button>
        </form>
      </Card>
    </div>
  )
}

function Result({ roomId, onReset }) {
  const [state, setState] = useState({ status: 'loading' })
  const [info, setInfo] = useState(null) // { room_code, type, members }

  async function doCheckIn() {
    const { data, error } = await supabase.rpc('check_in', { p_logical_room_id: roomId })
    if (error) {
      if (error.message.includes('INVALID_QR')) return setState({ status: 'invalid' })
      return setState({ status: 'error', text: error.message })
    }
    const row = data?.[0]
    if (row?.result === 'checked_in') setState({ status: 'checked_in', roomNumber: row.room_number, type: row.room_type })
    else setState({ status: 'waiting', type: row?.room_type })
  }

  // Lấy thông tin phòng để hiển thị (logical_room + room_member — anon đọc được).
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('logical_room')
        .select('room_code, type, room_member(display_name)')
        .eq('id', roomId)
        .maybeSingle()
      if (data) setInfo({ room_code: data.room_code, type: data.type, members: (data.room_member || []).map((m) => m.display_name) })
    })()
    doCheckIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // Khi đang chờ: subscribe Realtime, lễ tân gán phòng -> gọi lại check_in lấy số phòng.
  useEffect(() => {
    if (state.status !== 'waiting') return
    const ch = supabase
      .channel('checkin-' + roomId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'logical_room', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new.status === 'checked_in') doCheckIn()
        },
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, roomId])

  if (state.status === 'loading') return <Spinner label="Đang xử lý check-in…" />

  if (state.status === 'invalid')
    return (
      <Card style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>❌</div>
        <h3 style={{ color: colors.red, margin: '8px 0' }}>Mã QR không hợp lệ</h3>
        <p style={{ color: colors.gray, marginBottom: 16 }}>Mã này không có trong hệ thống.</p>
        <Button variant="ghost" onClick={onReset}>
          Quét lại
        </Button>
      </Card>
    )

  if (state.status === 'error')
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Alert kind="error">Lỗi: {state.text}</Alert>
        <Button variant="ghost" onClick={onReset}>
          Thử lại
        </Button>
      </div>
    )

  const RoomHeader = info && (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{info.room_code}</div>
      <div style={{ margin: '4px 0' }}>
        <Badge status={info.type} />
      </div>
      <div style={{ fontSize: 14, color: colors.gray }}>{info.members.join(' & ')}</div>
    </div>
  )

  if (state.status === 'waiting')
    return (
      <Card style={{ textAlign: 'center', background: '#fffbeb', borderColor: '#fde68a' }}>
        {RoomHeader}
        <div style={{ fontSize: 48 }}>⏳</div>
        <h3 style={{ color: colors.amber, margin: '8px 0' }}>Đang chờ phòng</h3>
        <p style={{ color: colors.gray }}>
          Chưa có phòng {info?.type === 'double' ? 'double' : 'twin'} nào dọn xong. Màn hình sẽ tự cập nhật số phòng ngay
          khi có — vui lòng giữ trang này.
        </p>
        <div style={{ marginTop: 12 }}>
          <Spinner label="Đang theo dõi…" />
        </div>
      </Card>
    )

  // checked_in
  return (
    <Card style={{ textAlign: 'center', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
      {RoomHeader}
      <div style={{ fontSize: 48 }}>✅</div>
      <h3 style={{ color: colors.green, margin: '8px 0' }}>Đã nhận phòng</h3>
      <div style={{ fontSize: 14, color: colors.gray }}>Số phòng của bạn</div>
      <div style={{ fontSize: 56, fontWeight: 800, color: colors.green, margin: '4px 0' }}>{state.roomNumber}</div>
      <p style={{ color: colors.gray, marginBottom: 16 }}>Đến quầy lễ tân nhận chìa khoá phòng này.</p>
      <Button variant="ghost" onClick={onReset}>
        Quét mã khác
      </Button>
    </Card>
  )
}
