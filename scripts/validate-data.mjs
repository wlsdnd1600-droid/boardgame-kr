// 데이터 파일 검사. Claude 주간 작업은 커밋 전에 반드시 `npm run validate` 를 실행하고,
// 실패하면 커밋하지 않습니다. Vercel 빌드에서도 실행되어 잘못된 데이터가 배포되지 않습니다.
import { readFileSync } from "node:fs";

const load = (f) => JSON.parse(readFileSync(`public/data/${f}`, "utf8"));
const errors = [];
const err = (m) => errors.push(m);

const games = load("games.json");
const releases = load("releases.json");
const summaries = load("summaries.json");
const genres = load("genres.json");

const genreIds = new Set(genres.map((g) => g.id));
const gameIds = new Set();
const RELEASE_STATUS = ["confirmed", "candidate", "upcoming", "outOfPrint", "notReleased", "sample"];
const AWARD_LEVEL = ["winner", "special", "nominee"];

for (const g of games) {
  const where = `games.json[${g.id}]`;
  if (!/^[a-z0-9-]+$/.test(g.id || "")) err(`${where}: id는 영문 소문자·숫자·하이픈만`);
  if (gameIds.has(g.id)) err(`${where}: id 중복`);
  gameIds.add(g.id);
  if (!g.titleKo) err(`${where}: titleKo 없음`);
  const p = g.players || {};
  if (!(p.min >= 1 && p.max >= p.min)) err(`${where}: 인원 범위 오류`);
  for (const b of p.best || []) if (b < p.min || b > p.max) err(`${where}: 베스트 인원 ${b}이 범위 밖`);
  if (!(g.weight >= 1 && g.weight <= 5)) err(`${where}: 난이도는 1~5`);
  if (!g.weightBasis) err(`${where}: 난이도 근거(weightBasis) 없음`);
  if (!Array.isArray(g.genres) || g.genres.length < 1 || g.genres.length > 3) err(`${where}: 장르는 1~3개`);
  for (const id of g.genres || []) if (!genreIds.has(id)) err(`${where}: 알 수 없는 장르 ${id}`);
  if (g.genres?.includes("two") && p.max !== 2) err(`${where}: 2인 전용인데 최대 인원이 2가 아님`);
  for (const k of ["reviewTrend", "longevity"]) {
    const v = g.score?.[k];
    if (!(v >= 0 && v <= 10)) err(`${where}: score.${k}는 0~10`);
  }
  for (const a of g.awards || []) if (!AWARD_LEVEL.includes(a.level)) err(`${where}: 수상 level 오류 ${a.level}`);
}

for (const r of releases) {
  const where = `releases.json[${r.gameId}]`;
  if (!gameIds.has(r.gameId)) err(`${where}: games.json에 없는 게임`);
  if (!RELEASE_STATUS.includes(r.status)) err(`${where}: 상태값 오류 ${r.status}`);
  if (r.status === "confirmed" && !(r.sourceUrls?.length >= 1)) err(`${where}: 확정인데 출처 URL 없음`);
  if (r.status === "confirmed" && !r.checkedAt) err(`${where}: 확정인데 확인일 없음`);
}
for (const id of gameIds) if (!releases.some((r) => r.gameId === id)) err(`releases.json: ${id} 발매 정보 없음`);

for (const s of summaries) {
  if (!gameIds.has(s.gameId)) err(`summaries.json[${s.gameId}]: games.json에 없는 게임`);
  if (!s.sample && !(s.referenceLinks?.length >= 1)) err(`summaries.json[${s.gameId}]: 참고 리뷰 링크 없음`);
}

if (errors.length) {
  console.error(`데이터 검사 실패 (${errors.length}건)\n- ` + errors.join("\n- "));
  process.exit(1);
}
console.log(`데이터 검사 통과: 게임 ${games.length}개, 발매 정보 ${releases.length}개, 요약 ${summaries.length}개`);
