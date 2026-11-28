-- Group members: a group invitation (e.g. "Teman Kantor") can list its members by name. Each
-- person opens the shared group link, picks their own name from the list and answers hadir /
-- tidak hadir; their Entry Access Card QR then carries that member, so check-in records the
-- actual person. A group without members keeps the free-name answers of 0003.
--
-- A name is locked to the first phone that answers for it (its respondent key): other phones
-- see it as taken and cannot answer for it. The same phone can change its answer, or pick a
-- different name, which releases the first one. The owner resets a lock by setting
-- respondent_key and attendance to null (see README).
--
-- Compatible with the code already deployed: existing functions keep their signatures and only
-- gain fields; new behaviour is in new functions.

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.invitation_parties(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  respondent_key uuid,
  attendance text check (attendance in ('attending', 'declined')),
  answered_at timestamptz,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  check ((respondent_key is null) = (attendance is null)),
  check ((attendance is null) = (answered_at is null))
);
create unique index group_members_name on public.group_members (party_id, lower(name));
-- One name per phone within a group.
create unique index group_members_respondent on public.group_members (party_id, respondent_key) where respondent_key is not null;
alter table public.group_members enable row level security;
revoke all on public.group_members from anon, authenticated;

create function public.validate_group_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not (select is_group from public.invitation_parties where id = new.party_id) then
    raise exception 'Members belong only to group invitations';
  end if;
  return new;
end;
$$;
create trigger validate_group_member before insert or update of party_id on public.group_members
for each row execute function public.validate_group_member();

-- The member list a guest sees on the group link: names only, plus whether each name is
-- already taken by another phone or is this phone's own. Other people's answers stay private.
create function public.group_members_for_guest(p_party uuid, p_respondent_key uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name,
      'taken', m.respondent_key is not null and m.respondent_key is distinct from p_respondent_key,
      'mine', m.respondent_key is not null and m.respondent_key = p_respondent_key)
    order by lower(m.name)), '[]'::jsonb)
  from public.group_members m where m.party_id = p_party;
$$;

-- This phone's own member answer, in the shape of an RSVP.
create function public.member_rsvp_json(m public.group_members) returns jsonb
language sql immutable set search_path = '' as $$
  select case when m.id is null or m.attendance is null then null
    else jsonb_build_object('attendance', m.attendance, 'guestCount', case when m.attendance = 'attending' then 1 else 0 end,
      'updatedAt', m.answered_at, 'name', m.name, 'memberId', m.id) end;
$$;

-- For staff: every member with their answer and arrival.
create function public.group_members_for_staff(p_party uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'attendance', m.attendance,
      'checkedInAt', m.checked_in_at) order by lower(m.name)), '[]'::jsonb)
  from public.group_members m where m.party_id = p_party;
$$;

-- Group totals now count member answers too (one person each).
create or replace function public.group_summary(p_party uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'responses', (select count(*) from public.group_rsvps where party_id = p_party)
      + (select count(*) from public.group_members where party_id = p_party and attendance is not null),
    'guests', (select coalesce(sum(guest_count) filter (where attendance = 'attending'), 0) from public.group_rsvps where party_id = p_party)
      + (select count(*) from public.group_members where party_id = p_party and attendance = 'attending'));
$$;

-- guest_party: a group with members also returns the member list, and `rsvp` is this phone's
-- member answer.
create or replace function public.guest_party(p_token_hash text, p_respondent_key uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  p public.invitation_parties;
  r public.rsvps;
  g public.group_rsvps;
  m public.group_members;
begin
  select * into p from public.invitation_parties where token_hash = p_token_hash;
  if not found then raise exception 'INVALID_TOKEN'; end if;
  if p.is_group then
    if exists (select 1 from public.group_members where party_id = p.id) then
      select * into m from public.group_members where party_id = p.id and respondent_key = p_respondent_key;
      return jsonb_build_object('name', p.display_name, 'maxGuests', 1, 'group', true,
        'members', public.group_members_for_guest(p.id, p_respondent_key), 'rsvp', public.member_rsvp_json(m));
    end if;
    select * into g from public.group_rsvps where party_id = p.id and respondent_key = p_respondent_key;
    return jsonb_build_object('name', p.display_name, 'maxGuests', p.max_guests, 'group', true, 'rsvp', public.group_rsvp_json(g));
  end if;
  select * into r from public.rsvps where party_id = p.id;
  return jsonb_build_object('name', p.display_name, 'maxGuests', p.max_guests, 'group', false, 'rsvp', public.rsvp_json(r));
end;
$$;

-- A member answers for themselves (hadir counts one person). The first phone to answer for a
-- name keeps it; picking another name from the same phone releases the previous one.
create function public.submit_member_rsvp(p_token_hash text, p_member_id uuid, p_respondent_key uuid, p_attendance text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
  m public.group_members;
begin
  select * into p from public.invitation_parties where token_hash = p_token_hash;
  if not found then raise exception 'INVALID_TOKEN'; end if;
  if p_attendance is null or p_attendance not in ('attending', 'declined') then raise exception 'INVALID_ATTENDANCE'; end if;
  if p_respondent_key is null or p_member_id is null then raise exception 'GROUP_DETAILS_REQUIRED'; end if;
  perform public.take_request_slot(p.id, 'rsvp', 60, interval '10 minutes');
  select * into m from public.group_members where id = p_member_id and party_id = p.id for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if m.respondent_key is not null and m.respondent_key <> p_respondent_key then raise exception 'NAME_TAKEN'; end if;
  update public.group_members set respondent_key = null, attendance = null, answered_at = null
  where party_id = p.id and respondent_key = p_respondent_key and id <> m.id;
  update public.group_members set respondent_key = p_respondent_key, attendance = p_attendance, answered_at = now()
  where id = m.id returning * into m;
  return public.member_rsvp_json(m);
end;
$$;

-- check_in: unchanged, plus the member list for a group with members (the staff page shows it
-- so the arriving person can be chosen by name).
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
    'group', case when p.is_group then public.group_summary(p.id) end,
    'members', case when p.is_group and exists (select 1 from public.group_members where party_id = p.id)
      then public.group_members_for_staff(p.id) end);
end;
$$;

-- Staff: record one member's arrival, by the group QR code (from the member's own card) or by
-- the group id (from the staff page's member list). A second scan reports "already".
create function public.check_in_member(p_member_id uuid, p_token_hash text default null, p_party_id uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  p public.invitation_parties;
  m public.group_members;
  already boolean;
begin
  select * into p from public.invitation_parties
  where (p_token_hash is not null and token_hash = p_token_hash) or (p_party_id is not null and id = p_party_id);
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into m from public.group_members where id = p_member_id and party_id = p.id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  already := m.checked_in_at is not null;
  if not already then
    update public.group_members set checked_in_at = now() where id = m.id returning * into m;
    update public.invitation_parties set checked_in_at = coalesce(checked_in_at, m.checked_in_at) where id = p.id;
  end if;
  return jsonb_build_object('id', p.id, 'name', p.display_name, 'maxGuests', p.max_guests,
    'checkedInAt', m.checked_in_at, 'already', already, 'rsvp', null,
    'group', public.group_summary(p.id),
    'member', jsonb_build_object('id', m.id, 'name', m.name, 'attendance', m.attendance, 'checkedInAt', m.checked_in_at),
    'members', public.group_members_for_staff(p.id));
end;
$$;

-- Staff search also finds group members by their own name; the group is returned with its
-- member list.
create or replace function public.staff_find_parties(p_query text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'name', p.display_name, 'maxGuests', p.max_guests,
      'checkedInAt', p.checked_in_at, 'rsvp', public.rsvp_json(r),
      'group', case when p.is_group then public.group_summary(p.id) end,
      'members', case when p.is_group and exists (select 1 from public.group_members where party_id = p.id)
        then public.group_members_for_staff(p.id) end) as item
    from public.invitation_parties p
    left join public.rsvps r on r.party_id = p.id
    where char_length(btrim(coalesce(p_query, ''))) >= 2
      and (strpos(lower(p.display_name), lower(btrim(p_query))) > 0
        or exists (select 1 from public.group_members m
                   where m.party_id = p.id and strpos(lower(m.name), lower(btrim(p_query))) > 0))
    order by p.display_name
    limit 10
  ) found;
$$;

revoke all on function
  public.validate_group_member(),
  public.group_members_for_guest(uuid, uuid),
  public.member_rsvp_json(public.group_members),
  public.group_members_for_staff(uuid),
  public.submit_member_rsvp(text, uuid, uuid, text),
  public.check_in_member(uuid, text, uuid)
from public, anon, authenticated;
grant execute on function
  public.group_members_for_guest(uuid, uuid),
  public.member_rsvp_json(public.group_members),
  public.group_members_for_staff(uuid),
  public.submit_member_rsvp(text, uuid, uuid, text),
  public.check_in_member(uuid, text, uuid)
to service_role;

-- Owner views: totals include member answers; each member is listed with answer and arrival.
create or replace view private.attendance_totals as
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
      (select count(*) from public.group_rsvps)
        + (select count(*) from public.group_members where attendance is not null) as group_responses,
      (select coalesce(sum(guest_count) filter (where attendance = 'attending'), 0) from public.group_rsvps)
        + (select count(*) from public.group_members where attendance = 'attending') as group_guests_attending
  )
  select personal.*, grouped.*, personal.guests_attending + grouped.group_guests_attending as total_guests_attending
  from personal, grouped;

create view private.group_member_status as
  select p.display_name as "group", m.name, m.attendance, m.answered_at, m.checked_in_at,
    m.respondent_key is not null as locked
  from public.group_members m
  join public.invitation_parties p on p.id = m.party_id
  order by p.display_name, lower(m.name);

revoke all on all tables in schema private from public, anon, authenticated;
