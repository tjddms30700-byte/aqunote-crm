"use client";
// ✅ v3.50.0: 업무·프로젝트 관리 모듈
//   - 요청자/담당자(다수) 지정, 마감일, 우선순위, 상태(대기중/진행중/검토중/보류/완료)
//   - 표 형식 + 내 업무/요청한 업무/전체 업무 탭 + 담당자 이름 클릭 필터 + 진행 메모
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { Plus, RefreshCw, X, ClipboardList, MessageSquare } from "lucide-react";

const STATUSES = ["대기중", "진행중", "검토중", "보류", "완료"] as const;
const PRIORITIES = ["긴급", "높음", "보통", "낮음"] as const;

const STATUS_STYLE: Record<string, string> = {
  대기중: "bg-slate-100 text-slate-600",
  진행중: "bg-blue-100 text-blue-700",
  검토중: "bg-amber-100 text-amber-700",
  보류: "bg-purple-100 text-purple-700",
  완료: "bg-emerald-100 text-emerald-700",
};
const PRIORITY_STYLE: Record<string, string> = {
  긴급: "bg-red-100 text-red-700",
  높음: "bg-orange-100 text-orange-700",
  보통: "bg-sky-100 text-sky-700",
  낮음: "bg-gray-100 text-gray-500",
};
const PRIORITY_ORDER: Record<string, number> = { 긴급: 0, 높음: 1, 보통: 2, 낮음: 3 };

type ScopeTab = "mine" | "requested" | "all";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TasksPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<any[]>([]);
  const [memos, setMemos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [me, setMe] = useState<any>(null); // 로그인한 직원
  const [scope, setScope] = useState<ScopeTab>("all");
  const [staffFilter, setStaffFilter] = useState<string | null>(null); // 담당자 클릭 필터
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form, setForm] = useState<any>({
    title: "", description: "", priority: "보통", due_date: "",
    requester_id: "", assignee_ids: [] as string[], status: "대기중",
  });

  const [memoTarget, setMemoTarget] = useState<any>(null);
  const [memoText, setMemoText] = useState("");

  const staffName = (id: string | null | undefined) =>
    staff.find((s) => s.id === id)?.name || "-";

  async function loadAll() {
    setLoading(true);
    const [staffRes, taskRes, asgRes, memoRes] = await Promise.all([
      supabase.from("staff").select("id, name, role, email, status, is_resigned, is_active, resign_date").order("name"),
      supabase.from("work_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
      supabase.from("work_task_assignees").select("*"),
      supabase.from("work_task_memos").select("*").order("created_at", { ascending: false }),
    ]);
    const activeStaff = (staffRes.data || []).filter((s: any) => {
      if (s.is_resigned === true || s.is_active === false) return false;
      const st = String(s.status || "").toLowerCase();
      return !["resigned", "retired", "inactive", "terminated", "quit", "퇴사", "퇴직"].includes(st);
    });
    setStaff(activeStaff);
    setTasks(taskRes.data || []);
    setAssignees(asgRes.data || []);
    setMemos(memoRes.data || []);
    setLoading(false);
  }

  // 로그인 이메일 → staff 매칭
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email || "";
        if (email) {
          const { data: s } = await supabase.from("staff").select("id, name, role, email").eq("email", email).maybeSingle();
          if (s) setMe(s);
        }
      } catch {}
      loadAll();
    })();
  }, []);

  const assigneesOf = (taskId: string) => assignees.filter((a) => a.task_id === taskId).map((a) => a.staff_id);
  const memosOf = (taskId: string) => memos.filter((m) => m.task_id === taskId);

  // ✅ 마감 임박 순 정렬: ① 완료는 맨 아래 ② 마감일 오름차순(없으면 뒤) ③ 우선순위
  const sortedTasks = useMemo(() => {
    let rows = [...tasks];
    if (scope === "mine" && me) rows = rows.filter((t) => assigneesOf(t.id).includes(me.id));
    if (scope === "requested" && me) rows = rows.filter((t) => t.requester_id === me.id);
    if (staffFilter) rows = rows.filter((t) => assigneesOf(t.id).includes(staffFilter));
    if (statusFilter) rows = rows.filter((t) => t.status === statusFilter);
    const today = todayStr();
    rows.sort((a, b) => {
      const aDone = a.status === "완료" ? 1 : 0;
      const bDone = b.status === "완료" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      // 기한 초과(미완료) 최우선
      const aOver = a.due_date && a.due_date < today && a.status !== "완료" ? 0 : 1;
      const bOver = b.due_date && b.due_date < today && b.status !== "완료" ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const ad = a.due_date || "9999-12-31";
      const bd = b.due_date || "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
    });
    return rows;
  }, [tasks, assignees, scope, staffFilter, statusFilter, me]);

  function dDay(due: string | null, status: string) {
    if (!due) return null;
    if (status === "완료") return { label: "완료", cls: "text-gray-400" };
    const diff = Math.round((new Date(due + "T00:00:00").getTime() - new Date(todayStr() + "T00:00:00").getTime()) / 86400000);
    if (diff < 0) return { label: `D+${Math.abs(diff)} 기한초과`, cls: "text-red-600 font-bold" };
    if (diff === 0) return { label: "D-DAY", cls: "text-red-600 font-bold" };
    if (diff <= 3) return { label: `D-${diff}`, cls: "text-orange-600 font-bold" };
    return { label: `D-${diff}`, cls: "text-slate-500" };
  }

  function openNew() {
    setEditTarget(null);
    setForm({ title: "", description: "", priority: "보통", due_date: "", requester_id: me?.id || "", assignee_ids: [], status: "대기중" });
    setShowForm(true);
  }
  function openEdit(t: any) {
    setEditTarget(t);
    setForm({
      title: t.title, description: t.description || "", priority: t.priority,
      due_date: t.due_date || "", requester_id: t.requester_id || "",
      assignee_ids: assigneesOf(t.id), status: t.status,
    });
    setShowForm(true);
  }

  async function saveTask() {
    if (!form.title.trim()) return alert("업무 제목을 입력하세요");
    if (form.assignee_ids.length === 0) return alert("담당자를 1명 이상 선택하세요");
    const payload: any = {
      title: form.title.trim(), description: form.description.trim() || null,
      priority: form.priority, due_date: form.due_date || null,
      requester_id: form.requester_id || null, status: form.status,
      updated_at: new Date().toISOString(),
      completed_at: form.status === "완료" ? new Date().toISOString() : null,
    };
    let taskId = editTarget?.id;
    if (editTarget) {
      const { error } = await supabase.from("work_tasks").update(payload).eq("id", editTarget.id);
      if (error) return alert("수정 실패: " + error.message);
      await supabase.from("work_task_assignees").delete().eq("task_id", editTarget.id);
    } else {
      const { data, error } = await supabase.from("work_tasks").insert(payload).select().single();
      if (error) return alert("등록 실패: " + error.message);
      taskId = data.id;
    }
    const rows = form.assignee_ids.map((sid: string) => ({ task_id: taskId, staff_id: sid }));
    const { error: aErr } = await supabase.from("work_task_assignees").insert(rows);
    if (aErr) return alert("담당자 저장 실패: " + aErr.message);
    setShowForm(false);
    loadAll();
  }

  async function changeStatus(t: any, status: string) {
    const { error } = await supabase.from("work_tasks")
      .update({ status, updated_at: new Date().toISOString(), completed_at: status === "완료" ? new Date().toISOString() : null })
      .eq("id", t.id);
    if (error) return alert("상태 변경 실패: " + error.message);
    loadAll();
  }

  // ✅ v3.50.1: 업무 삭제 (담당자 배정·메모는 DB CASCADE로 함께 삭제)
  async function deleteTask(t: any) {
    if (!confirm(`🗑️ '${t.title}' 업무를 삭제할까요?\n\n· 담당자 배정과 진행 메모도 함께 삭제됩니다\n· 이 작업은 되돌릴 수 없습니다`)) return;
    const { error } = await supabase.from("work_tasks").delete().eq("id", t.id);
    if (error) return alert("삭제 실패: " + error.message);
    setShowForm(false);
    setEditTarget(null);
    loadAll();
  }

  async function addMemo() {
    if (!memoText.trim()) return;
    const { error } = await supabase.from("work_task_memos")
      .insert({ task_id: memoTarget.id, staff_id: me?.id || null, content: memoText.trim() });
    if (error) return alert("메모 저장 실패: " + error.message);
    setMemoText("");
    loadAll();
  }

  const counts = useMemo(() => ({
    mine: me ? tasks.filter((t) => assigneesOf(t.id).includes(me.id)).length : 0,
    requested: me ? tasks.filter((t) => t.requester_id === me.id).length : 0,
    all: tasks.length,
    active: tasks.filter((t) => t.status !== "완료").length,
  }), [tasks, assignees, me]);

  return (
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow">
            <ClipboardList className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800">📋 업무 · 프로젝트 관리</h1>
            <p className="text-xs text-slate-400">업무 요청 · 담당자 배정 · 진행 현황 추적</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
          <button onClick={openNew} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
            <Plus className="w-4 h-4" /> 업무 등록
          </button>
          <HomeButton />
        </div>
      </div>

      {/* 탭: 내 업무 / 요청한 업무 / 전체 업무 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([["mine", `내 업무 (${counts.mine})`], ["requested", `요청한 업무 (${counts.requested})`], ["all", `전체 업무 (${counts.all})`]] as [ScopeTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => { setScope(key); setStaffFilter(null); }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${scope === key ? "bg-indigo-600 text-white shadow" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 self-center">진행 중 {counts.active}건</span>
      </div>

      {/* 상태 필터 칩 */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button onClick={() => setStatusFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-semibold ${!statusFilter ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}>전체</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${statusFilter === s ? "ring-2 ring-indigo-400 " + STATUS_STYLE[s] : STATUS_STYLE[s] + " opacity-60"}`}>
            {s}
          </button>
        ))}
        {staffFilter && (
          <button onClick={() => setStaffFilter(null)}
            className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 flex items-center gap-1">
            담당자: {staffName(staffFilter)} <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 업무 표 */}
      {loading ? (
        <div className="text-center text-slate-400 py-16">불러오는 중...</div>
      ) : sortedTasks.length === 0 ? (
        <div className="text-center text-slate-400 py-16 bg-white rounded-2xl border border-slate-100">
          표시할 업무가 없습니다. <button onClick={openNew} className="text-indigo-600 font-bold underline">업무 등록</button>으로 첫 업무를 만들어 보세요.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-3 py-3 text-left">우선순위</th>
                <th className="px-3 py-3 text-left">업무 제목</th>
                <th className="px-3 py-3 text-left">담당자</th>
                <th className="px-3 py-3 text-left">요청자</th>
                <th className="px-3 py-3 text-left">마감일</th>
                <th className="px-3 py-3 text-left">상태</th>
                <th className="px-3 py-3 text-left">메모</th>
                <th className="px-3 py-3 text-left">등록</th>
                <th className="px-3 py-3 text-left">관리</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((t) => {
                const dd = dDay(t.due_date, t.status);
                const mCount = memosOf(t.id).length;
                return (
                  <tr key={t.id} className={`border-t border-slate-100 hover:bg-indigo-50/40 ${t.status === "완료" ? "opacity-55" : ""}`}>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.보통}`}>{t.priority}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => openEdit(t)} className="font-semibold text-slate-800 hover:text-indigo-600 text-left">
                        {t.title}
                      </button>
                      {t.description && <div className="text-xs text-slate-400 truncate max-w-[280px]">{t.description}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {assigneesOf(t.id).map((sid) => (
                          <button key={sid} onClick={() => { setStaffFilter(sid); setScope("all"); }}
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold transition ${staffFilter === sid ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
                            title={`${staffName(sid)} 담당 업무 전체 보기`}>
                            {staffName(sid)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{staffName(t.requester_id)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="text-slate-700">{t.due_date || "-"}</div>
                      {dd && <div className={`text-xs ${dd.cls}`}>{dd.label}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <select value={t.status} onChange={(e) => changeStatus(t, e.target.value)}
                        className={`px-2 py-1 rounded-lg text-xs font-bold border-0 cursor-pointer ${STATUS_STYLE[t.status] || STATUS_STYLE.대기중}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => { setMemoTarget(t); setMemoText(""); }}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600">
                        <MessageSquare className="w-4 h-4" /> {mCount > 0 ? `${mCount}건` : "메모"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    {/* ✅ v3.50.2: 행에서 바로 삭제 */}
                    <td className="px-3 py-2.5">
                      <button onClick={() => deleteTask(t)}
                        className="px-2 py-1 rounded-lg text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100"
                        title="이 업무 삭제">
                        🗑️ 삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 업무 등록/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-800">{editTarget ? "✏️ 업무 수정" : "📋 업무 등록"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <label className="block text-xs font-bold text-slate-500 mb-1">업무 제목 *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="예: 법무사에게 자료 넘기기" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3" />

            <label className="block text-xs font-bold text-slate-500 mb-1">상세 내용</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} placeholder="업무 내용, 전달할 자료, 참고사항 등" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3" />

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">요청자</label>
                <select value={form.requester_id} onChange={(e) => setForm({ ...form, requester_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                  <option value="">선택</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">마감일</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
            </div>

            <label className="block text-xs font-bold text-slate-500 mb-1">담당자 * (복수 선택 가능)</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {staff.map((s) => {
                const on = form.assignee_ids.includes(s.id);
                return (
                  <button key={s.id} type="button"
                    onClick={() => setForm({ ...form, assignee_ids: on ? form.assignee_ids.filter((x: string) => x !== s.id) : [...form.assignee_ids, s.id] })}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${on ? "bg-indigo-600 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">우선순위</label>
                <div className="flex gap-1">
                  {PRIORITIES.map((p) => (
                    <button key={p} type="button" onClick={() => setForm({ ...form, priority: p })}
                      className={`flex-1 px-1 py-1.5 rounded-lg text-xs font-bold ${form.priority === p ? PRIORITY_STYLE[p] + " ring-2 ring-offset-1 ring-slate-300" : "bg-slate-50 text-slate-400"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">상태</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm">취소</button>
              <button onClick={saveTask} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700">
                {editTarget ? "수정 저장" : "업무 등록"}
              </button>
            </div>
            {/* ✅ v3.50.1: 수정 모드에서 삭제 버튼 */}
            {editTarget && (
              <button onClick={() => deleteTask(editTarget)}
                className="w-full mt-2 py-2 rounded-xl bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100">
                🗑️ 이 업무 삭제
              </button>
            )}
          </div>
        </div>
      )}

      {/* 진행 메모 모달 */}
      {memoTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setMemoTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-black text-slate-800">💬 진행 메모 — {memoTarget.title}</h2>
              <button onClick={() => setMemoTarget(null)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-2 mb-3 max-h-[50vh] overflow-y-auto">
              {memosOf(memoTarget.id).length === 0 && <div className="text-center text-slate-400 text-xs py-6">아직 메모가 없습니다</div>}
              {memosOf(memoTarget.id).map((m) => (
                <div key={m.id} className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-xs text-slate-400 mb-0.5">
                    {staffName(m.staff_id)} · {new Date(m.created_at).toLocaleString("ko-KR")}
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={memoText} onChange={(e) => setMemoText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMemo(); }}
                placeholder="진행 상황, 전달 사항 등을 입력" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              <button onClick={addMemo} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">등록</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
