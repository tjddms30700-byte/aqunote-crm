-- ═══════════════════════════════════════════════════════════════
-- AQUNOTE v3.23.4 긴급 복구 마이그레이션 (2026-08-03)
-- 목적:
--   1) 모든 하드 삭제 경로 차단을 위한 deleted_at 컬럼 보장
--   2) 이미 삭제된 데이터는 복구 불가 (하드 삭제였음) → 사용자에게 안내
--   3) 향후 안전한 소프트 삭제 인프라 구축
-- ═══════════════════════════════════════════════════════════════

-- (1) schedule_slots.deleted_at (v3.23.3에서 이미 추가되었을 수 있음)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedule_slots' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.schedule_slots ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ schedule_slots.deleted_at 추가';
  END IF;
END $$;

-- (2) attendance.deleted_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.attendance ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ attendance.deleted_at 추가';
  END IF;
END $$;

-- (3) payments.deleted_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.payments ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ payments.deleted_at 추가';
  END IF;
END $$;

-- (4) memberships.deleted_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memberships' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.memberships ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ memberships.deleted_at 추가';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 🚨 삭제된 데이터 자가 진단 (실행 후 결과 확인)
-- ═══════════════════════════════════════════════════════════════

-- (5) 현재 남아있는 예약 통계 (월별)
SELECT
  TO_CHAR(event_date::date, 'YYYY-MM') AS month,
  COUNT(*) AS total_slots,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted,
  COUNT(*) FILTER (WHERE event_type = 'lesson') AS lessons,
  COUNT(*) FILTER (WHERE event_type = 'revenue') AS revenues
FROM public.schedule_slots
GROUP BY TO_CHAR(event_date::date, 'YYYY-MM')
ORDER BY month DESC
LIMIT 24;

-- (6) 회원별 예약 수 (활성 회원만)
SELECT
  m.name,
  COUNT(s.id) FILTER (WHERE s.deleted_at IS NULL) AS active_slots,
  COUNT(s.id) FILTER (WHERE s.deleted_at IS NOT NULL) AS deleted_slots,
  MAX(s.event_date) AS last_event
FROM public.members m
LEFT JOIN public.schedule_slots s ON s.member_id = m.id
WHERE m.deleted_at IS NULL
GROUP BY m.name
HAVING COUNT(s.id) > 0
ORDER BY last_event DESC NULLS LAST
LIMIT 30;

-- (7) 소프트 삭제된 예약 일괄 복구 (필요 시 주석 해제하여 실행)
-- ⚠️ 최근 소프트 삭제된 예약을 되살립니다. 실행 전 반드시 위 (5)(6) 확인.
-- UPDATE public.schedule_slots
-- SET deleted_at = NULL
-- WHERE deleted_at IS NOT NULL
--   AND deleted_at > NOW() - INTERVAL '7 days';

-- ═══════════════════════════════════════════════════════════════
-- 🔧 RLS 정책 진단 (예약 저장 실패 원인 조사)
-- ═══════════════════════════════════════════════════════════════

-- (8) schedule_slots RLS 정책 확인
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'schedule_slots';

-- (9) authenticated 롤에 INSERT/UPDATE 권한 확인
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'schedule_slots'
  AND grantee IN ('authenticated', 'anon', 'service_role');

SELECT '🎉 v3.23.4 복구 진단 SQL 완료 – (5)(6) 결과로 데이터 상태 파악 후 (7) 복구 UPDATE 수동 실행하세요' AS status;
