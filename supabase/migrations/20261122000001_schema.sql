-- ===========================================================================
-- Empire City — core schema
-- All game writes happen through the Next.js server (direct Postgres
-- connection, inside transactions with row locks). Browsers can only READ
-- rows of rooms they belong to (see RLS migration) and receive Realtime
-- notifications for them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Static configuration
-- ---------------------------------------------------------------------------
create table if not exists public.board_tiles (
  idx            int primary key check (idx between 0 and 47),
  kind           text not null check (kind in ('go','jail','parking','goToJail','property','transport','utility','chance','community','tax')),
  name           text not null,
  district       text,
  district_name  text,
  district_color text,
  price          int check (price is null or price > 0),
  rent           jsonb,
  house_cost     int,
  mortgage       int,
  multipliers    jsonb,
  tax_amount     int
);

create table if not exists public.card_definitions (
  id     text primary key,
  deck   text not null check (deck in ('chance','community')),
  title  text not null,
  body   text not null,
  effect jsonb not null
);

-- ---------------------------------------------------------------------------
-- Rooms & lobby
-- ---------------------------------------------------------------------------
create table if not exists public.game_rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id    uuid not null,
  status          text not null default 'lobby' check (status in ('lobby','playing','finished','closed')),
  max_players     int  not null default 6 check (max_players between 2 and 6),
  has_password    boolean not null default false,
  settings        jsonb not null,
  current_game_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists game_rooms_status_idx on public.game_rooms(status);

-- Password hashes live in a separate table that no client role can read.
create table if not exists public.game_room_secrets (
  room_id       uuid primary key references public.game_rooms(id) on delete cascade,
  password_hash text not null
);

create table if not exists public.room_players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.game_rooms(id) on delete cascade,
  user_id      uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 20),
  color        text not null check (color in ('red','blue','green','yellow','purple','orange')),
  token        text not null check (token in ('car','ship','plane','rocket','crown','gem','dog','cat','train','bike')),
  avatar       text not null default '🙂' check (char_length(avatar) between 1 and 16),
  is_ready     boolean not null default false,
  status       text not null default 'active' check (status in ('active','left')),
  joined_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (room_id, user_id)
);
-- Two active players in the same room can never share a color.
create unique index if not exists room_players_color_unique
  on public.room_players(room_id, color) where status = 'active';
create index if not exists room_players_user_idx on public.room_players(user_id);

-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------
create table if not exists public.game_sessions (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.game_rooms(id) on delete cascade,
  status            text not null default 'active' check (status in ('active','finished')),
  settings          jsonb not null,
  version           int  not null default 1 check (version > 0),
  turn_number       int  not null default 1,
  current_player_id uuid,
  phase             text not null check (phase in ('ROLL','BUY','AUCTION','DEBT','MANAGE','GAME_OVER')),
  dice              jsonb,
  doubles_count     int  not null default 0 check (doubles_count between 0 and 3),
  turn_deadline     timestamptz,
  -- turn context that has no natural column (pending tile, debts, last card, bounded log...)
  engine            jsonb not null default '{}'::jsonb,
  -- denormalized public projection broadcast to clients via Realtime
  public_state      jsonb not null,
  started_at        timestamptz not null default now(),
  ends_at           timestamptz,
  finished_at       timestamptz,
  winner_player_id  uuid,
  finish_reason     text,
  updated_at        timestamptz not null default now()
);
create index if not exists game_sessions_room_idx on public.game_sessions(room_id);

do $$ begin
  alter table public.game_rooms
    add constraint game_rooms_current_game_fk foreign key (current_game_id)
    references public.game_sessions(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.game_players (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid not null references public.game_sessions(id) on delete cascade,
  room_player_id   uuid not null references public.room_players(id) on delete cascade,
  user_id          uuid not null,
  seat             int  not null check (seat between 0 and 5),
  display_name     text not null,
  color            text not null,
  token            text not null,
  avatar           text not null,
  balance          int  not null check (balance >= 0),
  position         int  not null default 0 check (position between 0 and 47),
  in_jail          boolean not null default false,
  jail_turns       int  not null default 0 check (jail_turns between 0 and 3),
  jail_cards       jsonb not null default '[]'::jsonb,
  status           text not null default 'active' check (status in ('active','bankrupt')),
  eliminated_order int,
  stats            jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  unique (game_id, user_id),
  unique (game_id, seat),
  unique (game_id, color)
);
create index if not exists game_players_game_idx on public.game_players(game_id);

create table if not exists public.property_ownership (
  game_id         uuid not null references public.game_sessions(id) on delete cascade,
  tile_idx        int  not null references public.board_tiles(idx),
  owner_player_id uuid references public.game_players(id) on delete set null,
  houses          int  not null default 0 check (houses between 0 and 5),
  mortgaged       boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (game_id, tile_idx),
  check (not (mortgaged and houses > 0)),
  check (owner_player_id is not null or (houses = 0 and not mortgaged))
);
create index if not exists property_ownership_owner_idx on public.property_ownership(owner_player_id);

create table if not exists public.game_turns (
  id          bigint generated always as identity primary key,
  game_id     uuid not null references public.game_sessions(id) on delete cascade,
  turn_number int  not null,
  player_id   uuid not null references public.game_players(id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  unique (game_id, turn_number)
);

-- Processed commands: guarantees idempotency (same command_id => same result).
create table if not exists public.game_actions (
  id            bigint generated always as identity primary key,
  game_id       uuid not null references public.game_sessions(id) on delete cascade,
  command_id    uuid not null,
  user_id       uuid not null,
  command_type  text not null,
  command       jsonb not null,
  ok            boolean not null,
  result        jsonb,
  version_after int,
  created_at    timestamptz not null default now(),
  unique (game_id, command_id)
);

create table if not exists public.game_events (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.game_sessions(id) on delete cascade,
  seq        int  not null,
  version    int  not null,
  type       text not null,
  player_id  uuid,
  message    text not null,
  data       jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, seq)
);

-- Deck order is secret: no client role can read this table.
create table if not exists public.game_decks (
  game_id    uuid not null references public.game_sessions(id) on delete cascade,
  deck       text not null check (deck in ('chance','community')),
  card_order jsonb not null,
  next_index int  not null default 0 check (next_index >= 0),
  primary key (game_id, deck)
);

create table if not exists public.game_auctions (
  id                uuid primary key,
  game_id           uuid not null references public.game_sessions(id) on delete cascade,
  tile_idx          int  not null references public.board_tiles(idx),
  status            text not null default 'open' check (status in ('open','closed')),
  high_bid          int  not null default 0 check (high_bid >= 0),
  high_bidder_id    uuid references public.game_players(id) on delete set null,
  passed_player_ids jsonb not null default '[]'::jsonb,
  deadline          timestamptz not null,
  started_at        timestamptz not null,
  closed_at         timestamptz,
  winner_player_id  uuid references public.game_players(id) on delete set null,
  final_price       int
);
create unique index if not exists game_auctions_one_open
  on public.game_auctions(game_id) where status = 'open';

create table if not exists public.auction_bids (
  id         bigint generated always as identity primary key,
  auction_id uuid not null references public.game_auctions(id) on delete cascade,
  player_id  uuid not null references public.game_players(id) on delete cascade,
  amount     int  not null check (amount > 0),
  created_at timestamptz not null,
  unique (auction_id, amount)
);

create table if not exists public.trade_offers (
  id             uuid primary key,
  game_id        uuid not null references public.game_sessions(id) on delete cascade,
  from_player_id uuid not null references public.game_players(id) on delete cascade,
  to_player_id   uuid not null references public.game_players(id) on delete cascade,
  offer_tiles    jsonb not null default '[]'::jsonb,
  request_tiles  jsonb not null default '[]'::jsonb,
  offer_cash     int  not null default 0 check (offer_cash >= 0),
  request_cash   int  not null default 0 check (request_cash >= 0),
  offer_cards    jsonb not null default '[]'::jsonb,
  request_cards  jsonb not null default '[]'::jsonb,
  status         text not null check (status in ('pending','accepted','rejected','cancelled','countered','invalid')),
  parent_id      uuid references public.trade_offers(id) on delete set null,
  note           text,
  created_at     timestamptz not null,
  resolved_at    timestamptz,
  check (from_player_id <> to_player_id)
);
create index if not exists trade_offers_game_idx on public.trade_offers(game_id, status);

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id             bigint generated always as identity primary key,
  room_id        uuid not null references public.game_rooms(id) on delete cascade,
  user_id        uuid not null,
  room_player_id uuid references public.room_players(id) on delete set null,
  display_name   text not null,
  color          text,
  body           text not null check (char_length(body) between 1 and 300),
  created_at     timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages(room_id, created_at desc);
create index if not exists chat_messages_user_idx on public.chat_messages(user_id, created_at desc);
