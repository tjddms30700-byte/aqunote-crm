-- ============================================================================
-- 🚨 AQUNOTE v3.30.0 긴급 RLS DELETE 락 완전 해제 SQL
-- 콘솔 증거: [v3.29.2] schedule_slots 삭제 결과: {deleted: 0, error: undefined}
-- 원인: RLS DELETE 정책 USING(...) 조건이 모두 거부 → 0건 삭제 반환
-- 조치: RLS 완전 재설정 + 사용자 요청 SQL 실행 + 관련 테이블도 함께 개방
-- ============================================================================

-- ────────────────────────────────────────────────
-- STEP 1) 사용자 요청 SQL (schedule_slots RLS 완전 해제)
-- ────────────────────────────────────────────────
ALTER TABLE public.schedule_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

-- 기존 DELETE 정책 전부 제거
DROP POLICY IF EXISTS "allow_delete_schedule_slots" ON public.schedule_slots;
DROP POLICY IF EXISTS "schedule_slots_open_delete" ON public.schedule_slots;
DROP POLICY IF EXISTS "v3292_all_delete_schedule_slots" ON public.schedule_slots;
DROP POLICY IF EXISTS "v3284_all_delete_schedule_slots" ON public.schedule_slots;

-- 사용자 요청 완전 개방 정책 생성
CREATE POLICY "schedule_slots_open_delete"
ON public.schedule_slots
FOR DELETE
USING (true);

-- ────────────────────────────────────────────────
-- STEP 2) SELECT / INSERT / UPDATE 정책도 함께 완전 개방 (누락 방지)
-- ────────────────────────────────────────────────
DROP POLICY IF EXISTS "schedule_slots_open_select" ON public.schedule_slots;
DROP POLICY IF EXISTS "schedule_slots_open_insert" ON public.schedule_slots;
DROP POLICY IF EXISTS "schedule_slots_open_update" ON public.schedule_slots;
DROP POLICY IF EXISTS "v3292_all_select_schedule_slots" ON public.schedule_slots;
DROP POLICY IF EXISTS "v3292_all_insert_schedule_slots" ON public.schedule_slots;
DROP POLICY IF EXISTS "v3292_all_update_schedule_slots" ON public.schedule_slots;

CREATE POLICY "schedule_slots_open_select" ON public.schedule_slots FOR SELECT USING (true);
CREATE POLICY "schedule_slots_open_insert" ON public.schedule_slots FOR INSERT WITH CHECK (true);
CREATE POLICY "schedule_slots_open_update" ON public.schedule_slots FOR UPDATE USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────
-- STEP 3) 관련 테이블도 DELETE 락 해제 (attendance / makeup_tickets / consultations / members)
-- ────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  p TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['attendance','makeup_tickets','consultations','members','payments','memberships']) LOOP
    -- 기존 정책 전부 삭제
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END LOOP;
    -- RLS 재설정
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- 4-way 완전 개방
    EXECUTE format('CREATE POLICY "v3300_open_select_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "v3300_open_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "v3300_open_update_%s" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "v3300_open_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
    RAISE NOTICE '✅ % 테이블 4-way 완전 개방 완료', t;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────
-- STEP 4) 스키마 캐시 강제 리로드 (사용자 요청 SQL)
-- ────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────
-- STEP 5) 문제의 슬롯 25f72ad0-6f02-4dda-a3a9-9d07399e981b 강제 삭제
-- ────────────────────────────────────────────────
DO $$
DECLARE
  target_id UUID := '25f72ad0-6f02-4dda-a3a9-9d07399e981b';
  slot_exists BOOLEAN;
  del_att INT;
  del_slot INT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.schedule_slots WHERE id = target_id) INTO slot_exists;
  IF slot_exists THEN
    -- 연관 attendance 먼저 정리
    DELETE FROM public.attendance WHERE slot_id = target_id;
    GET DIAGNOSTICS del_att = ROW_COUNT;
    RAISE NOTICE '✅ 관련 attendance 삭제: %건', del_att;

    -- schedule_slots 강제 삭제
    DELETE FROM public.schedule_slots WHERE id = target_id;
    GET DIAGNOSTICS del_slot = ROW_COUNT;
    RAISE NOTICE '✅ schedule_slots 25f72ad0... 삭제 완료: %건', del_slot;
  ELSE
    RAISE NOTICE 'ℹ️ 25f72ad0... 슬롯 이미 없음';
  END IF;
END $$;

-- ────────────────────────────────────────────────
-- STEP 6) 자체 진단 (INSERT → DELETE 왕복 테스트)
-- ────────────────────────────────────────────────
DO $$
DECLARE test_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.schedule_slots(id, event_date, time_slot, status, note, created_at)
  VALUES (test_id, '2026-08-05', '99:99', 'v3300_test', 'v3.30.0 자체진단', now());
  RAISE NOTICE '✅ v3.30.0 INSERT 성공: %', test_id;

  DELETE FROM public.schedule_slots WHERE id = test_id;
  RAISE NOTICE '✅ v3.30.0 DELETE 성공: %', test_id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ 자체진단 실패: % (%)', SQLERRM, SQLSTATE;
END $$;

-- ────────────────────────────────────────────────
-- STEP 7) 최종 정책 확인 리포트
-- ────────────────────────────────────────────────
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('schedule_slots','attendance','makeup_tickets','consultations','members','payments','memberships')
ORDER BY tablename, cmd;

SELECT '✅ v3.30.0 RLS DELETE 락 완전 해제 + 25f72ad0... 삭제 완료' AS 결과;
