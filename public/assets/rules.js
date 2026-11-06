// 게임·발매 데이터 검사 규칙 (공용).
// scripts/validate-data.mjs (빌드·주간 작업)와 브라우저(Supabase 실시간 수정분 검사)가 같은 규칙을 씁니다.

export const RELEASE_STATUS = ["confirmed", "candidate", "upcoming", "outOfPrint", "notReleased", "sample"];
export const AWARD_LEVEL = ["winner", "special", "nominee"];
export const OFFICIAL_STOCK = ["inStock", "soldOut"];
// BGG 는 데이터 출처로 쓰지 않습니다. 상세 페이지의 검색 링크는 코드에서 만들므로 데이터에는 주소가 없어야 합니다.
export const BGG_DOMAIN = /boardgamegeek\.com|geekdo\.com/i;
// 게임 사진은 재사용이 허용된 자유 라이선스만 씁니다. 퍼블리셔 박스 이미지는 넣지 않습니다.
export const FREE_LICENSE = /^(CC0|Public domain|PD[ -]|CC BY(-SA)? \d)/i;

// ctx: { genreIds: Set, themes: Set | null(검사 생략), fileExists: (path) => boolean | null(검사 생략) }
export function checkGame(g, ctx) {
  const errs = [];
  const err = (m) => errs.push(m);
  if (!/^[a-z0-9-]+$/.test(g.id || "")) err("id는 영문 소문자·숫자·하이픈만");
  if (!g.titleKo) err("titleKo 없음");
  if (!g.titleOriginal) err("titleOriginal 없음");
  if (!Number.isInteger(g.year)) err("year는 정수");
  if (!(Number.isInteger(g.age) && g.age >= 0)) err("age는 0 이상 정수");
  const t = g.playTime || {};
  if (!(t.min >= 1 && t.max >= t.min)) err("플레이 시간 범위 오류");
  const p = g.players || {};
  if (!(p.min >= 1 && p.max >= p.min)) err("인원 범위 오류");
  for (const b of p.best || []) if (b < p.min || b > p.max) err(`베스트 인원 ${b}이 범위 밖`);
  if (!(g.weight >= 1 && g.weight <= 5)) err("난이도는 1~5");
  if (!g.weightBasis) err("난이도 근거(weightBasis) 없음");
  if (!Array.isArray(g.genres) || g.genres.length < 1 || g.genres.length > 3) err("장르는 1~3개");
  for (const id of g.genres || []) if (!ctx.genreIds.has(id)) err(`알 수 없는 장르 ${id}`);
  if (g.genres?.includes("two") && p.max !== 2) err("2인 전용인데 최대 인원이 2가 아님");
  for (const k of ["reviewTrend", "longevity"]) {
    const v = g.score?.[k];
    if (!(v >= 0 && v <= 10)) err(`score.${k}는 0~10`);
  }
  if (ctx.themes && !ctx.themes.has(g.theme)) err("theme는 themes.svg 의 id");
  if (!ctx.themes && !/^[a-z]+$/.test(g.theme || "")) err("theme 없음");
  if (g.image) {
    const i = g.image;
    const okPath = /^\/images\/games\/[a-z0-9-]+\.(jpg|png)$/.test(i.file || "");
    if (!okPath || (ctx.fileExists && !ctx.fileExists(`public${i.file}`))) err(`image.file 없음 ${i.file}`);
    if (!FREE_LICENSE.test(i.license || "")) err(`자유 라이선스가 아닌 사진 ${i.license}`);
    if (!i.credit) err("image.credit 없음");
    if (!/^https:\/\/commons\.wikimedia\.org\//.test(i.sourceUrl || "")) err("image.sourceUrl은 위키미디어 공용 주소");
  }
  if (!Array.isArray(g.awards)) err("awards는 배열 (수상이 없으면 [])");
  for (const a of g.awards || []) {
    if (!AWARD_LEVEL.includes(a.level)) err(`수상 level 오류 ${a.level}`);
    if (!a.name || !Number.isInteger(a.year)) err("수상 name·year 없음");
  }
  if (BGG_DOMAIN.test(JSON.stringify(g))) err("BGG 주소가 들어 있음");
  return errs;
}

export function checkRelease(r) {
  const errs = [];
  const err = (m) => errs.push(m);
  if (!RELEASE_STATUS.includes(r.status)) err(`상태값 오류 ${r.status}`);
  // confirmed 는 출처 URL 이 원칙. 운영자가 직접 확인한 경우(verifiedBy: "operator")만 예외로 출처 없이 허용합니다.
  if (r.verifiedBy !== undefined && r.verifiedBy !== "operator") err(`verifiedBy 오류 ${r.verifiedBy}`);
  if (r.status === "confirmed" && !(r.sourceUrls?.length >= 1) && r.verifiedBy !== "operator") err("확정인데 출처 URL 없음");
  if (r.status === "confirmed" && !r.checkedAt) err("확정인데 확인일 없음");
  if (r.officialStock && !OFFICIAL_STOCK.includes(r.officialStock)) err(`officialStock 오류 ${r.officialStock}`);
  if (BGG_DOMAIN.test(JSON.stringify(r))) err("BGG 주소가 들어 있음");
  return errs;
}
