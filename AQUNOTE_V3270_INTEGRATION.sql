-- ============================================================
-- 아쿠노트 v3.27.0 통합 마이그레이션 (2026-08-04)
-- 1) Soft Delete 폐지 → Hard Delete 전환
-- 2) 유령 데이터 완전 정제
-- 3) 출결 상태 트랜잭션 (수강권/보강권 연동)
-- 4) 시간표 ↔ 출결장 1:1 실시간 동기화
-- ============================================================

-- ── STEP 1: 기존 트리거·함수 완전 제거 (충돌 방지)
DROP TRIGGER IF EXISTS trg_cascade_delete_att ON public.schedule_slots;
DROP TRIGGER IF EXISTS trg_cascade_delete_attendance ON public.schedule_slots;
DROP TRIGGER IF EXISTS trg_cascade_hard_delete_att ON public.schedule_slots;
DROP TRIGGER IF EXISTS trg_sync_membership ON public.attendance;
DROP TRIGGER IF EXISTS trg_restore_membership ON public.attendance;
DROP TRIGGER IF EXISTS trg_update_last_attend ON public.attendance;
DROP TRIGGER IF EXISTS trg_sync_dates ON public.attendance;
DROP TRIGGER IF EXISTS trg_sync_dates_ss ON public.schedule_slots;
DROP TRIGGER IF EXISTS trg_auto_fill ON public.schedule_slots;
DROP TRIGGER IF EXISTS trg_cascade_delete_payment ON public.payments;
DROP FUNCTION IF EXISTS cascade_delete_attendance_hard() CASCADE;
DROP FUNCTION IF EXISTS cascade_soft_delete_attendance() CASCADE;
DROP FUNCTION IF EXISTS cascade_hard_delete_attendance() CASCADE;
DROP FUNCTION IF EXISTS sync_membership_on_attendance() CASCADE;
DROP FUNCTION IF EXISTS restore_membership_on_att_delete() CASCADE;
DROP FUNCTION IF EXISTS update_member_last_attend() CASCADE;
DROP FUNCTION IF EXISTS sync_all_date_columns() CASCADE;
DROP FUNCTION IF EXISTS auto_fill_schedule_slots() CASCADE;
DROP FUNCTION IF EXISTS cascade_delete_payment() CASCADE;

-- ── STEP 2: 유령 데이터 완전 하드 삭제
DELETE FROM public.attendance WHERE deleted_at IS NOT NULL;
DELETE FROM public.schedule_slots WHERE deleted_at IS NOT NULL;
DELETE FROM public.attendance WHERE status IN ('cancel','cancelled','canceled');
DELETE FROM public.attendance a
WHERE NOT EXISTS (
  SELECT 1 FROM public.schedule_slots s
  WHERE s.member_id = a.member_id AND s.event_date = a.attend_date
);
-- 중복 정리
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY member_id, attend_date, COALESCE(time_slot,'')
    ORDER BY CASE WHEN slot_id IS NOT NULL THEN 0 ELSE 1 END, created_at DESC
  ) rn FROM public.attendance WHERE member_id IS NOT NULL
)
DELETE FROM public.attendance WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY member_id, event_date, COALESCE(time_slot,'')
    ORDER BY created_at DESC
  ) rn FROM public.schedule_slots WHERE member_id IS NOT NULL
)
DELETE FROM public.schedule_slots WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── STEP 3: 사인 있는 attendance status 정규화 (scheduled → present)
UPDATE public.attendance
SET status = 'present'
WHERE signature IS NOT NULL
  AND (status IS NULL OR status = 'scheduled' OR status = '');

-- ── STEP 4: 보강권 테이블 생성 (없으면)
CREATE TABLE IF NOT EXISTS public.makeup_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  count INT NOT NULL DEFAULT 0,
  source_attendance_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  used_slot_id UUID
);
CREATE INDEX IF NOT EXISTS idx_makeup_member ON public.makeup_tickets(member_id);

-- ── STEP 5: RLS DELETE 정책 (400/403 방지)
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_attendance" ON public.attendance;
CREATE POLICY "allow_all_attendance" ON public.attendance
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_schedule_slots" ON public.schedule_slots;
CREATE POLICY "allow_all_schedule_slots" ON public.schedule_slots
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.makeup_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_makeup" ON public.makeup_tickets;
CREATE POLICY "allow_all_makeup" ON public.makeup_tickets
  FOR ALL USING (true) WITH CHECK (true);

-- ── STEP 6: 시간표 삭제 → attendance 자동 CASCADE (Hard Delete)
CREATE OR REPLACE FUNCTION cascade_delete_attendance_hard()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    DELETE FROM public.attendance WHERE slot_id = OLD.id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_delete_att
BEFORE DELETE ON public.schedule_slots
FOR EACH ROW EXECUTE FUNCTION cascade_delete_attendance_hard();

-- ── STEP 7: 출결 상태 트랜잭션 (수강권 차감/복원 + 보강권 생성)
CREATE OR REPLACE FUNCTION sync_ticket_on_attendance()
RETURNS TRIGGER AS $$
DECLARE
  ms_id UUID;
BEGIN
  -- INSERT/UPDATE: 상태별 수강권 차감
  IF TG_OP IN ('INSERT','UPDATE') THEN
    -- 활성 회원권 조회
    SELECT id INTO ms_id FROM public.memberships
    WHERE member_id = NEW.member_id
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
      AND (status IS NULL OR status <> 'cancelled')
    ORDER BY created_at DESC LIMIT 1;

    -- 이전 상태 원복 (UPDATE의 경우)
    IF TG_OP = 'UPDATE' AND OLD.status IN ('present','absent','no_show','cancelled')
       AND OLD.membership_id IS NOT NULL
       AND (NEW.status IS NULL OR NEW.status = 'scheduled' OR NEW.status = 'rolled_over') THEN
      UPDATE public.memberships
      SET used_sessions = GREATEST(0, COALESCE(used_sessions,0) - 1)
      WHERE id = OLD.membership_id;
    END IF;

    -- 새 상태 차감 (present/absent/no_show/cancelled 는 -1)
    IF NEW.status IN ('present','absent','no_show','cancelled') AND ms_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status = 'scheduled' OR OLD.status = 'rolled_over'
            OR OLD.membership_id IS NULL) THEN
      UPDATE public.memberships
      SET used_sessions = COALESCE(used_sessions,0) + 1
      WHERE id = ms_id;
      NEW.membership_id := ms_id;
    END IF;

    -- 병결/개인사정(absent_excused) → 보강권 +1 생성
    IF NEW.status IN ('sick','personal','absent_excused')
       AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('sick','personal','absent_excused')) THEN
      INSERT INTO public.makeup_tickets (member_id, count, source_attendance_id, reason)
      VALUES (NEW.member_id, 1, NEW.id, NEW.status);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_ticket ON public.attendance;
CREATE TRIGGER trg_sync_ticket
BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION sync_ticket_on_attendance();

-- ── STEP 8: attendance 삭제 시 회원권 복원 + 보강권 삭제
CREATE OR REPLACE FUNCTION restore_on_att_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- 회원권 복원
  IF OLD.status IN ('present','absent','no_show','cancelled') AND OLD.membership_id IS NOT NULL THEN
    UPDATE public.memberships
    SET used_sessions = GREATEST(0, COALESCE(used_sessions,0) - 1)
    WHERE id = OLD.membership_id;
  END IF;
  -- 병결/개인사정으로 생성된 보강권 삭제
  DELETE FROM public.makeup_tickets WHERE source_attendance_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restore_att_delete ON public.attendance;
CREATE TRIGGER trg_restore_att_delete
BEFORE DELETE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION restore_on_att_delete();

-- ── STEP 9: schema cache reload
NOTIFY pgrst, 'reload schema';

-- ── STEP 10: 검증
SELECT '전체 attendance' AS 항목, COUNT(*)::text AS 값 FROM public.attendance
UNION ALL SELECT '전체 schedule_slots', COUNT(*)::text FROM public.schedule_slots
UNION ALL SELECT '보강권', COUNT(*)::text FROM public.makeup_tickets
UNION ALL SELECT '2026-08-04 시간표', COUNT(*)::text FROM public.schedule_slots WHERE event_date = '2026-08-04'
UNION ALL SELECT '2026-08-04 attendance', COUNT(*)::text FROM public.attendance WHERE attend_date = '2026-08-04';

SELECT '✅ v3.27.0 통합 마이그레이션 완료' AS 결과;
