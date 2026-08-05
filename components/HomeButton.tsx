"use client";

/**
 * v3.31.0: 중복 홈 버튼 제거
 * - 이전 버전들에서 각 페이지가 개별적으로 HomeButton을 렌더링했으나,
 *   v3.30.0에서 GlobalHeader가 우측 상단에 홈 버튼을 통일 렌더링하도록 변경됨
 * - 하위 호환 유지를 위해 컴포넌트 자체는 남기되, 렌더 결과는 null 반환
 * - 64개 페이지의 <HomeButton /> 참조를 일일이 지우지 않아도 자동 소거됨
 */
export default function HomeButton() {
  return null;
}
