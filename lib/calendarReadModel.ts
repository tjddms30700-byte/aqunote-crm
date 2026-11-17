/** Read until an empty page: a server row cap may be smaller than the requested page size.
 * Never convert an API error or repeated/truncated page into an empty calendar. */
export function calendarStaffColumns(staff:any[],slots:any[],date:string):any[]{
 const daySlots=slots.filter(s=>String(s.event_date||'').slice(0,10)===date&&!s.deleted_at&&!['staff_work','staff_off'].includes(s.event_type));
 const assigned=new Set(daySlots.map(s=>s.staff_id).filter(Boolean));
 const rows=(staff||[]).filter(s=>assigned.has(s.id)||(!s.is_resigned&&s.is_active!==false&&!['resigned','retired','inactive','terminated','quit','leave'].includes(String(s.status||'').toLowerCase()))||(s.resign_date&&s.resign_date>=date));
 for(const id of assigned)if(!rows.some(s=>s.id===id))rows.push({id,name:'담당자 정보 확인',color:'#64748B',role:'기존 예약'});
 if(daySlots.some(s=>!s.staff_id)||!rows.length)rows.push({id:null,name:'미배정',color:'#94a3b8',role:''});
 return rows;
}
export async function readCalendarPages(fetchPage:(from:number,to:number)=>PromiseLike<{data:any[]|null;error:any}>,pageSize=500):Promise<any[]>{
 const result:any[]=[],seen=new Set<string>();let offset=0;
 for(let page=0;page<2000;page++){
  const {data,error}=await fetchPage(offset,offset+pageSize-1);
  if(error)throw new Error(error.message||'예약을 끝까지 조회하지 못했습니다.');
  if(!Array.isArray(data))throw new Error('시간표 조회 응답 형식을 확인해주세요.');
  if(!data.length)return result;
  for(const row of data){if(!row?.id)throw new Error('예약 식별자가 없는 응답입니다.');const key=String(row.id);if(seen.has(key))throw new Error('예약 목록이 조회 중 변경되었거나 같은 페이지가 반복됐습니다. 다시 조회해주세요.');seen.add(key);result.push(row);}
  offset+=data.length;
 }
 throw new Error('예약 조회 범위가 너무 큽니다. 기간을 줄여 조회해주세요.');
}
