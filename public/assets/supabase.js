// Supabase 연결 (회원 리뷰·제보). config.js 에 값이 없으면 null 을 돌려주고,
// 화면은 "연동 전" 안내를 보여줍니다. 지금은 연동하지 않은 상태입니다.
let clientPromise;

export function isSupabaseConfigured() {
  const c = window.APP_CONFIG || {};
  return Boolean(c.supabaseUrl && c.supabaseAnonKey);
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG;
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) => createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } }))
      .catch((e) => { console.warn("Supabase 로드 실패", e); return null; });
  }
  return clientPromise;
}

// { [game_id]: { avg_rating, review_count } }
export async function fetchRatingStats() {
  const sb = await getSupabase();
  if (!sb) return {};
  const { data, error } = await sb.from("game_rating_stats").select("game_id, avg_rating, review_count");
  if (error) { console.warn(error); return {}; }
  return Object.fromEntries(data.map((r) => [r.game_id, r]));
}

// 배포 없이 바로 반영하는 게임 수정분. 응답이 늦으면(3초) JSON 데이터만으로 화면을 그립니다.
export async function fetchGameUpdates() {
  const sb = await getSupabase();
  if (!sb) return [];
  const query = sb.from("game_updates").select("game_id, game, release, updated_at")
    .then(({ data, error }) => { if (error) { console.warn(error); return []; } return data; });
  const timeout = new Promise((resolve) => setTimeout(() => resolve([]), 3000));
  return Promise.race([query, timeout]);
}

export async function fetchReviews(gameId) {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("reviews")
    .select("nickname, rating, played_with, body, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function insertReview(row) {
  const sb = await getSupabase();
  if (!sb) throw new Error("Supabase 미연동");
  const { error } = await sb.from("reviews").insert(row);
  if (error) throw error;
}

export async function insertReport(row) {
  const sb = await getSupabase();
  if (!sb) throw new Error("Supabase 미연동");
  const { error } = await sb.from("reports").insert(row);
  if (error) throw error;
}
