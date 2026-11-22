-- ===========================================================================
-- Empire City — monotonic room revision.
-- Every mutation of a room (join, profile, ready, settings, start, leave,
-- rematch, game over) increments it while holding the room row lock.
-- Clients ignore snapshots whose revision is older than the one they show,
-- so out-of-order responses can never roll the lobby back.
-- ===========================================================================
alter table public.game_rooms add column if not exists revision bigint not null default 0;
