// Vercel 빌드 때 환경변수(SUPABASE_URL, SUPABASE_ANON_KEY)를 public/config.js 로 써 넣습니다.
// anon key 는 브라우저에 공개되는 키이며, 데이터 보호는 Supabase RLS 정책이 담당합니다.
import { writeFileSync, existsSync, readFileSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const cfg = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
};
writeFileSync(
  "public/config.js",
  `// 빌드 시 자동 생성됨 (scripts/build-config.mjs)\nwindow.APP_CONFIG = ${JSON.stringify(cfg)};\n`
);
console.log(`config.js 생성: Supabase ${cfg.supabaseUrl ? "연동됨" : "미연동"}`);
