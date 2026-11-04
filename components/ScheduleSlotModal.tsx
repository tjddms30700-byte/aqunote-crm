"use client";
import {useState,useEffect} from 'react';
import MemberSearch from '@/components/MemberSearch';
import {supabase} from '@/lib/supabase';
import {remainingOf,totalOf} from '@/lib/membershipFifo';
import {availableReservationMemberships,reservationMembershipDecision,isFreeReservation} from '@/lib/reservationMembership';
import {normalizeClockTime} from '@/lib/calendarPayments';
import {AQUA_PRESETS,GROUND_PRESETS} from '@/lib/deskBooking';
import {localDay} from '@/lib/mobileWork';
import {X,Repeat,Clock,Trash2,Calendar,Plus,Check,User} from 'lucide-react';
const DAYS_KR=['일','월','화','수','목','금','토'];
const STATUS_OPTIONS = [
  { value: "scheduled", label: "예약",     color: "bg-blue-100 text-blue-800 border-blue-300",  dot: "bg-blue-500",   textColor: "text-blue-700" },
  { value: "done",      label: "완료",     color: "bg-green-100 text-green-800 border-green-300", dot: "bg-green-500",  textColor: "text-green-700" },
  { value: "sick",      label: "병결",     color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
  { value: "personal",  label: "개인사정", color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
  { value: "cancel",    label: "🚫 취소(노쇼)", color: "bg-red-50 text-red-700 border-red-300 line-through decoration-red-500", dot: "bg-red-500",    textColor: "text-red-700" },  // ✅ v3.45.8: 취소=노쇼, 취소 슬롯 명확하게 빨간색+취소선으로 표시
  { value: "noshow",    label: "노쇼",     color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
  { value: "carryover", label: "이월",     color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
];
// 구버전 호환: completed / cancelled 등을 통일 이름으로 매핑
export default function SlotModal({ f, setF, modal, members, staff, plans, timeSlotOptions, onClose, onSave, onDelete, saving, track = "aqua", makeupPending = [] }: any) {  // ✅ v3.57.0: makeupPending prop 추가 (보강 대기 회원 자동 필터)
  const isEditing = !!f.id;
  const [directTime,setDirectTime]=useState(!!f.time_slot && !((f.track||track)==='ground'?GROUND_PRESETS:AQUA_PRESETS).includes(String(f.time_slot).slice(0,5)));
  const activeTrack=f.track||track;
  const isRecurring = !!f.recurring_id;
  // 예약 날짜 기준 재직 중인 직원만 노출 (퇴사일 이후엔 선택 불가)
  const targetDate = f.event_date || modal?.date || new Date().toISOString().split("T")[0];
  const availableStaff = (staff || []).filter((s: any) => {
    if (!s.is_resigned) return true;
    if (s.resign_date && s.resign_date >= targetDate) return true; // 퇴사일 당일까지는 선택 가능
    // 현재 수정 중인 예약에 이미 해당 직원이 배정되어 있으면 표시
    if (f.staff_id === s.id) return true;
    return false;
  });

  // ✅ v3.16.0: 선택한 회원의 보유 회원권 자동 로드
  const [memberMemberships, setMemberMemberships] = useState<any[]>([]);
  const [loadingMs, setLoadingMs] = useState(false);
  useEffect(() => {
    if (!f.member_id) { setMemberMemberships([]); return; }
    let stopped = false;
    const refresh = async () => {
      setLoadingMs(true);
      const { data, error } = await supabase.from("memberships").select("*").eq("member_id", f.member_id).order("created_at", { ascending: false });
      if (stopped) return;
      setMemberMemberships(error ? [] : (data || []).filter((m: any) => !m.deleted_at && !["cancelled", "refunded"].includes(m.status)));
      setLoadingMs(false);
    };
    void refresh();
    const onVisible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [f.member_id, f.membership_id]);

  const reservationSlot = { ...f, track: f.track || track };
  const pickerMemberships = availableReservationMemberships(reservationSlot, memberMemberships);
  const oldCompleted = ["done", "completed", "noshow", "cancel"].includes(modal?.editing?.status || "");
  const linkedHistorical = oldCompleted ? memberMemberships.find((m: any) => m.id === modal?.editing?.membership_id) : null;
  useEffect(() => {
    if (oldCompleted || loadingMs || f.allow_unpaid || !f.member_id || !["lesson", "trial", "makeup"].includes(f.event_type)) return;
    const choice = reservationMembershipDecision({ ...f, track: f.track || track }, memberMemberships);
    if (f.membership_id !== choice.id && (choice.reason === "unique" || choice.reason === "free" || !choice.choices.some((m: any) => m.id === f.membership_id))) {
      setF((prev: any) => ({ ...prev, membership_id: choice.id,lesson_name:prev.lesson_name||memberMemberships.find((m:any)=>m.id===choice.id)?.plan_name||'' }));
    }
  }, [memberMemberships, loadingMs, f.member_id, f.membership_id, f.event_date, f.event_type, f.lesson_name, f.track, track, oldCompleted,f.allow_unpaid]);

  const selectedMs = memberMemberships.find((m: any) => m.id === f.membership_id);
  const selectedMember = (members || []).find((m: any) => m.id === f.member_id);

  // ✅ v3.57.0: [일반 예약] / [🔁 보강 배정] 탭 (신규 예약에서만 노출)
  const [reservTab, setReservTab] = useState<"normal" | "makeup">(
    (f.event_type === "makeup" || f.is_makeup_reservation) ? "makeup" : "normal"
  );
  // 보강 배정 탭 활성 시 보강 대기 회원만 필터
  const makeupCandidates = (makeupPending || []).filter((r: any) => {
    const m = (members || []).find((mm: any) => mm.id === r.member_id);
    return !!m;
  });
  // 회원 선택 시 원본 결석 자동 연결
  function pickMakeupMember(r: any) {
    const m = (members || []).find((mm: any) => mm.id === r.member_id);
    setF({
      ...f,
      member_id: r.member_id,
      event_type: "makeup",
      is_makeup_reservation: true,
      original_absence_slot_id: r.slot_id || r.id,
      makeup_for_id: r.slot_id || r.id,
      staff_id: f.staff_id || r.staff_id || (m?.staff_id) || "",
      lesson_name: f.lesson_name || "보강 수업",
    });
  }

  return (
    <div className="aqu-schedule-overlay fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[120] p-0 sm:p-3"
      role="dialog" aria-modal="true" aria-label="일정 등록 및 수정" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[94dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>

        {/* ✅ v3.16.0: 헤더 (색상 대조 강화) */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-aqu-50 to-blue-50 rounded-t-2xl sticky top-0 z-10">
          <h2 className="text-lg font-bold text-aqu-900 flex items-center gap-2">
            📅 {isEditing ? "일정 수정" : "새 일정"}
            {isRecurring && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded flex items-center gap-1">
                <Repeat className="w-3 h-3" /> 반복 시리즈
              </span>
            )}
          </h2>
          <button onClick={onClose} className="min-h-12 min-w-12 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          {/* ✅ v3.71.0: 보강 배정 탭 제거 — 보강은 일반 예약으로 잡고, 위 보강필요 카드에서만 관리자가 체크합니다 */}


          {/* ═══ 섹션 1: 기본 정보 (v3.20.6 재디자인) ═══ */}
          <div className="bg-gradient-to-br from-aqu-50/40 to-blue-50/40 border border-aqu-100 rounded-xl p-4">
            <div className="text-xs font-bold text-aqu-800 mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> 기본 정보
            </div>
            <div className="mb-3"><label className="text-xs font-semibold">수업 트랙</label><select aria-label="수업 트랙" className="min-h-12 w-full rounded border p-2" disabled={!!f.id} value={activeTrack} onChange={e=>{setF({...f,track:e.target.value,time_slot:'',membership_id:null,lesson_name:''});setDirectTime(false);}}><option value="aqua">수중</option><option value="ground">지상</option></select></div>
            {/* 날짜 */}
            <Field label="날짜 *">
              <input aria-label="등록 수업일" type="date" value={f.event_date}
                onChange={e => setF({ ...f, event_date: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none bg-white" />
            </Field>

            <div className="mt-3 space-y-2"><div className="flex items-center justify-between"><label className="text-xs font-semibold">수업 시작 시간</label><button type="button" onClick={()=>setDirectTime(!directTime)} className="min-h-12 rounded-lg border px-3 text-xs">{directTime?'정규 시간 선택':'직접 입력'}</button></div>
              {directTime?<input aria-label="수업 시작 시간 직접 입력" type="text" inputMode="numeric" maxLength={5} placeholder="15:25 또는 1525" value={f.time_slot||''} onChange={e=>setF({...f,time_slot:e.target.value})} onBlur={e=>{const t=normalizeClockTime(e.target.value);if(t)setF((prev:any)=>({...prev,time_slot:t}));}} className="min-h-12 w-full rounded-lg border p-3 text-lg"/>:activeTrack==='ground'?<select aria-label="지상 수업 시간 선택" className="min-h-12 w-full rounded-lg border p-3" value={f.time_slot||''} onChange={e=>setF({...f,time_slot:e.target.value})}><option value="">시간 선택</option>{GROUND_PRESETS.map(t=><option key={t} value={t}>{t}</option>)}</select>:<div className="grid grid-cols-3 gap-2">{AQUA_PRESETS.map(t=><button type="button" key={t} aria-pressed={f.time_slot===t} onClick={()=>setF({...f,time_slot:t})} className={`min-h-12 rounded-lg border text-sm ${f.time_slot===t?'bg-teal-800 text-white':'bg-white'}`}>{t}</button>)}</div>}
            </div>
            <label className="mt-2 block text-xs">수업 시간(분)<input aria-label="수업 시간 분" type="number" min={10} max={180} step={5} className="min-h-12 w-full rounded border p-2" value={f.duration_minutes||40} onChange={e=>setF({...f,duration_minutes:e.target.value})}/></label>
            <div className="mt-2">
              <Field label="유형">
                <select aria-label="예약 유형" value={f.event_type} onChange={e => setF({ ...f, event_type: e.target.value,lesson_name:e.target.value==='trial'?'체험 1회권':e.target.value==='lesson'?'':f.lesson_name,membership_id:null,deposit_paid:false })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none bg-white">
                  {/* ✅ v3.20.3: 직원 근무·휴무 옵션 복원 (회원 수업↔직원 일정 통합 등록) */}
                  <optgroup label="📚 회원 수업">
                    <option value="lesson">🏊 수업</option>
                    <option value="trial">🎯 체험</option>
                    <option value="makeup">🔄 보강</option>
                  </optgroup>
                  <optgroup label="👥 직원 일정">
                    <option value="staff_work">👤 직원 근무</option>
                    <option value="staff_off">🏖️ 직원 휴무</option>
                  </optgroup>
                  <optgroup label="📌 기타">
                    <option value="other">📌 기타</option>
                  </optgroup>
                </select>
              </Field>
            </div>
          </div>

          {/* ═══ 섹션 2: 회원 · 강사 (수업·체험·보강·매출) ═══ */}
          {(f.event_type === "lesson" || f.event_type === "trial" || f.event_type === "makeup" || f.event_type === "revenue") && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
              <div className="text-xs font-bold text-blue-700 mb-2">👤 회원 · 강사</div>
              <div className="space-y-2">
                <Field label="회원">
                  <MemberSearch
                    members={members}
                    value={f.member_id}
                    onChange={(id: string) => setF({ ...f, member_id: id, membership_id: null, lesson_name: "" })}
                  />
                </Field>
                {selectedMember && (
                  <div className="text-[11px] text-blue-800 bg-white rounded px-2 py-1 border border-blue-200">
                    ✓ {selectedMember.name} ({selectedMember.member_type === "child" ? "아동" : "성인"})
                    {selectedMember.phone && ` · ${selectedMember.phone}`}
                  </div>
                )}
                <Field label={`담당 강사 (${availableStaff.length}명)`}>
                  {/* ✅ v3.17.1: 드롭다운 → 프로필 태그 버튼으로 변경 (강사 색상 반영) */}
                  {availableStaff.length === 0 ? (
                    <div className="text-xs text-red-500 py-2">⚠️ 해당 날짜에 재직 강사가 없습니다</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setF({ ...f, staff_id: "" })}
                        className={`px-2.5 py-1.5 rounded-full text-xs font-medium border-2 transition ${f.staff_id === "" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}
                      >
                        — 미지정
                      </button>
                      {availableStaff.map((s: any) => {
                        const isSel = f.staff_id === s.id;
                        const color = s.color || "#3b82f6";
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setF({ ...f, staff_id: s.id })}
                            title={`${s.name} · ${s.role || "직원"}${s.is_resigned && s.resign_date ? ` ⚠️ ${s.resign_date} 퇴사예정` : ""}`}
                            style={isSel ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition hover:shadow-md flex items-center gap-1.5"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: isSel ? "#fff" : color }}
                            />
                            {s.name}
                            <span className="text-[10px] opacity-80">({s.role || "직원"})</span>
                            {s.is_resigned && s.resign_date && (
                              <span className="text-[9px] ml-0.5">⚠️</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Field>
              </div>
            </div>
          )}

          {f.event_type==='trial'&&!f.id&&<section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3"><b>체험 1회권 · 총 70,000원</b><p className="text-xs">예약금 35,000원 + 체험 당일 잔금 35,000원. 등록과 동시에 익주 같은 시간의 자리를 홀딩합니다.</p><label className="flex min-h-12 items-center gap-2"><input type="checkbox" checked={!!f.deposit_paid} onChange={e=>setF({...f,deposit_paid:e.target.checked})}/>예약금 35,000원 실제 수납 완료</label><select aria-label="예약금 결제 수단" className="min-h-12 w-full rounded border p-2" value={f.deposit_method||'transfer'} onChange={e=>setF({...f,deposit_method:e.target.value})}><option value="transfer">계좌이체</option><option value="card">카드</option></select><label className="block text-xs">예약금 실제 수납일<input type="date" className="min-h-12 w-full rounded border p-2" value={f.deposit_date||localDay()} max={localDay()} onChange={e=>setF({...f,deposit_date:e.target.value})}/></label></section>}
          {['lesson','makeup'].includes(f.event_type)&&!f.id&&<label className="flex min-h-12 items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm"><input type="checkbox" checked={!!f.allow_unpaid} onChange={e=>setF({...f,allow_unpaid:e.target.checked,membership_id:null,lesson_name:''})}/>잔여 0회·회원권 없음: 미래 일정 결제예정으로 등록 (예약 시 차감 없음)</label>}
          {/* ═══ 섹션 3: ✅ v3.16.0 회원 보유 회원권 자동 표시 ═══ */}
          {(f.event_type === "lesson" || (f.event_type === "trial" && !!f.id) || f.event_type === "makeup") && f.member_id && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-emerald-700">🎫 보유 회원권</div>
                <span className="text-[10px] text-emerald-600">예약은 연결만 · 완료/사인 시 차감</span>
              </div>
              {isFreeReservation(reservationSlot) ? (
                <div className="text-xs text-emerald-800 p-2 bg-white rounded-lg">무료체험 예약입니다. 회원권을 연결하거나 횟수를 차감하지 않습니다.</div>
              ) : loadingMs ? (
                <div className="text-xs text-emerald-600">회원권 불러오는 중...</div>
              ) : pickerMemberships.length === 0 && !linkedHistorical ? (
                <div className="text-xs text-emerald-800 bg-white rounded p-2 border border-emerald-200">
                  ⚠️ 사용 가능한 회원권이 없습니다. 새 일정은 결제예정을 체크해 미래 예약만 등록할 수 있습니다. 소진된 권은 차감하지 않습니다. <a href="/payments" className="underline font-bold">결제 등록</a>으로 이동하세요.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {linkedHistorical && !pickerMemberships.some((m: any) => m.id === linkedHistorical.id) && <div className="p-2 rounded-lg bg-slate-100 text-slate-600 text-xs">기존 완료 수업 사용권: {linkedHistorical.plan_name} · 잔여 {remainingOf(linkedHistorical)}회 (과거 이력 보존·새 예약 선택 불가)</div>}
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border-2 border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="ms" checked={!f.membership_id} onChange={() => setF({ ...f, membership_id: null })} />
                    <span className="text-xs text-gray-600">사용 회원권 선택 (유효한 권 1개면 자동 연결)</span>
                  </label>
                  {pickerMemberships.map((m: any) => {
                    const remaining = remainingOf(m);
                    const low = remaining <= 3;
                    const isActive = f.membership_id === m.id;
                    return (
                      <label key={m.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition ${isActive ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200" : "border-gray-200 bg-white hover:border-emerald-300"}`}>
                        <input type="radio" name="ms" checked={isActive}
                          onChange={() => setF({ ...f, membership_id: m.id, lesson_name: m.plan_name || f.lesson_name })} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-800">{m.plan_name || "회원권"}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${low ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {remaining}/{totalOf(m)}회 남음
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {m.start_date && `${m.start_date}`}{m.end_date && ` ~ ${m.end_date}`}{m.end_date && String(m.end_date).slice(0,10)<String(f.event_date).slice(0,10) && <span className="ml-1 text-amber-700 font-semibold">기간 만료 · 잔여 사용 가능</span>}
                            {m.amount ? ` · ₩${Number(m.amount).toLocaleString()}` : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedMs && (
                <div className="mt-2 p-2 bg-white rounded border border-emerald-300 text-[11px] text-emerald-800">
                  💡 <b>완료</b>로 저장하면 선택한 <b>{selectedMs.plan_name}</b>에서 1회 차감합니다. 이미 처리된 수업은 중복 차감하지 않습니다.
                </div>
              )}
            </div>
          )}

          {f.id && ["done", "completed", "noshow", "cancel"].includes(modal?.editing?.status || "") && !modal?.editing?.membership_id && f.membership_id && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 mb-3">
              <div className="font-bold mb-2">과거 수업 정산 방식</div>
              <label className="flex items-center gap-2 mb-2"><input type="radio" name="historical_handling" checked={f.historical_handling !== "link_only"} onChange={() => setF({ ...f, historical_handling: "deduct" })} />아직 차감하지 않음 — 선택 회원권에서 1회 차감</label>
              <label className="flex items-center gap-2"><input type="radio" name="historical_handling" checked={f.historical_handling === "link_only"} onChange={() => setF({ ...f, historical_handling: "link_only" })} />이미 수동 정산함 — 연결만 저장 (추가 차감 없음)</label>
            </div>
          )}

          {/* ═══ 섹션 4: 수업명 (보강·기타 포함) ═══ */}
          {(!f.membership_id||f.allow_unpaid) && f.event_type!=="trial" && (["lesson", "makeup", "revenue", "other"].includes(f.event_type)) && (
            <Field label={f.event_type === "makeup" ? "보강 수업명" : (f.event_type === "other" ? "일정 명칭" : "수업명 (직접 입력)")}>
              <PlanPicker plans={plans} value={f.lesson_name} onChange={(name: string) => setF({ ...f, lesson_name: name,membership_id:f.allow_unpaid?null:f.membership_id })} track={activeTrack} />
            </Field>
          )}

          {f.event_type === "revenue" && (
            <Field label="금액 (원)">
              <input type="number" value={f.amount}
                onChange={e => setF({ ...f, amount: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>
          )}

          {(f.event_type === "staff_work" || f.event_type === "staff_off") ? (
            <Field label={f.event_type === "staff_work" ? "📝 근무 사유 / 내용" : "📝 휴무 사유"}>
              <textarea value={f.note || ""}
                onChange={e => setF({ ...f, note: e.target.value })}
                rows={3}
                placeholder={f.event_type === "staff_work" ? "예: 오전조 근무, 회의 참석, 교육 등" : "예: 연차, 병가, 경조사 등"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none resize-none" />
              <div className="text-[10px] text-gray-500 mt-1">ℹ️ 직원 근무/휴무는 상태 구분 없이 사유만 기록됩니다</div>
            </Field>
          ) : (
          <Field label="상태">
            <div className="grid grid-cols-3 gap-1">
              {STATUS_OPTIONS.filter(st=>!f._mobileMode||st.value==='scheduled').map(st => (
                <button key={st.value} type="button"
                  onClick={() => setF({ ...f, status: st.value })}
                  className={`py-2 px-2 rounded-lg border text-xs ${f.status === st.value ? st.color + " font-bold shadow-sm" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  {st.label}
                </button>
              ))}
            </div>
          </Field>
          )}

          {!(f.event_type === "staff_work" || f.event_type === "staff_off") && (
            <Field label="메모">
              <input type="text" value={f.note}
                onChange={e => setF({ ...f, note: e.target.value })}
                placeholder="예: 컨디션 나빠 30분 조기 종료"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>
          )}

          {/* 반복 예약 옵션 (새 예약일 때만) */}
          {!isEditing && !f._mobileMode && f.event_type!=='trial' && (
            <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f.recurring_enabled}
                  onChange={e => setF({ ...f, recurring_enabled: e.target.checked })}
                  className="w-4 h-4 accent-purple-600" />
                <span className="text-sm font-medium text-purple-900 flex items-center gap-1">
                  <Repeat className="w-4 h-4" /> 매주 반복 예약
                </span>
              </label>
              {f.recurring_enabled && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-purple-800">이번 주부터</span>
                  <select value={f.recurring_weeks}
                    onChange={e => setF({ ...f, recurring_weeks: parseInt(e.target.value) })}
                    className="px-2 py-1 border border-purple-200 rounded text-sm bg-white focus:ring-2 focus:ring-purple-400 focus:outline-none">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n}>{n}주 동안</option>
                    ))}
                  </select>
                  <span className="text-xs text-purple-800">매주 같은 시간</span>
                </div>
              )}
              {f.recurring_enabled && f.event_date && (
                <div className="text-[11px] text-purple-700 mt-2">
                  📅 {f.event_date} ({DAYS_KR[new Date(f.event_date).getDay()]})요일 {f.time_slot}에 <b>{f.recurring_weeks}회</b> 자동 등록됩니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* ✅ v3.20.16: 삭제 버튼 3종 통일 디자인 (동일 크기·글꼴·패딩) */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-white p-3" style={{paddingBottom:'max(12px,env(safe-area-inset-bottom))'}}>
          {onDelete && isEditing && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => onDelete({ mode: "single" })}
                className="px-3 py-2 border border-red-200 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center gap-1"
                title="이 일정만 삭제">
                <Trash2 className="w-3.5 h-3.5" /> 이 일정
              </button>
              {isRecurring && (
                <>
                  <button onClick={() => onDelete({ mode: "series_after", recurring_id: f.recurring_id, from_date: f.event_date })}
                    className="px-3 py-2 border border-orange-200 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-100 flex items-center gap-1"
                    title="이 날짜 이후(포함) 반복 삭제">
                    <Trash2 className="w-3.5 h-3.5" /> 이후 삭제
                  </button>
                  <button onClick={() => onDelete({ mode: "series_all", recurring_id: f.recurring_id })}
                    className="px-3 py-2 border border-red-300 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 flex items-center gap-1"
                    title="반복 시리즈 전체 삭제">
                    <Trash2 className="w-3.5 h-3.5" /> 전체 삭제
                  </button>
                </>
              )}
            </div>
          )}
          <button onClick={onClose} disabled={saving}
            className="min-h-12 flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button onClick={onSave} disabled={saving}
            className="min-h-12 flex-1 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 disabled:opacity-50">
            {saving ? "저장 중..." : (f.recurring_enabled ? `${f.recurring_weeks}주 등록` : "저장")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlanPicker({ plans, value, onChange, track }: any) {  // ✅ v3.52.0: track(aqua/ground) 전달 시 해당 카테고리 횟수권만 표시
  // plan_type 자동 판별:
  //  1) plans에 plan_type이 있으면 사용
  //  2) 없으면 이름에 "월/기간/무제한" 있으면 amount, "회" 있으면 session
  //  3) sessions > 0 → session, sessions === 0 → amount (기본 규칙)
  function detectType(p: any): "session" | "amount" {
    if (p?.plan_type === "amount" || p?.plan_type === "session") return p.plan_type;
    const name = (p?.name || "").toLowerCase();
    if (/월|기간|무제한|정액/.test(name)) return "amount";
    if (/회|횟수/.test(name)) return "session";
    return (p?.sessions || 0) > 0 ? "session" : "amount";
  }

  const [tab, setTab] = useState<"session" | "amount" | "custom">("session");
  const [customInput, setCustomInput] = useState("");

  // ✅ v3.52.0: 트랙별 횟수권 분리 — 지상 시간표는 지상(ground)권만, 수중은 수중(aqua)권만 표시
  //   category가 없는 기존 플랜은 이름에 '지상' 포함 여부로 추정, common/미분류는 양쪽 모두 표시
  const planTrack = (p: any): string => {
    const cat = String(p?.category || "").toLowerCase();
    if (cat === "aqua" || cat === "ground" || cat === "device") return cat;
    const nm = String(p?.name || "");
    if (nm.includes("지상")) return "ground";
    if (nm.includes("수중")) return "aqua";
    return "common";
  };
  const trackMatched = (plans || []).filter((p: any) => {
    if (p.is_active === false) return false;
    if (!track) return true;
    const pt = planTrack(p);
    return pt === track || pt === "common";
  });
  const availablePlans = trackMatched;
  const sessionPlans = availablePlans.filter((p: any) => detectType(p) === "session");
  const amountPlans = availablePlans.filter((p: any) => detectType(p) === "amount");

  // 현재 선택된 회원권의 타입을 감지해 탭 자동 전환
  useEffect(() => {
    if (!value) return;
    const found = availablePlans.find((p: any) => p.name === value);
    if (found) {
      const t = detectType(found);
      setTab(t);
    } else if (value === "__custom__" || (value && !availablePlans.find((p: any) => p.name === value))) {
      setTab("custom");
      if (value !== "__custom__") setCustomInput(value);
    }
  }, [value, plans]);

  const isChosen = (p: any) => value === p.name;

  if (!plans || plans.length === 0) {
    return (
      <div>
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)}
          placeholder="예: 수중프로그램 30회권, 월 4회권"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
        <div className="text-[10px] text-gray-500 mt-1">
          💡 회원권은 <a href="/settings/catalog?tab=plans" className="text-aqu-600 underline">회원권 관리 페이지</a>에서 추가하세요
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 탭 - 정액권/횟수권/직접입력 */}
      <div className="flex gap-1 border-b border-gray-100">
        <button type="button" onClick={() => setTab("session")}
          className={`flex-1 px-3 py-2 text-xs font-semibold border-b-2 transition ${tab === "session" ? "border-indigo-500 text-indigo-700 bg-indigo-50/50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          🎫 횟수권 ({sessionPlans.length})
        </button>
        <button type="button" onClick={() => setTab("amount")}
          className={`flex-1 px-3 py-2 text-xs font-semibold border-b-2 transition ${tab === "amount" ? "border-purple-500 text-purple-700 bg-purple-50/50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          🗓️ 정액권 ({amountPlans.length})
        </button>
        <button type="button" onClick={() => setTab("custom")}
          className={`flex-1 px-3 py-2 text-xs font-semibold border-b-2 transition ${tab === "custom" ? "border-gray-500 text-gray-700 bg-gray-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          📝 직접 입력
        </button>
      </div>

      {/* 횟수권 그리드 */}
      {tab === "session" && (
        <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
          {sessionPlans.length === 0 ? (
            <div className="col-span-2 p-4 text-center text-xs text-gray-400 bg-gray-50 rounded-lg">
              등록된 횟수권이 없습니다<br/>
              <a href="/settings/catalog?tab=plans" className="text-indigo-600 underline text-[11px] mt-1 inline-block">회원권 관리에서 추가</a>
            </div>
          ) : (
            sessionPlans.map((p: any) => (
              <button key={p.id} type="button"
                onClick={() => onChange(p.name)}
                className={`text-left p-2 rounded-lg border-2 transition ${isChosen(p) ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-bold ${isChosen(p) ? "text-indigo-800" : "text-slate-800"}`}>{p.name}</span>
                  {isChosen(p) && <span className="text-indigo-600 text-xs">✓</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-mono font-bold">
                    {p.sessions || 1}회
                  </span>
                  <span className="text-gray-600">₩{(p.price || 0).toLocaleString()}</span>
                  {p.valid_days && <span className="text-gray-400">· {p.valid_days}일</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* 정액권 그리드 */}
      {tab === "amount" && (
        <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
          {amountPlans.length === 0 ? (
            <div className="col-span-2 p-4 text-center text-xs text-gray-400 bg-gray-50 rounded-lg">
              등록된 정액권이 없습니다<br/>
              <a href="/settings/catalog?tab=plans" className="text-purple-600 underline text-[11px] mt-1 inline-block">회원권 관리에서 추가</a>
            </div>
          ) : (
            amountPlans.map((p: any) => (
              <button key={p.id} type="button"
                onClick={() => onChange(p.name)}
                className={`text-left p-2 rounded-lg border-2 transition ${isChosen(p) ? "border-purple-500 bg-purple-50 shadow-sm" : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30"}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-bold ${isChosen(p) ? "text-purple-800" : "text-slate-800"}`}>{p.name}</span>
                  {isChosen(p) && <span className="text-purple-600 text-xs">✓</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-mono font-bold">
                    {p.valid_days ? `${p.valid_days}일` : "무제한"}
                  </span>
                  <span className="text-gray-600">₩{(p.price || 0).toLocaleString()}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* 직접 입력 */}
      {tab === "custom" && (
        <div>
          <input type="text"
            value={customInput || (value && !availablePlans.find((p: any) => p.name === value) ? value : "")}
            onChange={e => { setCustomInput(e.target.value); onChange(e.target.value); }}
            placeholder="예: 체험, 개인지도, 그룹레슨 A"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
          <div className="text-[10px] text-gray-500 mt-1">
            💡 목록에 없는 특별 회원권은 여기에 입력하세요
          </div>
        </div>
      )}

      {/* 선택 확인 배지 */}
      {value && value !== "__custom__" && (
        <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
          <span className="text-emerald-600 font-bold">✓ 선택됨:</span>
          <span className="text-emerald-800 font-semibold">{value}</span>
          {(() => {
            const p = availablePlans.find((x: any) => x.name === value);
            if (!p) return <span className="text-gray-500">(직접 입력)</span>;
            const t = detectType(p);
            return (
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${t === "session" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>
                {t === "session" ? `🎫 횟수권 ${p.sessions}회` : `🗓️ 정액권 ${p.valid_days || "?"}일`}
              </span>
            );
          })()}
          <button type="button" onClick={() => onChange("")}
            className="text-gray-400 hover:text-red-500 text-sm leading-none">×</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * ✅ v3.29.0: DayListModal - 달력 셀 +더보기 클릭 시 표시
 * 당일 전체 수강 회원 리스트 + 원클릭 상태 변경 + 완전 삭제
 * ═══════════════════════════════════════════════════════════ */
function Field({label,children}:any){return <div><label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>{children}</div>;}
