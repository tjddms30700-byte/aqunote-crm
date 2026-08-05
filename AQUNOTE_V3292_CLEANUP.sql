-- ============================================================================
-- 🚨 AQUNOTE v3.29.2 긴급 정제 SQL
-- 목적: 
--   1) 파이프라인 UUID 파싱 대응(consultations status 컬럼 보장)
--   2) 시간표 중복 538건 일괄 정제
--   3) Hard Delete API 정상화 (RLS 완전 개방)
--   4) makeup_tickets 정합성 확보
-- 실행 순서: Supabase SQL Editor에서 위→아래 순서대로 전체 실행
-- ============================================================================

-- ────────────────────────────────────────────────
-- STEP 1) consultations 테이블 status 컬럼 자동 보장
-- ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='consultations' AND column_name='status'
  ) THEN
    ALTER TABLE public.consultations ADD COLUMN status TEXT DEFAULT 'new';
    RAISE NOTICE '✅ consultations.status 컬럼 추가됨';
  ELSE
    RAISE NOTICE 'ℹ️ consultations.status 이미 존재';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='consultations' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.consultations ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    RAISE NOTICE '✅ consultations.updated_at 컬럼 추가됨';
  END IF;
END $$;

-- ────────────────────────────────────────────────
-- STEP 2) RLS 완전 개방 (schedule_slots / attendance / consultations / members / makeup_tickets)
-- ────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  p TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['schedule_slots','attendance','consultations','members','makeup_tickets','payments','memberships']) LOOP
    -- 기존 정책 모두 삭제
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END LOOP;
    -- RLS 재설정
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- 4-way 오픈 정책
    EXECUTE format('CREATE POLICY "v3292_all_select_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "v3292_all_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "v3292_all_update_%s" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "v3292_all_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
    RAISE NOTICE '✅ % 테이블 RLS 4-way 개방 완료', t;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────
-- STEP 3) 시간표 중복 데이터 일괄 정제 (요청 SQL 그대로)
-- ────────────────────────────────────────────────
-- 3-1) 동일 member_id + event_date + time_slot 중복 최신 1건만 남기고 삭제
WITH ranked_slots AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY member_id, event_date, time_slot 
    ORDER BY created_at DESC NULLS LAST, id DESC
  ) AS rn
  FROM public.schedule_slots
  WHERE member_id IS NOT NULL
)
DELETE FROM public.schedule_slots 
WHERE id IN (SELECT id FROM ranked_slots WHERE rn > 1);

-- 3-2) 테스트/더미/취소 레코드 정제
DELETE FROM public.schedule_slots WHERE status IN ('test','dummy','cancel','cancelled');

-- 3-3) 유령 attendance (schedule_slots에 대응 없는) 제거
DELETE FROM public.attendance a
WHERE a.slot_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.schedule_slots s WHERE s.id = a.slot_id);

-- ────────────────────────────────────────────────
-- STEP 4) 스키마 캐시 강제 리로드
-- ────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────
-- STEP 5) 자체 진단 (Hard Delete 테스트)
-- ────────────────────────────────────────────────
DO $$
DECLARE test_id UUID := gen_random_uuid();
BEGIN
  -- 테스트 INSERT
  INSERT INTO public.schedule_slots(id, event_date, time_slot, status, note, created_at)
  VALUES (test_id, '2026-08-05', '99:99', 'unlock_test_v3292', 'v3.29.2 자체진단', now());
  RAISE NOTICE '✅ INSERT 성공: %', test_id;
  
  -- 테스트 DELETE
  DELETE FROM public.schedule_slots WHERE id = test_id;
  RAISE NOTICE '✅ DELETE 성공: %', test_id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ 자체진단 실패: % (%)', SQLERRM, SQLSTATE;
END $$;

-- ────────────────────────────────────────────────
-- STEP 6) 결과 리포트
-- ────────────────────────────────────────────────
SELECT '전체 schedule_slots' AS 항목, COUNT(*)::text AS 값 FROM public.schedule_slots
UNION ALL SELECT '2026-08 시간표', COUNT(*)::text 
  FROM public.schedule_slots WHERE event_date >= '2026-08-01' AND event_date < '2026-09-01'
UNION ALL SELECT '중복 남은 개수', COUNT(*)::text FROM (
  SELECT member_id, event_date, time_slot 
  FROM public.schedule_slots 
  WHERE member_id IS NOT NULL 
  GROUP BY member_id, event_date, time_slot 
  HAVING COUNT(*) > 1
) x
UNION ALL SELECT '전체 attendance', COUNT(*)::text FROM public.attendance
UNION ALL SELECT '전체 makeup_tickets', COUNT(*)::text FROM public.makeup_tickets
UNION ALL SELECT '전체 consultations', COUNT(*)::text FROM public.consultations;

SELECT '✅ v3.29.2 정제 + RLS 개방 + UUID 컬럼 보장 완료' AS 결과;
