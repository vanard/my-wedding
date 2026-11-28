-- Short invitation links: /i/<name>-<code>, e.g. /i/Riswanda-x7k2p9q4mb. The 10-character code
-- (a-z, 0-9: about 52 bits, far too many to guess through the site) is the key; the name part
-- is only the greeting, like ?to=. Only a SHA-256 hash of the code is stored, in link_hash.
--
-- A party keeps its long code (token_hash), so links already sent as /?to=…&k=… keep working.
-- The API turns a short code into the party's token_hash with party_token_for_link and then
-- calls the existing functions unchanged.

alter table public.invitation_parties
  add column link_hash text unique check (link_hash ~ '^[a-f0-9]{64}$');

create function public.party_token_for_link(p_link_hash text) returns text
language sql stable set search_path = '' as $$
  select token_hash from public.invitation_parties where link_hash = p_link_hash;
$$;

revoke all on function public.party_token_for_link(text) from public, anon, authenticated;
grant execute on function public.party_token_for_link(text) to service_role;
