"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  FileSignature, FileText, Plus, X, Save, Trash2, Search,
  UserCheck, Users, Calendar, ChevronLeft, Printer, Download
} from "lucide-react";
import ContractSignaturePad, { CenterSeal } from "@/components/ContractSignaturePad";

/**
 * v3.20.11: 계약서 폼 관리
 * - 근로계약서, 회원 이용계약서, 개인정보동의서 자체 폼 작성
 * - 서명 이미지 첨부 및 파일 저장
 * - 회원별 · 직원별 이력 관리
 */

// ✅ v3.20.20: 회원용 4종 + 직원용 4종 = 8개 양식 (센터 공식 폼)
const CONTRACT_TYPES = [
  // v3.20.24: 직원용 – 근로계약서 3종 세분화
  { v: "employment",         l: "📄 근로계약서 (정규직)",  cat: "staff",  color: "bg-blue-100 text-blue-800 border-blue-300" },
  { v: "employment_fixed",   l: "📝 근로계약서 (계약직)",  cat: "staff",  color: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { v: "employment_daily",   l: "⏱️ 근로계약서 (일용·시급제)", cat: "staff",  color: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  { v: "nda",            l: "🔒 비밀유지서약서",   cat: "staff",  color: "bg-slate-100 text-slate-800 border-slate-300" },
  { v: "apology",        l: "📝 시말서",             cat: "staff",  color: "bg-amber-100 text-amber-800 border-amber-300" },
  { v: "resignation",    l: "📬 사직서",             cat: "staff",  color: "bg-rose-100 text-rose-800 border-rose-300" },
  // 회원용 4종
  { v: "member_service", l: "📝 회원 이용계약서", cat: "member", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { v: "privacy",        l: "🛡️ 개인정보 동의서", cat: "member", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { v: "safety",         l: "⚠️ 안전·백임 동의서",  cat: "member", color: "bg-orange-100 text-orange-800 border-orange-300" },
  { v: "summary",        l: "📋 이용안내 요약서",     cat: "member", color: "bg-teal-100 text-teal-800 border-teal-300" },
  // 기타
  { v: "other",          l: "📌 기타 계약서",         cat: "other",  color: "bg-gray-100 text-gray-800 border-gray-300" },
];

function typeLabel(t: string) {
  return CONTRACT_TYPES.find(x => x.v === t)?.l || t;
}
function typeColor(t: string) {
  return CONTRACT_TYPES.find(x => x.v === t)?.color || "bg-gray-100 text-gray-800 border-gray-300";
}

// v3.20.24: 계약직 · 일용·시급제 근로계약서 템플릿 상수
const EMPLOYMENT_FIXED_TPL = `위례아쿠수중운동센터 근로계약서
(계약직 · 기간의 정함이 있는 경우)

위례아쿠수중운동센터 (이하 "사업주"라 함)과(와) {{name}} (이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.

제1조 근로계약기간
· 계약기간: {{start_date}} 이후 {{end_date}} 까지
· 수습기간: 입사일로부터 3개월 (수습기간 중 임금은 본입금 100%로 지급)
· 갱신 조입: 계약종료 30일 전 상호 협의를 통해 재계약 가능하며, 재계약 시 근로조건을 새롭게 정한다.

제2조 근무장소
{{workplace}}

제3조 업무의 내용
{{duty}}

제4조 소정근로시간
· 평일: {{weekday_hours}}
· 토요일: {{saturday_hours}}
· 일요일·공휴일: 휴무

제5조 임금
· 기본급: {{base_salary}}원 (월급)
· 식대: {{meal_allowance}}원
· 지급일: 매월 15일
· 지급방법: {{pay_method}}

제6조 계약의 해지
· 계약기간 만료로 당연히 종료하며, 별도의 해지 예고를 요하지 않는다.
· 계약기간 중 근로자의 사직은 30일 전 서면 통보로 한다.

제7조 사회보험
· 고용보험 · 산재보험 · 국민연금 · 건강보험 가입

제8조 비밀유지
· 근로자는 재직 중 및 퇴직 후에도 업무상 알게 된 모든 보호자·회원·이용 정보와 수당 생산 내역을 외부에 누설하지 않는다.

제9조 기타
· 본 계약에 명시되지 않은 사항은 근로기준법을 따른다.

계약일자: {{contract_date}}

사업주: 위례아쿠수중운동센터 · 대표자 하유정 (서명/직인)
근로자: {{name}} · 연락처 {{phone}} (서명)
`;

const EMPLOYMENT_DAILY_TPL = `위례아쿠수중운동센터 근로계약서
(일용·시급제)

위례아쿠수중운동센터 (이하 "사업주"라 함)과(와) {{name}} (이하 "근로자"라 함)은 다음과 같이 일용·시급제 근로계약을 체결한다.

제1조 근로형태 및 근무일
· 근로형태: 일용·시간제 (예약 기반 호출)
· 근무일: 사업주가 사전 통보한 날에 한함

제2조 근무장소
{{workplace}}

제3조 업무의 내용
{{duty}}

제4조 소정근로시간
· 근무일 당 {{daily_hours}}시간 (휴게시간 별도)
· 휴게시간: {{break_time}}

제5조 임금
· 시급: {{hourly_wage}}원 (또는 일급 {{daily_wage}}원)
· 지급일: 매월 15일 (또는 근무 종료 후 즉시 지급)
· 지급방법: {{pay_method}}
· 주휴수당: 주 15시간 이상 근무 시 근로기준법에 따라 지급

제6조 기타
· 사회보험: 산재보험 필수 가입 (적용 대상 시 고용보험 가입)
· 본 계약에 명시되지 않은 사항은 근로기준법을 따른다.

계약일자: {{contract_date}}

사업주: 위례아쿠수중운동센터 · 대표자 하유정 (서명/직인)
근로자: {{name}} · 연락처 {{phone}} (서명)
`;

// 기본 템플릿 문구
const TEMPLATES: Record<string, string> = {
  employment_fixed: EMPLOYMENT_FIXED_TPL,
  employment_daily: EMPLOYMENT_DAILY_TPL,
  employment: `위례아쿠수중운동센터 근로계약서
(정규직 · 기간의 정함이 없는 경우)

위례아쿠수중운동센터 (이하 "사업주"라 함)과(와) {{name}} (이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.

제1조 근로개시일
{{start_date}}부터

제2조 근무장소
경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터

제3조 업무의 내용
아동발달에 대한 상담 및 지원사업 (발달바우처, 교육청 바우처 등)에 따른 관련 업무 수행, 행정 업무와 운영업무 보조, 아동발달에 대한 상담 및 치료 수중감각통합 등에 관련한 업무 수행

제4조 소정근로시간
평일: 13시 00분부터 22시 00분까지 (휴게시간 19시 30분 ~ 20시 30분, 1일 1시간)
토요일: 10시 00분부터 14시 30분까지 (휴게시간 12시 00분 ~ 12시 30분, 30분)
매주 월요일부터 토요일 6일근무
토요일 추가근무 시간에 한해 무급휴일 제공

제5조 근무일/휴일
휴일: 주휴일 (1주 개근시 유급, 1주 소정근로시 15시간 이상인 경우 적용)
근로자의날, 공휴일, 일요일 휴무
휴가: 휴가에 관한 사항은 고용노동관계 법령에 따른다.

제6조 임금
1. 월급: {{base_salary}} 원
2. 상여금: 있음 ( ✓ ) / 없음 (  )   (금액 상이함)
3. 기타급여: 있음 ( ✓ ) / 없음 (  )
   · 식대: 200,000 원
   · 교통비:       원
4. 임금지급: 매월 15일 (휴일의 경우는 전일 지급)
5. 지급방법: 근로자 명의 예금통장에 입금 ( ✓ ) / 근로자에게 직접지급 (  )
6. 월 임금의 계산:
   (1) 월 임금의 계산기간은 매월 1일부터 말일까지로 하고, 임금 총액에서 법령상 사용자가 원천징수해야하는 금액과 가불금 등 합의에 의한 금품을 공제한 금액을 익월 15일에 계좌이체 방법으로 지급한다.
   (2) 근로자는 본 근로계약의 체결로 매월 고정적 시간외 근로에 대한 수당을 위와 같이 월 임금에 산입해 지급받는데 동의하는 것으로 하며, 사용자는 근로자에게 고정적인 시간외근로를 초과해 근로를 지시한 경우에는 이에 상응하는 수당을 추가로 지급한다.
   (3) 근로자가 지각/조퇴/외출 등으로 정상근로 하지 못하는 경우, 사용자는 그 시간에 상응하는 임금을 임금계산에서 공제 반영할 수 있다.
   (4) 결근, 월의 중도 입퇴사, 휴직 등의 경우 월 임금의 일할 계산은 해당 월의 일수를 기준으로 한다.

제7조 근로계약의 해지
1. 직원이 근로계약을 해지하고자 하는 경우 30일전에 사직서를 제출하고 사용자의 퇴직 승인을 득한 후 업무 인수인계를 마치고 퇴직할 수 있다.
2. 직원이 안전, 고객서비스, 청결 등의 관리나 근무태도 불성실 등 성실복무 의무를 위반하여 근로계약 관계를 더 이상 유지하기 어렵다고 인정될 경우 회사는 관계법령에 따라 직원을 해고할 수 있다.

제8조 사회보험 적용여부
해당란에 ✓ 체크 ( ✓ 고용보험   ✓ 산재보험   ✓ 국민연금   ✓ 건강보험 )

제9조 근로계약서 교부
사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부 요구와 관계없이 근로자에게 교부함(근로기준법 제17조 이행)
근로자는 사용자로부터 본 계약서 1부를 교부받았음을 확인함.

제10조 비밀유지
1. 직원은 재직중 알게된 일체의 사항에 재직중은 물론 퇴사 이후에도 비밀을 유지하여야 한다.
2. 직원은 본인의 급여에 대해 비밀을 유지하여야 하며, 타인의 급여에 대해 알려해서도 안된다.

제11조 기타
본 계약에 정함이 없는 사항은 고용노동법령에 따른다.

{{contract_date}}

사업주
· 사업체명: 위례아쿠수중운동센터
· 대표자: 하유정             (서명/날인)

근로자
· 연락처: {{phone}}
· 성  명: {{name}}          (서명/날인)`,

  member_service: `위례아쿠수중운동센터 회원(보호자) 이용계약서

본 계약은 위례아쿠수중운동센터(이하 "센터")와 보호자(이하 "회원") 간에 센터가 제공하는 교육·운동·체험 서비스 이용과 관련한 제반 사항을 규정함을 목적으로 한다.

제1조 【센터 정보】
· 상호명: 위례아쿠수중운동센터
· 대표자: 하유정
· 사업자등록번호: 680-04-03475
· 업태/업종: 서비스업 / 교육서비스업 (기타 스포츠 교육기관)
· 주소: 경기도 하남시 위례대로 190, 위례효성해링턴타워 203호

제2조 【서비스의 성격 및 범위】
1. 센터에서 제공하는 모든 프로그램은 의료행위, 치료, 재활, 진단을 목적으로 하지 않는 교육·운동·체험 서비스이다.
2. 본 서비스는 의료기관 또는 치료기관의 진료·치료·재활 서비스를 대체하지 않는다.
3. 회원은 본 서비스의 성격을 충분히 이해하고 이에 동의한 상태에서 계약을 체결한다.

제3조 【이용 대상 및 보호자 고지 의무】
· 성명: {{name}}
· 생년월일: {{birth}}
· 연락처: {{phone}}
1. 회원은 건강 상태, 발달 특성, 질환 이력, 수중 활동에 영향을 줄 수 있는 모든 사항을 사전에 센터에 고지해야 한다.
2. 고지 의무 불이행으로 발생하는 문제에 대해서는 센터가 책임지지 않는다.

제4조 【프로그램 및 이용 형태】
· 프로그램: [{{plan_std}}] STANDARD  [{{plan_adv}}] ADVANCED  [{{plan_prm}}] PREMIUM
· 이용 형태: 월권제 (주 {{weekly_count}}회 × 4주 = 월 {{monthly_count}}회)
· 이용 기간: {{start_date}} ~ {{end_date}}
· 이용 요일/시간: {{schedule}}
· 월 결제금액: {{amount}}원

제5조 【결제 조건】
1. 모든 프로그램 이용 요금은 선결제를 원칙으로 한다.
2. 월권제 운영으로, 매월 고정 요일·시간에 해당 월의 수업 횟수를 결제한다.
3. 결제 완료 후 프로그램 예약이 확정된다.

제6조 【결석 및 보강】
1. 사전 고지 없는 결석은 보강이 제공되지 않는다.
2. 보강 수업은 센터 운영 일정에 따라 제공되며, 일정 조율이 제한될 수 있다.
3. 개인 사정으로 인한 결석은 환불 사유에 해당하지 않는다.

제7조 【안전 관리 및 책임 범위】
1. 센터는 수중 활동 특성에 맞는 안전 수칙을 마련하고 이를 준수한다.
2. 다만, 수중 활동은 부력·수압·미끄러움 등으로 인해 예측 불가능한 상황이 발생할 수 있음을 회원은 충분히 인지한다.
3. 센터의 고의 또는 중과실이 없는 한, 수중 활동 중 발생할 수 있는 사고에 대해 법적 책임을 지지 않는다.

제8조 【계약 해지, 환불 및 위약금】
1. 회원과 센터는 상호 협의에 따라 본 계약을 해지할 수 있다.
2. 계약 해지 시 환불 금액은 총 결제금액에서 이미 이용한 회기 금액을 차감한 잔여 금액을 기준으로 산정한다.
3. 제2항의 잔여 금액에서 위약금 10% 및 결제 수단에 따른 수수료 3%를 공제한 금액을 환불하는 것에 회원은 동의한다.
4. 프로그램 이용 개시 후에는 단순 변심, 개인 사정, 만족도 저하를 사유로 한 전액 환불은 불가하다.
5. 센터의 고의 또는 중과실로 인한 계약 해지가 아닌 경우, 본 조에 따른 위약금 및 수수료 공제는 동일하게 적용된다.
6. 환불은 센터가 지정한 절차에 따라 처리되며, 처리에는 일정 기간이 소요될 수 있다.
[ ✓ ] 본 조항은 본 계약의 핵심 조항으로, 회원은 충분한 설명을 듣고 이에 명시적으로 동의한다.

제9조 【계약 해지 제한】
다음 각 호에 해당하는 경우 센터는 계약을 해지하거나 서비스 제공을 중단할 수 있다.
1. 안전 수칙을 반복적으로 위반한 경우
2. 타 회원 또는 직원에게 피해를 주는 경우
3. 허위 정보 제공 또는 고지 의무 위반이 확인된 경우

제10조 【분쟁 해결】
본 계약과 관련하여 발생하는 분쟁은 상호 협의로 해결하며, 협의가 이루어지지 않을 경우 센터 소재지 관할 법원을 따른다.

제11조 【기타】
본 계약서에 명시되지 않은 사항은 관계 법령 및 일반 상관례에 따른다.

본인은 위 계약 내용을 충분히 이해하고,
특히 제8조(계약 해지·환불·위약금) 조항에 대해 명확히 설명을 듣고 동의합니다.

계약일자: {{contract_date}}

[보호자]
· 성명: {{name}}
· 생년원일: {{birth}}
· 연락처: {{phone}}
· 서명:                       (서명/날인)

[센터]
· 위례아쿠수중운동센터
· 대표자: 하유정              (서명/직인)

※ 본 계약서는 교육·운동·체험 서비스 이용을 위한 계약서이며, 의료행위 또는 치료 목적의 계약이 아닙니다.`,

  privacy: `개인정보 및 민감정보 수집·이용 동의서

본 동의서는 「위례아쿠수중운동센터 회원 이용계약서」 제3조(이용 대상 및 보호자 고지 의무) 및 제7조(안전 관리 및 책임 범위)에 근거하여 작성되었습니다.
위례아쿠수중운동센터(이하 "센터")는 교육·운동·체험 서비스 제공을 위하여 아래와 같이 개인정보를 수집·이용합니다.

1. 개인정보 수집 항목
① 보호자 정보: 성명 / 주민등록번호 / 연락처
② 아동 정보: 성명 / 생년원일
③ 민감정보(보호자 제공 시): 건강 상태 / 발달 특성 / 질환 이력 / 수중 활동에 영향을 줄 수 있는 기타 정보
④ 서비스 이용 정보: 프로그램 참여 기록 / 상담 기록 / 안전 및 교육 기록
⑤ 사진·영상 자료: 교육 및 활동 기록 목적의 찬영 자료

2. 개인정보 이용 목적
· 교육·운동·체험 프로그램 운영
· 회원 및 아동 안전 관리
· 상담 및 서비스 제공
· 분쟁 발생 시 사실 확인
· 법령상 의무 이행

3. 개인정보 보유 및 이용 기간
· 계약 종료일로부터 최대 5년 또는
· 관련 법령에 따른 보관 기간 중 더 긴 기간

4. 개인정보 제공 및 위탁
· 센터는 수집된 개인정보를 제3자에게 제공하지 않습니다.
· 단, 법령에 따른 요청이 있는 경우는 예외로 합니다.

5. 동의 거부 권리 및 불이익 안내
개인정보 제공에 대한 동의를 거부할 수 있으나, 이 경우 센터 서비스 이용이 제한될 수 있습니다.

본인은 위 내용을 충분히 이해하였으며, 개인정보 및 민감정보 수집·이용에 동의합니다.

[보호자 / 본인]
· 성명: {{name}}
· 생년원일: {{birth}}
· 서명:                       (서명/날인)
· 날짜: {{contract_date}}

※ 본 동의서는 교육·운동·체험 서비스 운영을 위한 필수 동의서입니다.
위례아쿠수중운동센터 | 대표자: 하유정 | 사업자등록번호: 680-04-03475`,

  // ✅ v3.20.16: 직원 비밀유지서약서
  nda: `직원 비밀유지 서약서

위례아쿠수중운동센터 (이하 "센터"라 함)와 {{name}} (이하 "직원"이라 함) 간에 직원이 센터에서 근무하는 동안 및 퇴사 이후 수행하게 되는 업무와 관련하여 알게 된 상업비밀 및 영업상 중요 정보의 보호를 위하여 다음과 같이 비밀유지 서약을 체결한다.

제1조 【목적】
본 서약서는 직원이 센터에서 근무하는 동안 및 퇴사 후에도 지켜야 할 비밀유지 의무와 그 범위를 명확히 하여, 센터의 영업비밀 및 관련 자산을 보호함을 목적으로 한다.

제2조 【비밀정보의 정의】
본 서약에서 "비밀정보"란 직원이 재직 중 알게 된 다음 각 호의 정보를 말한다.
1. 회원 개인정보 (성명, 연락처, 주소, 건강상태, 진단명, 보호자 정보 등)
2. 회원 결제 및 결제 내역 정보
3. 수업 프로그램, 지도법, 교안 및 교육자료
4. 직원 급여, 계약조건, 인사 정보
5. 센터의 경영전략, 마케팅, 거래처 정보
6. 기타 센터가 비밀로 관리하는 일체의 정보

제3조 【비밀유지 의무】
1. 직원은 재직 중은 물론 퇴사 이후에도 제2조의 비밀정보를 제3자에게 누설하거나 공개하지 않는다.
2. 직원은 업무상 부득이한 경우를 제외하고는 비밀정보를 외부로 반출하거나 복사하지 않는다.
3. 직원은 본인의 급여에 대해 비밀을 유지하여야 하며, 동료 직원의 급여를 물으면 안 된다.
4. 직원은 센터의 동의 없이 다른 기관에서 동종 업무를 겸직하지 않는다.

제4조 【자료의 반환】
직원은 퇴사 시에 재직 중 생성·보관하던 모든 자료(종이·전자파일·음성·영상 등 모든 매체)를 센터에 반환하며, 사본을 보유하지 않는다.

제5조 【손해배상】
직원이 본 서약을 위반하여 센터에 손해를 끼친 경우, 직원은 재직 중 및 퇴사 후를 불문하고 그 손해를 배상하여야 한다.

제6조 【서약의 효력】
본 서약서는 서명일로부터 효력이 발생하며, 퇴사 이후에도 지속적으로 적용된다.

서약일: {{contract_date}}

[직원]
· 성명: {{name}}
· 연락처: {{phone}}
· 서명:                       (서명/날인)

[센터]
· 위례아쿠수중운동센터
· 대표자: 하유정              (서명/직인)`,

  // ✅ v3.20.20: 시말서
  apology: `시  말  서

아래와 같은 사유로 시말서를 제출합니다.

· 소   속: 위례아쿠수중운동센터
· 직   위: {{position}}
· 성   명: {{name}}

[사유 및 경위]
{{apology_reason}}

본인은 공동 사업을 운영하는 책임감을 가진 운영자이자 직원으로서 맡은바 책임과 의무를 다하여 성실히 근무하여야 함에도 불구하고 센터의 이미지 및 명예를 훼손하여 회사 업무에 차질을 주었습니다.

차후 이와 같은 일이 재발하지 않을 것임을 서약하며 이에 시말서를 제출합니다.

상기 기록 사실에 허위가 없습니다.

{{contract_date}}

작성자:  {{name}}          (서명/인)`,

  // ✅ v3.20.20: 사직서
  resignation: `사  직  서

════════════════════════════════════

· 회   사: 위례아쿠수중운동센터
· 직   위: {{position}}
· 성   명: {{name}}
· 생년원일: {{birth}}
· 입사년월일: {{hire_date}}
· 주민등록번호: {{rrn}}
· 주   소: {{address}}

════════════════════════════════════

상기 본인은 {{resign_date}}자로
({{resign_reason}})로 사직하고자 하오니
조치하여 주시기 바랍니다.

{{contract_date}}

신청인:  {{name}}          (서명/인)`,

  // ✅ v3.20.20: 수중활동 안전 및 책임 고지(면책) 동의서
  safety: `수중활동 안전 및 책임 고지(면책) 동의서

본 동의서는 위례아쿠수중운동센터(이하 "센터")가 제공하는 수중활동의 특성과 상해 위험을 사전에 고지하고, 회원과 보호자가 이를 이해·동의함을 밝히기 위해 작성되었습니다.

1. 수중활동 특성에 대한 인지
· 수중활동은 부력·수압·미끄러움 등 지상과 다른 물리적 환경으로 인해 예측 불가능한 상황이 발생할 수 있습니다.
· 음닉·어지럼·높은 심박수 등 수중 특유의 반응이 생길 수 있습니다.

2. 보호자 고지 의무
· 회원은 건강 상태, 발달 특성, 질환 이력, 수술력, 복용약, 알레르기 등 수중활동에 영향을 줄 수 있는 모든 사항을 사전에 센터에 고지하여야 합니다.
· 고지 의무 불이행으로 발생하는 문제에 대해서는 센터가 책임지지 않습니다.

3. 센터의 안전 관리 범위
· 센터는 수중활동 특성에 맞는 안전 수칙을 마련하고 이를 준수합니다.
· 안전 관리자 1:1 배정 및 물안이·수온 관리를 시행합니다.
· 지정 안전 수칙을 준수하지 않을 시 진행이 제한될 수 있습니다.

4. 책임 범위 및 면책
· 센터의 고의 또는 중과실이 없는 한, 수중활동 중 발생할 수 있는 사고에 대해 법적 책임을 지지 않습니다.
· 회원이 사전 고지 의무를 이행하지 않은 경우 발생하는 문제에 대해서는 센터가 책임을 지지 않습니다.

5. 응급 상황 대응 동의
· 응급 상황 발생 시 센터는 119 신고 및 응급조치를 시행하며, 보호자에게 즉시 연락합니다.
· 응급 상황의 초기 대응을 위한 센터의 조치에 동의합니다.

본인은 위 내용을 충분히 이해하였으며, 이에 동의합니다.

[보호자 / 본인]
· 성   명: {{name}}
· 생년원일: {{birth}}
· 서   명:                       (서명/날인)
· 날   짜: {{contract_date}}

※ 본 동의서는 수중활동의 안전한 진행을 위한 필수 동의서입니다.
위례아쿠수중운동센터 | 대표자: 하유정 | 사업자등록번호: 680-04-03475`,

  // ✅ v3.20.20: 이용 안내 및 주요 계약내용 요약서
  summary: `아쿠수중운동센터 이용 안내 및 주요 계약내용 요약

1. 센터 서비스의 성격
· 본 센터의 모든 프로그램은 교육·운동·체험 서비스입니다.
· 의료행위, 치료, 재활, 진단을 목적으로 하지 않으며, 의료기관 서비스를 대체하지 않습니다.

2. 프로그램 이용 형태
· STANDARD / ADVANCED / PREMIUM 중 선택
· 월권제 운영 – 매월 고정 요일·시간으로 수업 횟수 결제
· 선결제 원칙 – 결제 완료 후 예약 확정

3. 환불 및 계약 해지
· 환불액 = 총결제금액 − 이용한 회기 금액
· 위약금 10% 및 결제수수료 3% 공제 후 환불
· 단순 변심·개인사정·만족도 저하 사유의 전액환불 불가
· 취소사유의 공지 의무 및 사전 협의 준수

4. 안전 및 보호자 고지 의무
· 건강상태·발달특성·질환 이력 등 사전 고지 필수
· 수중활동 특성에 따른 예측 불가능 상황 인지 및 동의
· 센터의 고의·중과실 외 법적 책임 없음

5. 개인정보 안내
· 수집 정보: 이름, 연락처, 생년원일, 보호자 정보, 민감정보(진단명 등)
· 이용 목적: 교육·운동 프로그램 운영 및 안전관리
· 보유 기간: 계약 종료일로부터 최대 5년 또는 법령 준수

※ 본 요약서는 이해를 돕기 위한 자료이며, 구체적 조건은 계약서 전문을 기준으로 합니다.

위례아쿠수중운동센터 | 대표자: 하유정 | 사업자등록번호: 680-04-03475
경기도 하남시 위례대로 190, 위례효성해링턴타워 203호`,
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function ContractsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">로딩중...</div>}>
      <ContractsPage />
    </Suspense>
  );
}

function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<"all" | "staff" | "member" | "other">("all");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => { loadAll(); }, []);

  // v3.20.21: URL 파라미터 자동 로드 (/reports 양식 탭에서 진입)
  useEffect(() => {
    const newType = searchParams?.get("new");
    const subjectKind = searchParams?.get("subject_kind") as "staff" | "member" | null;
    const subjectId = searchParams?.get("subject_id");
    const subjectName = searchParams?.get("subject_name");
    if (newType && subjectKind) {
      openNewByType(newType, subjectKind, subjectId || "", subjectName || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // v3.20.21: 계약서 유형별 자동 폼장이 주입
  function defaultFormDataFor(contractType: string, subCat: "staff" | "member") {
    if (contractType === "employment") return {
      employment_type: "정규직",
      workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
      duty: "아동발달에 대한 상담 및 지원사업, 행정 및 운영업무 보조",
      weekday_hours: "13:00 ~ 22:00 (휴게 19:30~20:30, 1시간)",
      saturday_hours: "10:00 ~ 14:30 (휴게 12:00~12:30, 30분)",
      base_salary: 2100000, meal_allowance: 200000, transport_allowance: 0,
      bonus_yn: "있음 (금액 상이함)", pay_day: 15,
      pay_method: "근로자 명의 예금통장 입금",
      insurance_employment: true, insurance_industrial: true,
      insurance_pension: true, insurance_health: true,
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
    };
    // v3.20.24: 계약직 근로계약서
    if (contractType === "employment_fixed") return {
      employment_type: "계약직",
      workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
      duty: "아동발달에 대한 상담 및 지원사업, 행정 및 운영업무 보조",
      weekday_hours: "13:00 ~ 22:00 (휴게 19:30~20:30, 1시간)",
      saturday_hours: "10:00 ~ 14:30 (휴게 12:00~12:30, 30분)",
      probation_months: 3,
      renewal_clause: "계약종료 30일 전 상호 협의로 갱신 가능",
      base_salary: 2100000, meal_allowance: 200000,
      pay_day: 15, pay_method: "근로자 명의 예금통장 입금",
      insurance_employment: true, insurance_industrial: true,
      insurance_pension: true, insurance_health: true,
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
    };
    // v3.20.24: 일용·시급제 근로계약서
    if (contractType === "employment_daily") return {
      employment_type: "일용·시급제",
      workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
      duty: "수중재활 수업 진행 및 해당 회원 지원 업무",
      daily_hours: 4,
      break_time: "수업 사이 10분",
      hourly_wage: 15000,
      daily_wage: 60000,
      pay_day: 15,
      pay_method: "근로자 명의 예금통장 입금",
      insurance_industrial: true, insurance_employment: false,
      insurance_pension: false, insurance_health: false,
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
    };
    if (contractType === "nda") return {
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
      confidential_scope: "회원·보호자 개인정보, 결제·매출 자료, 진단·치료 기록, 센터 운영 노하우 일체",
      duration_years: 3,
      penalty: "민형상 배상 및 근로계약 해지",
    };
    if (contractType === "resignation") return {
      worker_phone: "", birth_date: "",
      hire_date: "", last_work_date: todayStr(),
      reason: "개인 사유",
      handover_notes: "담당 회원 인수인계 및 자료 정리 완료",
    };
    if (contractType === "incident") return {
      worker_phone: "", incident_date: todayStr(),
      incident_desc: "", cause: "", pledge: "동일 사유로 재발 시 징계를 감수하겠습니다",
    };
    if (contractType === "member_service") return {
      guardian: "", phone: "", plan_name: "", sessions: 0, amount: 0,
      agree_contract: false, agree_privacy: false, agree_safety: false, agree_photo: false,
    };
    if (contractType === "privacy") return {
      guardian: "", phone: "", birth_date: "",
      agree_required: false, agree_optional_photo: false, agree_optional_marketing: false,
    };
    if (contractType === "safety") return {
      guardian: "", phone: "", health_note: "",
      agree_risk: false, agree_emergency: false,
    };
    if (contractType === "consent_minor") return {
      guardian: "", relation: "부", phone: "", child_name: "", child_birth: "",
    };
    return {};
  }

  function openNewByType(contractType: string, subCat: "staff" | "member", subjectId: string, subjectName: string) {
    setEditing({
      contract_type: contractType,
      subject_kind: subCat,
      subject_id: subjectId,
      subject_name: subjectName,
      title: subjectName ? `${new Date().getFullYear()}년 ${typeLabel(contractType).replace(/^[^ ]+ /, "")} (${subjectName})` : "",
      contract_date: todayStr(),
      start_date: todayStr(),
      end_date: "",
      body: TEMPLATES[contractType] || "",
      form_data: defaultFormDataFor(contractType, subCat),
      signature: "", counter_signature: "", status: "draft", note: "",
      // v3.20.22: 자동연장 (해지 전까지 계속 연장)
      auto_renew: true,
      renew_period_months: subCat === "staff" ? 12 : 12,
    });
  }
  useBranchWatch(() => loadAll());

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();
    const bf = (q: any) => branchId ? q.eq("branch_id", branchId) : q;

    // contracts 테이블 (자동 폴백)
    let contractsData: any[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await bf(supabase.from("contracts").select("*")).order("contract_date", { ascending: false });
      if (!r.error) { contractsData = r.data || []; break; }
      if (r.error.code === "42703" || r.error.message?.includes("branch_id")) {
        const r2 = await supabase.from("contracts").select("*").order("contract_date", { ascending: false });
        if (!r2.error) { contractsData = r2.data || []; break; }
      }
      if (r.error.code === "42P01" || r.error.message?.includes("does not exist")) {
        // 테이블 없음
        contractsData = [];
        break;
      }
      break;
    }
    setContracts(contractsData);

    const mRes = await supabase.from("members").select("id, name, member_type, phone, guardian_name").is("deleted_at", null).order("name");
    setMembers(mRes.data || []);
    const sRes = await supabase.from("staff").select("id, name, role, phone, hire_date").order("name");
    setStaffList(sRes.data || []);

    setLoading(false);
  }

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      if (filterCat !== "all") {
        const t = CONTRACT_TYPES.find(x => x.v === c.contract_type);
        if (!t || t.cat !== filterCat) return false;
      }
      if (filterType && c.contract_type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        const nameHit = (c.subject_name || "").toLowerCase().includes(q);
        const titleHit = (c.title || "").toLowerCase().includes(q);
        if (!nameHit && !titleHit) return false;
      }
      return true;
    });
  }, [contracts, filterCat, filterType, search]);

  const stats = useMemo(() => ({
    total: contracts.length,
    staff: contracts.filter(c => {
      const t = CONTRACT_TYPES.find(x => x.v === c.contract_type);
      return t?.cat === "staff";
    }).length,
    member: contracts.filter(c => {
      const t = CONTRACT_TYPES.find(x => x.v === c.contract_type);
      return t?.cat === "member";
    }).length,
    thisMonth: contracts.filter(c => c.contract_date?.startsWith(new Date().toISOString().slice(0,7))).length,
  }), [contracts]);

  function openNew(subCat: "staff" | "member") {
    const contractType = subCat === "staff" ? "employment" : "member_service";
    setEditing({
      contract_type: contractType,
      subject_kind: subCat,
      subject_id: "",
      subject_name: "",
      title: "",
      contract_date: todayStr(),
      start_date: todayStr(),
      end_date: "",
      body: TEMPLATES[contractType] || "",
      // ✅ v3.20.15: 상담신청서처럼 필드별 개별 입력 (form_data JSON 저장)
      form_data: subCat === "staff" ? {
        // 근로계약서 기본 필드 (위례아쿠수중운동센터 실제 양식)
        workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
        duty: "아동발달에 대한 상담 및 지원사업 (발달바우처, 교육청 바우처 등)에 따른 관련 업무 수행, 행정 업무와 운영업무 보조, 아동발달에 대한 상담 및 치료 수중감각통합 등에 관련한 업무 수행",
        weekday_hours: "13:00 ~ 22:00 (휴게 19:30~20:30, 1시간)",
        saturday_hours: "10:00 ~ 14:30 (휴게 12:00~12:30, 30분)",
        base_salary: 2100000,
        meal_allowance: 200000,
        transport_allowance: 0,
        bonus_yn: "있음 (금액 상이함)",
        pay_day: 15,
        pay_method: "근로자 명의 예금통장 입금",
        insurance_employment: true,
        insurance_industrial: true,
        insurance_pension: true,
        insurance_health: true,
        employer_name: "위례아쿠수중운동센터",
        employer_ceo: "하유정",
        worker_phone: "",
      } : {
        // 회원 이용계약서 기본 필드
        guardian: "",
        phone: "",
        plan_name: "",
        sessions: 0,
        amount: 0,
      },
      signature: "",
      counter_signature: "",
      status: "draft",
      note: "",
      auto_renew: true,
      renew_period_months: 12,
    });
  }

  async function save() {
    if (!editing.subject_name) return alert("대상(회원/직원)명을 입력해 주세요");
    if (!editing.title) return alert("계약서 제목을 입력해 주세요");

    // ✅ v3.20.18: 회원 계약서 필수 동의 체크 검증
    if (editing.subject_kind === "member" && editing.contract_type === "member_service") {
      const fd = editing.form_data || {};
      const missing: string[] = [];
      if (!fd.agree_contract) missing.push("계약·환불·위약금 조항 동의");
      if (!fd.agree_privacy)  missing.push("개인정보 수집·이용 동의");
      if (!fd.agree_safety)   missing.push("안전 관리·책임 조항 동의");
      if (missing.length > 0) {
        alert(`❌ 필수 동의 항목이 체크되지 않았습니다:\n\n• ${missing.join("\n• ")}\n\n하단 동의 체크박스를 모두 처리해 주세요.`);
        return;
      }
    }
    // 근로계약·비밀유지 등 직원 계약서도 서명 유도 검증
    if (!editing.signature) {
      const proceed = confirm("⚠️ 아직 서명하지 않았습니다.\n그대로 초안으로 저장하시겠습니까?");
      if (!proceed) return;
    }

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const branchId = getActiveBranchId();
    const payload: any = {
      org_id: orgId,
      ...(branchId ? { branch_id: branchId } : {}),
      contract_type: editing.contract_type,
      subject_kind: editing.subject_kind,
      subject_id: editing.subject_id || null,
      subject_name: editing.subject_name,
      title: editing.title,
      contract_date: editing.contract_date,
      start_date: editing.start_date || null,
      end_date: editing.end_date || null,
      body: editing.body,
      signature: editing.signature || null,
      counter_signature: editing.counter_signature || null,
      status: editing.status,
      note: editing.note || null,
      // ✅ v3.20.15: 필드 값 JSON 저장 (상담신청서과 동일 방식)
      form_data: editing.form_data || null,
      // v3.20.22: 자동연장 설정
      auto_renew: editing.auto_renew !== false,
      renew_period_months: editing.renew_period_months || 12,
      terminated_at: editing.terminated_at || null,
      termination_reason: editing.termination_reason || null,
    };

    // 자동 컬럼 폴백
    let lastErr: any = null;
    let savedId: string | null = editing.id || null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const call = editing.id
        ? supabase.from("contracts").update(payload).eq("id", editing.id).select().single()
        : supabase.from("contracts").insert(payload).select().single();
      const { data, error } = await call;
      if (!error) {
        savedId = data?.id || editing.id;
        // v3.20.21: 서명 완료 시 회원/직원 문서로 자동 링크
        if (savedId && editing.signature && editing.status === "signed") {
          await autoLinkToDocument(savedId, editing, orgId);
          // v3.20.22: 서명 완료 시 PDF Storage 자동 생성
          await generateAndUploadPdf(savedId);
        }
        alert((editing.id ? "✅ 계약서가 수정되었습니다" : "✅ 계약서가 저장되었습니다") +
          (editing.signature && editing.status === "signed"
            ? `\n\n📄 ${editing.subject_kind === "staff" ? "직원 문서함" : "회원 문서함"}으로 자동 저장되었습니다`
            : ""));
        setEditing(null);
        loadAll();
        return;
      }
      lastErr = error;
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        alert(`❌ contracts 테이블이 없습니다.\n\n💡 아래 SQL을 Supabase에서 먼저 실행하세요:\n\nCREATE TABLE contracts (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  org_id UUID, branch_id UUID,\n  contract_type TEXT NOT NULL,\n  subject_kind TEXT, subject_id UUID, subject_name TEXT,\n  title TEXT, contract_date DATE, start_date DATE, end_date DATE,\n  body TEXT, signature TEXT, counter_signature TEXT,\n  status TEXT DEFAULT 'draft', note TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE contracts ENABLE ROW LEVEL SECURITY;\nCREATE POLICY contracts_all ON contracts FOR ALL USING (true) WITH CHECK (true);`);
        return;
      }
      const m = error.message.match(/'([^']+)' column|column "([^"]+)"/);
      const missing = m?.[1] || m?.[2];
      if (missing && missing in payload) { delete payload[missing]; continue; }
      break;
    }
    alert("저장 실패: " + (lastErr?.message || "알 수 없는 오류"));
  }

  // v3.20.21: 계약서 서명 완료 시 회원/직원 문서함으로 자동 복사
  async function autoLinkToDocument(contractId: string, ed: any, orgId: string | undefined) {
    try {
      const subjectKind = ed.subject_kind;
      const subjectId = ed.subject_id;
      if (!subjectId || !subjectKind) return;

      const typeLabelText = typeLabel(ed.contract_type);
      const fileName = `${ed.subject_name}_${typeLabelText}_${ed.contract_date}.pdf`;
      const category = ed.contract_type === "employment" ? "contract"
                      : ed.contract_type === "nda" ? "contract"
                      : ed.contract_type === "resignation" ? "resignation"
                      : ed.contract_type === "incident" ? "incident"
                      : ed.contract_type === "member_service" ? "contract"
                      : ed.contract_type === "privacy" ? "privacy"
                      : ed.contract_type === "safety" ? "safety"
                      : "contract";

      if (subjectKind === "staff") {
        // 이미 링크된 문서 있는지 확인
        const { data: existing } = await supabase.from("staff_documents")
          .select("id").eq("contract_id", contractId).maybeSingle();
        if (existing?.id) return;

        const { data: ins, error } = await supabase.from("staff_documents").insert({
          staff_id: subjectId,
          org_id: orgId,
          category,
          title: `${typeLabelText} (자동생성)`,
          file_name: fileName,
          file_size: 0,
          mime_type: "application/pdf",
          memo: `계약서 관리에서 자동 생성된 문서 (계약서 ID: ${contractId})`,
          contract_id: contractId,
        }).select().single();
        if (!error && ins?.id) {
          await supabase.from("contracts").update({ auto_doc_id: ins.id }).eq("id", contractId);
        }
      } else if (subjectKind === "member") {
        const { data: existing } = await supabase.from("documents")
          .select("id").eq("contract_id", contractId).maybeSingle();
        if (existing?.id) return;

        const { data: ins, error } = await supabase.from("documents").insert({
          org_id: orgId,
          member_id: subjectId,
          category,
          filename: fileName,
          file_size: 0,
          mime_type: "application/pdf",
          description: `${typeLabelText} - 계약서 관리에서 자동 생성 (계약서 ID: ${contractId})`,
          contract_id: contractId,
        }).select().single();
        if (!error && ins?.id) {
          await supabase.from("contracts").update({ auto_doc_id: ins.id }).eq("id", contractId);
        }
      }
    } catch (e) {
      console.warn("autoLinkToDocument fallback:", e);
    }
  }

  async function del(c: any) {
    if (!confirm(`"${c.title}" 계약서를 삭제할까요?\n\n삭제된 데이터는 복구할 수 없습니다.`)) return;
    const { error } = await supabase.from("contracts").delete().eq("id", c.id);
    if (error) return alert("삭제 실패: " + error.message);
    loadAll();
  }

  function handlePrint() {
    // ✅ v3.20.18: 계약서로 보기 모드에서만 프린트 (편집 UI 숨김)
    if (editing?._view !== "preview") {
      setEditing({ ...editing, _view: "preview" });
      // 대기 후 프린트
      setTimeout(() => window.print(), 300);
      return;
    }
    window.print();
  }

  // v3.20.22: 계약서를 자체 완결형 HTML 문서로 렌더링 (Storage 저장용)
  function renderContractHtmlForStorage(ed: any): string {
    const fd = ed.form_data || {};
    const title = ed.title || typeLabel(ed.contract_type);
    const bodyHtml = (ed.body || "").replace(/</g, "&lt;").replace(/\n/g, "<br/>");
    const signImg = ed.signature ? `<img src="${ed.signature}" style="max-width:180px;max-height:60px;object-fit:contain"/>` : "";
    const sealHtml = ed.counter_signature === "seal" ? `<img src="/center_seal.png" style="width:64px;height:64px;object-fit:contain"/>` : "";
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>
<title>${title}</title>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Nanum+Gothic:wght@400;700;800&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif; font-size: 8.8pt; line-height: 1.4; color: #111; margin: 0; padding: 0; word-break: keep-all; }
  h1 { text-align: center; font-size: 12pt; border-bottom: 1.5px solid #0284c7; padding-bottom: 3px; margin: 0 0 4mm 0; font-weight: 700; }
  .meta { display: flex; justify-content: space-between; font-size: 8pt; color: #475569; margin-bottom: 3mm; }
  .body { white-space: pre-wrap; letter-spacing: -0.03em; }
  .body p, .body div, .body li { margin: 0; padding: 0; }
  .sign { display: flex; justify-content: space-around; margin-top: 4mm; padding-top: 2mm; border-top: 1px solid #cbd5e1; page-break-inside: avoid; break-inside: avoid; }
  .sign-box { text-align: center; font-size: 8.2pt; line-height: 1.5; }
  .sign-box img { max-width: 40mm; max-height: 14mm; object-fit: contain; }
  .footer { text-align: right; font-size: 7.5pt; color: #64748b; margin-top: 3mm; }
  @media print { .no-print { display:none } }
</style></head><body>
<h1>${title}</h1>
<div class="meta"><span>대상: <b>${ed.subject_name || "-"}</b></span><span>계약일: <b>${ed.contract_date}</b></span><span>자동연장: <b>${ed.auto_renew !== false ? "O (" + (ed.renew_period_months || 12) + "개월 단위)" : "X"}</b></span></div>
<div class="body">${bodyHtml}</div>
<div class="sign">
  <div class="sign-box">
    <div>${ed.subject_kind === "staff" ? "근로자" : "회원(보호자)"}: <b>${ed.subject_name || "-"}</b></div>
    <div>연락처: ${fd.worker_phone || fd.phone || "-"}</div>
    <div style="margin-top:10px">${signImg}</div>
  </div>
  <div class="sign-box">
    <div>사업자: <b>${fd.employer_name || "위례아쿠수중운동센터"}</b></div>
    <div>대표자: ${fd.employer_ceo || "하유정"}</div>
    <div style="margin-top:10px">${sealHtml}</div>
  </div>
</div>
<div class="footer">생성일: ${new Date().toISOString().slice(0,10)} · 위례아쿠수중운동센터 · 사업자등록번호 680-04-03475</div>
</body></html>`;
  }

  // v3.20.22: PDF Storage 자동 업로드 (HTML 스냅샷 → 서명 완료 시 호출)
  async function generateAndUploadPdf(contractId: string) {
    try {
      // 계약서 HTML 스냅샷을 base64 PDF 로 변환하려면 외부 툴이 필요.
      // 이단계에서는 계약서 HTML 본문을 .html 로 저장 (Storage 버킷 documents)
      const html = renderContractHtmlForStorage(editing);
      const blob = new Blob([html], { type: "text/html; charset=utf-8" });
      const safeName = (editing.subject_name || "contract").replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
      const typeLabelText = typeLabel(editing.contract_type).replace(/^[^ ]+ /, "");
      const filePath = `contracts/${contractId}/${safeName}_${typeLabelText}_${editing.contract_date}_${Date.now()}.html`;

      const { error: upErr } = await supabase.storage.from("documents")
        .upload(filePath, blob, { upsert: true, contentType: "text/html; charset=utf-8" });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60 * 24 * 365);

      await supabase.from("contracts").update({
        pdf_storage_path: filePath,
        pdf_public_url: signed?.signedUrl || null,
        pdf_generated_at: new Date().toISOString(),
      }).eq("id", contractId);

      return { path: filePath, url: signed?.signedUrl };
    } catch (e: any) {
      console.warn("generateAndUploadPdf failed:", e);
      return null;
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <style jsx global>{`
        /* v3.20.23: Pretendard · Noto Sans KR · Nanum Gothic 고딕 웹폰트 (화면/인쇄 통일) */
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Nanum+Gothic:wght@400;700;800&display=swap');

        /* 계약서 본문 – 화면용 (편집 단계) */
        .contract-body {
          white-space: pre-wrap;
          font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          line-height: 1.55;
          font-size: 12.5px;
          letter-spacing: -0.015em;
          color: #111;
          background: #fff;
          word-break: keep-all;
          text-align: justify;
        }
        .contract-body h1, .contract-body h2, .contract-body h3 {
          font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif;
          font-weight: 700;
        }
        .contract-sign-area { page-break-inside: avoid; break-inside: avoid; }

        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff !important; font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif !important; }
          main { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }

          /* 모달 배경 제거 */
          .fixed.inset-0 { position: static !important; background: #fff !important; padding: 0 !important; }
          .fixed.inset-0 > div { max-width: 100% !important; width: 100% !important; max-height: none !important; box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; }
          .fixed.inset-0 > div > div { max-height: none !important; overflow: visible !important; }
          .fixed.inset-0 .bg-gradient-to-r,
          .fixed.inset-0 .border-b { border: none !important; background: transparent !important; }

          /* v3.20.24: A4 1페이지 강제 압축 */
          @page { size: A4; margin: 8mm 10mm 8mm 10mm; }

          html, body { font-size: 8.5pt !important; line-height: 1.35 !important; }

          .contract-body {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 8.5pt !important;
            line-height: 1.35 !important;
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            resize: none;
            letter-spacing: -0.03em;
            page-break-inside: auto;
            word-break: keep-all;
            font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif !important;
          }
          .contract-body p,
          .contract-body div,
          .contract-body li { margin: 0 !important; padding: 0 !important; break-inside: auto; }
          .contract-body br { line-height: 1.2 !important; }

          /* 모달 헤더 제목 */
          h1 { font-size: 12pt !important; margin: 0 0 4px 0 !important; }
          h2 { font-size: 10pt !important; margin: 4px 0 2px 0 !important; }
          h3 { font-size: 9pt !important; margin: 3px 0 1px 0 !important; }

          /* v3.20.24: 서명·직인 영역 – A4 1장 최하단 안에 무조건 들어가도록 압축 */
          .contract-sign-area {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-top: 4mm !important;
            padding-top: 2mm !important;
            font-size: 8pt !important;
            line-height: 1.3 !important;
            gap: 4px !important;
          }
          .contract-sign-area > * { padding: 0 !important; margin: 0 !important; }
          .contract-sign-area img { max-width: 32mm !important; max-height: 12mm !important; }

          /* v3.20.24: 모달 내부 입력 폼의 서명·직인 박스를 인쇄 시 완전 숨김 */
          .no-print, .no-print *,
          [data-noprint], [data-noprint] * {
            display: none !important;
            visibility: hidden !important;
          }

          /* 모든 grid/flex 여백 축소 */
          .fixed.inset-0 .space-y-2 > * + * { margin-top: 2mm !important; }
          .fixed.inset-0 .space-y-3 > * + * { margin-top: 3mm !important; }
          .fixed.inset-0 .space-y-4 > * + * { margin-top: 3mm !important; }
          .fixed.inset-0 .gap-2 { gap: 2mm !important; }
          .fixed.inset-0 .gap-3 { gap: 3mm !important; }
          .fixed.inset-0 .p-3, .fixed.inset-0 .p-4, .fixed.inset-0 .p-5 { padding: 2mm !important; }
          .fixed.inset-0 .py-3, .fixed.inset-0 .py-4 { padding-top: 2mm !important; padding-bottom: 2mm !important; }
          .fixed.inset-0 .my-2, .fixed.inset-0 .my-3, .fixed.inset-0 .my-4 { margin-top: 2mm !important; margin-bottom: 2mm !important; }
          .fixed.inset-0 .mt-4, .fixed.inset-0 .mt-6, .fixed.inset-0 .mt-8 { margin-top: 3mm !important; }

          input, textarea, select, button, label { visibility: visible; }
          .no-print, .no-print * { display: none !important; }

          .contract-print { border: none !important; padding: 0 !important; }
        }
        .print-only { display: none; }

        /* 화면에서 계약서로 보기 모드 (A4 프리뷰) */
        .contract-preview-a4 {
          font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif !important;
          font-size: 12.5px !important;
          line-height: 1.55 !important;
        }
      `}</style>

      <div className="no-print">
        <div className="flex items-center gap-2 mb-3">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-aqu-700 flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> 설정
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <FileSignature className="w-7 h-7 text-emerald-600" /> 계약서 관리
          </h1>
          <div className="flex gap-2">
            <button onClick={() => openNew("staff")}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /> 근로계약서
            </button>
            <button onClick={() => openNew("member")}
              className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /> 회원 계약서
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="전체 계약서" val={stats.total} icon="📁" color="text-slate-700" />
          <KPI label="근로계약"   val={stats.staff} icon="👨‍💼" color="text-blue-700" />
          <KPI label="회원계약"   val={stats.member} icon="👥" color="text-purple-700" />
          <KPI label="이번달"     val={stats.thisMonth} icon="📅" color="text-emerald-700" />
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl border border-emerald-100 p-3 mb-4 flex flex-wrap items-center gap-2">
          {(["all","staff","member","other"] as const).map(c => (
            <button key={c} onClick={() => { setFilterCat(c); setFilterType(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterCat === c ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {c === "all" ? "전체" : c === "staff" ? "👨‍💼 직원" : c === "member" ? "👥 회원" : "기타"}
            </button>
          ))}
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs">
            <option value="">전체 유형</option>
            {CONTRACT_TYPES.filter(t => filterCat === "all" || t.cat === filterCat).map(t => (
              <option key={t.v} value={t.v}>{t.l}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="이름·제목 검색"
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </div>
        </div>
      </div>

      {/* 리스트 */}
      <div className="bg-white rounded-xl border border-emerald-100 overflow-hidden no-print">
        {loading ? (
          <div className="p-8 text-center text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            등록된 계약서가 없습니다.<br />
            <span className="text-xs">상단의 "+" 버튼으로 새 계약서를 작성해 주세요.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-50/60 border-b border-emerald-100">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">유형</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">대상</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">제목</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">계약일</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">기간</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-gray-700">상태</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-700">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-emerald-50/30">
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColor(c.contract_type)}`}>
                      {typeLabel(c.contract_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{c.subject_name}</td>
                  <td className="px-3 py-2 text-gray-700">{c.title}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{c.contract_date}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {c.start_date && c.end_date ? `${c.start_date} ~ ${c.end_date}` : c.start_date || "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      c.status === "signed" ? "bg-green-100 text-green-700" :
                      c.status === "sent" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {c.status === "signed" ? "✓ 서명완료" : c.status === "sent" ? "📤 발송" : "📝 초안"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(c)} className="text-xs text-emerald-600 hover:text-emerald-800 mr-2">보기/편집</button>
                    <button onClick={() => del(c)} className="text-red-400 hover:text-red-600" title="삭제">
                      <Trash2 className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 편집 모달 */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="no-print px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-emerald-600" />
                <div className="font-bold text-slate-900">{editing.id ? "계약서 편집" : "새 계약서 작성"}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={handlePrint} className="px-2 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50 flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5" /> 인쇄
                </button>
                <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-white/70 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="no-print grid grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">유형 *</span>
                  <select value={editing.contract_type}
                    onChange={e => {
                      const newType = e.target.value;
                      const useTemplate = !editing.id && (!editing.body || Object.values(TEMPLATES).includes(editing.body));
                      setEditing({ ...editing, contract_type: newType, body: useTemplate && TEMPLATES[newType] ? TEMPLATES[newType] : editing.body });
                    }}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
                    {CONTRACT_TYPES.map(t => (
                      <option key={t.v} value={t.v}>{t.l}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">상태</span>
                  <select value={editing.status}
                    onChange={e => setEditing({ ...editing, status: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="draft">📝 초안</option>
                    <option value="sent">📤 발송/전달</option>
                    <option value="signed">✓ 서명완료</option>
                  </select>
                </label>
              </div>

              {/* v3.20.21: 회원/직원 검색 셀렉터 */}
              <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">대상자 검색 (클릭 시 자동 입력)</span>
                  <select value={editing.subject_id || ""}
                    onChange={e => {
                      const list = editing.subject_kind === "staff" ? staffList : members;
                      const found = list.find((x: any) => x.id === e.target.value);
                      if (found) {
                        const fd = { ...(editing.form_data || {}) };
                        if (editing.subject_kind === "staff") fd.worker_phone = found.phone || fd.worker_phone;
                        else { fd.phone = found.phone || fd.phone; fd.guardian = found.guardian_name || fd.guardian; }
                        setEditing({
                          ...editing,
                          subject_id: found.id,
                          subject_name: found.name,
                          title: editing.title || `${new Date().getFullYear()}년 ${typeLabel(editing.contract_type).replace(/^[^ ]+ /, "")} (${found.name})`,
                          form_data: fd,
                        });
                      } else {
                        setEditing({ ...editing, subject_id: "" });
                      }
                    }}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">— {editing.subject_kind === "staff" ? "직원" : "회원"} 선택 —</option>
                    {(editing.subject_kind === "staff" ? staffList : members).map((x: any) => (
                      <option key={x.id} value={x.id}>{x.name}{x.phone ? ` (${x.phone})` : ""}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">대상자명 *</span>
                  <input type="text" value={editing.subject_name}
                    onChange={e => setEditing({ ...editing, subject_name: e.target.value })}
                    placeholder="회원명 또는 직원명"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>
              <div className="no-print">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">계약서 제목 *</span>
                  <input type="text" value={editing.title}
                    onChange={e => setEditing({ ...editing, title: e.target.value })}
                    placeholder="예: 2026년 근로계약서 (윤성은)"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              <div className="no-print grid grid-cols-3 gap-2">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">계약일 *</span>
                  <input type="date" value={editing.contract_date}
                    onChange={e => setEditing({ ...editing, contract_date: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">시작일</span>
                  <input type="date" value={editing.start_date || ""}
                    onChange={e => setEditing({ ...editing, start_date: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">종료일</span>
                  <input type="date" value={editing.end_date || ""}
                    onChange={e => setEditing({ ...editing, end_date: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              {/* v3.20.22: 자동연장 UI */}
              <div className="no-print border-2 border-green-100 rounded-lg p-3 bg-green-50/40">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editing.auto_renew !== false}
                    onChange={e => setEditing({ ...editing, auto_renew: e.target.checked })}
                    className="w-4 h-4" />
                  <span className="font-bold text-green-800">🔄 자동연장 (해지 전까지 계속 연장)</span>
                </label>
                {editing.auto_renew !== false && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">연장 주기 (개월)</span>
                      <input type="number" value={editing.renew_period_months || 12} min={1} max={60}
                        onChange={e => setEditing({ ...editing, renew_period_months: Number(e.target.value) })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <div className="text-xs text-green-700 flex items-end">
                      💡 종료일 도달 시 자동으로 {editing.renew_period_months || 12}개월 연장됩니다.
                    </div>
                  </div>
                )}
                {editing.id && editing.auto_renew !== false && (
                  <button type="button" onClick={() => {
                    const reason = prompt("해지 사유를 입력하세요 (필수)");
                    if (!reason) return;
                    setEditing({ ...editing, auto_renew: false,
                      terminated_at: new Date().toISOString(),
                      termination_reason: reason,
                      status: "terminated",
                    });
                    alert("✅ 해지 처리되었습니다. 저장 버튼을 눌러 확정해 주세요.");
                  }} className="mt-2 text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200">
                    🗑️ 계약 해지
                  </button>
                )}
                {editing.terminated_at && (
                  <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    ⛔ 해지일: {new Date(editing.terminated_at).toLocaleDateString()} · 사유: {editing.termination_reason || "-"}
                  </div>
                )}
              </div>

              {/* 인쇄용 헤더 */}
              <div className="print-only mb-3 text-center">
                <div className="text-xl font-bold mb-1">{editing.title}</div>
                <div className="text-xs text-gray-600">아쿠수중운동센터 · 계약일 {editing.contract_date}</div>
                <hr className="my-2 border-black" />
              </div>

              {/* ✅ v3.20.15: 상담신청서처럼 필드별 입력폼 (근로계약서) */}
              {editing.contract_type === "employment" && editing.form_data && (
                <div className="no-print border-2 border-blue-100 rounded-lg p-3 bg-blue-50/30 space-y-2">
                  <div className="text-xs font-bold text-blue-800 mb-2">📝 근로계약서 필드 입력</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">근무장소</span>
                      <input type="text" value={editing.form_data.workplace || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, workplace: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">연락처 (근로자)</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        placeholder="010-0000-0000"
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block">
                    <span className="text-gray-600 font-semibold">업무의 내용</span>
                    <textarea value={editing.form_data.duty || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, duty: e.target.value } })}
                      className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">평일 근무시간</span>
                      <input type="text" value={editing.form_data.weekday_hours || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, weekday_hours: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">토요일 근무시간</span>
                      <input type="text" value={editing.form_data.saturday_hours || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, saturday_hours: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">월급 (원)</span>
                      <input type="number" value={editing.form_data.base_salary || 0} step={100000}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, base_salary: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">식대 (원)</span>
                      <input type="number" value={editing.form_data.meal_allowance || 0} step={10000}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, meal_allowance: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">교통비 (원)</span>
                      <input type="number" value={editing.form_data.transport_allowance || 0} step={10000}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, transport_allowance: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">지급일 (매월)</span>
                      <input type="number" value={editing.form_data.pay_day || 15} min={1} max={31}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, pay_day: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">지급 방법</span>
                      <input type="text" value={editing.form_data.pay_method || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, pay_method: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_employment}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_employment: e.target.checked } })} />
                      고용보험
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_industrial}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_industrial: e.target.checked } })} />
                      산재보험
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_pension}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_pension: e.target.checked } })} />
                      국민연금
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_health}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_health: e.target.checked } })} />
                      건강보험
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">사업체명</span>
                      <input type="text" value={editing.form_data.employer_name || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, employer_name: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">대표자</span>
                      <input type="text" value={editing.form_data.employer_ceo || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, employer_ceo: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <button type="button" onClick={() => {
                    const fd = editing.form_data;
                    const filled = (TEMPLATES.employment || "")
                      .replace(/\{\{name\}\}/g, editing.subject_name || "")
                      .replace(/\{\{start_date\}\}/g, editing.start_date || editing.contract_date || "")
                      .replace(/\{\{base_salary\}\}/g, Number(fd.base_salary || 0).toLocaleString())
                      .replace(/\{\{phone\}\}/g, fd.worker_phone || "")
                      .replace(/\{\{contract_date\}\}/g, editing.contract_date || "");
                    setEditing({ ...editing, body: filled });
                    alert("✅ 필드 값이 계약서 본문에 반영되었습니다. 아래 본문을 확인 후 필요시 추가 편집하세요.");
                  }} className="w-full py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 font-semibold">
                    🔄 필드 값 계약서 본문에 적용
                  </button>
                </div>
              )}

              {/* v3.20.21: NDA 비밀유지서약서 자동 폼 */}
              {editing.contract_type === "nda" && editing.form_data && (
                <div className="no-print border-2 border-purple-100 rounded-lg p-3 bg-purple-50/30 space-y-2">
                  <div className="text-xs font-bold text-purple-800 mb-2">🔒 비밀유지서약서(NDA) 필드</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs"><span className="text-gray-600 font-semibold">근로자 연락처</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">유지 기간(년)</span>
                      <input type="number" value={editing.form_data.duration_years || 3}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, duration_years: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">비밀정보 범위</span>
                    <textarea value={editing.form_data.confidential_scope || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, confidential_scope: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">위반 시 제재</span>
                    <input type="text" value={editing.form_data.penalty || ""}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, penalty: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                </div>
              )}

              {/* v3.20.21: 사직서 자동 폼 */}
              {editing.contract_type === "resignation" && editing.form_data && (
                <div className="no-print border-2 border-orange-100 rounded-lg p-3 bg-orange-50/30 space-y-2">
                  <div className="text-xs font-bold text-orange-800 mb-2">📝 사직서 필드</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className="text-xs"><span className="text-gray-600 font-semibold">연락처</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">생년월일</span>
                      <input type="date" value={editing.form_data.birth_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, birth_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">입사일</span>
                      <input type="date" value={editing.form_data.hire_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, hire_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">마지막 근무일</span>
                      <input type="date" value={editing.form_data.last_work_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, last_work_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs md:col-span-2"><span className="text-gray-600 font-semibold">퇴사 사유</span>
                      <input type="text" value={editing.form_data.reason || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, reason: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">인수인계 계획</span>
                    <textarea value={editing.form_data.handover_notes || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, handover_notes: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                </div>
              )}

              {/* v3.20.21: 시말서 자동 폼 */}
              {editing.contract_type === "incident" && editing.form_data && (
                <div className="no-print border-2 border-red-100 rounded-lg p-3 bg-red-50/30 space-y-2">
                  <div className="text-xs font-bold text-red-800 mb-2">⚠️ 시말서 필드</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs"><span className="text-gray-600 font-semibold">연락처</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">사건 발생일</span>
                      <input type="date" value={editing.form_data.incident_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, incident_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">사건 경위</span>
                    <textarea value={editing.form_data.incident_desc || ""} rows={3}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, incident_desc: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">원인 및 반성</span>
                    <textarea value={editing.form_data.cause || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, cause: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">서약 사항</span>
                    <input type="text" value={editing.form_data.pledge || ""}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, pledge: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                </div>
              )}

              {/* ✅ v3.20.17: 뉴 모드 토글 (편집 / 실계약서 미리보기) */}
              <div className="no-print flex items-center gap-2">
                <span className="text-xs text-gray-600 font-semibold">📄 계약 본문</span>
                <div className="ml-auto flex bg-gray-100 rounded-lg p-0.5 text-[11px]">
                  <button type="button" onClick={() => setEditing({ ...editing, _view: "edit" })}
                    className={`px-3 py-1 rounded ${(editing._view || "edit") === "edit" ? "bg-white shadow font-bold text-gray-900" : "text-gray-500"}`}>
                    ✏️ 편집
                  </button>
                  <button type="button" onClick={() => setEditing({ ...editing, _view: "preview" })}
                    className={`px-3 py-1 rounded ${editing._view === "preview" ? "bg-white shadow font-bold text-gray-900" : "text-gray-500"}`}>
                    👁️ 계약서로 보기
                  </button>
                </div>
              </div>

              {(editing._view || "edit") === "edit" ? (
                <textarea value={editing.body}
                  onChange={e => {
                    setEditing({ ...editing, body: e.target.value });
                    // auto-resize (프린트 시 본문 잘림 방지)
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = "auto";
                    el.style.height = Math.max(400, el.scrollHeight) + "px";
                  }}
                  rows={20}
                  ref={(el) => {
                    if (el && (!el.style.height || el.style.height === "auto")) {
                      requestAnimationFrame(() => {
                        el.style.height = "auto";
                        el.style.height = Math.max(400, el.scrollHeight) + "px";
                      });
                    }
                  }}
                  className="contract-body w-full mt-1 px-4 py-3 border border-gray-200 rounded-lg bg-white"
                  placeholder="계약서 본문을 입력하세요..." />
              ) : (
                /* ✅ v3.20.18: 실계약서 A4 종이 스타일 + 서명·직인 실시간 반영 */
                <div className="contract-body mt-1 px-8 py-10 md:px-12 md:py-14 bg-white border border-gray-300 shadow-sm rounded"
                  style={{ minHeight: "600px" }}>
                  <div className="text-center mb-6 pb-4 border-b-2 border-gray-800">
                    <div className="text-lg font-bold">{editing.title || "계약서"}</div>
                    <div className="text-[10px] text-gray-500 mt-1">위례아쿠수중운동센터 · 계약일 {editing.contract_date}</div>
                  </div>
                  <div className="whitespace-pre-wrap">{editing.body}</div>

                  {/* ✅ v3.20.18: 서명·직인 영역 실시간 미리보기 */}
                  <div className="contract-sign-area grid grid-cols-2 gap-4 mt-8 pt-4 border-t border-gray-200">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">
                        {editing.subject_kind === "staff" ? "근로자" : "회원(보호자)"}
                      </div>
                      <div className="text-[11px] text-gray-800 space-y-0.5 mb-2">
                        <div>연락처: {editing.form_data?.worker_phone || editing.form_data?.phone || "-"}</div>
                        <div>이  름: <b>{editing.subject_name || "-"}</b></div>
                      </div>
                      <div className="h-[70px] flex items-center justify-center border border-gray-100 rounded bg-gray-50/40">
                        {editing.signature
                          ? <img src={editing.signature} alt="sign" style={{ maxWidth: 200, maxHeight: 60, objectFit: "contain" }} />
                          : <span className="text-[10px] text-gray-400">서명 필요</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">사업주</div>
                      <div className="text-[11px] text-gray-800 space-y-0.5 mb-2">
                        <div>사업체명: <b>위례아쿠수중운동센터</b></div>
                        <div>대표자: <b>하유정</b></div>
                      </div>
                      <div className="h-[70px] flex items-center justify-center border border-gray-100 rounded bg-gray-50/40">
                        {editing.counter_signature === "seal"
                          ? <CenterSeal size={60} />
                          : <span className="text-[10px] text-gray-400">직인 필요</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ✅ v3.20.17: 회원 계약서 전용 동의 체크박스 */}
              {editing.subject_kind === "member" && (
                <div className="border-2 border-emerald-100 bg-emerald-50/40 rounded-lg p-3 mt-3 space-y-1.5">
                  <div className="text-xs font-bold text-emerald-800 mb-1">✅ 계약 동의 항목 (필수)</div>
                  <label className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" className="mt-0.5"
                      checked={!!editing.form_data?.agree_contract}
                      onChange={e => setEditing({ ...editing, form_data: { ...(editing.form_data || {}), agree_contract: e.target.checked } })} />
                    <span>본인은 위 계약 내용을 충분히 이해하였으며, <b>제8조(계약 해지·환불·위약금)</b> 조항에 대해 명확히 설명을 듣고 <b>동의합니다</b>.</span>
                  </label>
                  <label className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" className="mt-0.5"
                      checked={!!editing.form_data?.agree_privacy}
                      onChange={e => setEditing({ ...editing, form_data: { ...(editing.form_data || {}), agree_privacy: e.target.checked } })} />
                    <span>개인정보 및 민감정보 수집·이용에 <b>동의합니다</b>.</span>
                  </label>
                  <label className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" className="mt-0.5"
                      checked={!!editing.form_data?.agree_safety}
                      onChange={e => setEditing({ ...editing, form_data: { ...(editing.form_data || {}), agree_safety: e.target.checked } })} />
                    <span>제7조(안전 관리 및 책임 범위) 조항을 이해하고 <b>동의합니다</b>.</span>
                  </label>
                  <label className="flex items-start gap-2 text-[12px] cursor-pointer text-gray-600">
                    <input type="checkbox" className="mt-0.5"
                      checked={!!editing.form_data?.agree_photo}
                      onChange={e => setEditing({ ...editing, form_data: { ...(editing.form_data || {}), agree_photo: e.target.checked } })} />
                    <span>(선택) 교육·활동 기록 목적의 사진·영상 촬영에 <b>동의합니다</b>.</span>
                  </label>
                </div>
              )}

              <div className="no-print">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">비고</span>
                  <input type="text" value={editing.note || ""}
                    onChange={e => setEditing({ ...editing, note: e.target.value })}
                    placeholder="내부 메모 (계약 상대방에게 노출되지 않음)"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              {/* ✅ v3.20.17: 서명·직인 좀 더 컴팩트하게 좌우 배치 (글자 안 잘리게) */}
              <div className="contract-sign-area grid grid-cols-2 gap-2 mt-4 print:mt-6">
                {/* 좌: 근로자/회원 서명 */}
                <div className="border border-gray-200 rounded-lg p-2 bg-white">
                  <div className="text-[10px] font-bold text-gray-500 mb-1">
                    {editing.subject_kind === "staff" ? "근로자" : "회원(보호자)"}
                  </div>
                  <div className="space-y-0.5 text-[11px] text-gray-800 mb-1.5">
                    <div>연락처: {editing.form_data?.worker_phone || editing.form_data?.phone || "-"}</div>
                    <div>이  름: <b>{editing.subject_name || "-"}</b></div>
                  </div>
                  <ContractSignaturePad
                    label="서명"
                    value={editing.signature || ""}
                    onChange={(dataUrl) => setEditing({ ...editing, signature: dataUrl })}
                    width={240}
                    height={70}
                  />
                </div>
                {/* 우: 사업주 + 직인 */}
                <div className="border border-gray-200 rounded-lg p-2 bg-white">
                  <div className="text-[10px] font-bold text-gray-500 mb-1">사업주</div>
                  <div className="space-y-0.5 text-[11px] text-gray-800 mb-1.5">
                    <div>사업체명: <b>위례아쿠수중운동센터</b></div>
                    <div>대표자: <b>하유정</b></div>
                  </div>
                  <div className="flex items-center justify-center h-[70px] border border-gray-100 rounded bg-gray-50/40">
                    {editing.counter_signature === "seal"
                      ? <CenterSeal size={64} />
                      : <span className="text-[10px] text-gray-400">직인 표시를 체크하세요</span>}
                  </div>
                  <label className="no-print flex items-center gap-1 mt-1 text-[10px] text-gray-600">
                    <input type="checkbox" checked={editing.counter_signature === "seal"}
                      onChange={e => setEditing({ ...editing, counter_signature: e.target.checked ? "seal" : "" })} />
                    생성/프린트 시 직인 표시
                  </label>
                </div>
              </div>
            </div>

            <div className="no-print px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
              <div className="text-[11px] text-gray-500">
                💡 서명 후 저장하면 PDF·프린트·이메일 발송 가능
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setEditing(null)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
                {/* ✅ v3.20.18: PDF 저장 (브라우저 프린트 다이얼로그→PDF로 저장)
                    계약서는 모두 contracts 테이블에 자동 저장되며,
                    회원/직원 상세 페이지에 자동으로 노출됩니다. */}
                <button onClick={handlePrint}
                  className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm flex items-center gap-1">
                  <Download className="w-4 h-4" /> PDF 저장
                </button>
                <button onClick={save}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1">
                  <Save className="w-4 h-4" /> 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ label, val, icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-emerald-100 p-3 flex items-center gap-3">
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="text-[10px] text-gray-500 font-medium">{label}</div>
        <div className={`text-xl md:text-2xl font-bold ${color}`}>{val}</div>
      </div>
    </div>
  );
}
