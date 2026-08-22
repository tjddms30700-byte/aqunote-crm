"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 🏋️‍♂️ v3.42.0 지상재활 Visual Body Map
 * ═══════════════════════════════════════════════════════════════
 * - 인체 SVG 일러스트 + 부위별 클릭 포인트 + 텍스트 라벨
 * - 앞면(Front) / 뒷면(Back) 전환 탭
 * - 신청폼에서 전달된 pain_areas 배열이 있으면 자동 하이라이트
 * - readOnly 모드 지원 (상담차트 뷰에서 그림만 표시)
 */

import { useState } from "react";

// ── 부위 정의 (신청폼과 완전 동일 key) ──
export const GROUND_BODY_PARTS_FRONT = [
  { key: "neck_front", label: "목", cx: 100, cy: 55, side: "front" },
  { key: "shoulder_l", label: "왼쪽 어깨", cx: 130, cy: 82, side: "front" },
  { key: "shoulder_r", label: "오른쪽 어깨", cx: 70, cy: 82, side: "front" },
  { key: "chest_l", label: "왼쪽 가슴", cx: 118, cy: 110, side: "front" },
  { key: "chest_r", label: "오른쪽 가슴", cx: 82, cy: 110, side: "front" },
  { key: "elbow_l", label: "왼쪽 팔꿈치", cx: 150, cy: 145, side: "front" },
  { key: "elbow_r", label: "오른쪽 팔꿈치", cx: 50, cy: 145, side: "front" },
  { key: "wrist_l", label: "왼쪽 손목", cx: 165, cy: 195, side: "front" },
  { key: "wrist_r", label: "오른쪽 손목", cx: 35, cy: 195, side: "front" },
  { key: "fingers", label: "손가락", cx: 170, cy: 220, side: "front" },
  { key: "pelvis_l", label: "왼쪽 골반", cx: 118, cy: 195, side: "front" },
  { key: "pelvis_r", label: "오른쪽 골반", cx: 82, cy: 195, side: "front" },
  { key: "hip_joint_l", label: "좌측 고관절", cx: 122, cy: 215, side: "front" },
  { key: "hip_joint_r", label: "우측 고관절", cx: 78, cy: 215, side: "front" },
  { key: "groin_l", label: "왼쪽 사타구니", cx: 110, cy: 232, side: "front" },
  { key: "groin_r", label: "오른쪽 사타구니", cx: 90, cy: 232, side: "front" },
  { key: "knee_l", label: "왼쪽 무릎", cx: 115, cy: 295, side: "front" },
  { key: "knee_r", label: "오른쪽 무릎", cx: 85, cy: 295, side: "front" },
  { key: "ankle_l", label: "왼쪽 발목", cx: 115, cy: 370, side: "front" },
  { key: "ankle_r", label: "오른쪽 발목", cx: 85, cy: 370, side: "front" },
  { key: "toes", label: "발가락", cx: 100, cy: 395, side: "front" },
];

export const GROUND_BODY_PARTS_BACK = [
  { key: "neck_back", label: "목", cx: 100, cy: 55, side: "back" },
  { key: "shoulder_back", label: "어깨", cx: 100, cy: 82, side: "back" },
  { key: "scapula_spine", label: "날개뼈와 척추사이", cx: 100, cy: 105, side: "back" },
  { key: "upper_back", label: "등 상부", cx: 100, cy: 130, side: "back" },
  { key: "lower_back", label: "허리", cx: 100, cy: 175, side: "back" },
  { key: "buttock", label: "엉덩이", cx: 100, cy: 220, side: "back" },
  { key: "hamstring", label: "허벅지 뒤", cx: 100, cy: 275, side: "back" },
  { key: "calf", label: "종아리", cx: 100, cy: 335, side: "back" },
  { key: "sole", label: "발바닥", cx: 100, cy: 395, side: "back" },
];

interface Props {
  selectedKeys: string[];
  onToggle?: (key: string) => void;
  readOnly?: boolean;
  className?: string;
}

export default function GroundBodyMap({ selectedKeys, onToggle, readOnly = false, className = "" }: Props) {
  const [view, setView] = useState<"front" | "back">("front");
  const parts = view === "front" ? GROUND_BODY_PARTS_FRONT : GROUND_BODY_PARTS_BACK;
  const isSel = (k: string) => selectedKeys.includes(k);

  const handleClick = (key: string) => {
    if (readOnly) return;
    onToggle?.(key);
  };

  // 앞면 인체 SVG (단순화된 실루엣)
  const FrontSilhouette = (
    <g stroke="#94a3b8" strokeWidth="1.5" fill="#f1f5f9">
      {/* 머리 */}
      <circle cx="100" cy="30" r="20" />
      {/* 목 */}
      <rect x="93" y="48" width="14" height="12" rx="3" />
      {/* 몸통 (어깨 → 골반) */}
      <path d="M 65 65 Q 60 75 60 90 L 60 200 Q 60 215 70 225 L 130 225 Q 140 215 140 200 L 140 90 Q 140 75 135 65 Z" />
      {/* 왼팔 */}
      <path d="M 140 75 Q 158 80 160 100 L 168 155 Q 170 175 168 200 L 165 215" fill="none" strokeWidth="2" />
      <circle cx="170" cy="220" r="8" />
      {/* 오른팔 */}
      <path d="M 60 75 Q 42 80 40 100 L 32 155 Q 30 175 32 200 L 35 215" fill="none" strokeWidth="2" />
      <circle cx="30" cy="220" r="8" />
      {/* 왼다리 */}
      <path d="M 105 225 L 108 300 Q 110 340 112 380" fill="none" strokeWidth="2" />
      <ellipse cx="110" cy="395" rx="10" ry="6" />
      {/* 오른다리 */}
      <path d="M 95 225 L 92 300 Q 90 340 88 380" fill="none" strokeWidth="2" />
      <ellipse cx="90" cy="395" rx="10" ry="6" />
      {/* 가슴선 */}
      <line x1="100" y1="70" x2="100" y2="225" stroke="#cbd5e1" strokeDasharray="2,3" strokeWidth="1" />
    </g>
  );

  // 뒷면 인체 SVG
  const BackSilhouette = (
    <g stroke="#94a3b8" strokeWidth="1.5" fill="#f1f5f9">
      {/* 뒷머리 */}
      <circle cx="100" cy="30" r="20" />
      {/* 목 뒤 */}
      <rect x="93" y="48" width="14" height="12" rx="3" />
      {/* 등판 */}
      <path d="M 65 65 Q 60 75 60 90 L 60 200 Q 60 215 70 225 L 130 225 Q 140 215 140 200 L 140 90 Q 140 75 135 65 Z" />
      {/* 왼팔(뒤) */}
      <path d="M 140 75 Q 158 80 160 100 L 168 155 Q 170 175 168 200 L 165 215" fill="none" strokeWidth="2" />
      <circle cx="170" cy="220" r="8" />
      {/* 오른팔(뒤) */}
      <path d="M 60 75 Q 42 80 40 100 L 32 155 Q 30 175 32 200 L 35 215" fill="none" strokeWidth="2" />
      <circle cx="30" cy="220" r="8" />
      {/* 왼다리(뒤) */}
      <path d="M 105 225 L 108 300 Q 110 340 112 380" fill="none" strokeWidth="2" />
      <ellipse cx="110" cy="395" rx="10" ry="6" />
      {/* 오른다리(뒤) */}
      <path d="M 95 225 L 92 300 Q 90 340 88 380" fill="none" strokeWidth="2" />
      <ellipse cx="90" cy="395" rx="10" ry="6" />
      {/* 척추선 */}
      <line x1="100" y1="70" x2="100" y2="225" stroke="#94a3b8" strokeDasharray="3,3" strokeWidth="1.5" />
      {/* 골반 굴곡 */}
      <path d="M 70 210 Q 100 218 130 210" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2" />
    </g>
  );

  return (
    <div className={`${className}`}>
      {/* 앞/뒷면 전환 탭 */}
      <div className="flex gap-2 mb-3 justify-center">
        <button
          type="button"
          onClick={() => setView("front")}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition ${
            view === "front"
              ? "bg-emerald-500 text-white border-emerald-500 shadow"
              : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
          }`}
        >
          🧍 앞면
        </button>
        <button
          type="button"
          onClick={() => setView("back")}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition ${
            view === "back"
              ? "bg-emerald-500 text-white border-emerald-500 shadow"
              : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
          }`}
        >
          🚶 뒷면
        </button>
      </div>

      {/* SVG 인체 일러스트 + 클릭 포인트 */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="mx-auto md:mx-0" style={{ width: 220 }}>
          <svg viewBox="0 0 200 420" className="w-full h-auto bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-slate-200">
            {view === "front" ? FrontSilhouette : BackSilhouette}
            {/* 클릭 포인트 */}
            {parts.map((p) => {
              const selected = isSel(p.key);
              return (
                <g
                  key={p.key}
                  onClick={() => handleClick(p.key)}
                  style={{ cursor: readOnly ? "default" : "pointer" }}
                >
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={selected ? 8 : 5}
                    fill={selected ? "#ef4444" : "#e2e8f0"}
                    stroke={selected ? "#b91c1c" : "#64748b"}
                    strokeWidth={selected ? 2 : 1}
                    opacity={selected ? 0.9 : 0.55}
                  >
                    {selected && (
                      <animate
                        attributeName="r"
                        values="8;10;8"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    )}
                  </circle>
                  {selected && (
                    <text
                      x={p.cx}
                      y={p.cy - 12}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#b91c1c"
                      style={{ pointerEvents: "none" }}
                    >
                      ●
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* 부위 텍스트 라벨 목록 */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-600 mb-2">
            {view === "front" ? "🧍 앞면 부위" : "🚶 뒷면 부위"}
            <span className="ml-2 text-slate-400">
              (클릭 시 선택 · 전체 선택 {selectedKeys.length}곳)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {parts.map((p) => {
              const selected = isSel(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleClick(p.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                    selected
                      ? "bg-red-500 text-white border-red-600 shadow"
                      : "bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:bg-red-50"
                  } ${readOnly ? "cursor-default opacity-90" : "cursor-pointer"}`}
                >
                  {selected ? "● " : ""}{p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 선택된 부위 요약 */}
      {selectedKeys.length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
          <b>선택된 부위 {selectedKeys.length}곳:</b>{" "}
          {selectedKeys
            .map((k) => {
              const all = [...GROUND_BODY_PARTS_FRONT, ...GROUND_BODY_PARTS_BACK];
              return all.find((p) => p.key === k)?.label || k;
            })
            .join(", ")}
        </div>
      )}
    </div>
  );
}
