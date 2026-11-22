-- ===========================================================================
-- Empire City — Row Level Security
-- Clients (anon / authenticated roles, i.e. browsers with the anon key) may
-- only SELECT rows of rooms they are an active member of. No client role may
-- INSERT/UPDATE/DELETE anything: every write goes through the server API,
-- which connects with the database owner role and validates each command.
-- ===========================================================================

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room
      and rp.user_id = auth.uid()
      and rp.status = 'active'
  );
$$;

create or replace function public.is_game_member(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_sessions gs
    join public.room_players rp on rp.room_id = gs.room_id
    where gs.id = p_game
      and rp.user_id = auth.uid()
      and rp.status = 'active'
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.is_game_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to anon, authenticated;
grant execute on function public.is_game_member(uuid) to anon, authenticated;

alter table public.board_tiles        enable row level security;
alter table public.card_definitions   enable row level security;
alter table public.game_rooms         enable row level security;
alter table public.game_room_secrets  enable row level security;
alter table public.room_players       enable row level security;
alter table public.game_sessions      enable row level security;
alter table public.game_players       enable row level security;
alter table public.property_ownership enable row level security;
alter table public.game_turns         enable row level security;
alter table public.game_actions       enable row level security;
alter table public.game_events        enable row level security;
alter table public.game_decks         enable row level security;
alter table public.game_auctions      enable row level security;
alter table public.auction_bids       enable row level security;
alter table public.trade_offers       enable row level security;
alter table public.chat_messages      enable row level security;

-- Writes are server-only.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
-- Secret tables: not even readable.
revoke all on public.game_room_secrets from anon, authenticated;
revoke all on public.game_decks        from anon, authenticated;
revoke all on public.game_actions      from anon, authenticated;

drop policy if exists "board readable" on public.board_tiles;
create policy "board readable" on public.board_tiles for select to anon, authenticated using (true);

drop policy if exists "cards readable" on public.card_definitions;
create policy "cards readable" on public.card_definitions for select to anon, authenticated using (true);

drop policy if exists "members read room" on public.game_rooms;
create policy "members read room" on public.game_rooms for select to authenticated
  using (public.is_room_member(id));

drop policy if exists "members read players" on public.room_players;
create policy "members read players" on public.room_players for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members read sessions" on public.game_sessions;
create policy "members read sessions" on public.game_sessions for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members read game players" on public.game_players;
create policy "members read game players" on public.game_players for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists "members read ownership" on public.property_ownership;
create policy "members read ownership" on public.property_ownership for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists "members read turns" on public.game_turns;
create policy "members read turns" on public.game_turns for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists "members read events" on public.game_events;
create policy "members read events" on public.game_events for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists "members read auctions" on public.game_auctions;
create policy "members read auctions" on public.game_auctions for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists "members read bids" on public.auction_bids;
create policy "members read bids" on public.auction_bids for select to authenticated
  using (exists (select 1 from public.game_auctions a where a.id = auction_id and public.is_game_member(a.game_id)));

drop policy if exists "members read trades" on public.trade_offers;
create policy "members read trades" on public.trade_offers for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists "members read chat" on public.chat_messages;
create policy "members read chat" on public.chat_messages for select to authenticated
  using (public.is_room_member(room_id));
