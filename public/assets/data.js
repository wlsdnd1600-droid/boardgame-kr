// 데이터 로드와 계산 로직 (목록·상세 페이지 공용)
// 게임 데이터는 public/data/*.json 이며, Claude 주간 작업이 갱신합니다.

export const DIFFICULTY_LEVELS = [
  { id: 1, label: "입문", min: 1.0, max: 1.79 },
  { id: 2, label: "초급", min: 1.8, max: 2.59 },
  { id: 3, label: "중급", min: 2.6, max: 3.39 },
  { id: 4, label: "중상급", min: 3.4, max: 4.19 },
  { id: 5, label: "고급", min: 4.2, max: 5.0 },
];

// 사이트에 노출하는 발매 상태 (기획서 4장)
export const VISIBLE_STATUS = ["confirmed", "outOfPrint", "sample"];
export const STATUS_LABEL = {
  confirmed: "한국 정식 발매",
  outOfPrint: "절판",
  sample: "예시 데이터 · 발매 확인 전",
  candidate: "확인 중",
  upcoming: "출시 예정",
  notReleased: "미발매",
};

// 추천 점수 가중치 (기획서 3장). 회원 평점이 5개 미만이면 빼고 나머지로 다시 나눔.
export const SCORE_WEIGHTS = { reviewTrend: 0.5, awards: 0.2, longevity: 0.1, members: 0.2 };
export const SCORE_LABEL = { reviewTrend: "공개 리뷰 경향", awards: "수상 이력", longevity: "시장 수명", members: "회원 평점" };
export const MIN_MEMBER_REVIEWS = 5;
const AWARD_POINTS = { winner: 10, special: 8, nominee: 7 };
const NO_AWARD_POINTS = 5; // 수상 이력이 없으면 감점이 아니라 중립값

export function difficultyLevel(weight) {
  return DIFFICULTY_LEVELS.find((l) => weight >= l.min && weight <= l.max + 0.0001) || DIFFICULTY_LEVELS[4];
}

export function awardScore(game) {
  const pts = (game.awards || []).map((a) => AWARD_POINTS[a.level] || 0);
  return pts.length ? Math.max(...pts) : NO_AWARD_POINTS;
}

// stat: { avg_rating(1~5), review_count } 또는 undefined
export function computeScore(game, stat) {
  const parts = {
    reviewTrend: game.score.reviewTrend,
    awards: awardScore(game),
    longevity: game.score.longevity,
  };
  if (stat && stat.review_count >= MIN_MEMBER_REVIEWS) parts.members = Number(stat.avg_rating) * 2;
  let sum = 0, wsum = 0;
  for (const [k, v] of Object.entries(parts)) { sum += v * SCORE_WEIGHTS[k]; wsum += SCORE_WEIGHTS[k]; }
  return { total: Math.round((sum / wsum) * 10) / 10, parts };
}

export function playersText(p) {
  const range = p.min === p.max ? `${p.min}명` : `${p.min}–${p.max}명`;
  return p.best?.length ? `${range} (베스트 ${p.best.join("·")}명)` : range;
}
export function timeText(t) {
  return t.min === t.max ? `${t.min}분` : `${t.min}–${t.max}분`;
}

export function bggSearchUrl(game) {
  return `https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(game.titleOriginal)}`;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 자유 라이선스 사진이 있으면 사진, 없으면 주제 일러스트(themes.svg)를 보여줍니다.
export function thumbHtml(game, extraClass = "") {
  const inner = game.image
    ? `<img src="${escapeHtml(game.image.file)}" alt="" loading="lazy" />`
    : `<svg viewBox="0 0 20 20"><use href="/assets/themes.svg#${escapeHtml(game.theme)}"></use></svg>`;
  return `<div class="thumb ${extraClass}" data-genre="${escapeHtml(game.genres[0])}" aria-hidden="true">${inner}</div>`;
}

let cache;
export async function loadAll() {
  if (cache) return cache;
  const get = (f) => fetch(`/data/${f}`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  const [games, releases, summaries, genres, runLog] = await Promise.all([
    get("games.json"), get("releases.json"), get("summaries.json"), get("genres.json"), get("run-log.json"),
  ]);
  const releaseById = Object.fromEntries(releases.map((r) => [r.gameId, r]));
  const summaryById = Object.fromEntries(summaries.map((s) => [s.gameId, s]));
  const genreLabel = Object.fromEntries(genres.map((g) => [g.id, g.label]));
  const visible = games
    .map((g) => ({ ...g, release: releaseById[g.id], summary: summaryById[g.id] }))
    .filter((g) => g.release && VISIBLE_STATUS.includes(g.release.status));
  cache = { games: visible, genres, genreLabel, runLog };
  return cache;
}
