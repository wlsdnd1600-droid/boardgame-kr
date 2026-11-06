-- 오늘의 보드게임은?! · Supabase 초기 스키마
-- 여러 번 실행해도 오류가 나지 않도록 작성했습니다 (if not exists / drop ... if exists).
-- 게임 데이터의 기준은 GitHub 저장소의 public/data/*.json 이고,
-- Supabase 에는 회원 리뷰·제보와 배포 없이 바로 반영할 게임 수정분(game_updates)만 둡니다.

-- 0) 게임 id 목록 ---------------------------------------------------------
-- 없는 game_id 로 리뷰·제보가 들어가지 않도록 외래 키 대상으로 씁니다.
-- games.json 의 id 는 시드 마이그레이션으로 넣고, game_updates 로 새 게임을 추가하면 트리거가 자동으로 넣습니다.
create table if not exists public.known_games (
  id         text primary key check (id ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now()
);

-- 1) 회원 리뷰 ------------------------------------------------------------
create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  game_id     text        not null,
  nickname    text        not null check (char_length(nickname) between 1 and 20),
  rating      smallint    not null check (rating between 1 and 5),   -- 별점 1~5
  played_with smallint    check (played_with between 1 and 12),      -- 함께 플레이한 인원
  body        text        not null check (char_length(body) between 2 and 300),
  hidden      boolean     not null default false,                    -- 주간 정리에서 욕설·광고 숨김
  created_at  timestamptz not null default now()
);
create index if not exists reviews_game_idx on public.reviews (game_id, created_at desc);

-- 2) 제보 (누락 게임, 정보 오류) --------------------------------------------
create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  game_id    text,                                                 -- 누락 게임 제보면 null
  type       text        not null check (type in ('missing_game', 'wrong_info', 'other')),
  body       text        not null check (char_length(body) between 2 and 500),
  status     text        not null default 'open' check (status in ('open', 'applied', 'rejected')),
  note       text,                                                 -- 처리 메모
  created_at timestamptz not null default now()
);

-- 없는 game_id 차단 (테이블이 이미 있던 경우에도 추가되도록 별도로 겁니다)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_game_id_fkey') then
    alter table public.reviews add constraint reviews_game_id_fkey
      foreign key (game_id) references public.known_games (id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_game_id_fkey') then
    alter table public.reports add constraint reports_game_id_fkey
      foreign key (game_id) references public.known_games (id) not valid;
  end if;
end $$;

-- 3) 실시간 게임 수정분 ------------------------------------------------------
-- 한 행 = 게임 하나. 브라우저가 games.json / releases.json 위에 덮어씁니다.
--  - game:    games.json 형식의 필드 일부(기존 게임 수정) 또는 전체(새 게임). id 는 넣지 않아도 됩니다.
--  - release: releases.json 형식의 필드 일부 또는 전체. gameId 는 넣지 않아도 됩니다.
-- 주간 작업이 이 내용을 JSON 에 합쳐 커밋한 뒤 행을 지웁니다.
-- 쓰기는 Supabase 대시보드(Table Editor) 또는 service_role 키로만 가능합니다.
create table if not exists public.game_updates (
  game_id    text primary key check (game_id ~ '^[a-z0-9-]+$'),
  game       jsonb not null default '{}'::jsonb check (jsonb_typeof(game) = 'object'),
  release    jsonb not null default '{}'::jsonb check (jsonb_typeof(release) = 'object'),
  note       text,                                                 -- 수정 이유 메모 (화면엔 안 보이지만 anon 도 읽을 수 있으니 개인 정보는 쓰지 않음)
  updated_at timestamptz not null default now()
);

-- DB 쪽 최소 검사 (전체 규칙은 브라우저와 validate-data.mjs 의 public/assets/rules.js)
create or replace function public.game_update_is_valid(g jsonb, r jsonb)
returns boolean language sql immutable set search_path = public as $$
  select
    -- BGG 주소 금지
    (g::text || r::text) !~* '(boardgamegeek\.com|geekdo\.com)'
    -- 사진은 쓰지 않음 (썸네일은 주제 픽셀 아이콘)
    and not (g ? 'image')
    -- 발매 상태값
    and (not (r ? 'status') or r->>'status' in ('confirmed','candidate','upcoming','outOfPrint','notReleased','sample'))
    -- confirmed 는 출처 URL 과 확인일 필수
    and (r->>'status' is distinct from 'confirmed'
         or (jsonb_typeof(r->'sourceUrls') = 'array' and jsonb_array_length(r->'sourceUrls') >= 1
             and coalesce(r->>'checkedAt', '') <> ''))
    -- 난이도 1~5
    and (not (g ? 'weight') or (jsonb_typeof(g->'weight') = 'number' and (g->>'weight')::numeric between 1 and 5))
    -- 인원 범위
    and (not (g ? 'players') or (
          jsonb_typeof(g->'players'->'min') = 'number' and jsonb_typeof(g->'players'->'max') = 'number'
          and (g->'players'->>'min')::numeric >= 1
          and (g->'players'->>'max')::numeric >= (g->'players'->>'min')::numeric))
$$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'game_updates_valid') then
    alter table public.game_updates add constraint game_updates_valid
      check (public.game_update_is_valid(game, release));
  end if;
end $$;

-- 새 게임을 추가하면 리뷰를 받을 수 있도록 known_games 에도 넣고, 수정 시각을 갱신합니다.
create or replace function public.game_updates_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.known_games (id) values (new.game_id) on conflict do nothing;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists game_updates_touch on public.game_updates;
create trigger game_updates_touch before insert or update on public.game_updates
  for each row execute function public.game_updates_touch();

-- 4) 게임별 회원 평점 집계 (목록 정렬·추천 점수에 사용) -----------------------
create or replace view public.game_rating_stats
with (security_invoker = true) as
select game_id,
       round(avg(rating)::numeric, 2) as avg_rating,
       count(*)::int                   as review_count
from public.reviews
where hidden = false
group by game_id;

-- 5) 보안 정책(RLS) ---------------------------------------------------------
-- 브라우저는 anon key 로 접속하므로, 아래 정책 밖의 작업은 모두 막힙니다.
-- 정책 이름이 같으면 지우고 다시 만들어 재실행해도 오류가 나지 않습니다.
alter table public.known_games  enable row level security;
alter table public.reviews      enable row level security;
alter table public.reports      enable row level security;
alter table public.game_updates enable row level security;

-- 숨김 처리되지 않은 리뷰만 읽기
drop policy if exists "reviews: read visible" on public.reviews;
create policy "reviews: read visible" on public.reviews
  for select to anon, authenticated using (hidden = false);

-- 리뷰 작성 (숨김 값은 직접 지정 불가, 없는 게임은 외래 키가 차단)
drop policy if exists "reviews: insert" on public.reviews;
create policy "reviews: insert" on public.reviews
  for insert to anon, authenticated with check (hidden = false);

-- 제보 작성만 가능, 읽기는 불가 (주간 작업은 service_role 키로 읽음)
drop policy if exists "reports: insert" on public.reports;
create policy "reports: insert" on public.reports
  for insert to anon, authenticated with check (status = 'open' and note is null);

-- 게임 수정분은 읽기만 (쓰기 정책 없음 → 대시보드·service_role 만 쓰기 가능)
drop policy if exists "game_updates: read" on public.game_updates;
create policy "game_updates: read" on public.game_updates
  for select to anon, authenticated using (true);

-- known_games 는 외래 키 확인용이라 브라우저 정책이 필요 없습니다.
-- 수정·삭제 정책은 만들지 않습니다 → anon 에서는 불가.
-- service_role 키는 절대 브라우저·저장소에 넣지 마세요.
