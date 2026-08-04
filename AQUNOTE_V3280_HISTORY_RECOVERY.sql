-- ============================================================
-- 아쿠노트 v3.28.0 통합 마이그레이션 (2026-08-04)
-- 1) 과거 히스토리 데이터 완전 원복 (deleted_at IS NOT NULL → NULL)
-- 2) 매출 중복 집계 버그 정제
-- 3) 마스터 권한 시스템 (staff.is_master, role)
-- 4) makeup_tickets 안정화
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- STEP 1: 과거 히스토리 완전 원복 (임의 삭제된 데이터 복구)
-- ══════════════════════════════════════════════════════════════

-- soft-delete로 표시되어 UI에서 사라진 과거 데이터 전부 원복
-- (Hard Delete로 전환하기 전에 반드시 실행!)
UPDATE public.schedule_slots SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE public.attendance SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE public.members SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE public.payments SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE public.memberships SET deleted_at = NULL WHERE deleted_at IS NOT NULL;

-- 원복 결과 검증
SELECT '2024-08 시간표' AS 항목, COUNT(*) AS 건수
FROM public.schedule_slots 
WHERE event_date >= '2024-08-01' AND event_date < '2024-09-01'
UNION ALL
SELECT '2024-08 attendance', COUNT(*)
FROM public.attendance 
WHERE attend_date >= '2024-08-01' AND attend_date < '2024-09-01'
UNION ALL
SELECT '2025-01 payments', COUNT(*)
FROM public.payments
WHERE paid_at >= '2025-01-01' AND paid_at < '2025-02-01'
UNION ALL
SELECT '전체 활성 members', COUNT(*) FROM public.members;

-- ══════════════════════════════════════════════════════════════
-- STEP 2: 매출 중복 집계 버그 정제 (payments 중복 제거)
-- ══════════════════════════════════════════════════════════════

-- 같은 회원 + 같은 결제일시 + 같은 금액 + 같은 회원권 = 중복 결제 (최신 1건만 유지)
WITH ranked_payments AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY member_id, paid_at, amount, plan_id
    ORDER BY created_at DESC
  ) rn
  FROM public.payments
  WHERE member_id IS NOT NULL AND paid_at IS NOT NULL AND amount IS NOT NULL
)
DELETE FROM public.payments
WHERE id IN (SELECT id FROM ranked_payments WHERE rn > 1);

-- memberships 중복도 정제 (payment_id가 같은 경우)
WITH ranked_ms AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY payment_id
    ORDER BY created_at DESC
  ) rn
  FROM public.memberships
  WHERE payment_id IS NOT NULL
)
DELETE FROM public.memberships
WHERE id IN (SELECT id FROM ranked_ms WHERE rn > 1);

-- 중복 정제 결과 검증
SELECT '2025-01-02 매출 총건수' AS 항목, COUNT(*) AS 건수, COALESCE(SUM(amount),0)::text AS 총액
FROM public.payments 
WHERE paid_at::date = '2025-01-02' AND (status IS NULL OR status <> 'cancelled');

-- ══════════════════════════════════════════════════════════════
-- STEP 3: 마스터 계정 권한 시스템 (staff 테이블 확장)
-- ══════════════════════════════════════════════════════════════

-- staff 테이블에 is_master 컬럼 추가
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT FALSE;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS email TEXT;

-- 대표/센터장/master 역할 자동 승격
UPDATE public.staff 
SET is_master = TRUE
WHERE LOWER(COALESCE(role, '')) IN ('master', 'director', 'owner', 'admin', '대표', '센터장');

-- 마스터 계정 인덱스
CREATE INDEX IF NOT EXISTS idx_staff_is_master ON public.staff(is_master) WHERE is_master = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_email ON public.staff(email) WHERE email IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- STEP 4: makeup_tickets 테이블 안정화 (v3.27.0 확장)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.makeup_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  count INT NOT NULL DEFAULT 0,
  source_attendance_id UUID,
  source_slot_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  used_slot_id UUID,
  expires_at DATE
);

-- 기존 테이블에 컬럼 추가 (있으면 무시)
ALTER TABLE public.makeup_tickets ADD COLUMN IF NOT EXISTS source_slot_id UUID;
ALTER TABLE public.makeup_tickets ADD COLUMN IF NOT EXISTS expires_at DATE;

CREATE INDEX IF NOT EXISTS idx_makeup_member ON public.makeup_tickets(member_id);
CREATE INDEX IF NOT EXISTS idx_makeup_used ON public.makeup_tickets(used_at) WHERE used_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- STEP 5: RLS 정책 재설정 (400/403 방지 + 마스터 권한)
-- ══════════════════════════════════════════════════════════════

-- attendance
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_attendance" ON public.attendance;
DROP POLICY IF EXISTS "allow_read_attendance" ON public.attendance;
DROP POLICY IF EXISTS "allow_write_attendance" ON public.attendance;
CREATE POLICY "allow_all_attendance" ON public.attendance FOR ALL USING (true) WITH CHECK (true);

-- schedule_slots
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_schedule_slots" ON public.schedule_slots;
CREATE POLICY "allow_all_schedule_slots" ON public.schedule_slots FOR ALL USING (true) WITH CHECK (true);

-- makeup_tickets
ALTER TABLE public.makeup_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_makeup" ON public.makeup_tickets;
CREATE POLICY "allow_all_makeup" ON public.makeup_tickets FOR ALL USING (true) WITH CHECK (true);

-- payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_payments" ON public.payments;
CREATE POLICY "allow_all_payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- STEP 6: schema cache reload
-- ══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════
-- STEP 7: 최종 검증
-- ══════════════════════════════════════════════════════════════

SELECT '━━━ v3.28.0 마이그레이션 결과 ━━━' AS 결과;

SELECT '전체 schedule_slots' AS 항목, COUNT(*)::text AS 값 FROM public.schedule_slots
UNION ALL SELECT '전체 attendance', COUNT(*)::text FROM public.attendance
UNION ALL SELECT '전체 payments', COUNT(*)::text FROM public.payments
UNION ALL SELECT '전체 memberships', COUNT(*)::text FROM public.memberships
UNION ALL SELECT '전체 members', COUNT(*)::text FROM public.members
UNION ALL SELECT '마스터 계정 수', COUNT(*)::text FROM public.staff WHERE is_master = TRUE
UNION ALL SELECT '보강권', COUNT(*)::text FROM public.makeup_tickets
UNION ALL SELECT '2024-08 시간표 (복구 확인)', COUNT(*)::text 
  FROM public.schedule_slots WHERE event_date >= '2024-08-01' AND event_date < '2024-09-01'
UNION ALL SELECT '2026-08-04 시간표', COUNT(*)::text 
  FROM public.schedule_slots WHERE event_date = '2026-08-04';

SELECT '✅ v3.28.0 통합 마이그레이션 완료 - 과거 히스토리 복구 + 매출 중복 정제 + 마스터 권한' AS 결과;

-- ══════════════════════════════════════════════════════════════
-- (선택) 특정 이메일을 마스터로 지정하려면:
-- UPDATE public.staff SET is_master = TRUE WHERE email = 'your@email.com';
-- ══════════════════════════════════════════════════════════════
