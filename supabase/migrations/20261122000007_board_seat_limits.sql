-- ===========================================================================
-- Empire City — seat limits per board, enforced by the database.
--   classic 2–4 · standard 2–6 · maxi 2–8
-- Rooms without a board in their settings count as "standard".
-- ===========================================================================

-- Bring existing classic rooms within the new limit first.
update public.game_rooms
   set max_players = 4,
       settings = jsonb_set(settings, '{maxPlayers}', '4'::jsonb),
       updated_at = now()
 where jsonb_typeof(settings) = 'object'
   and settings->>'board' = 'classic'
   and max_players > 4;

alter table public.game_rooms drop constraint if exists game_rooms_board_seats;
alter table public.game_rooms add constraint game_rooms_board_seats check (
  max_players <= case
    when jsonb_typeof(settings) <> 'object' then 6
    when settings->>'board' = 'classic' then 4
    when settings->>'board' = 'maxi' then 8
    else 6
  end
);
