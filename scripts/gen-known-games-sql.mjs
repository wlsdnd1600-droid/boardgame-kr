// games.json 의 id 를 Supabase known_games 에 넣는 SQL 을 만듭니다 (재실행 안전).
// 사용: node scripts/gen-known-games-sql.mjs > supabase/migrations/<시각>_seed_known_games.sql
import { readFileSync } from "node:fs";
const ids = JSON.parse(readFileSync("public/data/games.json", "utf8")).map((g) => g.id);
for (const id of ids) if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`잘못된 id ${id}`);
console.log(`-- games.json 의 게임 id ${ids.length}개 (scripts/gen-known-games-sql.mjs 로 생성)
insert into public.known_games (id) values
${ids.map((id) => `  ('${id}')`).join(",\n")}
on conflict (id) do nothing;`);
