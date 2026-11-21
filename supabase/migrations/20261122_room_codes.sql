-- Room codes for invite links, plus guest (anonymous) join.
--
-- Run once in the Supabase SQL editor, then turn on
-- Authentication → Sign In / Providers → "Allow anonymous sign-ins".
--
-- Additive only: the existing share-link RPCs (get_or_create_share_link,
-- regenerate_share_link, revoke_share_link, get_share_link_preview,
-- accept_share_link) are not modified. A room code is resolved to the link's
-- token, and the token flow does the rest.

/* ------------------------------------------------------------------------ */
/*  1. Code generator                                                        */
/* ------------------------------------------------------------------------ */

-- 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX.
-- Randomness comes from gen_random_uuid() (core since PG 13, no extension needed). Bytes 6
-- and 8 carry the UUID version/variant bits, so they're skipped.
create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  picks constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10];
  code text := '';
  i int;
begin
  foreach i in array picks loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

/* ------------------------------------------------------------------------ */
/*  2. Column + backfill (before the trigger exists)                         */
/* ------------------------------------------------------------------------ */

alter table public.project_share_links add column if not exists join_code text;

update public.project_share_links
set join_code = public.generate_room_code()
where join_code is null;

create unique index if not exists project_share_links_join_code_key
  on public.project_share_links (join_code);

alter table public.project_share_links alter column join_code set not null;

/* ------------------------------------------------------------------------ */
/*  3. Keep codes in step with tokens                                        */
/* ------------------------------------------------------------------------ */

-- New link → new code. Token reset (regenerate_share_link) → new code, so the old code
-- stops working along with the old URL. Codes can't be chosen or edited by clients.
-- SECURITY DEFINER so the uniqueness check sees every trip's links, not just the caller's.
create or replace function public.set_share_link_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  if tg_op = 'UPDATE' and new.token is not distinct from old.token and old.join_code is not null then
    new.join_code := old.join_code;
    return new;
  end if;

  loop
    candidate := public.generate_room_code();
    exit when not exists (select 1 from public.project_share_links where join_code = candidate);
  end loop;
  new.join_code := candidate;
  return new;
end;
$$;

drop trigger if exists project_share_links_join_code on public.project_share_links;
create trigger project_share_links_join_code
  before insert or update on public.project_share_links
  for each row execute function public.set_share_link_join_code();

/* ------------------------------------------------------------------------ */
/*  4. Code → token lookup (callable signed out)                             */
/* ------------------------------------------------------------------------ */

-- Accepts any casing and separators ("k7qm-2xpa", "K7QM 2XPA"). Returns NULL for unknown
-- or disabled links. Knowing the code already grants what the token grants, so returning
-- the token reveals nothing new.
create or replace function public.resolve_room_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select token
  from public.project_share_links
  where is_active
    and join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
  limit 1;
$$;

revoke all on function public.resolve_room_code(text) from public;
grant execute on function public.resolve_room_code(text) to anon, authenticated;

/* ------------------------------------------------------------------------ */
/*  5. Guests have no email                                                  */
/* ------------------------------------------------------------------------ */

-- Anonymous users get a profiles row through the existing new-user trigger. If that
-- trigger needs a non-null email, guest sign-in fails with "Database error saving new user".
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email' and is_nullable = 'NO'
  ) then
    alter table public.profiles alter column email drop not null;
  end if;
end $$;

/* ------------------------------------------------------------------------ */
/*  6. Live lobby                                                            */
/* ------------------------------------------------------------------------ */

-- Lets the lobby hear new members join (Realtime still applies RLS per subscriber).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_members'
     ) then
    alter publication supabase_realtime add table public.project_members;
  end if;
end $$;
