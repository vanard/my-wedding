-- Foundation only; do not enable forms before API authorization and abuse controls exist.
create table public.invitation_parties (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  max_guests integer not null check (max_guests between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.rsvps (
  party_id uuid primary key references public.invitation_parties(id) on delete cascade,
  attendance text not null check (attendance in ('attending', 'declined')),
  guest_count integer not null,
  updated_at timestamptz not null default now(),
  check ((attendance = 'declined' and guest_count = 0) or (attendance = 'attending' and guest_count > 0))
);

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.invitation_parties(id) on delete cascade,
  idempotency_key uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  message text not null check (char_length(message) between 1 and 1000),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (party_id, idempotency_key)
);
create index wishes_public_page on public.wishes (created_at desc, id desc) where approved = true;

alter table public.invitation_parties enable row level security;
alter table public.rsvps enable row level security;
alter table public.wishes enable row level security;
-- No browser access: future endpoints authorize requests using server-only credentials.
revoke all on public.invitation_parties, public.rsvps, public.wishes from anon, authenticated;

create function public.validate_rsvp_party_size() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.guest_count > (select max_guests from public.invitation_parties where id = new.party_id) then
    raise exception 'Guest count exceeds invitation allowance';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger validate_rsvp_party_size before insert or update on public.rsvps
for each row execute function public.validate_rsvp_party_size();
