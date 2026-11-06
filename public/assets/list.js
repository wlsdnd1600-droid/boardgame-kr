import {
  loadAll, computeScore, difficultyLevel, DIFFICULTY_LEVELS, playersText, timeText, escapeHtml,
} from "./data.js";
import { fetchRatingStats, isSupabaseConfigured } from "./supabase.js";

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]; // 8 = 8명 이상
const $ = (id) => document.getElementById(id);

// 필터 상태 ↔ URL (?p=4&best=1&d=1,2&g=party,coop&sort=score) — 링크로 공유 가능
const state = readState();
function readState() {
  const q = new URLSearchParams(location.search);
  const list = (k) => (q.get(k) ? q.get(k).split(",").filter(Boolean) : []);
  return {
    players: q.get("p") ? Number(q.get("p")) : null,
    bestOnly: q.get("best") === "1",
    difficulty: new Set(list("d").map(Number)),
    genres: new Set(list("g")),
    sort: q.get("sort") || "score",
  };
}
function writeState() {
  const q = new URLSearchParams();
  if (state.players) q.set("p", state.players);
  if (state.bestOnly) q.set("best", "1");
  if (state.difficulty.size) q.set("d", [...state.difficulty].sort().join(","));
  if (state.genres.size) q.set("g", [...state.genres].join(","));
  if (state.sort !== "score") q.set("sort", state.sort);
  const s = q.toString();
  history.replaceState(null, "", s ? `?${s}` : location.pathname);
}

function chip(label, pressed, onClick, extra = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.setAttribute("aria-pressed", String(pressed));
  b.innerHTML = `${escapeHtml(label)}${extra}`;
  b.addEventListener("click", onClick);
  return b;
}

function renderFilters(genres) {
  const fp = $("f-players");
  fp.replaceChildren(...PLAYER_OPTIONS.map((n) =>
    chip(n === 8 ? "8명+" : `${n}명`, state.players === n, () => {
      state.players = state.players === n ? null : n; update();
    })));
  $("f-best").checked = state.bestOnly;
  $("f-best").disabled = !state.players;

  $("f-difficulty").replaceChildren(...DIFFICULTY_LEVELS.map((l) =>
    chip(l.label, state.difficulty.has(l.id), () => {
      state.difficulty.has(l.id) ? state.difficulty.delete(l.id) : state.difficulty.add(l.id); update();
    }, ` <span class="chip-sub">${l.min.toFixed(1)}–${l.max === 5 ? "5.0" : l.max.toFixed(1)}</span>`)));

  $("f-genres").replaceChildren(...genres.map((g) =>
    chip(g.label, state.genres.has(g.id), () => {
      state.genres.has(g.id) ? state.genres.delete(g.id) : state.genres.add(g.id); update();
    })));
  $("f-sort").value = state.sort;
}

function matches(g) {
  if (state.players) {
    const n = state.players;
    const fits = n === 8 ? g.players.max >= 8 : g.players.min <= n && n <= g.players.max;
    if (!fits) return false;
    if (state.bestOnly && !(g.players.best || []).some((b) => (n === 8 ? b >= 8 : b === n))) return false;
  }
  if (state.difficulty.size && !state.difficulty.has(difficultyLevel(g.weight).id)) return false;
  if (state.genres.size && !g.genres.some((id) => state.genres.has(id))) return false;
  return true;
}

const SORTERS = {
  score: (a, b) => b._score.total - a._score.total,
  members: (a, b) => (b._stat?.avg_rating ?? -1) - (a._stat?.avg_rating ?? -1) || b._score.total - a._score.total,
  easy: (a, b) => a.weight - b.weight || b._score.total - a._score.total,
  new: (a, b) => (b.release?.releaseDate || String(b.year)).localeCompare(a.release?.releaseDate || String(a.year)),
};

function card(g, genreLabel) {
  const lvl = difficultyLevel(g.weight);
  const li = document.createElement("li");
  li.className = "game-card";
  const badge = g.release.status === "outOfPrint" ? `<span class="badge warn">절판</span>` : "";
  const member = g._stat?.review_count
    ? `<span class="meta">회원 ★ ${Number(g._stat.avg_rating).toFixed(1)} (${g._stat.review_count})</span>` : "";
  li.innerHTML = `
    <a href="/game?id=${encodeURIComponent(g.id)}" class="card-link">
      <div class="thumb" data-genre="${escapeHtml(g.genres[0])}" aria-hidden="true">${escapeHtml(g.titleKo.slice(0, 1))}</div>
      <div class="card-body">
        <h3>${escapeHtml(g.titleKo)} ${badge}</h3>
        <p class="orig">${escapeHtml(g.titleOriginal)} · ${g.year}</p>
        <div class="tags">
          <span class="tag">${escapeHtml(playersText(g.players))}</span>
          <span class="tag lvl-${lvl.id}">난이도 ${g.weight.toFixed(1)} · ${lvl.label}</span>
          <span class="tag">플레이 ${escapeHtml(timeText(g.playTime))}</span>
        </div>
        <p class="genres">${g.genres.map((id) => escapeHtml(genreLabel[id])).join(" · ")} ${member}</p>
      </div>
      <div class="score" title="추천 점수 (10점 만점)"><b>${g._score.total.toFixed(1)}</b><span>추천 점수</span></div>
    </a>`;
  return li;
}

let data, stats = {};
function update() {
  writeState();
  renderFilters(data.genres);
  const list = data.games
    .map((g) => ({ ...g, _stat: stats[g.id], _score: computeScore(g, stats[g.id]) }))
    .filter(matches)
    .sort(SORTERS[state.sort] || SORTERS.score);
  $("game-list").replaceChildren(...list.map((g) => card(g, data.genreLabel)));
  $("result-count").textContent = `한국 발매작 ${list.length}개`;
  $("empty").hidden = list.length > 0;
}

async function main() {
  data = await loadAll();
  $("sample-banner").hidden = !data.games.some((g) => g.release.status === "sample");
  const last = data.runLog.runs?.at(-1);
  if (last) $("last-run").textContent = `마지막 데이터 업데이트: ${last.runAt}`;
  $("f-best").addEventListener("change", (e) => { state.bestOnly = e.target.checked; update(); });
  $("f-sort").addEventListener("change", (e) => { state.sort = e.target.value; update(); });
  $("f-reset").addEventListener("click", () => {
    Object.assign(state, { players: null, bestOnly: false, difficulty: new Set(), genres: new Set(), sort: "score" });
    update();
  });
  if (!isSupabaseConfigured()) $("f-sort").querySelector('[value="members"]').disabled = true;
  update();
  stats = await fetchRatingStats(); // Supabase 미연동이면 {} — 화면은 그대로
  if (Object.keys(stats).length) update();
}

main().catch((e) => {
  console.error(e);
  $("result-count").textContent = "데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
});
