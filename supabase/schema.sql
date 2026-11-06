-- 보드게임 추천 사이트 · Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요.
-- 게임 데이터 자체는 GitHub 저장소의 public/data/*.json 에 있고,
-- Supabase 에는 사용자가 만드는 데이터(회원 리뷰, 제보)만 저장합니다.

-- 1) 회원 리뷰 ------------------------------------------------------------
create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  game_id     text        not null,                         -- games.json 의 id
  nickname    text        not null check (char_length(nickname) between 1 and 20),
  rating      smallint    not null check (rating between 1 and 5),   -- 별점 1~5
  played_with smallint    check (played_with between 1 and 12),      -- 함께 플레이한 인원
  body        text        not null check (char_length(body) between 2 and 300),
  hidden      boolean     not null default false,           -- Claude 주간 정리에서 욕설·광고 숨김
  created_at  timestamptz not null default now()
);
create index if not exists reviews_game_idx on public.reviews (game_id, created_at desc);

-- 2) 제보 (누락 게임, 정보 오류) --------------------------------------------
create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  game_id    text,                                          -- 누락 게임 제보면 null
  type       text        not null check (type in ('missing_game', 'wrong_info', 'other')),
  body       text        not null check (char_length(body) between 2 and 500),
  status     text        not null default 'open' check (status in ('open', 'applied', 'rejected')),
  note       text,                                          -- Claude 처리 메모
  created_at timestamptz not null default now()
);

-- 3) 게임별 회원 평점 집계 (목록 정렬·추천 점수에 사용) -----------------------
create or replace view public.game_rating_stats
with (security_invoker = true) as
select game_id,
       round(avg(rating)::numeric, 2) as avg_rating,
       count(*)::int                   as review_count
from public.reviews
where hidden = false
group by game_id;

-- 4) 보안 정책(RLS) ---------------------------------------------------------
-- 브라우저는 anon key 로 접속하므로, 아래 정책 밖의 작업은 모두 막힙니다.
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

-- 누구나 숨김 처리되지 않은 리뷰를 읽을 수 있음
create policy "reviews: read visible" on public.reviews
  for select to anon, authenticated using (hidden = false);

-- 누구나 리뷰 작성 가능 (숨김 값은 직접 지정 불가)
create policy "reviews: insert" on public.reviews
  for insert to anon, authenticated with check (hidden = false);

-- 누구나 제보 작성 가능, 읽기는 불가 (Claude 작업은 service_role 키로 읽음)
create policy "reports: insert" on public.reports
  for insert to anon, authenticated with check (status = 'open' and note is null);

-- 수정·삭제 정책은 만들지 않습니다 → anon 에서는 불가.
-- Claude 주간 작업은 service_role 키로 접속해 hidden/status 를 변경합니다.
-- (service_role 키는 절대 브라우저·저장소에 넣지 마세요.)
