-- ═══════════════════════════════════════════════════════════════
-- 🧹 v3.34.2 카톡 무더기 세션 청소 SQL - deleted_at 컬럼 유무 자동 대응
-- (2026-08-07) sessions 테이블에 deleted_at 없어도 동작
-- ═══════════════════════════════════════════════════════════════

-- ═══ STEP 0: 안전 가드 - deleted_at 컬럼이 없으면 자동 추가 ═══
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS tags TEXT[];

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS activities TEXT[];

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS source TEXT;

NOTIFY pgrst, 'reload schema';

-- ═══ STEP 1: 진단 - 같은 회원·같은 날짜에 3건 이상 쌓인 세션 조회 ═══
SELECT
  member_id,
  session_date,
  COUNT(*) AS 세션_건수,
  STRING_AGG(COALESCE(source, '(source없음)'), ', ') AS 저장_경로
FROM public.sessions
WHERE deleted_at IS NULL
GROUP BY member_id, session_date
HAVING COUNT(*) >= 3
ORDER BY COUNT(*) DESC, session_date DESC
LIMIT 30;

-- ═══ STEP 2: 활동 태그가 0개인 카톡 무더기 세션 청소 ═══
-- ⚠️ 활동 0개 + [자동 태그]/[보호자 메시지] 접두어 + 시간 표기 포함 = 무더기 분할 흔적
UPDATE public.sessions
SET deleted_at = now()
WHERE deleted_at IS NULL
  AND (
    activities IS NULL
    OR array_length(activities, 1) IS NULL
    OR array_length(activities, 1) = 0
  )
  AND (
    memo LIKE '%[자동 태그]%'
    OR memo LIKE '%[보호자 메시지]%'
    OR memo ~ '\[오[전후] \d{1,2}:\d{2}\]'
  );

-- ═══ STEP 3: 같은 날짜 3건 이상 중 오래된 1건만 유지, 나머지 정리 ═══
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY member_id, session_date ORDER BY created_at ASC) AS rn,
         COUNT(*) OVER (PARTITION BY member_id, session_date) AS total
  FROM public.sessions
  WHERE deleted_at IS NULL
    AND (source LIKE 'kakao%' OR source LIKE 'quick_note%' OR source IS NULL)
)
UPDATE public.sessions s
SET deleted_at = now()
FROM dupes d
WHERE s.id = d.id
  AND d.total >= 3
  AND d.rn > 1;

-- ═══ STEP 4: 결과 확인 ═══
SELECT
  '정리 후 남은 활성 세션' AS 항목,
  COUNT(*)::TEXT AS 값
FROM public.sessions
WHERE deleted_at IS NULL
UNION ALL
SELECT
  '삭제된(deleted_at) 세션',
  COUNT(*)::TEXT
FROM public.sessions
WHERE deleted_at IS NOT NULL;

-- ═══ STEP 5: 최종 리로드 ═══
NOTIFY pgrst, 'reload schema';

SELECT '✅ v3.34.2 카톡 무더기 세션 안전 청소 완료' AS 결과;
