-- Group invitations on top of 0002: one shared link for a group (e.g. "Teman Kantor") where
-- every person who opens it sends their own RSVP with their own name and head count.
-- Responses add up per group; they never replace each other.
--
-- A group response is identified by a random "respondent key" that the guest's browser
-- creates and keeps, so the same phone can update its own answer and a retried submission
-- never creates a second row. For groups, max_guests is the limit per response.

alter table public.invitation_parties add column is_group boolean not null default false;

create table public.group_rsvps (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.invitation_parties(id) on delete cascade,
  respondent_key uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  attendance text not null check (attendance in ('attending', 'declined')),
  guest_count integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_id, respondent_key),
  check ((attendance = 'declined' and guest_count = 0) or (attendance = 'attending' and guest_count > 0))
);
alter table public.group_rsvps enable row level security;
revoke all on public.group_rsvps from anon, authenticated;

-- Database-level guard, like validate_rsvp_party_size for personal RSVPs.
create function public.validate_group_rsvp() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
begin
  select * into p from public.invitation_parties where id = new.party_id;
  if not p.is_group then raise exception 'Party is not a group invitation'; end if;
  if new.guest_count > p.max_guests then raise exception 'Guest count exceeds invitation allowance'; end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger validate_group_rsvp before insert or update on public.group_rsvps
for each row execute function public.validate_group_rsvp();

-- Personal RSVPs belong only to personal invitations.
create or replace function public.validate_rsvp_party_size() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
begin
  select * into p from public.invitation_parties where id = new.party_id;
  if p.is_group then raise exception 'Group invitations use group_rsvps'; end if;
  if new.guest_count > p.max_guests then
    raise exception 'Guest count exceeds invitation allowance';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create function public.group_rsvp_json(g public.group_rsvps) returns jsonb
language sql immutable set search_path = '' as $$
  select case when g.id is null then null
    else jsonb_build_object('attendance', g.attendance, 'guestCount', g.guest_count, 'updatedAt', g.updated_at, 'name', g.name) end;
$$;

-- For staff: how many people answered through a group link and how many are coming.
create function public.group_summary(p_party uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'responses', count(*),
    'guests', coalesce(sum(guest_count) filter (where attendance = 'attending'), 0))
  from public.group_rsvps where party_id = p_party;
$$;

-- guest_party and submit_rsvp gain an optional respondent key (and name), so drop the old
-- signatures first: PostgREST must not see two overloads.
drop function public.guest_party(text);
drop function public.submit_rsvp(text, text, integer);

-- The guest's own invitation. For a group, `rsvp` is this browser's own response, if any.
create function public.guest_party(p_token_hash text, p_respondent_key uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  p public.invitation_parties;
  r public.rsvps;
  g public.group_rsvps;
begin
  select * into p from public.invitation_parties where token_hash = p_token_hash;
  if not found then raise exception 'INVALID_TOKEN'; end if;
  if p.is_group then
    select * into g from public.group_rsvps where party_id = p.id and respondent_key = p_respondent_key;
    return jsonb_build_object('name', p.display_name, 'maxGuests', p.max_guests, 'group', true, 'rsvp', public.group_rsvp_json(g));
  end if;
  select * into r from public.rsvps where party_id = p.id;
  return jsonb_build_object('name', p.display_name, 'maxGuests', p.max_guests, 'group', false, 'rsvp', public.rsvp_json(r));
end;
$$;

-- Personal invitation: one current RSVP per party (atomic upsert).
-- Group invitation: one current RSVP per respondent key; different people add up.
-- Retries and double submits never duplicate in either case.
create function public.submit_rsvp(p_token_hash text, p_attendance text, p_guest_count integer,
  p_respondent_key uuid default null, p_name text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
  r public.rsvps;
  g public.group_rsvps;
begin
  select * into p from public.invitation_parties where token_hash = p_token_hash;
  if not found then raise exception 'INVALID_TOKEN'; end if;
  if p_attendance is null or p_attendance not in ('attending', 'declined') then raise exception 'INVALID_ATTENDANCE'; end if;
  if p_attendance = 'declined' then
    p_guest_count := 0;
  elsif p_guest_count is null or p_guest_count < 1 or p_guest_count > p.max_guests then
    raise exception 'INVALID_GUEST_COUNT';
  end if;

  if not p.is_group then
    perform public.take_request_slot(p.id, 'rsvp', 10, interval '10 minutes');
    insert into public.rsvps (party_id, attendance, guest_count)
    values (p.id, p_attendance, p_guest_count)
    on conflict (party_id) do update set attendance = excluded.attendance, guest_count = excluded.guest_count
    returning * into r;
    return public.rsvp_json(r);
  end if;

  if p_respondent_key is null or char_length(coalesce(btrim(p_name), '')) not between 1 and 100 then
    raise exception 'GROUP_DETAILS_REQUIRED';
  end if;
  -- A shared link: a higher per-group rate, and a cap on new responses so a forwarded link
  -- cannot grow the list without bound. The slot's advisory lock serializes the cap check.
  perform public.take_request_slot(p.id, 'rsvp', 60, interval '10 minutes');
  if not exists (select 1 from public.group_rsvps where party_id = p.id and respondent_key = p_respondent_key)
     and (select count(*) from public.group_rsvps where party_id = p.id) >= 300 then
    raise exception 'GROUP_FULL';
  end if;
  insert into public.group_rsvps (party_id, respondent_key, name, attendance, guest_count)
  values (p.id, p_respondent_key, btrim(p_name), p_attendance, p_guest_count)
  on conflict (party_id, respondent_key) do update
    set name = excluded.name, attendance = excluded.attendance, guest_count = excluded.guest_count
  returning * into g;
  return public.group_rsvp_json(g);
end;
$$;

-- Wishes: a group link is shared by many people, so it gets higher limits.
create or replace function public.submit_wish(p_token_hash text, p_idempotency_key uuid, p_name text, p_message text)
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
  perform public.take_request_slot(p.id, 'wish', case when p.is_group then 20 else 3 end, interval '10 minutes');
  if (select count(*) from public.wishes where party_id = p.id) >= (case when p.is_group then 200 else 10 end) then
    raise exception 'WISH_LIMIT';
  end if;
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

-- Check-in: a group QR is shared by everyone in the group, so it is never "already checked
-- in"; the first arrival time is still kept, and staff see the group's totals.
create or replace function public.check_in(p_token_hash text default null, p_party_id uuid default null)
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
  already := p.checked_in_at is not null and not p.is_group;
  if p.checked_in_at is null then
    update public.invitation_parties set checked_in_at = now() where id = p.id returning checked_in_at into p.checked_in_at;
  end if;
  select * into r from public.rsvps where party_id = p.id;
  return jsonb_build_object('id', p.id, 'name', p.display_name, 'maxGuests', p.max_guests,
    'checkedInAt', p.checked_in_at, 'already', already, 'rsvp', public.rsvp_json(r),
    'group', case when p.is_group then public.group_summary(p.id) end);
end;
$$;

create or replace function public.staff_find_parties(p_query text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'name', p.display_name, 'maxGuests', p.max_guests,
      'checkedInAt', p.checked_in_at, 'rsvp', public.rsvp_json(r),
      'group', case when p.is_group then public.group_summary(p.id) end) as item
    from public.invitation_parties p
    left join public.rsvps r on r.party_id = p.id
    where char_length(btrim(coalesce(p_query, ''))) >= 2
      and strpos(lower(p.display_name), lower(btrim(p_query))) > 0
    order by p.display_name
    limit 10
  ) found;
$$;

revoke all on function
  public.group_rsvp_json(public.group_rsvps),
  public.group_summary(uuid),
  public.guest_party(text, uuid),
  public.submit_rsvp(text, text, integer, uuid, text),
  public.validate_group_rsvp()
from public, anon, authenticated;
grant execute on function
  public.group_rsvp_json(public.group_rsvps),
  public.group_summary(uuid),
  public.guest_party(text, uuid),
  public.submit_rsvp(text, text, integer, uuid, text)
to service_role;

-- Owner views: groups appear with their summed head count; each group answer is listed too.
drop view private.guest_overview;
create view private.guest_overview as
  select p.display_name, p.is_group, p.max_guests,
    case when p.is_group then 'group' else r.attendance end as attendance,
    case when p.is_group then (public.group_summary(p.id)->>'guests')::integer else r.guest_count end as guest_count,
    case when p.is_group then (public.group_summary(p.id)->>'responses')::integer end as group_responses,
    r.updated_at as rsvp_updated_at, p.checked_in_at
  from public.invitation_parties p
  left join public.rsvps r on r.party_id = p.id
  order by p.display_name;

drop view private.attendance_totals;
create view private.attendance_totals as
  with personal as (
    select
      count(*) as parties,
      count(*) filter (where r.attendance = 'attending') as parties_attending,
      coalesce(sum(r.guest_count) filter (where r.attendance = 'attending'), 0) as guests_attending,
      count(*) filter (where r.attendance = 'declined') as parties_declined,
      count(*) filter (where r.party_id is null) as parties_no_response,
      count(*) filter (where p.checked_in_at is not null) as parties_checked_in
    from public.invitation_parties p
    left join public.rsvps r on r.party_id = p.id
    where not p.is_group
  ), grouped as (
    select
      count(*) as group_responses,
      coalesce(sum(g.guest_count) filter (where g.attendance = 'attending'), 0) as group_guests_attending
    from public.group_rsvps g
  )
  select personal.*, grouped.*, personal.guests_attending + grouped.group_guests_attending as total_guests_attending
  from personal, grouped;

create view private.group_responses as
  select p.display_name as "group", g.name, g.attendance, g.guest_count, g.updated_at
  from public.group_rsvps g
  join public.invitation_parties p on p.id = g.party_id
  order by p.display_name, g.created_at;

revoke all on all tables in schema private from public, anon, authenticated;
