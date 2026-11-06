# 오늘의 보드게임은?!

인원·난이도·장르를 고르면 **한국에 정식 발매된 보드게임만** 추천 점수순으로 보여주는 사이트입니다.
데이터는 Claude 예약 작업이 매주 자동으로 갱신합니다. 자세한 기획은 기획서 문서를 참고하세요.

> 현재 상태: **배포됨** — https://boardgame-kr.vercel.app (Vercel, main 푸시 시 자동 배포)
> Supabase 프로젝트(서울)에 마이그레이션은 적용했지만, Vercel 에 `SUPABASE_ANON_KEY` 를 아직 넣지 않아
> 회원 리뷰·제보·실시간 게임 수정은 "연동 전" 상태입니다. 키를 넣고 재배포하면 켜집니다.
> `public/data` 는 118종이며, 111종은 코리아보드게임즈 공식 상품 페이지로, 7종은 운영자 확인(`verifiedBy: "operator"`, 출처 URL 없음)으로 발매를 확인했습니다.

## 구조

```
public/                 ← Vercel 이 그대로 배포하는 폴더 (빌드 도구·의존성 없음)
  index.html            메인: 필터 + 추천 목록
  game.html             게임 상세 (/game?id=azul)
  config.js             Supabase 공개 설정 (빌드 때 환경변수로 자동 생성)
  assets/
    data.js             데이터 로드, 추천 점수·난이도 계산
    list.js             필터·정렬 화면
    game.js             상세 화면, 회원 리뷰·제보
    supabase.js         Supabase 연결 (설정이 없으면 "연동 전" 상태)
    rules.js            게임·발매 데이터 검사 규칙 (검사 스크립트와 브라우저 공용)
    style.css
  data/                 ← Claude 주간 작업이 갱신하는 데이터
    games.json          게임 정보, 난이도, 장르, 점수 요소
    releases.json       한국 발매 상태·퍼블리셔·출처
    summaries.json      해외 평 AI 요약
    genres.json         사이트 장르 12개
    publishers.json     국내 퍼블리셔 목록
    run-log.json        자동 실행 기록
scripts/
  build-config.mjs      환경변수 → public/config.js
  validate-data.mjs     데이터 검사 (실패하면 빌드 중단)
  serve.mjs             로컬 미리보기 서버
  gen-known-games-sql.mjs  games.json id → Supabase known_games 시드 SQL
supabase/migrations/    회원 리뷰·제보·실시간 게임 수정 테이블과 보안 정책 (파일명 순서대로 실행)
agent/weekly-update.md  Claude 예약 작업용 프롬프트
```

## 로컬에서 보기

Node.js 18 이상만 있으면 됩니다. 설치할 패키지는 없습니다.

```bash
npm run dev        # http://localhost:3000
npm run validate   # 데이터 검사
```

## 연동 방법

### 1. GitHub
저장소: `wlsdnd1600-droid/boardgame-kr` (공개)

### 2. Supabase
1. 새 프로젝트를 만듭니다 (리전: Northeast Asia (Seoul) 권장).
2. SQL Editor 에서 `supabase/migrations/` 의 파일을 이름 순서대로 실행합니다. 다시 실행해도 오류가 나지 않습니다.
3. Settings → API 에서 `Project URL` 과 `anon public` 키를 복사합니다.
4. `service_role` 키는 Claude 예약 작업에만 쓰고, 저장소·브라우저에는 절대 넣지 않습니다.

### 3. Vercel
1. Add New → Project 에서 GitHub 저장소를 가져옵니다. Framework Preset 은 **Other**.
2. Environment Variables 에 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 를 등록합니다.
3. Deploy. 빌드 설정은 `vercel.json` 에 들어 있습니다 (빌드 = 설정 생성 + 데이터 검사, 출력 = `public`).
4. 이후 main 브랜치에 푸시될 때마다 자동 배포됩니다.

### 4. Claude 예약 작업
1. Claude 에서 주 1회 예약 작업을 만들고 `agent/weekly-update.md` 의 프롬프트를 넣습니다.
2. 작업이 GitHub 저장소에 푸시할 수 있도록 연결하고, Supabase service_role 키를 작업 환경에만 제공합니다.

## 배포 없이 게임 추가·수정하기 (실시간)

Supabase 대시보드 → Table Editor → `game_updates` 에 행을 넣으면 다음 페이지 로드부터 바로 반영됩니다.

| 열 | 내용 |
| --- | --- |
| `game_id` | 게임 id (기존 게임이면 games.json 의 id, 새 게임이면 영문 소문자·숫자·하이픈) |
| `game` | 바꿀 games.json 필드만. 예: `{"players": {"max": 5}, "age": 10}` |
| `release` | 바꿀 releases.json 필드만. 예: `{"officialStock": "soldOut"}` |
| `note` | 수정 이유 메모 (공개 읽기 가능하니 개인 정보는 쓰지 않기) |

- 새 게임은 `game` 에 games.json 의 필수 필드 전부, `release` 에 `status`·`sourceUrls`·`checkedAt` 등을 넣습니다. 사진(`image`)은 쓰지 않습니다.
- 브라우저가 합친 결과를 `public/assets/rules.js` 규칙으로 검사해 통과하지 못하면 그 행은 무시합니다 (콘솔에 이유 표시). DB 도 BGG 주소, 발매 상태값, confirmed 의 출처·확인일, 난이도·인원 범위를 막습니다.
- 매주 Claude 작업이 이 수정분을 JSON 에 합쳐 커밋하고 행을 지웁니다. 기준 데이터는 계속 저장소입니다.

## 계산 규칙

**난이도 (5점 만점, AI 산정)**

| 단계 | 점수 | 기준 |
| --- | --- | --- |
| 입문 | 1.0–1.79 | 규칙 설명 10분 이내, 턴당 선택지 1~2개 |
| 초급 | 1.8–2.59 | 핵심 메커니즘 1~2개, 30~60분 |
| 중급 | 2.6–3.39 | 메커니즘 여러 개 결합, 장기 계획 필요 |
| 중상급 | 3.4–4.19 | 예외 규칙 많음, 90분 이상 |
| 고급 | 4.2–5.0 | 룰북 분량 큼, 2시간 이상 |

**추천 점수 (10점 만점)** = 공개 리뷰 경향 50% + 수상 이력 20% + 시장 수명 10% + 회원 평점 20%

- 수상 이력: 올해의 게임·전문가 게임상 수상 10, 특별상 8, 후보 7, 없음 5(중립)
- 회원 평점: 별점(1~5)×2. 리뷰 5개 미만이면 빼고 나머지 비중으로 다시 계산
- 가중치는 `public/assets/data.js` 의 `SCORE_WEIGHTS` 에서 바꿀 수 있습니다.

**사이트에 보이는 발매 상태**: `confirmed`(정식 발매), `outOfPrint`(절판, 배지 표시), `sample`(예시 데이터, 현재 없음). `confirmed` 는 출처 URL 과 확인일이 필수이며, 운영자가 직접 확인한 게임만 `verifiedBy: "operator"` 로 출처 없이 허용합니다(상세 화면에 "운영자 확인" 표시).
`candidate`·`upcoming`·`notReleased` 는 숨깁니다.

## 주의
- BoardGameGeek 페이지는 데이터 출처로 쓰지 않습니다 (BGG 약관의 AI 데이터 사용 금지). 상세 페이지에 BGG 검색 링크만 둡니다.
- 리뷰 원문은 저장하지 않고 Claude 가 자기 말로 요약합니다.
- 퍼블리셔 박스 이미지는 저작권 때문에 넣지 않습니다. 썸네일은 모두 주제 픽셀 아이콘(`assets/themes.svg`, `games.json` 의 `theme`)을 씁니다. 사진 표시 코드(`image` 필드, `/credits`)는 남아 있지만 현재 사진은 넣지 않습니다.
