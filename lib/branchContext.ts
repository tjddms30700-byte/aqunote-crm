"use client";
/**
 * 🏢 지점 컨텍스트 라이브러리
 * ─────────────────────────────
 * - 로그인한 계정의 소속 지점(branch_id)과 마스터 여부(is_master)를 관리
 * - 마스터 계정은 지점 스위처로 다른 지점 데이터 조회 가능
 * - 일반 계정은 소속 지점 데이터만 조회 가능
 *
 * 사용 예:
 *   const { activeBranchId, isMaster, setActiveBranchId } = useBranchContext();
 *   // Supabase 쿼리에 .eq("branch_id", activeBranchId) 적용
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const ACTIVE_BRANCH_KEY = "aqu_active_branch_id";
const CURRENT_ACCOUNT_KEY = "aqu_current_account";

export type BranchContext = {
  accountId: string | null;
  loginId: string | null;
  ownBranchId: string | null;      // 계정 본래 소속 지점
  isMaster: boolean;                // 메인 마스터 여부
  activeBranchId: string | null;    // 현재 보고 있는 지점 (마스터는 전환 가능)
  branches: any[];                  // 접근 가능한 지점 목록
};

/**
 * 현재 로그인 계정 정보를 읽어와 지점 컨텍스트를 반환
 */
export async function loadBranchContext(): Promise<BranchContext> {
  const emptyCtx: BranchContext = {
    accountId: null, loginId: null, ownBranchId: null,
    isMaster: false, activeBranchId: null, branches: [],
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
        .select("id, login_id, email, branch_id, is_master, permission")
        .eq("email", user.email)
        .is("deleted_at", null)
        .maybeSingle();
      if (data) acct = data;
    }
  } catch {}

  if (!acct) return emptyCtx;

  const isMaster = Boolean(acct.is_master || acct.permission === "master");

  // 2) 접근 가능한 지점 목록 (마스터는 전체, 일반은 자기 지점만)
  const { data: allBranches } = await supabase
    .from("branches")
    .select("*")
    .is("deleted_at", null)
    .order("branch_type", { ascending: true })
    .order("created_at");

  const accessibleBranches = isMaster
    ? (allBranches || [])
    : (allBranches || []).filter(b => b.id === acct.branch_id);

  // 3) activeBranchId 결정 (localStorage 우선, 없으면 소속 지점, 없으면 첫 번째)
  let activeBranchId: string | null = null;
  try {
    activeBranchId = window.localStorage.getItem(ACTIVE_BRANCH_KEY);
  } catch {}
  const stillAccessible = activeBranchId && accessibleBranches.some(b => b.id === activeBranchId);
  if (!stillAccessible) {
    activeBranchId = acct.branch_id || accessibleBranches[0]?.id || null;
    if (activeBranchId) {
      try { window.localStorage.setItem(ACTIVE_BRANCH_KEY, activeBranchId); } catch {}
    }
  }

  return {
    accountId: acct.id,
    loginId: acct.login_id,
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
