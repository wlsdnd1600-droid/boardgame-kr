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

// BGG 는 데이터 출처로 쓰지 않습니다. 상세 페이지의 검색 링크는 코드에서 만들므로 데이터에는 주소가 없어야 합니다.
const BGG_DOMAIN = /boardgamegeek\.com|geekdo\.com/i;
for (const f of ["games.json", "releases.json", "summaries.json", "publishers.json", "run-log.json"]) {
  if (BGG_DOMAIN.test(readFileSync(`public/data/${f}`, "utf8"))) err(`${f}: BGG 주소가 들어 있음 (데이터 출처로 사용 금지)`);
}

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
  if (!g.titleOriginal) err(`${where}: titleOriginal 없음`);
  if (!Number.isInteger(g.year)) err(`${where}: year는 정수`);
  if (!(Number.isInteger(g.age) && g.age >= 0)) err(`${where}: age는 0 이상 정수`);
  const t = g.playTime || {};
  if (!(t.min >= 1 && t.max >= t.min)) err(`${where}: 플레이 시간 범위 오류`);
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
  if (!Array.isArray(g.awards)) err(`${where}: awards는 배열 (수상이 없으면 [])`);
  for (const a of g.awards || []) {
    if (!AWARD_LEVEL.includes(a.level)) err(`${where}: 수상 level 오류 ${a.level}`);
    if (!a.name || !Number.isInteger(a.year)) err(`${where}: 수상 name·year 없음`);
  }
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
  for (const k of ["pros", "cons"]) {
    if (!(Array.isArray(s[k]) && s[k].length >= 1)) err(`summaries.json[${s.gameId}]: ${k}는 1개 이상의 배열`);
  }
  for (const k of ["recommendFor", "writtenAt"]) if (!s[k]) err(`summaries.json[${s.gameId}]: ${k} 없음`);
}

if (errors.length) {
  console.error(`데이터 검사 실패 (${errors.length}건)\n- ` + errors.join("\n- "));
  process.exit(1);
}
console.log(`데이터 검사 통과: 게임 ${games.length}개, 발매 정보 ${releases.length}개, 요약 ${summaries.length}개`);
