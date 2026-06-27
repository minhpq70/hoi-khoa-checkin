# SPEC — Hệ thống ghép phòng & check-in hội khoá (Vercel + Supabase)

> Tài liệu này để đưa thẳng vào Claude Code làm theo từng phase. Văn bản tiếng Việt, tên bảng/cột/SQL giữ tiếng Anh theo chuẩn.

## 1. Nguyên tắc thiết kế cốt lõi

Tách bạch **2 khái niệm phòng**:

- **Phòng logic** (`logical_room`): kết quả ghép phòng "ai ở với ai" + loại double/twin. Cố định **trước** sự kiện. Đây là thứ sinh ra **mã phòng** và **QR**. QR chỉ chứa `logical_room.id` (uuid vô nghĩa), **không chứa số phòng KS, không chứa dữ liệu cá nhân**.
- **Phòng vật lý** (`physical_room`): số phòng KS thật + chìa khoá. Chỉ được gán **lúc check-in** theo **FCFS**, dựa trên phòng nào lễ tân đã dọn xong.

→ QR không trỏ tới số phòng KS. Lúc check-in: đọc QR → biết "cần 1 phòng twin" → lấy phòng twin trống đầu hàng → ghi nhận → phát chìa.

**Ràng buộc đã chốt:** số phòng double/twin đã fix khớp với danh sách ghép → **không có** logic thay thế chéo loại. Mỗi loại là một bài toán producer–consumer độc lập. Khách vẫn có thể *chờ trong cùng loại* nếu phòng chưa dọn xong (chỉ là vấn đề thời điểm, không phải thiếu phòng).

**Dữ liệu cá nhân:** Database **chỉ lưu họ tên + lớp** (và tên người đi cùng). **CCCD và năm sinh KHÔNG vào DB** — chúng nằm ở file Excel gốc, gửi riêng cho khách sạn để khai báo lưu trú. Hệ thống này không đụng tới CCCD ở bất kỳ đâu.

## 2. Stack

- **Frontend:** React + Vite, deploy Vercel. 3 màn: Admin (ghép phòng), Lễ tân (nhập phòng available — có đăng nhập), Check-in (quét QR — public).
- **Backend:** Supabase (Postgres + Auth + Realtime). Logic tranh chấp phòng nằm trong **RPC Postgres**, không nằm ở JS.
- **Quét QR:** `html5-qrcode` hoặc `jsQR` qua camera điện thoại/laptop.

## 3. Schema (4 bảng)

```sql
-- Người đăng ký: CHỈ tên + lớp. KHÔNG lưu CCCD/năm sinh trong DB.
-- (CCCD + năm sinh để ở file Excel gốc, gửi riêng cho khách sạn — xem mục 11.)
create table registrant (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  class           text,
  companion_name  text,             -- tên người đi cùng (nếu có) -> để ưu tiên double
  created_at      timestamptz default now()
);

-- Phòng logic: KHÔNG chứa PII. id là payload của QR.
create table logical_room (
  id               uuid primary key default gen_random_uuid(),
  room_code        text unique not null,            -- vd 'D-01', 'T-05'
  type             text not null check (type in ('double','twin')),
  status           text not null default 'pending'  -- pending | waiting | checked_in
                     check (status in ('pending','waiting','checked_in')),
  physical_room_id bigint,
  waiting_since    timestamptz,
  checked_in_at    timestamptz
);

-- Người ở trong mỗi phòng logic (chỉ tên hiển thị, KHÔNG CCCD).
create table room_member (
  id              bigint generated always as identity primary key,
  logical_room_id uuid not null references logical_room(id) on delete cascade,
  display_name    text not null,
  is_companion    boolean default false
);

-- Phòng vật lý: số phòng KS thật.
create table physical_room (
  id              bigint generated always as identity primary key,
  room_number     text unique not null,
  type            text not null check (type in ('double','twin')),
  status          text not null default 'not_ready' -- not_ready | available | occupied
                    check (status in ('not_ready','available','occupied')),
  available_at    timestamptz,
  logical_room_id uuid references logical_room(id)
);
```

## 4. Hai RPC — trái tim của hệ thống

> Cả hai là `security definer`, chạy trong 1 transaction. Điểm mấu chốt chống race là `FOR UPDATE SKIP LOCKED`.

### 4.1 `check_in` — khách quét QR

```sql
create or replace function check_in(p_logical_room_id uuid)
returns table(result text, room_number text, room_type text)
language plpgsql security definer set search_path = public as $$
declare
  v_type text; v_status text; v_phys_id bigint; v_room_number text;
begin
  -- khoá hàng phòng logic này lại
  select lr.type, lr.status, lr.physical_room_id
    into v_type, v_status, v_phys_id
  from logical_room lr where lr.id = p_logical_room_id
  for update;

  if not found then
    raise exception 'INVALID_QR';
  end if;

  -- đã check-in rồi (người thứ 2 của cặp, hoặc quét lại) -> idempotent, trả đúng phòng cũ
  if v_status = 'checked_in' then
    select pr.room_number into v_room_number from physical_room pr where pr.id = v_phys_id;
    return query select 'checked_in', v_room_number, v_type; return;
  end if;

  -- thử claim 1 phòng vật lý trống đúng loại (atomic, không trùng)
  select pr.id, pr.room_number into v_phys_id, v_room_number
  from physical_room pr
  where pr.type = v_type and pr.status = 'available'
  order by pr.available_at
  for update skip locked
  limit 1;

  if found then
    update physical_room set status='occupied', logical_room_id=p_logical_room_id where id=v_phys_id;
    update logical_room set status='checked_in', physical_room_id=v_phys_id, checked_in_at=now()
      where id=p_logical_room_id;
    return query select 'checked_in', v_room_number, v_type;
  else
    -- chưa có phòng -> vào hàng đợi (giữ nguyên waiting_since nếu đã chờ trước đó)
    update logical_room set status='waiting', waiting_since=coalesce(waiting_since, now())
      where id=p_logical_room_id;
    return query select 'waiting', null::text, v_type;
  end if;
end; $$;
```

### 4.2 `add_available_room` — lễ tân nhập phòng đã dọn xong

```sql
create or replace function add_available_room(p_room_number text, p_type text)
returns table(result text, assigned_room_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_phys_id bigint; v_logical_id uuid; v_room_code text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'UNAUTHORIZED';   -- chỉ lễ tân đã đăng nhập
  end if;

  insert into physical_room(room_number, type, status, available_at)
  values (p_room_number, p_type, 'available', now())
  on conflict (room_number) do update set status='available', available_at=now()
  returning id into v_phys_id;

  -- có ai đang chờ đúng loại không? -> ưu tiên người chờ lâu nhất
  select lr.id, lr.room_code into v_logical_id, v_room_code
  from logical_room lr
  where lr.type = p_type and lr.status = 'waiting'
  order by lr.waiting_since
  for update skip locked
  limit 1;

  if found then
    update physical_room set status='occupied', logical_room_id=v_logical_id where id=v_phys_id;
    update logical_room set status='checked_in', physical_room_id=v_phys_id, checked_in_at=now()
      where id=v_logical_id;
    return query select 'assigned_to_waiting', v_room_code;  -- bắn cho khách đang chờ qua Realtime
  else
    return query select 'added_available', null::text;        -- để vào pool chờ khách tới
  end if;
end; $$;
```

## 5. RLS & bảo mật (chỗ dễ sai nhất với Supabase)

- Bật RLS cho **tất cả** bảng.
- `registrant`: không còn CCCD/PII nhạy cảm (chỉ tên + lớp). Vẫn nên để anon **không ghi** trực tiếp; chỉ admin authenticated được thao tác. anon `SELECT` được tên để hiển thị check-in nếu cần.
- `logical_room`: anon được `SELECT` (không có PII) — cần cho Realtime để khách theo dõi phòng của mình. anon **không** được UPDATE trực tiếp (chỉ qua RPC).
- `room_member`: anon `SELECT` được (chỉ tên hiển thị) để màn check-in hiện "phòng D-05: A & B".
- `physical_room`: anon **không** truy cập trực tiếp; chỉ authenticated (lễ tân).
- Quyền thực thi: `grant execute on function check_in to anon;` — `grant execute on function add_available_room to authenticated;`
- `service_role` key chỉ đặt trong **env var của Vercel**, tuyệt đối không nhúng browser.
- Màn lễ tân bắt buộc đăng nhập (Supabase Auth).

## 6. Realtime (thay cho polling)

- Khách đang chờ: client `subscribe` thay đổi của đúng `logical_room` của mình. Khi lễ tân nhập phòng và RPC gán xong → `status` đổi sang `checked_in` → màn khách hiện số phòng ngay.
- **Không** giữ Vercel function treo chờ phòng (function có giới hạn thời gian + tính phí). Việc "chờ" để client subscribe lo, server không treo.

## 7. QR

- Nội dung QR = `logical_room.id` (uuid). Có thể bọc trong URL: `https://<app>/checkin?r=<uuid>`.
- Sinh QR ở Phase 1 sau khi chốt ghép phòng. In kèm `room_code` để đọc tay khi cần.

## 8. Acceptance criteria (edge cases bắt buộc test)

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Người thứ 2 của cặp quét QR sau khi người 1 đã check-in | Trả đúng phòng đã gán, **không** ngốn phòng mới (idempotent) |
| 2 | Quét lại QR đã check-in | Trả đúng phòng cũ |
| 3 | 2 khách khác nhau quét cùng lúc, chỉ còn 1 phòng trống đúng loại | Đúng 1 người nhận phòng, người kia vào `waiting` (nhờ `SKIP LOCKED`) |
| 4 | Khách quét khi chưa có phòng dọn xong | Trạng thái `waiting`, màn hiện "đang chờ" |
| 5 | Lễ tân nhập phòng, đang có người chờ đúng loại | Gán ngay cho người **chờ lâu nhất**, khách được báo qua Realtime |
| 6 | Lễ tân nhập phòng, không ai chờ | Phòng vào pool `available`, khách tới sau claim |
| 7 | QR sai/không tồn tại | Báo lỗi `INVALID_QR`, không crash |
| 8 | anon thử gọi `add_available_room` | Bị chặn `UNAUTHORIZED` |

## 9. Phases cho Claude Code

- **Phase 0 — Hạ tầng:** tạo project Supabase, chạy schema mục 3, RLS mục 5, seed dữ liệu mẫu.
- **Phase 1 — Ghép phòng (chạy trước sự kiện):**
  - Import danh sách đăng ký từ **Excel/CSV** (xem mục 11), có map cột + validate.
  - Công cụ ghép **bán tự động**: (1) ép double cho ai có người đi cùng + các cặp đôi; (2) gợi ý cặp twin dựa trên lịch sử ở chung các năm trước; (3) **cho admin chỉnh tay** rồi mới chốt.
  - Sinh `logical_room` + `room_member` + QR.
  - **Xuất file QR** (Excel + PDF) để gửi cho mọi người tải về / lưu mã số (xem mục 12).
- **Phase 2 — Màn lễ tân (auth):** đăng nhập, nhập phòng dọn xong (số phòng + loại) gọi `add_available_room`, dashboard trạng thái phòng/hàng đợi.
- **Phase 3 — Màn check-in (public):** quét QR → gọi `check_in` → hiện số phòng hoặc "đang chờ" (subscribe Realtime).
- **Phase 4 — Dry run:** diễn tập toàn luồng + tình huống tranh chấp (test #3) trước ngày diễn ra; in danh sách ghép phòng giấy làm fallback.

## 10. Vận hành tại hiện trường

- Cloud phụ thuộc **internet tại KS** — chuẩn bị **4G hotspot dự phòng** cho máy lễ tân.
- **In sẵn danh sách ghép phòng giấy** để check-in tay nếu hệ thống/mạng lỗi.
- Phần ghép phòng chạy trước sự kiện nên không lo mạng.
- Không nhét CCCD/PII vào QR hay phơi ra client (NĐ 13/2023 về bảo vệ dữ liệu cá nhân).

## 11. Import Excel (Phase 1)

> DB chỉ nhận **họ tên, lớp, tên người đi cùng**. Các cột CCCD/năm sinh trong file Excel **bỏ qua khi import** — chúng vẫn ở lại file Excel gốc để gửi cho khách sạn.

### Luồng

1. Admin kéo thả file `.xlsx` ở màn Admin.
2. App đọc bằng **SheetJS (xlsx)** ngay trên trình duyệt → mảng object theo header gốc (tiếng Việt).
3. **Map cột:** app tự đoán cột theo từ khoá, cho admin chỉnh lại.
4. **Validate** từng dòng → tách dòng OK / dòng lỗi. Chỉ chèn dòng OK vào `registrant`.
5. Hiện danh sách dòng lỗi để admin sửa rồi import lại.

### Quy tắc

- **Chỉ map 3 cột vào DB:** `full_name`, `class`, `companion_name`. Mọi cột khác (CCCD, năm sinh) **không đọc vào DB**.
- **Map cột linh hoạt**, vì header thật thường là "Họ và tên", "Lớp", "Người đi cùng"…
- **Validate:** thiếu `full_name` → lỗi. Không chèn ngầm dòng lỗi.
- Giữ file Excel gốc (có CCCD) ở nơi an toàn để gửi khách sạn; không upload lên chỗ public.

### Đoạn mẫu đọc .xlsx + map cột tiếng Việt

```javascript
import * as XLSX from 'xlsx';

// Chỉ quan tâm 3 cột này. CCCD/năm sinh cố tình KHÔNG map.
const COLUMN_HINTS = {
  full_name:      ['ho va ten', 'ho ten', 'hoten', 'name'],
  class:          ['lop', 'class'],
  companion_name: ['nguoi di cung', 'ten nguoi di cung', 'companion'],
};

const norm = (s) =>
  (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().trim();

function guessMapping(headers) {
  const map = {};
  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    const hit = headers.find((h) => hints.some((k) => norm(h).includes(k)));
    if (hit) map[field] = hit;
  }
  return map; // { full_name: 'Họ và tên', class: 'Lớp', companion_name: 'Người đi cùng' }
}

async function readExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { rows, headers, mapping: guessMapping(headers) };
}

function transform(rows, mapping) {
  const valid = [], errors = [];
  rows.forEach((r, i) => {
    const rec = {
      full_name:      (r[mapping.full_name] ?? '').toString().trim(),
      class:          (r[mapping.class] ?? '').toString().trim() || null,
      companion_name: (r[mapping.companion_name] ?? '').toString().trim() || null,
    };
    if (!rec.full_name) errors.push({ row: i + 2, error: 'thiếu họ tên', data: r });
    else valid.push(rec);
  });
  return { valid, errors };
}

async function importToDb(supabase, valid) {
  const { error } = await supabase.from('registrant').insert(valid);
  if (error) throw error;
}
```

## 12. Xuất file QR cho mọi người (Phase 1)

Sau khi chốt ghép phòng và sinh `logical_room`, xuất **2 dạng** để phát cho từng người tải về hoặc lưu mã số đem đến KS:

### 12.1 Excel (danh sách tổng — cho ban tổ chức)

Một sheet gồm các cột: `room_code`, `type` (double/twin), danh sách người ở phòng (`display_name`), và **link/giá trị QR** (`logical_room.id` hoặc URL `…/checkin?r=<id>`). Dùng để tổ chức gửi mail/Zalo hàng loạt. Tạo bằng SheetJS:

```javascript
import * as XLSX from 'xlsx';

function exportRoomsXlsx(rooms) {
  // rooms: [{ room_code, type, members:[name], qr_id, qr_url }]
  const data = rooms.map(r => ({
    'Mã phòng': r.room_code,
    'Loại':     r.type === 'double' ? 'Double' : 'Twin',
    'Người ở':  r.members.join(', '),
    'Mã QR':    r.qr_id,
    'Link QR':  r.qr_url,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách phòng');
  XLSX.writeFile(wb, 'danh-sach-phong-QR.xlsx');
}
```

### 12.2 PDF (một thẻ QR mỗi phòng — cho cá nhân tải về)

Mỗi `logical_room` một thẻ: **ảnh QR + `room_code` + tên người ở + loại phòng**. In/tải được, mỗi người giữ thẻ của mình. Sinh ảnh QR bằng **`qrcode`**, ghép PDF bằng **`jspdf`**:

```javascript
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

async function exportRoomsPdf(rooms) {
  const doc = new jsPDF({ unit: 'mm', format: 'a6' }); // mỗi phòng 1 thẻ A6
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (i > 0) doc.addPage();
    const dataUrl = await QRCode.toDataURL(r.qr_url, { width: 400, margin: 1 });
    doc.addImage(dataUrl, 'PNG', 35, 12, 35, 35);     // QR ở giữa trên
    doc.setFontSize(18); doc.text(r.room_code, 52, 56, { align: 'center' });
    doc.setFontSize(11);
    doc.text(r.type === 'double' ? 'Phòng Double' : 'Phòng Twin', 52, 64, { align: 'center' });
    doc.setFontSize(10);
    doc.text(r.members.join('  &  '), 52, 74, { align: 'center', maxWidth: 90 });
  }
  doc.save('the-QR-cac-phong.pdf');
}
```

> Lưu trữ KS (CCCD): hệ thống không giữ CCCD. Khi cần đưa khách sạn danh sách lưu trú gắn với số phòng, dùng file Excel gốc (có CCCD) **VLOOKUP theo họ tên** với cột `room_code` xuất ở mục 12.1. Vì có thể trùng tên, nên thêm cột lớp để đối chiếu, hoặc chốt số phòng vật lý sau check-in rồi mới khớp.
