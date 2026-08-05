-- ============================================================================
-- 🔄 AQUNOTE v3.30.3 시간표 ↔ 출결장 양방향 완전 동기화 SQL
-- 실행일: 2026-08-05
-- 문제: 박지훈 10:00 시간표=예약 / 출결=출석 불일치 등 다수
-- 원인: attendance.slot_id 매칭 실패 + schedule_slots.status 갱신 누락
-- ============================================================================

-- STEP 1: 오늘(2026-08-05) 및 어제(2026-08-04) 불일치 진단
SELECT
  m.name AS 회원명, s.event_date AS 날짜, s.time_slot AS 시간,
  s.status AS 시간표, a.status AS 출결,
  CASE WHEN a.signature IS NOT NULL THEN '✅' ELSE '❌' END AS 사인,
  CASE
    WHEN a.status='present' AND s.status IN ('scheduled','reserved') THEN '⚠️ 시간표를 done으로'
    WHEN a.status='sick' AND s.status != 'sick' THEN '⚠️ sick 갱신 필요'
    WHEN a.status='personal' AND s.status != 'personal' THEN '⚠️ personal 갱신 필요'
    ELSE '✅ 일치'
  END AS 판정
FROM public.schedule_slots s
LEFT JOIN public.members m ON s.member_id = m.id
LEFT JOIN public.attendance a
  ON a.slot_id = s.id
  OR (a.member_id = s.member_id AND a.attend_date = s.event_date::date AND a.time_slot = s.time_slot)
WHERE s.event_date::date IN ('2026-08-04','2026-08-05')
  AND s.deleted_at IS NULL
ORDER BY s.event_date, s.time_slot;

-- STEP 2: attendance.slot_id NULL인 경우 매칭 자동 복원
UPDATE public.attendance a
SET slot_id = s.id
FROM public.schedule_slots s
WHERE a.slot_id IS NULL
  AND a.member_id = s.member_id
  AND a.attend_date = s.event_date::date
  AND a.time_slot = s.time_slot
  AND s.deleted_at IS NULL;

-- STEP 3: attendance.status → schedule_slots.status 강제 동기화
UPDATE public.schedule_slots s
SET status = CASE a.status
  WHEN 'present'  THEN 'done'
  WHEN 'absent'   THEN 'noshow'
  WHEN 'sick'     THEN 'sick'
  WHEN 'personal' THEN 'personal'
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

-- STEP 4: 사인 있는데 status가 잘못된 attendance → present
UPDATE public.attendance
SET status = 'present', updated_at = now()
WHERE signature IS NOT NULL
  AND (status IS NULL OR status = 'scheduled' OR status = '')
  AND deleted_at IS NULL;

-- STEP 5: 박지훈 10:00 케이스 명시적 처리
DO $$
DECLARE
  jihoon_id UUID;
  slot_id UUID;
  att_id UUID;
BEGIN
  SELECT id INTO jihoon_id FROM public.members WHERE name LIKE '%박지훈%' LIMIT 1;
  IF jihoon_id IS NOT NULL THEN
    SELECT id INTO slot_id FROM public.schedule_slots
    WHERE member_id = jihoon_id AND event_date::date = '2026-08-04' AND time_slot = '10:00'
    AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO att_id FROM public.attendance
    WHERE member_id = jihoon_id AND attend_date = '2026-08-04' AND time_slot = '10:00'
    AND deleted_at IS NULL LIMIT 1;

    IF slot_id IS NOT NULL THEN
      UPDATE public.schedule_slots SET status = 'done', updated_at = now() WHERE id = slot_id;
      RAISE NOTICE '✅ 박지훈 시간표 → done';
    END IF;
    IF att_id IS NOT NULL AND slot_id IS NOT NULL THEN
      UPDATE public.attendance SET slot_id = slot_id, status = 'present' WHERE id = att_id;
      RAISE NOTICE '✅ 박지훈 attendance.slot_id 연결 + present 강제';
    END IF;
  END IF;
END $$;

-- STEP 6: 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';

-- STEP 7: 최종 검증
SELECT
  m.name AS 회원명, s.event_date AS 날짜, s.time_slot AS 시간,
  s.status AS 시간표, a.status AS 출결,
  CASE
    WHEN (a.status='present' AND s.status='done')
      OR (a.status='sick' AND s.status='sick')
      OR (a.status='personal' AND s.status='personal') THEN '✅ 동기화됨'
    WHEN a.status IS NULL THEN 'ℹ️ 미체크'
    ELSE '❌ 불일치'
  END AS 최종
FROM public.schedule_slots s
LEFT JOIN public.members m ON s.member_id = m.id
LEFT JOIN public.attendance a ON a.slot_id = s.id
WHERE s.event_date::date IN ('2026-08-04','2026-08-05')
  AND s.deleted_at IS NULL
ORDER BY s.event_date, s.time_slot;

SELECT '✅ v3.30.3 시간표↔출결장 완전 동기화 완료' AS 결과;
