// 데이터 파일 검사. Claude 주간 작업은 커밋 전에 반드시 `npm run validate` 를 실행하고,
// 실패하면 커밋하지 않습니다. Vercel 빌드에서도 실행되어 잘못된 데이터가 배포되지 않습니다.
// 게임·발매 규칙은 public/assets/rules.js 에 있고, 브라우저도 Supabase 실시간 수정분을 같은 규칙으로 검사합니다.
import { existsSync, readFileSync } from "node:fs";
import { checkGame, checkRelease, BGG_DOMAIN } from "../public/assets/rules.js";

const load = (f) => JSON.parse(readFileSync(`public/data/${f}`, "utf8"));
const errors = [];
const err = (m) => errors.push(m);

const games = load("games.json");
const releases = load("releases.json");
const summaries = load("summaries.json");
const genres = load("genres.json");

for (const f of ["games.json", "releases.json", "summaries.json", "publishers.json", "run-log.json"]) {
  if (BGG_DOMAIN.test(readFileSync(`public/data/${f}`, "utf8"))) err(`${f}: BGG 주소가 들어 있음 (데이터 출처로 사용 금지)`);
}

const ctx = {
  genreIds: new Set(genres.map((g) => g.id)),
  themes: new Set([...readFileSync("public/assets/themes.svg", "utf8").matchAll(/<symbol id="([a-z]+)"/g)].map((m) => m[1])),
  fileExists: existsSync,
};
const gameIds = new Set();
for (const g of games) {
  const where = `games.json[${g.id}]`;
  if (gameIds.has(g.id)) err(`${where}: id 중복`);
  gameIds.add(g.id);
  for (const m of checkGame(g, ctx)) err(`${where}: ${m}`);
}

for (const r of releases) {
  const where = `releases.json[${r.gameId}]`;
  if (!gameIds.has(r.gameId)) err(`${where}: games.json에 없는 게임`);
  for (const m of checkRelease(r)) err(`${where}: ${m}`);
}
for (const id of gameIds) if (!releases.some((r) => r.gameId === id)) err(`releases.json: ${id} 발매 정보 없음`);

for (const s of summaries) {
  if (!gameIds.has(s.gameId)) err(`summaries.json[${s.gameId}]: games.json에 없는 게임`);
  // 참고 리뷰 링크는 새로 쓰는 요약에 필수(주간 작업 지침)지만, 운영자가 검토한 기존 요약은 링크 없이도 허용합니다.
  if (!Array.isArray(s.referenceLinks)) err(`summaries.json[${s.gameId}]: referenceLinks는 배열`);
  for (const l of s.referenceLinks || []) if (!/^https?:\/\//.test(l.url || "")) err(`summaries.json[${s.gameId}]: 참고 리뷰 URL 오류`);
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
