"use client";
/**
 * 🏢 지점 컨텍스트 라이브러리 (v3.10.1)
 * ─────────────────────────────
 * - 로그인한 계정의 소속 지점(branch_id)과 마스터 여부(is_master)를 관리
 * - 마스터 계정은 지점 스위처로 다른 지점 데이터 조회 가능
 * - 일반 계정은 소속 지점 데이터만 조회 가능
 * - localStorage 캐시로 컴포넌트 밖에서도 접근 가능 (getActiveBranchId)
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const ACTIVE_BRANCH_KEY = "aqu_active_branch_id";
const CURRENT_ACCOUNT_KEY = "aqu_current_account";

// ✅ v3.48.7: 지점 필터 끄기 (전체 지점 조회) sentinel
//   - activeBranchId === ALL_BRANCHES 이면 모든 페이지에서 지점 필터를 적용하지 않음
export const ALL_BRANCHES = "ALL";
// ✅ v3.48.7: 계정별 마지막 지점 선택 기억 (로그인마다 다른 기본값 유지)
const PER_ACCOUNT_KEY = (acctId: string) => `aqu_active_branch_id_${acctId}`;

export type BranchContext = {
  accountId: string | null;
  loginId: string | null;
  ownBranchId: string | null;      // 계정 본래 소속 지점
  isMaster: boolean;                // 메인 마스터(대표) 여부
  isCenterManager: boolean;         // ✅ v3.49.0: 센터장(지점 관리자) 여부
  canManageBranch: boolean;         // ✅ v3.49.0: 지점 관리 가능 여부 (대표 또는 센터장)
  activeBranchId: string | null;    // 현재 보고 있는 지점 (대표만 전환 가능, 센터장은 소속 지점 고정)
  branches: any[];                  // 접근 가능한 지점 목록
};

/**
 * 컴포넌트 밖에서 activeBranchId를 즉시 읽기 (SSR 안전)
 */
export function getActiveBranchId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_BRANCH_KEY);
  } catch {
    return null;
  }
}

/** ✅ v3.48.7: 지점 필터가 꺼져 있는지(전체 지점 모드) 여부 */
export function isBranchFilterOff(): boolean {
  return getActiveBranchId() === ALL_BRANCHES;
}

/**
 * 현재 로그인 계정 정보를 읽어와 지점 컨텍스트를 반환
 */
export async function loadBranchContext(): Promise<BranchContext> {
  const emptyCtx: BranchContext = {
    accountId: null, loginId: null, ownBranchId: null,
    isMaster: false, isCenterManager: false, canManageBranch: false,
    activeBranchId: null, branches: [],
  };

  // 1) 로그인 계정 조회
  let acct: any = null;
  try {
    const cached = window.localStorage.getItem(CURRENT_ACCOUNT_KEY);
    if (cached) acct = JSON.parse(cached);
  } catch {}

  // Supabase Auth에서도 확인 (있으면 우선)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const { data } = await supabase
        .from("staff_accounts")
        .select("id, login_id, email, branch_id, is_master, permission, role")
        .eq("email", user.email)
        .is("deleted_at", null)
        .maybeSingle();
      if (data) {
        acct = data;
        try { window.localStorage.setItem(CURRENT_ACCOUNT_KEY, JSON.stringify(data)); } catch {}
      }
    }
  } catch {}

  if (!acct) return emptyCtx;

  // ✅ v3.49.0: 역할 계층 - 대표(master) > 센터장(manager) > 일반 직원
  const isMaster = Boolean(acct.is_master || acct.permission === "master");
  const acctRole = String(acct.role || acct.permission || "").toLowerCase();
  const isCenterManager = !isMaster && ["manager", "center_manager", "센터장"].includes(acctRole);
  const canManageBranch = isMaster || isCenterManager;

  // 2) 접근 가능한 지점 목록 (마스터는 전체, 일반은 자기 지점만)
  const { data: allBranches } = await supabase
    .from("branches")
    .select("*")
    .is("deleted_at", null)
    .order("branch_type", { ascending: true })
    .order("created_at");

  // ✅ v3.49.0: 대표는 전체 지점 접근, 센터장·직원은 소속 지점만 100% 격리
  const accessibleBranches = isMaster
    ? (allBranches || [])
    : (allBranches || []).filter(b => b.id === acct.branch_id);

  // 3) activeBranchId 결정
  //   ✅ v3.48.7: 우선순위 = ① 계정별 기억 → ② 공용 기억 → ③ 소속 지점 → ④ 첫 번째 지점
  //   마스터는 "전체 지점(ALL)" 선택도 유효한 값으로 인정해 유지
  let activeBranchId: string | null = null;
  try {
    activeBranchId = window.localStorage.getItem(PER_ACCOUNT_KEY(acct.id))
      || window.localStorage.getItem(ACTIVE_BRANCH_KEY);
  } catch {}
  const isAllSelected = activeBranchId === ALL_BRANCHES && isMaster;  // ALL은 대표(마스터)만 허용 - 센터장 불가
  const stillAccessible = isAllSelected
    || (activeBranchId && accessibleBranches.some(b => b.id === activeBranchId));
  if (!stillAccessible) {
    activeBranchId = acct.branch_id || accessibleBranches[0]?.id || null;
    if (activeBranchId) {
      try {
        window.localStorage.setItem(ACTIVE_BRANCH_KEY, activeBranchId);
        window.localStorage.setItem(PER_ACCOUNT_KEY(acct.id), activeBranchId);
      } catch {}
    }
  }

  return {
    accountId: acct.id,
    loginId: acct.login_id,
    isCenterManager,
    canManageBranch,
    ownBranchId: acct.branch_id || null,
    isMaster,
    activeBranchId,
    branches: accessibleBranches,
  };
}

/**
 * 현재 지점 전환 (마스터 전용)
 */
export function switchActiveBranch(branchId: string) {
  try {
    window.localStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
    // ✅ v3.48.7: 현재 계정의 마지막 선택으로도 기억 (다음 로그인 때 복원)
    const cached = window.localStorage.getItem(CURRENT_ACCOUNT_KEY);
    if (cached) {
      const acct = JSON.parse(cached);
      if (acct?.id) window.localStorage.setItem(`aqu_active_branch_id_${acct.id}`, branchId);
    }
    window.dispatchEvent(new CustomEvent("branch-switched", { detail: { branchId } }));
  } catch {}
}

/**
 * React 훅
 */
export function useBranchContext() {
  const [ctx, setCtx] = useState<BranchContext>({
    accountId: null, loginId: null, ownBranchId: null,
    isMaster: false, activeBranchId: null, branches: [],
  });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const c = await loadBranchContext();
    setCtx(c);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("branch-switched", handler);
    window.addEventListener("account-updated", handler);
    return () => {
      window.removeEventListener("branch-switched", handler);
      window.removeEventListener("account-updated", handler);
    };
  }, []);

  return {
    ...ctx,
    loading,
    setActiveBranchId: (id: string) => {
      switchActiveBranch(id);
      setCtx(prev => ({ ...prev, activeBranchId: id }));
    },
    refresh,
  };
}

/**
 * 페이지에서 지점 전환 이벤트를 감지해 콜백 실행
 * 사용 예:
 *   useBranchWatch(loadAll);  // 지점 바뀌면 자동으로 loadAll() 재호출
 */
export function useBranchWatch(callback: () => void) {
  useEffect(() => {
    const handler = () => callback();
    window.addEventListener("branch-switched", handler);
    window.addEventListener("account-updated", handler);
    return () => {
      window.removeEventListener("branch-switched", handler);
      window.removeEventListener("account-updated", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * 로그인 저장 (login 페이지에서 호출)
 */
export function saveLoggedInAccount(acct: any) {
  try {
    window.localStorage.setItem(CURRENT_ACCOUNT_KEY, JSON.stringify(acct));
    if (acct.branch_id) {
      window.localStorage.setItem(ACTIVE_BRANCH_KEY, acct.branch_id);
    }
    window.dispatchEvent(new CustomEvent("account-updated"));
  } catch {}
}

export function clearLoggedInAccount() {
  try {
    window.localStorage.removeItem(CURRENT_ACCOUNT_KEY);
    window.localStorage.removeItem(ACTIVE_BRANCH_KEY);
    window.dispatchEvent(new CustomEvent("account-updated"));
  } catch {}
}
