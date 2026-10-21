// v3.75.2: 회원권 조회 실패를 ‘회원권 없음’으로 취급하지 않는다. 상태 필터는 공용 판별기에서 처리.
import { supabase } from "@/lib/supabase";
export async function loadMemberMemberships(memberId: string): Promise<any[]> {
  if (!memberId) throw new Error("회원을 확인할 수 없습니다.");
  const result: any[]=[];
  const size=250;
  for(let offset=0;offset<20000;offset+=size){
    const r=await supabase.from("memberships").select("*").eq("member_id",memberId).order("id",{ascending:true}).range(offset,offset+size-1);
    if(r.error)throw new Error("회원권 조회에 실패했습니다. 회원권이 없다는 뜻이 아닙니다. 다시 조회해주세요. ("+(r.error.message || "통신 오류")+")");
    const rows=r.data || [];result.push(...rows);
    if(rows.length<size)return result;
  }
  throw new Error("회원권 조회 범위가 너무 큽니다. 관리자 확인이 필요합니다.");
}
