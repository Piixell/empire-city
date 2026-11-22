-- ===========================================================================
-- Empire City — board variants (classic 40 / standard 48 / maxi 64) and
-- up to 8 players. Existing rows become "standard" (the original board).
-- Constraints are located by definition, not by name, so this works on any
-- Postgres that ran the earlier migrations.
-- ===========================================================================

-- helper: drop CHECK constraints of a table whose definition matches a pattern
create or replace function pg_temp.drop_checks(tbl regclass, pattern text) returns void language plpgsql as $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = tbl and contype = 'c' and pg_get_constraintdef(oid) ilike pattern
  loop
    execute format('alter table %s drop constraint %I', tbl, r.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------- tiles ----
-- Foreign keys pointing at board_tiles(idx) must go before the PK changes.
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname from pg_constraint
     where contype = 'f' and confrelid = 'public.board_tiles'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.board_tiles add column if not exists board text not null default 'standard';
select pg_temp.drop_checks('public.board_tiles', '%idx%');
alter table public.board_tiles add constraint board_tiles_idx_range check (idx between 0 and 63);
alter table public.board_tiles drop constraint if exists board_tiles_board_check;
alter table public.board_tiles add constraint board_tiles_board_check check (board in ('classic', 'standard', 'maxi'));
alter table public.board_tiles drop constraint if exists board_tiles_pkey;
alter table public.board_tiles add primary key (board, idx);

-- --------------------------------------------------------------- games -----
alter table public.game_sessions add column if not exists board text not null default 'standard';
alter table public.game_sessions drop constraint if exists game_sessions_board_check;
alter table public.game_sessions add constraint game_sessions_board_check check (board in ('classic', 'standard', 'maxi'));

alter table public.property_ownership add column if not exists board text not null default 'standard';
alter table public.property_ownership
  add constraint property_ownership_board_tile_fkey
  foreign key (board, tile_idx) references public.board_tiles(board, idx);

alter table public.game_auctions add column if not exists board text not null default 'standard';
alter table public.game_auctions
  add constraint game_auctions_board_tile_fkey
  foreign key (board, tile_idx) references public.board_tiles(board, idx);

-- ------------------------------------------------------- up to 8 players ---
select pg_temp.drop_checks('public.game_rooms', '%max_players%');
alter table public.game_rooms add constraint game_rooms_max_players_range check (max_players between 2 and 8);

select pg_temp.drop_checks('public.room_players', '%color%');
alter table public.room_players add constraint room_players_color_valid
  check (color in ('red','blue','green','yellow','purple','orange','pink','teal'));

select pg_temp.drop_checks('public.game_players', '%seat%');
alter table public.game_players add constraint game_players_seat_range check (seat between 0 and 7);
select pg_temp.drop_checks('public.game_players', '%position%');
alter table public.game_players add constraint game_players_position_range check (position between 0 and 63);
