-- ============================================================
-- SCHEMA — Hội khoá check-in
-- Chạy lần lượt trong Supabase SQL Editor
-- ============================================================

-- 1. Tables ------------------------------------------------

create table if not exists registrant (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  class           text,
  companion_name  text,
  created_at      timestamptz default now()
);

create table if not exists logical_room (
  id               uuid primary key default gen_random_uuid(),
  room_code        text unique not null,
  type             text not null check (type in ('double','twin')),
  status           text not null default 'pending'
                     check (status in ('pending','waiting','checked_in')),
  physical_room_id bigint,
  waiting_since    timestamptz,
  checked_in_at    timestamptz
);

create table if not exists room_member (
  id              bigint generated always as identity primary key,
  logical_room_id uuid not null references logical_room(id) on delete cascade,
  display_name    text not null,
  is_companion    boolean default false
);

create table if not exists physical_room (
  id              bigint generated always as identity primary key,
  room_number     text unique not null,
  type            text not null check (type in ('double','twin')),
  status          text not null default 'not_ready'
                    check (status in ('not_ready','available','occupied')),
  available_at    timestamptz,
  logical_room_id uuid references logical_room(id)
);

-- 2. RLS ---------------------------------------------------

alter table registrant    enable row level security;
alter table logical_room  enable row level security;
alter table room_member   enable row level security;
alter table physical_room enable row level security;

-- registrant: chỉ authenticated đọc/ghi
create policy "admin read registrant"  on registrant for select using (auth.role() = 'authenticated');
create policy "admin write registrant" on registrant for all    using (auth.role() = 'authenticated');

-- logical_room: anon đọc được (không có PII), chỉ authenticated ghi trực tiếp
create policy "anon read logical_room"  on logical_room for select using (true);
create policy "auth write logical_room" on logical_room for all    using (auth.role() = 'authenticated');

-- room_member: anon đọc được (chỉ tên hiển thị)
create policy "anon read room_member"  on room_member for select using (true);
create policy "auth write room_member" on room_member for all    using (auth.role() = 'authenticated');

-- physical_room: chỉ authenticated
create policy "auth all physical_room" on physical_room for all using (auth.role() = 'authenticated');

-- 3. RPC ---------------------------------------------------

create or replace function check_in(p_logical_room_id uuid)
returns table(result text, room_number text, room_type text)
language plpgsql security definer set search_path = public as $$
declare
  v_type text; v_status text; v_phys_id bigint; v_room_number text;
begin
  select lr.type, lr.status, lr.physical_room_id
    into v_type, v_status, v_phys_id
  from logical_room lr where lr.id = p_logical_room_id
  for update;

  if not found then
    raise exception 'INVALID_QR';
  end if;

  if v_status = 'checked_in' then
    select pr.room_number into v_room_number from physical_room pr where pr.id = v_phys_id;
    return query select 'checked_in'::text, v_room_number, v_type; return;
  end if;

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
    return query select 'checked_in'::text, v_room_number, v_type;
  else
    update logical_room set status='waiting', waiting_since=coalesce(waiting_since, now())
      where id=p_logical_room_id;
    return query select 'waiting'::text, null::text, v_type;
  end if;
end; $$;

create or replace function add_available_room(p_room_number text, p_type text)
returns table(result text, assigned_room_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_phys_id bigint; v_logical_id uuid; v_room_code text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'UNAUTHORIZED';
  end if;

  insert into physical_room(room_number, type, status, available_at)
  values (p_room_number, p_type, 'available', now())
  on conflict (room_number) do update set status='available', available_at=now()
  returning id into v_phys_id;

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
    return query select 'assigned_to_waiting'::text, v_room_code;
  else
    return query select 'added_available'::text, null::text;
  end if;
end; $$;

-- 4. Grants ------------------------------------------------

grant execute on function check_in          to anon;
grant execute on function add_available_room to authenticated;

-- 5. Realtime ----------------------------------------------
-- Cho client subscribe thay đổi (màn check-in chờ phòng, dashboard lễ tân).
-- Bọc trong DO để chạy lại không lỗi "already member".
do $$
begin
  begin
    alter publication supabase_realtime add table logical_room;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table physical_room;
  exception when duplicate_object then null;
  end;
end $$;

-- 6. Seed data mẫu ----------------------------------------

-- registrant không có unique constraint -> 'on conflict' không chặn trùng.
-- Chỉ seed khi bảng đang rỗng để chạy lại nhiều lần không nhân bản dữ liệu.
insert into registrant (full_name, class, companion_name)
select * from (values
  ('Nguyễn Văn An', 'K10A', 'Trần Thị Bình'),
  ('Trần Thị Bình', 'K10A', 'Nguyễn Văn An'),
  ('Lê Văn Cường', 'K10B', null),
  ('Phạm Thị Dung', 'K10B', null),
  ('Hoàng Văn Em', 'K10C', null),
  ('Vũ Thị Phương', 'K10C', null)
) as v(full_name, class, companion_name)
where not exists (select 1 from registrant);
