// Vercel 빌드 때 Supabase 공개 설정(URL, 공개 키)을 public/config.js 로 써 넣습니다.
// 공개 키(anon / publishable)는 브라우저에 공개되는 키이며, 데이터 보호는 Supabase RLS 정책이 담당합니다.
// Supabase–Vercel 통합이 넣은 publishable 키를 먼저 쓰고, 없으면 예전 anon 키를 씁니다.
// service_role / secret 키는 절대 읽지 않습니다.
import { writeFileSync, existsSync, readFileSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const pick = (...names) => names.map((n) => process.env[n]).find(Boolean) || "";
const cfg = {
  supabaseUrl: pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: pick(
    "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ),
};
// 공개 키 자리에 secret 키가 잘못 들어오면 빌드를 멈춥니다.
if (/^sb_secret_/.test(cfg.supabaseAnonKey) || /"role"\s*:\s*"service_role"/.test(
  (() => { try { return Buffer.from(cfg.supabaseAnonKey.split(".")[1] || "", "base64").toString(); } catch { return ""; } })(),
)) {
  console.error("공개 키 자리에 secret/service_role 키가 들어 있습니다. 빌드를 중단합니다.");
  process.exit(1);
}
writeFileSync(
  "public/config.js",
  `// 빌드 시 자동 생성됨 (scripts/build-config.mjs)\nwindow.APP_CONFIG = ${JSON.stringify(cfg)};\n`
);
console.log(`config.js 생성: Supabase ${cfg.supabaseUrl && cfg.supabaseAnonKey ? "연동됨" : "미연동"}`);
