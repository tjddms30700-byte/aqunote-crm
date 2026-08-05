-- ============================================================================
-- 🚨 AQUNOTE v3.31.0 통합 마이그레이션 SQL (2026-08-05)
-- 목표:
--  1) 시간표 ↔ 출결장 자동 양방향 동기화 트리거 재설치 (safe 버전)
--  2) 출결 개인사정/노쇼 집계 컬럼 정합
--  3) 신규 유입 자동 승격 위한 members/consultations 컬럼 보장
--  4) 사인 이력 정렬용 signed_at NULL 자동 백필
-- ============================================================================

-- ────────────────────────────────────────────────
-- STEP 1: members / consultations 필수 컬럼 자동 보장
-- ────────────────────────────────────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS memo TEXT,
  ADD COLUMN IF NOT EXISTS wish_days TEXT[],
  ADD COLUMN IF NOT EXISTS wish_time_slots TEXT[],
  ADD COLUMN IF NOT EXISTS extra JSONB,
  ADD COLUMN IF NOT EXISTS guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_relation TEXT,
  ADD COLUMN IF NOT EXISTS school TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS member_type TEXT DEFAULT 'adult',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID,
  status TEXT DEFAULT 'new',
  source TEXT,
  memo TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS member_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS memo TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ────────────────────────────────────────────────
-- STEP 2: attendance.signed_at NULL 자동 백필 (사인 이력 정렬용)
-- ────────────────────────────────────────────────
UPDATE public.attendance
SET signed_at = COALESCE(created_at, updated_at, now())
WHERE signature IS NOT NULL
  AND signed_at IS NULL;

-- ────────────────────────────────────────────────
-- STEP 3: 어제/오늘 시간표↔출결장 상태 강제 동기화
-- ────────────────────────────────────────────────
-- 3-1) attendance.slot_id NULL 복원
UPDATE public.attendance a
SET slot_id = s.id
FROM public.schedule_slots s
WHERE a.slot_id IS NULL
  AND a.member_id = s.member_id
  AND a.attend_date = s.event_date::date
  AND a.time_slot = s.time_slot
  AND s.deleted_at IS NULL;

-- 3-2) attendance.status → schedule_slots.status 강제 동기화 (개인사정 매핑 수정)
UPDATE public.schedule_slots s
SET status = CASE a.status
  WHEN 'present'  THEN 'done'
  WHEN 'absent'   THEN 'noshow'
  WHEN 'sick'     THEN 'sick'
  WHEN 'personal' THEN 'personal'  -- v3.31.0: personal → personal (기존 sick 매핑 오류 수정)
  ELSE s.status
END,
updated_at = now()
FROM public.attendance a
WHERE (a.slot_id = s.id
       OR (a.member_id = s.member_id AND a.attend_date = s.event_date::date AND a.time_slot = s.time_slot))
  AND a.status IN ('present','absent','sick','personal')
  AND s.status IN ('scheduled','reserved')
  AND s.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- 3-3) 사인 있는데 status가 잘못된 attendance → present 강제
UPDATE public.attendance
SET status = 'present', updated_at = now()
WHERE signature IS NOT NULL
  AND (status IS NULL OR status = 'scheduled' OR status = '')
  AND deleted_at IS NULL;

-- ────────────────────────────────────────────────
-- STEP 4: 자동 동기화 트리거 재설치 (safe 버전 - 예외 시 원본 유지)
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_slot_from_attendance()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    IF NEW.status IN ('present','absent','sick','personal') AND NEW.slot_id IS NOT NULL THEN
      UPDATE public.schedule_slots
      SET status = CASE NEW.status
        WHEN 'present'  THEN 'done'
        WHEN 'absent'   THEN 'noshow'
        WHEN 'sick'     THEN 'sick'
        WHEN 'personal' THEN 'personal'
      END,
      updated_at = now()
      WHERE id = NEW.slot_id
        AND status IN ('scheduled','reserved')
        AND deleted_at IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- 트리거 예외 발생해도 attendance INSERT/UPDATE는 성공하도록
    RAISE WARNING 'sync_slot_from_attendance trigger error: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_slot_from_attendance ON public.attendance;
CREATE TRIGGER trg_sync_slot_from_attendance
AFTER INSERT OR UPDATE OF status ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.sync_slot_from_attendance();

-- ────────────────────────────────────────────────
-- STEP 5: RLS 완전 개방 재확인
-- ────────────────────────────────────────────────
DO $$
DECLARE t TEXT; p TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['schedule_slots','attendance','members','consultations','makeup_tickets','payments','memberships']) LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "v3310_select_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "v3310_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "v3310_update_%s" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "v3310_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
    RAISE NOTICE '✅ % 완전 개방', t;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────
-- STEP 6: 스키마 캐시 리로드
-- ────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────
-- STEP 7: 최종 검증
-- ────────────────────────────────────────────────
SELECT
  m.name AS 회원명, s.event_date AS 날짜, s.time_slot AS 시간,
  s.status AS 시간표, a.status AS 출결,
  CASE
    WHEN (a.status='present' AND s.status='done')
      OR (a.status='sick' AND s.status='sick')
      OR (a.status='personal' AND s.status='personal')
      OR (a.status='absent' AND s.status='noshow') THEN '✅ 동기화'
    WHEN a.status IS NULL THEN 'ℹ️ 미체크'
    ELSE '❌ 불일치'
  END AS 판정
FROM public.schedule_slots s
LEFT JOIN public.members m ON s.member_id = m.id
LEFT JOIN public.attendance a ON a.slot_id = s.id
WHERE s.event_date::date IN ('2026-08-04','2026-08-05')
  AND s.deleted_at IS NULL
ORDER BY s.event_date, s.time_slot;

SELECT '✅ v3.31.0 통합 마이그레이션 완료 (신규 유입 자동승격 + 시간표↔출결 트리거 + RLS)' AS 결과;
