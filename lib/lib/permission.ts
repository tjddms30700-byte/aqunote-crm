/**
 * ✅ v3.28.0: 마스터 계정 RBAC 권한 제어 라이브러리
 * - 일반 직원 계정은 등록/수정만 가능
 * - 마스터 계정만 완전 삭제(Hard Delete) 가능
 */
import { supabase } from "./supabase";

let cachedIsMaster: boolean | null = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 1000; // 1분

/**
 * 현재 로그인 사용자가 마스터(대표) 계정인지 확인
 * - staff.role === 'master' 또는 'director'
 * - staff.is_master === true
 * - 또는 email이 마스터 리스트에 포함
 */
export async function isMasterAccount(): Promise<boolean> {
  const now = Date.now();
  if (cachedIsMaster !== null && now - cachedAt < CACHE_TTL) return cachedIsMaster;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { cachedIsMaster = false; cachedAt = now; return false; }

    // ✅ v3.49.4: 마스터 판별을 staff.role 단일 기준으로 통일 (SQL 교정 불필요)
    //   - staff.is_master 옛 컬럼/값은 무시 (오염된 데이터가 있어도 영향 없음)
    //   - aqu_is_master localStorage 캐시 제거 (브라우저 잔여 데이터 오인식 차단)
    //   - 센터장(manager)은 마스터가 아님
    const { data: staff } = await supabase
      .from("staff")
      .select("role")
      .eq("email", user.email || "")
      .maybeSingle();

    if (staff) {
      const roleStr = String(staff.role || "").toLowerCase();
      if (["director", "owner", "admin", "대표", "원장"].includes(roleStr)) {
        cachedIsMaster = true; cachedAt = now; return true;
      }
    }

    cachedIsMaster = false; cachedAt = now; return false;
  } catch (e) {
    console.warn("[isMasterAccount] error:", e);
    return false;
  }
}

/**
 * 권한 강제 확인 후 Hard Delete 실행
 * - 마스터가 아니면 alert 후 false 반환
 * - 마스터면 confirm 팝업 노출 후 true 반환
 */
export async function confirmHardDelete(itemName: string): Promise<boolean> {
  const master = await isMasterAccount();
  if (!master) {
    alert("⚠️ 완전 삭제 권한이 없습니다.\n\n마스터(대표) 계정으로만 삭제할 수 있습니다.\n담당자에게 문의해주세요.");
    return false;
  }
  return confirm(`⚠️ 정말로 완전 삭제하시겠습니까? (복구 불가)\n\n대상: ${itemName}\n\n• DB에서 완전 삭제됩니다.\n• 관련 출결/수강권/보강권 자동 롤백됩니다.`);
}

/**
 * 캐시 초기화 (로그아웃/역할 변경 시 호출)
 */
export function resetMasterCache() {
  cachedIsMaster = null;
  cachedAt = 0;
}

/**
 * React Hook 스타일 (SSR 안전)
 */
export function useIsMaster() {
  if (typeof window === "undefined") return { isMaster: false, loading: true };
  // 클라이언트에서만 실제 확인 (useEffect 안에서 호출 권장)
  return { isMaster: cachedIsMaster ?? false, loading: cachedIsMaster === null };
}
