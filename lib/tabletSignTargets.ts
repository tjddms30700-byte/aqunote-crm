// v3.75.1: 같은 회원의 당일 여러 수업을 시간/slot_id별로 서명한다.
export function tabletSignTargets(members: any[], slots: any[], date: string): any[] {
  const out: any[]=[];
  for(const m of members || []) {
    const lessons=(slots || []).filter(s=>s.member_id===m.id && !s.deleted_at && String(s.event_date || "").slice(0,10)===date && !["staff_work","staff_off","revenue"].includes(s.event_type));
    if(!lessons.length)out.push({...m,_signSlot:null,_signKey:`${m.id}__none`});
    else for(const slot of lessons)out.push({...m,_signSlot:slot,_signKey:`${m.id}__${slot.id}`});
  }
  return out.sort((a,b)=>String(a._signSlot?.time_slot || "99:99").localeCompare(String(b._signSlot?.time_slot || "99:99")) || String(a.name || "").localeCompare(String(b.name || ""),"ko"));
}
export function attendanceForSignTarget(target: any, attendance: any[], date: string): any | null {
  const slot=target?._signSlot;
  const dated=(attendance || []).filter(a=>a.member_id===target?.id && !a.deleted_at && String(a.attend_date || a.date || a.attendance_date || a.session_date || "").slice(0,10)===date);
  let matches=slot?.id?dated.filter(a=>a.slot_id===slot.id):[];
  if(!matches.length&&slot?.time_slot)matches=dated.filter(a=>!a.slot_id&&a.time_slot===slot.time_slot);
  if(!slot)matches=dated.filter(a=>!a.slot_id&&!a.time_slot);
  return matches.length===1?matches[0]:null;
}
