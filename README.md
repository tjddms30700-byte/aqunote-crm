# 🌊 AQUNOTE

위례아쿠수중운동센터 통합 CRM (Next.js 14 + Supabase)

## ⚙️ 로컬 실행

```bash
npm install
npm run dev
```

브라우저: <http://localhost:3000>

## 🌐 Vercel 배포

1. GitHub 저장소에 이 폴더 push
2. <https://vercel.com/new> 접속 → 저장소 import
3. 환경변수 2개 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ngewuwxrvhorsfrdxlfu.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_K-qxr6wIYdRQtYvupY_m4A_82w2zNwE`
4. Deploy → `aqunote.vercel.app` 완성 🎉

## 📁 페이지

| 경로 | 설명 |
|---|---|
| `/` | 랜딩 (4개 카드) |
| `/dashboard` | KPI 6종 (아동/성인/전체/시간표/라벨/평가) |
| `/members` | 회원 46명 목록 (필터 · 검색) |
| `/consultations` | 상담 리드 (준비중) |
| `/schedule` | 주간 시간표 그리드 |

## 🗄️ Supabase

- Project: `ngewuwxrvhorsfrdxlfu`
- 스키마 설치: `AQUANOTE_ALL_v2.sql` (완료 ✅)
- 회원 이관: `AQUNOTE_MEMBERS_IMPORT.sql`

## 🎨 브랜드

- 이름: **AQUNOTE** (아쿠노트)
- 컬러: cyan-500 → aqu-600 (수중 느낌)
- 폰트: Pretendard / Malgun Gothic
