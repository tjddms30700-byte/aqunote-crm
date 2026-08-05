-- ============================================================
-- 아쿠노트 v3.29.1 DB 더미/무한 중복 정제 + RLS 완전 해제 (2026-08-05)
-- 1) 중복 schedule_slots 일괄 삭제
-- 2) 더미 status 레코드 완전 삭제
-- 3) RLS 정책 완전 재설정 (Hard Delete 정상화)
-- 4) makeup_tickets 자동 생성 트리거 재설치
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- STEP 1: RLS 완전 리셋 (Hard Delete 락 해제)
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
DECLARE p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_slots', 'attendance', 'makeup_tickets', 'members', 'payments', 'memberships', 'staff']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      FOR p IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY "%s_v3291_select" ON public.%I FOR SELECT USING (true)', t, t);
      EXECUTE format('CREATE POLICY "%s_v3291_insert" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
      EXECUTE format('CREATE POLICY "%s_v3291_update" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
      EXECUTE format('CREATE POLICY "%s_v3291_delete" ON public.%I FOR DELETE USING (true)', t, t);
      RAISE NOTICE '✅ % RLS 정책 재설정 완료', t;
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- STEP 2: 무한 중복 schedule_slots 일괄 정제 (사용자 요청 SQL)
-- ══════════════════════════════════════════════════════════════

-- 동일 회원+날짜+시간대 중복 → 최신 1건만 유지
WITH ranked_slots AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY member_id, event_date, COALESCE(time_slot, '')
    ORDER BY created_at DESC NULLS LAST
  ) as rn
  FROM public.schedule_slots
  WHERE member_id IS NOT NULL
)
DELETE FROM public.schedule_slots
WHERE id IN (SELECT id FROM ranked_slots WHERE rn > 1);

-- 더미/테스트 상태 정제
DELETE FROM public.schedule_slots
WHERE status IN ('test', 'dummy', 'test_v3281', 'unlock_test_v3284', 'cancel', 'cancelled', 'canceled');

-- ══════════════════════════════════════════════════════════════
-- STEP 3: 유령 attendance 정제 (schedule_slots 없이 남은 것)
-- ══════════════════════════════════════════════════════════════

DELETE FROM public.attendance a
WHERE a.slot_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.schedule_slots s WHERE s.id = a.slot_id);

-- attendance 중복 정제
WITH ranked_att AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY member_id, attend_date, COALESCE(time_slot, '')
    ORDER BY CASE WHEN slot_id IS NOT NULL THEN 0 ELSE 1 END, created_at DESC NULLS LAST
  ) as rn
  FROM public.attendance
  WHERE member_id IS NOT NULL AND attend_date IS NOT NULL
)
DELETE FROM public.attendance
WHERE id IN (SELECT id FROM ranked_att WHERE rn > 1);

-- ══════════════════════════════════════════════════════════════
-- STEP 4: makeup_tickets 테이블 확인 + 자동 생성 트리거
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.makeup_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  count INT NOT NULL DEFAULT 1,
  source_slot_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  used_slot_id UUID,
  expires_at DATE
);

-- 병결/개인사정 → makeup_ticket 자동 생성 트리거
CREATE OR REPLACE FUNCTION create_makeup_on_status()
RETURNS TRIGGER AS $$
BEGIN
  -- 병결(sick) 또는 개인사정(personal) 상태로 변경 시 → makeup_tickets 생성
  IF NEW.status IN ('sick', 'personal') AND (OLD.status IS NULL OR OLD.status NOT IN ('sick','personal')) THEN
    IF NEW.member_id IS NOT NULL THEN
      -- 이미 이 슬롯으로 생성된 makeup_ticket이 있는지 확인
      IF NOT EXISTS (SELECT 1 FROM public.makeup_tickets WHERE source_slot_id = NEW.id) THEN
        INSERT INTO public.makeup_tickets (member_id, count, source_slot_id, reason, created_at)
        VALUES (NEW.member_id, 1, NEW.id, NEW.status, NOW());
      END IF;
    END IF;
  END IF;

  -- 이월(carryover) 상태 → memberships.end_date 자동 연장 (30일)
  IF NEW.status = 'carryover' AND (OLD.status IS NULL OR OLD.status <> 'carryover') THEN
    UPDATE public.memberships
    SET end_date = COALESCE(end_date, CURRENT_DATE) + INTERVAL '30 days'
    WHERE member_id = NEW.member_id
      AND (end_date IS NULL OR end_date >= CURRENT_DATE - INTERVAL '30 days')
      AND (status IS NULL OR status <> 'cancelled');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_makeup ON public.schedule_slots;
CREATE TRIGGER trg_create_makeup
AFTER UPDATE OF status ON public.schedule_slots
FOR EACH ROW EXECUTE FUNCTION create_makeup_on_status();

-- ══════════════════════════════════════════════════════════════
-- STEP 5: 스키마 캐시 강제 리로드
-- ══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');

-- ══════════════════════════════════════════════════════════════
-- STEP 6: 자가 진단 (락 해제 검증)
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE test_id UUID;
BEGIN
  INSERT INTO public.schedule_slots (event_date, time_slot, status)
  VALUES ('2026-08-05', '99:99', 'v3291_test') RETURNING id INTO test_id;
  RAISE NOTICE '✅ INSERT 성공: %', test_id;
  DELETE FROM public.schedule_slots WHERE id = test_id;
  RAISE NOTICE '✅ DELETE 성공 - Hard Delete 정상 작동';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ 실패: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END $$;

-- ══════════════════════════════════════════════════════════════
-- STEP 7: 최종 검증
-- ══════════════════════════════════════════════════════════════

SELECT '━━━ v3.29.1 정제 결과 ━━━' AS 결과;

SELECT tablename, COUNT(*) AS 정책수
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('schedule_slots','attendance','members','payments','memberships','makeup_tickets','staff')
GROUP BY tablename ORDER BY tablename;

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
UNION ALL SELECT '전체 makeup_tickets', COUNT(*)::text FROM public.makeup_tickets;

SELECT '✅ v3.29.1 정제 + RLS 해제 + 자동 makeup 트리거 완료' AS 결과;
