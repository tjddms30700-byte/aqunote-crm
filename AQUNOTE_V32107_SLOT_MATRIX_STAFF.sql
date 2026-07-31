-- ═══════════════════════════════════════════════════════════
-- AQUNOTE v3.21.7 - slot_matrix.staff_id 컬럼 자동 추가
-- ═══════════════════════════════════════════════════════════
-- 목적: 상담·매칭 시간표에서 담당 강사를 셀별로 지정할 수 있도록
-- 실행 위치: Supabase SQL Editor
-- 안전성: IF NOT EXISTS 사용, 기존 데이터 무손실
-- ═══════════════════════════════════════════════════════════

-- 1) slot_matrix.staff_id 컬럼 추가 (담당 강사 FK)
ALTER TABLE public.slot_matrix
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_slot_matrix_staff_id ON public.slot_matrix(staff_id);

-- 2) members.staff_id 컬럼 (없으면 추가) - 회원 담당강사 상수
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_members_staff_id ON public.members(staff_id);

-- 3) attendance.makeup_for_id (보강 예약 → 원본 결석 FK) - v3.21.7 신설
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS makeup_for_id UUID REFERENCES public.attendance(id) ON DELETE SET NULL;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS is_makeup BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_attendance_makeup_for_id ON public.attendance(makeup_for_id);

-- 4) schedule_slots.makeup_for_id (보강 슬롯 → 원본 결석 FK)
ALTER TABLE public.schedule_slots
  ADD COLUMN IF NOT EXISTS makeup_for_id UUID;

CREATE INDEX IF NOT EXISTS idx_schedule_slots_makeup_for_id ON public.schedule_slots(makeup_for_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_event_type ON public.schedule_slots(event_type);

-- 5) 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance(status);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_status ON public.schedule_slots(status);

-- ═══════════════════════════════════════════════════════════
-- 완료: 새 컬럼이 정상 추가되었습니다.
-- ═══════════════════════════════════════════════════════════
