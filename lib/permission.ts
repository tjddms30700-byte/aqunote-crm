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

    // 1) staff 테이블에서 role/is_master 확인
    const { data: staff } = await supabase
      .from("staff")
      .select("role, is_master")
      .eq("email", user.email || "")
      .maybeSingle();

    if (staff) {
      const roleStr = String(staff.role || "").toLowerCase();
      if (staff.is_master === true) { cachedIsMaster = true; cachedAt = now; return true; }
      if (["master", "director", "owner", "admin", "대표", "센터장"].includes(roleStr)) {
        cachedIsMaster = true; cachedAt = now; return true;
      }
    }

    // 2) localStorage fallback (개발/테스트용)
    if (typeof window !== "undefined") {
      const lsMaster = localStorage.getItem("aqu_is_master");
      if (lsMaster === "true") { cachedIsMaster = true; cachedAt = now; return true; }
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
