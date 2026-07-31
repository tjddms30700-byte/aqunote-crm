-- ═══════════════════════════════════════════════════════════
-- AQUNOTE v3.23.0 - 연타임 차감·요일별 담당강사·보강 이월 통합
-- ═══════════════════════════════════════════════════════════
-- 실행 위치: Supabase SQL Editor
-- 안전성: IF NOT EXISTS 사용, 기존 데이터 무손실
-- ═══════════════════════════════════════════════════════════

-- 1) attendance.time_slot 컬럼 추가 (연타임 차감 - slot 단위 관리)
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS time_slot VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_attendance_member_date_time ON public.attendance(member_id, attend_date, time_slot);

-- 2) attendance.saved_at / deducted_at / deduction_mode / membership_id (자동차감 로그)
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deducted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deduction_mode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL;

-- 3) attendance.is_makeup_waived / is_makeup_covered (보강 이월 트래킹)
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS is_makeup_waived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_makeup_covered BOOLEAN DEFAULT FALSE;

-- 4) schedule_slots.makeup_waived (보강 안함/이월 플래그)
ALTER TABLE public.schedule_slots
  ADD COLUMN IF NOT EXISTS makeup_waived BOOLEAN DEFAULT FALSE;

-- 5) members.staff_by_day JSONB (요일별 담당강사 매핑)
--    형식: {"1":"staff-uuid-mon","2":"staff-uuid-tue",...,"6":"staff-uuid-sat"}
--    key: 1=월 2=화 3=수 4=목 5=금 6=토
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS staff_by_day JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_members_staff_by_day ON public.members USING GIN (staff_by_day);

-- 6) 정렬 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_attendance_created_at ON public.attendance(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_event_date ON public.schedule_slots(event_date DESC);

-- ═══════════════════════════════════════════════════════════
-- 이전 마이그레이션(v3.21.7) 병합 - 이미 적용된 경우 스킵
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.slot_matrix
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_slot_matrix_staff_id ON public.slot_matrix(staff_id);

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_members_staff_id ON public.members(staff_id);

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS makeup_for_id UUID REFERENCES public.attendance(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_makeup BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_attendance_makeup_for_id ON public.attendance(makeup_for_id);

ALTER TABLE public.schedule_slots
  ADD COLUMN IF NOT EXISTS makeup_for_id UUID,
  ADD COLUMN IF NOT EXISTS is_makeup BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_schedule_slots_makeup_for_id ON public.schedule_slots(makeup_for_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_event_type ON public.schedule_slots(event_type);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_status ON public.schedule_slots(status);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance(status);

-- ═══════════════════════════════════════════════════════════
-- 완료: v3.21.7 + v3.23.0 신규 컬럼 모두 반영되었습니다
-- ═══════════════════════════════════════════════════════════
