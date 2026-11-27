-- Wishes are shown as soon as they are sent (the couple's choice, 2026-11-27). Only a valid
-- personal or group link can send one, with the per-party rate and count limits from
-- 0002/0003. To hide a wish, set approved = false; it disappears from the public list
-- within about a minute (the list is cached).
alter table public.wishes alter column approved set default true;

-- Wishes that were waiting for review are shown too.
update public.wishes set approved = true where not approved;
