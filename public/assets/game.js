import {
  loadAll, computeScore, difficultyLevel, playersText, timeText, escapeHtml, bggSearchUrl, thumbHtml,
  SCORE_LABEL, SCORE_WEIGHTS, STATUS_LABEL, MIN_MEMBER_REVIEWS,
} from "./data.js";
import { isSupabaseConfigured, fetchRatingStats, fetchReviews, insertReview, insertReport } from "./supabase.js";

const root = document.getElementById("detail");
const id = new URLSearchParams(location.search).get("id");
const e = escapeHtml;

// 목록에서 왔으면 필터 조건을 유지한 채 돌아가기
if (document.referrer && new URL(document.referrer).origin === location.origin) {
  const ref = new URL(document.referrer);
  if (ref.pathname === "/" || ref.pathname.endsWith("index.html")) document.getElementById("back").href = "/" + ref.search;
}

function stars(n) {
  const r = Math.round(n);
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function scoreSection(score, stat) {
  const rows = Object.entries(SCORE_LABEL).map(([k, label]) => {
    const v = score.parts[k];
    const used = v !== undefined;
    const note = k === "members" && !used
      ? `<span class="muted bar-note">회원 리뷰 ${MIN_MEMBER_REVIEWS}개 이상부터 반영${stat ? ` (현재 ${stat.review_count}개)` : ""}</span>` : "";
    return `<div class="bar-row ${used ? "" : "off"}">
      <span class="bar-label">${label} <span class="muted">${Math.round(SCORE_WEIGHTS[k] * 100)}%</span></span>
      <span class="bar"><span style="width:${used ? v * 10 : 0}%"></span></span>
      <span class="bar-val">${used ? v.toFixed(1) : "–"}</span>${note}
    </div>`;
  }).join("");
  return `<section class="panel"><h2>추천 점수 <b class="score-big">${score.total.toFixed(1)}</b><span class="muted"> / 10</span></h2>
    ${rows}
    <p class="muted small">AI 산정값입니다. 수상 이력이 없으면 중립값 5점으로 계산합니다. BGG 평점과는 다른 자체 점수예요.</p></section>`;
}

function photoCredit(img) {
  if (!img) return "";
  return `<p class="muted small">사진: ${e(img.credit)} · <a href="${e(img.sourceUrl)}" target="_blank" rel="noopener">${e(img.license)}</a> · 게임 공식 이미지가 아닙니다</p>`;
}

function releaseSection(r) {
  if (r.status === "sample") {
    return `<section class="panel"><h2>한국 발매 정보</h2>
      <p class="notice">예시 데이터입니다. 퍼블리셔·출시일·구매처는 첫 자동 업데이트에서 국내 퍼블리셔 공식 페이지로 확인해 채웁니다.</p></section>`;
  }
  const src = (r.sourceUrls || []).map((u, i) => `<a href="${e(u)}" target="_blank" rel="noopener">출처 ${i + 1}</a>`).join(" · ");
  return `<section class="panel"><h2>한국 발매 정보 <span class="badge ${r.status === "outOfPrint" ? "warn" : "ok"}">${e(STATUS_LABEL[r.status])}</span></h2>
    <dl class="info">
      <dt>퍼블리셔</dt><dd>${e(r.publisher || "–")}</dd>
      <dt>출시일</dt><dd>${e(r.releaseDate || "–")}</dd>
      <dt>구매처</dt><dd>${r.buyUrl ? `<a href="${e(r.buyUrl)}" target="_blank" rel="noopener">공식 판매 페이지</a>` : "–"}${r.officialStock === "soldOut" ? ` <span class="badge warn">확인일 기준 공식 몰 품절</span>` : ""}</dd>
      <dt>확인</dt><dd>${e(r.checkedAt || "–")} ${src ? `(${src})` : ""}</dd>
    </dl></section>`;
}

function summarySection(s) {
  if (!s) return `<section class="panel"><h2>해외 평 요약</h2><p class="muted">아직 요약이 없어요. 다음 자동 업데이트에서 작성됩니다.</p></section>`;
  const links = (s.referenceLinks || []).map((l) => `<li><a href="${e(l.url)}" target="_blank" rel="noopener">${e(l.title || l.url)}</a></li>`).join("");
  return `<section class="panel"><h2>해외 평 요약 <span class="badge ai">AI 요약</span></h2>
    <div class="pros-cons">
      <div><h3>좋은 점</h3><ul>${s.pros.map((x) => `<li>${e(x)}</li>`).join("")}</ul></div>
      <div><h3>아쉬운 점</h3><ul>${s.cons.map((x) => `<li>${e(x)}</li>`).join("")}</ul></div>
    </div>
    <p class="recommend"><b>이런 분께 추천</b> ${e(s.recommendFor)}</p>
    ${links ? `<h3>참고한 리뷰</h3><ul class="refs">${links}</ul>` : `<p class="muted small">${s.sample ? "예시 요약입니다. 실제 운영에서는 참고한 리뷰 링크가 함께 표시됩니다." : ""}</p>`}
    <p class="muted small">작성일 ${e(s.writtenAt)} · 리뷰 원문은 옮기지 않고 Claude가 자기 말로 정리했습니다.</p></section>`;
}

function reviewSection() {
  const off = !isSupabaseConfigured();
  return `<section class="panel" id="reviews"><h2>회원 리뷰</h2>
    ${off ? `<p class="notice">회원 리뷰는 Supabase 연동 후 사용할 수 있어요. (현재 연동 전)</p>` : ""}
    <ul class="review-list" id="review-list"></ul>
    <form id="review-form" class="form" ${off ? "inert" : ""}>
      <h3>리뷰 남기기</h3>
      <div class="form-row">
        <label>닉네임 <input name="nickname" maxlength="20" required /></label>
        <label>별점
          <select name="rating" required>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${stars(n)} ${n}</option>`).join("")}</select>
        </label>
        <label>몇 명이서? <input name="played_with" type="number" min="1" max="12" /></label>
      </div>
      <label>한 줄 평 <textarea name="body" maxlength="300" minlength="2" required rows="2"></textarea></label>
      <button type="submit" ${off ? "disabled" : ""}>등록</button>
      <p class="form-msg" role="status"></p>
    </form></section>`;
}

function reportSection() {
  const off = !isSupabaseConfigured();
  return `<section class="panel"><h2>정보가 틀렸나요?</h2>
    <form id="report-form" class="form" ${off ? "inert" : ""}>
      <label>내용 <textarea name="body" maxlength="500" minlength="2" required rows="2" placeholder="예: 최대 인원이 6명이에요 / 절판되었어요"></textarea></label>
      <button type="submit" ${off ? "disabled" : ""}>제보하기</button>
      <p class="form-msg" role="status">${off ? "제보 기능은 Supabase 연동 후 사용할 수 있어요." : "Claude가 다음 자동 업데이트에서 확인해 반영합니다."}</p>
    </form></section>`;
}

async function renderReviews() {
  const ul = document.getElementById("review-list");
  if (!isSupabaseConfigured()) return;
  try {
    const rows = await fetchReviews(id);
    ul.innerHTML = rows.length
      ? rows.map((r) => `<li><span class="stars">${stars(r.rating)}</span> <b>${e(r.nickname)}</b>
          ${r.played_with ? `<span class="muted">${r.played_with}명 플레이</span>` : ""}
          <p>${e(r.body)}</p><span class="muted small">${new Date(r.created_at).toLocaleDateString("ko-KR")}</span></li>`).join("")
      : `<li class="muted">첫 리뷰를 남겨 주세요.</li>`;
  } catch (err) {
    ul.innerHTML = `<li class="muted">리뷰를 불러오지 못했어요.</li>`;
  }
}

function bindForms() {
  const rf = document.getElementById("review-form");
  rf?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(rf), msg = rf.querySelector(".form-msg");
    try {
      await insertReview({
        game_id: id, nickname: f.get("nickname").trim(), rating: Number(f.get("rating")),
        played_with: f.get("played_with") ? Number(f.get("played_with")) : null, body: f.get("body").trim(),
      });
      rf.reset(); msg.textContent = "등록되었어요. 고마워요!"; renderReviews();
    } catch { msg.textContent = "등록하지 못했어요. 잠시 후 다시 시도해 주세요."; }
  });
  const pf = document.getElementById("report-form");
  pf?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = pf.querySelector(".form-msg");
    try {
      await insertReport({ game_id: id, type: "wrong_info", body: new FormData(pf).get("body").trim() });
      pf.reset(); msg.textContent = "제보가 접수되었어요. 다음 업데이트에서 확인할게요.";
    } catch { msg.textContent = "접수하지 못했어요. 잠시 후 다시 시도해 주세요."; }
  });
}

async function main() {
  const { games, genreLabel } = await loadAll();
  const g = games.find((x) => x.id === id);
  if (!g) { root.innerHTML += `<p>게임을 찾을 수 없어요.</p>`; document.getElementById("loading").remove(); return; }
  const stats = await fetchRatingStats();
  const stat = stats[g.id];
  const score = computeScore(g, stat);
  const lvl = difficultyLevel(g.weight);
  document.title = `${g.titleKo} · 오늘의 보드게임은?!`;
  document.getElementById("loading").remove();

  root.insertAdjacentHTML("beforeend", `
    <section class="hero">
      ${thumbHtml(g, "big")}
      <div>
        <h1>${e(g.titleKo)}</h1>
        <p class="orig">${e(g.titleOriginal)} · ${g.year}</p>
        <p class="genres">${g.genres.map((x) => `<span class="tag">${e(genreLabel[x])}</span>`).join(" ")}</p>
        <p><a href="${bggSearchUrl(g)}" target="_blank" rel="noopener" class="ext">BGG에서 보기 ↗</a></p>
        ${photoCredit(g.image)}
      </div>
    </section>
    <section class="panel">
      <dl class="info grid">
        <dt>인원</dt><dd>${e(playersText(g.players))} <span class="badge ai">베스트 AI 추정</span></dd>
        <dt>플레이 시간</dt><dd>${e(timeText(g.playTime))}</dd>
        <dt>연령</dt><dd>${g.age}세 이상</dd>
        <dt>난이도</dt><dd><b>${g.weight.toFixed(1)}</b> / 5 · ${lvl.label} <span class="badge ai">AI 산정</span><br /><span class="muted small">근거: ${e(g.weightBasis)}</span></dd>
        <dt>수상</dt><dd>${g.awards.length ? g.awards.map((a) => `${a.year} ${e(a.name)}`).join("<br />") : "–"}</dd>
      </dl>
    </section>
    ${scoreSection(score, stat)}
    ${releaseSection(g.release)}
    ${summarySection(g.summary)}
    ${reviewSection()}
    ${reportSection()}
  `);
  bindForms();
  renderReviews();
}

main().catch((err) => { console.error(err); root.innerHTML += `<p>데이터를 불러오지 못했어요.</p>`; });
