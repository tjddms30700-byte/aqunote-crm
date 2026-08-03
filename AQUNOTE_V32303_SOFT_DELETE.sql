-- ═══════════════════════════════════════════════════════════════
-- AQUNOTE v3.23.3 긴급 마이그레이션 – 데이터 손실 방지
-- 실행일: 2026-08-03
-- 목적:
--   1) schedule_slots.deleted_at 컬럼 보장 (소프트 삭제용)
--   2) 이미 잘못 하드 삭제된 데이터가 있다면 복구 불가 - 예방책
--   3) RLS 정책으로 인한 조용한 실패 방지 확인용 인덱스
-- ═══════════════════════════════════════════════════════════════

-- (1) schedule_slots.deleted_at 컬럼 추가 (없을 때만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_slots' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.schedule_slots ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ schedule_slots.deleted_at 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️ schedule_slots.deleted_at 이미 존재';
  END IF;
END $$;

-- (2) 삭제되지 않은 활성 예약 조회용 인덱스 (소프트 삭제 필터 성능 향상)
CREATE INDEX IF NOT EXISTS idx_schedule_slots_active
  ON public.schedule_slots (event_date, time_slot)
  WHERE deleted_at IS NULL;

-- (3) recurring_id 그룹 삭제 시 성능 향상용
CREATE INDEX IF NOT EXISTS idx_schedule_slots_recurring
  ON public.schedule_slots (recurring_id)
  WHERE deleted_at IS NULL AND recurring_id IS NOT NULL;

-- (4) branch_id + deleted_at 복합 인덱스 (지점 필터 성능)
CREATE INDEX IF NOT EXISTS idx_schedule_slots_branch_active
  ON public.schedule_slots (branch_id, event_date)
  WHERE deleted_at IS NULL;

-- (5) payments.discount_amount 컬럼 보장 (할인 매출 계산용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN discount_amount NUMERIC DEFAULT 0;
    RAISE NOTICE '✅ payments.discount_amount 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️ payments.discount_amount 이미 존재';
  END IF;
END $$;

-- (6) payments.refunded_amount 컬럼 보장
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'refunded_amount'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN refunded_amount NUMERIC DEFAULT 0;
    RAISE NOTICE '✅ payments.refunded_amount 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️ payments.refunded_amount 이미 존재';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- ⚠️ Supabase 대시보드 확인 사항 (수동):
--   • Table Editor → schedule_slots → Realtime 활성화 유지
--   • Authentication → Policies → schedule_slots RLS 정책 확인
--     (SELECT/INSERT/UPDATE 모두 authenticated 허용)
--   • Database → Extensions → pg_cron 사용 시 자동 삭제 스크립트 없는지 확인
-- ═══════════════════════════════════════════════════════════════

SELECT '🎉 v3.23.3 마이그레이션 완료 – 소프트 삭제·할인 매출 준비 완료' AS status;
