"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, Check } from "lucide-react";

/**
 * v3.20.16: 계약서 서명 캔버스 (근로자·회원·직원 서명용)
 * - 마우스/터치 드로잉 지원
 * - PNG dataURL 저장
 * - 지우기·확인 버튼
 */
export default function ContractSignaturePad({
  label = "서명",
  value = "",
  onChange,
  width = 260,
  height = 90,
}: {
  label?: string;
  value?: string;
  onChange: (dataUrl: string) => void;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(!!value);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    // 저장된 서명이 있으면 표시
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
      };
      img.src = value;
    }
  }, [value]);

  function getPos(e: any) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - r.top;
    return { x: (x * c.width) / r.width, y: (y * c.height) / r.height };
  }
  function start(e: any) {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: any) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  }
  function end() {
    if (!drawing) return;
    setDrawing(false);
    const c = canvasRef.current!;
    onChange(c.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasStroke(false);
    onChange("");
  }

  return (
    <div className="border-2 border-gray-200 rounded-lg p-2 bg-white">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-gray-700">{label}</span>
        <div className="flex gap-1">
          <button type="button" onClick={clear} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center gap-1">
            <Eraser className="w-3 h-3" /> 지우기
          </button>
          {hasStroke && <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 flex items-center gap-1"><Check className="w-3 h-3" /> 서명됨</span>}
        </div>
      </div>
      <canvas ref={canvasRef} width={width} height={height}
        className="w-full border border-gray-100 rounded touch-none cursor-crosshair bg-white"
        style={{ aspectRatio: `${width}/${height}` }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
    </div>
  );
}

/**
 * v3.20.17: 위례아쿠수중운동센터 실제 직인 PNG 이미지
 * - /public/center_seal.png (사용자 업로드 직인 파일)
 * - 계약서 저장/프린트 시 자동 삽입
 */
export function CenterSeal({ size = 100 }: { size?: number }) {
  return (
    <img
      src="/center_seal.png"
      alt="위례아쿠수중운동센터 직인"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "inline-block" }}
    />
  );
}
