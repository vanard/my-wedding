-- Guest services on top of 0001: personal-link lookup, RSVP, wishes and venue check-in.
--
-- Access model: browsers never reach these tables or functions. Only the site's Vercel
-- Functions call them, with the server-only secret key (role service_role). Guests are
-- identified by the SHA-256 hash of the opaque code in their personal link (?k=); the
-- code itself is never stored. Venue staff are authorized by the endpoint (CHECKIN_KEY).

-- Venue check-in: when the party's QR code (or name search) was first confirmed by staff.
alter table public.invitation_parties add column checked_in_at timestamptz;

-- One party per display name (case-insensitive), so re-running a guest import cannot
-- create duplicates. Distinguish genuine namesakes in the name, e.g. "Budi (Kantor)".
create unique index invitation_parties_display_name_key on public.invitation_parties (lower(display_name));

-- Persistent rate limiting, shared by every function instance.
create table public.request_events (
  party_id uuid not null references public.invitation_parties(id) on delete cascade,
  action text not null check (action in ('rsvp', 'wish')),
  at timestamptz not null default now()
);
create index request_events_recent on public.request_events (party_id, action, at desc);
create index wishes_party on public.wishes (party_id);
alter table public.request_events enable row level security;
revoke all on public.request_events from anon, authenticated;

-- Records one request for the party, or raises RATE_LIMITED when the window is full.
-- The advisory lock serializes concurrent requests of the same party and action.
create function public.take_request_slot(p_party uuid, p_action text, p_limit integer, p_window interval)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_party::text || ':' || p_action, 0));
  if (select count(*) from public.request_events
      where party_id = p_party and action = p_action and at > now() - p_window) >= p_limit then
    raise exception 'RATE_LIMITED';
  end if;
  delete from public.request_events where party_id = p_party and action = p_action and at < now() - interval '1 day';
  insert into public.request_events (party_id, action) values (p_party, p_action);
end;
$$;

create function public.rsvp_json(r public.rsvps) returns jsonb
language sql immutable set search_path = '' as $$
  select case when r.party_id is null then null
    else jsonb_build_object('attendance', r.attendance, 'guestCount', r.guest_count, 'updatedAt', r.updated_at) end;
$$;

-- The guest's own invitation: display name, allowance and current RSVP.
create function public.guest_party(p_token_hash text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  p public.invitation_parties;
  r public.rsvps;
begin
  select * into p from public.invitation_parties where token_hash = p_token_hash;
  if not found then raise exception 'INVALID_TOKEN'; end if;
  select * into r from public.rsvps where party_id = p.id;
  return jsonb_build_object('name', p.display_name, 'maxGuests', p.max_guests, 'rsvp', public.rsvp_json(r));
end;
$$;

-- One current RSVP per party: an atomic upsert, so retries and double submits never duplicate.
create function public.submit_rsvp(p_token_hash text, p_attendance text, p_guest_count integer)
returns jsonb language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
  r public.rsvps;
begin
  select * into p from public.invitation_parties where token_hash = p_token_hash;
  if not found then raise exception 'INVALID_TOKEN'; end if;
  if p_attendance is null or p_attendance not in ('attending', 'declined') then raise exception 'INVALID_ATTENDANCE'; end if;
  if p_attendance = 'declined' then
    p_guest_count := 0;
  elsif p_guest_count is null or p_guest_count < 1 or p_guest_count > p.max_guests then
    raise exception 'INVALID_GUEST_COUNT';
  end if;
  perform public.take_request_slot(p.id, 'rsvp', 10, interval '10 minutes');
  insert into public.rsvps (party_id, attendance, guest_count)
  values (p.id, p_attendance, p_guest_count)
  on conflict (party_id) do update set attendance = excluded.attendance, guest_count = excluded.guest_count
  returning * into r;
  return public.rsvp_json(r);
end;
$$;

-- A wish waits for the couple's approval before it is shown. The idempotency key makes a
-- retried submission return the wish that was already saved instead of adding another.
create function public.submit_wish(p_token_hash text, p_idempotency_key uuid, p_name text, p_message text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
  w public.wishes;
begin
  select * into p from public.invitation_parties where token_hash = p_token_hash;
  if not found then raise exception 'INVALID_TOKEN'; end if;
  if p_idempotency_key is null
    or char_length(coalesce(btrim(p_name), '')) not between 1 and 100
    or char_length(coalesce(btrim(p_message), '')) not between 1 and 1000 then
    raise exception 'INVALID_WISH';
  end if;
  select * into w from public.wishes where party_id = p.id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('approved', w.approved, 'duplicate', true); end if;
  perform public.take_request_slot(p.id, 'wish', 3, interval '10 minutes');
  if (select count(*) from public.wishes where party_id = p.id) >= 10 then raise exception 'WISH_LIMIT'; end if;
  insert into public.wishes (party_id, idempotency_key, name, message)
  values (p.id, p_idempotency_key, btrim(p_name), btrim(p_message))
  on conflict (party_id, idempotency_key) do nothing
  returning * into w;
  if not found then
    select * into w from public.wishes where party_id = p.id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('approved', w.approved, 'duplicate', true);
  end if;
  return jsonb_build_object('approved', w.approved, 'duplicate', false);
end;
$$;

-- Approved wishes only, newest first, with keyset pagination. Public fields only: no party,
-- contact details or attendance. At most 51 rows (the endpoint asks for one extra row to
-- know whether another page exists).
create function public.public_wishes(p_before_created timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (id uuid, name text, message text, created_at timestamptz)
language sql stable set search_path = '' as $$
  select w.id, w.name, w.message, w.created_at
  from public.wishes w
  where w.approved
    and (p_before_created is null or (w.created_at, w.id) < (p_before_created, p_before_id))
  order by w.created_at desc, w.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$$;

-- Staff: confirm a party's arrival by QR code (token hash) or by id from a name search.
-- The first confirmation is kept; repeated scans report when the party already arrived.
create function public.check_in(p_token_hash text default null, p_party_id uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
  r public.rsvps;
  already boolean;
begin
  select * into p from public.invitation_parties
  where (p_token_hash is not null and token_hash = p_token_hash) or (p_party_id is not null and id = p_party_id)
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  already := p.checked_in_at is not null;
  if not already then
    update public.invitation_parties set checked_in_at = now() where id = p.id returning checked_in_at into p.checked_in_at;
  end if;
  select * into r from public.rsvps where party_id = p.id;
  return jsonb_build_object('id', p.id, 'name', p.display_name, 'maxGuests', p.max_guests,
    'checkedInAt', p.checked_in_at, 'already', already, 'rsvp', public.rsvp_json(r));
end;
$$;

-- Staff: find parties by part of the name (for guests without their QR code).
create function public.staff_find_parties(p_query text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'name', p.display_name, 'maxGuests', p.max_guests,
      'checkedInAt', p.checked_in_at, 'rsvp', public.rsvp_json(r)) as item
    from public.invitation_parties p
    left join public.rsvps r on r.party_id = p.id
    where char_length(btrim(coalesce(p_query, ''))) >= 2
      and strpos(lower(p.display_name), lower(btrim(p_query))) > 0
    order by p.display_name
    limit 10
  ) found;
$$;

-- Server only. PostgreSQL grants EXECUTE to PUBLIC by default and Supabase adds grants for
-- anon/authenticated, so remove both explicitly.
revoke all on function
  public.take_request_slot(uuid, text, integer, interval),
  public.rsvp_json(public.rsvps),
  public.guest_party(text),
  public.submit_rsvp(text, text, integer),
  public.submit_wish(text, uuid, text, text),
  public.public_wishes(timestamptz, uuid, integer),
  public.check_in(text, uuid),
  public.staff_find_parties(text)
from public, anon, authenticated;
grant execute on function
  public.take_request_slot(uuid, text, integer, interval),
  public.rsvp_json(public.rsvps),
  public.guest_party(text),
  public.submit_rsvp(text, text, integer),
  public.submit_wish(text, uuid, text, text),
  public.public_wishes(timestamptz, uuid, integer),
  public.check_in(text, uuid),
  public.staff_find_parties(text)
to service_role;

-- Owner views for the Supabase dashboard (SQL editor / Table editor). The private schema
-- is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create view private.guest_overview as
  select p.display_name, p.max_guests, r.attendance, r.guest_count, r.updated_at as rsvp_updated_at, p.checked_in_at
  from public.invitation_parties p
  left join public.rsvps r on r.party_id = p.id
  order by p.display_name;

create view private.attendance_totals as
  select
    count(*) as parties,
    count(*) filter (where r.attendance = 'attending') as parties_attending,
    coalesce(sum(r.guest_count) filter (where r.attendance = 'attending'), 0) as guests_attending,
    count(*) filter (where r.attendance = 'declined') as parties_declined,
    count(*) filter (where r.party_id is null) as parties_no_response,
    count(*) filter (where p.checked_in_at is not null) as parties_checked_in
  from public.invitation_parties p
  left join public.rsvps r on r.party_id = p.id;

create view private.wishes_to_review as
  select w.id, w.name, w.message, w.created_at, p.display_name as party
  from public.wishes w
  join public.invitation_parties p on p.id = w.party_id
  where not w.approved
  order by w.created_at;
