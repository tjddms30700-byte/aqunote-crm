"use client";
import {useEffect,useRef,useState,useMemo} from 'react';
import {createPortal} from 'react-dom';
import {supabase} from '@/lib/supabase';
import {RadarChart,PolarGrid,PolarAngleAxis,PolarRadiusAxis,Radar,ResponsiveContainer,PieChart,Pie,Cell,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import {X} from 'lucide-react';
import {REPORT_AXES,MEASURE_KEYS,buildGrowthData,trendPoints} from '@/lib/growthReport';
type Props={memberId:string;memberName:string;memberLevel?:number;period:'monthly'|'yearly';startDate?:string;endDate?:string;onClose?:()=>void};
export default function ComprehensiveGrowthReport(p:Props){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),from=p.startDate||(p.period==='yearly'?today.slice(0,4)+'-01-01':today.slice(0,7)+'-01'),to=p.endDate||today;
 const [ctx,setCtx]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[aiBusy,setAiBusy]=useState(false),[pdfBusy,setPdfBusy]=useState(false),[consent,setConsent]=useState(true),[reviewed,setReviewed]=useState(false),[analysis,setAnalysis]=useState(''),[home,setHome]=useState(''),[aiMeta,setAiMeta]=useState<any>(null),[metric,setMetric]=useState('activity'),[therapist,setTherapist]=useState(''),[signature,setSignature]=useState(''),[signOpen,setSignOpen]=useState(false),[overflow,setOverflow]=useState(false),[capture,setCapture]=useState(false);
 const page1=useRef<HTMLElement>(null),page2=useRef<HTMLElement>(null),version=useRef(0),captureLock=useRef(false),controller=useRef<AbortController|null>(null),layoutLock=useRef(false),autoAttempt=useRef(""),generationLock=useRef<number|null>(null);
 useEffect(()=>{let alive=true;const n=++version.current;controller.current?.abort();setCtx(null);setAnalysis('');setHome('');setAiMeta(null);setReviewed(false);setAiBusy(false);generationLock.current=null;autoAttempt.current="";setSignature('');setTherapist('');setMetric('activity');setLoading(true);setError('');(async()=>{try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('로그인 후 다시 이용해주세요.');const r=await supabase.rpc('growth_report_context',{p_member:p.memberId,p_from:from,p_to:to}).setHeader('Authorization',`Bearer ${session.access_token}`);if(r.error)throw new Error(['PGRST202','42883'].includes(r.error.code)?'v3.87.0 성장보고서 SQL을 먼저 적용해주세요.':r.error.message);if(alive&&version.current===n)setCtx(r.data);}catch(e:any){if(alive)setError(e.message);}finally{if(alive)setLoading(false);}})();return()=>{alive=false;controller.current?.abort();};},[p.memberId,from,to]);
 const data=useMemo(()=>ctx?buildGrowthData(ctx,from,ctx.effective_to):null,[ctx,from]),trend=useMemo(()=>data?trendPoints(data.rows,metric,from,ctx.effective_to):[],[data,metric,from,ctx]),selectedMetric=MEASURE_KEYS.find(m=>m.key===metric),measureLabel=selectedMetric?`${selectedMetric.label} (${selectedMetric.unit})`:'활동 태그 기록량';
 const assess=()=>{const bad=[page1.current,page2.current].some(el=>!!el&&(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2));setOverflow(bad);return !bad;};
 useEffect(()=>{const t=setTimeout(assess,120);const ro=new ResizeObserver(()=>{if(!layoutLock.current)assess();});for(const el of [page1.current,page2.current])if(el){ro.observe(el);for(const c of el.children)ro.observe(c);}return()=>{clearTimeout(t);ro.disconnect();};},[ctx,analysis,home,signature,metric]);
 useEffect(()=>{const before=()=>{if(document.querySelector('.report-print-host'))return;const host=document.createElement('div');host.className='report-print-host';const source=page1.current?.parentElement;if(source){const clone=source.cloneNode(true) as HTMLElement;clone.querySelectorAll('select,button').forEach(el=>el.remove());const ids=new Map<string,string>();clone.querySelectorAll('[id]').forEach(el=>{const old=el.id;ids.set(old,'report-print-'+old);el.id='report-print-'+old;});clone.querySelectorAll('*').forEach(el=>{for(const attr of Array.from(el.attributes)){let v=attr.value;for(const [old,next]of ids){v=v.split('url(#'+old+')').join('url(#'+next+')');if(v==='#'+old)v='#'+next;}if(v!==attr.value)el.setAttribute(attr.name,v);}});host.appendChild(clone);document.body.appendChild(host);}};const after=()=>document.querySelector('.report-print-host')?.remove();window.addEventListener('beforeprint',before);window.addEventListener('afterprint',after);return()=>{window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after);after();};},[ctx,analysis,home,signature,metric,reviewed]);
 async function generate(automatic=false){if(aiBusy||generationLock.current===version.current||!consent)return;if(!automatic&&(analysis||home)&&!window.confirm('현재 작성 내용을 새 AI 초안으로 바꿀까요? 실패하면 기존 내용은 유지합니다.'))return;setAiBusy(true);setError('');const generation=version.current;generationLock.current=generation;const c=new AbortController();controller.current=c;try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('로그인이 필요합니다.');const r=await fetch('/api/ai?action=growth-report',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({member_id:p.memberId,from,to,consent:true})});const out=await r.json();if(!r.ok||!out.success)throw new Error(out.error||'보고서 생성에 실패했습니다.');if(generation!==version.current)return;setAnalysis(out.analysis);setHome(out.home);setAiMeta(out);setReviewed(false);}catch(e:any){if(e.name!=='AbortError'&&generation===version.current)setError(e.message);}finally{if(generation===version.current){generationLock.current=null;setAiBusy(false);}}}
 useEffect(()=>{if(!ctx||!data||loading||!consent||data.notes.length<2)return;const key=p.memberId+':'+from+':'+to+':'+version.current;if(autoAttempt.current===key)return;const timer=setTimeout(()=>{if(autoAttempt.current===key)return;autoAttempt.current=key;void generate(true);},350);return()=>clearTimeout(timer);},[ctx,data,loading,consent,p.memberId,from,to]);
 function canExport(){if(!analysis.trim()||!home.trim()){setError('종합 분석과 가정 연계 가이드를 작성해주세요.');return false;}if(!reviewed){setError('실제 세션 기록과 사실관계를 최종 검토해주세요.');return false;}if(!assess()){setError('작성 내용이 A4 2페이지를 넘습니다. 빨간 안내가 사라지도록 본문을 줄여주세요. 내용을 잘라서 저장하지 않습니다.');return false;}return true;}
 async function printableDocument(){await document.fonts.ready;await Promise.all([page1.current,page2.current].flatMap(el=>Array.from(el?.querySelectorAll('img')||[])).map(img=>img.decode?.().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return assess();}
 async function download(){if(captureLock.current||!canExport())return;captureLock.current=true;setPdfBusy(true);setError('');layoutLock.current=true;setCapture(true);await new Promise(r=>setTimeout(r,100));try{if(!await printableDocument())throw new Error('A4 2페이지 범위를 넘습니다. 본문을 줄여주세요.');const [{default:jsPDF},{default:html2canvas}]=await Promise.all([import('jspdf'),import('html2canvas')]);const pdf=new jsPDF('p','mm','a4');for(const [i,el] of [page1.current,page2.current].entries()){if(!el)throw new Error('출력 영역을 찾을 수 없습니다.');const canvas=await html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,width:el.offsetWidth,height:el.offsetHeight});if(i)pdf.addPage();pdf.addImage(canvas.toDataURL('image/png'),'PNG',12,15,186,267,undefined,'FAST');}pdf.save(`${ctx.member.name}_성장종합보고서_${from}_${to}.pdf`);}catch(e:any){setError(e.message||'PDF 생성에 실패했습니다.');}finally{setCapture(false);setPdfBusy(false);captureLock.current=false;layoutLock.current=false;}}
 async function printReport(){if(!canExport())return;if(await printableDocument())window.print();}
 if(loading)return <div className="growth-report-loading" role="status">실제 세션 기록을 불러오고 있어요…</div>;
 if(!ctx||!data)return <div role="alert" className="growth-report-error">{error||'보고서 데이터를 확인하지 못했습니다.'}</div>;
 const donut=data.axes.filter(a=>a.count>0),dominant=data.summary.dominant,center=ctx.settings?.center_name||'위례아쿠수중운동센터',disabled=pdfBusy||aiBusy;
 return <div className={'growth-report-container report-v3870'+(capture?' report-exporting':'')}>
 <div className="growth-report-toolbar print-hide"><div><h1>성장 종합보고서</h1><p>{ctx.member.name} · {from} ~ {to} · v3.88.1</p></div><div className="report-toolbar-actions"><button onClick={printReport} disabled={disabled}>인쇄</button><button className="report-primary" onClick={download} disabled={disabled}>{pdfBusy?'PDF 생성 중…':'PDF 다운로드'}</button>{p.onClose&&<button onClick={p.onClose}>닫기</button>}</div></div>
 <section className="report-editor print-hide" aria-label="보고서 작성 및 검토"><div className="report-edit-grid"><label>종합 분석 <span>{analysis.length?`${analysis.length}자`:aiBusy?'AI 초안 작성 중…':'자동 초안 대기'}</span><textarea aria-label="종합 분석 수정" value={analysis} maxLength={1800} disabled={disabled} onChange={e=>{setAnalysis(e.target.value);setReviewed(false);}} placeholder="실제 일지에서 AI 초안을 자동으로 불러와요. 생성 후 검토·수정해주세요."/></label><label>가정 연계 가이드 <span>{home.length?`${home.length}자`:aiBusy?'AI 초안 작성 중…':'자동 초안 대기'}</span><textarea aria-label="가정 연계 가이드 수정" value={home} maxLength={600} disabled={disabled} onChange={e=>{setHome(e.target.value);setReviewed(false);}} placeholder="실제 관찰에 연결한 가정 안내 초안을 자동으로 불러와요."/></label></div>
 <p className="report-basis-note" role="status">{aiBusy?"AI가 종합 분석과 가정 연계 가이드 초안을 자동 작성하고 있어요…":analysis&&home?"AI 초안이 채워졌습니다. 실제 기록과 대조한 뒤 미세 수정해주세요.":"자동 초안은 실제 일지 2회 이상과 AI 연결이 필요합니다. 기록이 부족하거나 연결이 실패하면 관찰을 지어내지 않습니다."}</p><div className="report-editor-bottom"><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={disabled}/> 자동 AI 초안 사용 — 선택한 회원·기간의 가명 처리 일지를 외부 AI로 분석합니다.</label><button className="report-primary" disabled={disabled||!consent||data.notes.length<2} onClick={()=>generate(false)}>{aiBusy?'실제 일지 분석 중…':'실제 일지로 AI 분석 재생성'}</button></div>
 <div className="report-review-row"><label><input type="checkbox" aria-label="보고서 사실관계 최종 검토" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} disabled={disabled}/> 실제 기록·인용·가정 안내를 최종 검토했습니다.</label><select aria-label="담당 치료사" disabled={disabled} value={therapist} onChange={e=>setTherapist(e.target.value)}><option value="">담당 치료사 선택</option>{(ctx.staff||[]).map((s:any)=><option key={s.id} value={s.name}>{s.name}</option>)}</select><button onClick={()=>setSignOpen(true)} disabled={disabled}>{signature?'서명 다시 입력':'서명 입력'}</button>{signature&&<button onClick={()=>setSignature('')} disabled={disabled}>서명 지우기</button>}</div>
 <p className="report-basis-note">실제 관찰 일지 {data.notes.length}회 · 상위 활동 태그: {data.topTags.map(t=>`${t.tag} ${t.count}회`).join(' / ')||'기록 없음'}. {data.notes.length<2?'AI 개인화에는 서로 다른 세션의 실제 일지 2회 이상이 필요합니다. 직접 작성은 가능합니다.':''} 작성 내용은 이 화면의 초안이며 회원 DB에 자동 저장되지 않습니다.</p>{aiMeta&&<p className="report-basis-note">AI는 실제 인용문 2건을 원문 대조했습니다. {aiMeta.coverage?.provided_notes}/{aiMeta.coverage?.notes}개 일지 제공 · {aiMeta.coverage?.selection}. 내용의 임상적 타당성은 담당자 검토가 필요합니다.</p>}
 {error&&<p role="alert" className="growth-report-error">{error}</p>}{overflow&&<p role="alert" className="growth-report-error">본문이 A4 2페이지 출력 범위를 넘습니다. 글을 줄여주세요. 잘라내거나 숨겨서 PDF로 저장하지 않습니다.</p>}
 </section>
 <div className="report-scroll" data-testid="report-scroll"><div className="growth-report-print">
 <section ref={page1} className="report-sheet report-page-one" data-page="1"><header className="report-header"><div><span className="report-eyebrow">AQU · INDIVIDUAL GROWTH</span><h1>성장 종합보고서</h1><p>{ctx.member.name} 회원 · {from} ~ {to}</p></div><div className="report-center"><b>{center}</b>{ctx.settings?.ceo_name&&<span>대표 {ctx.settings.ceo_name}</span>}{ctx.settings?.phone&&<span>{ctx.settings.phone}</span>}</div></header>
 <div className="report-kpis summary-section">{[['기록된 수업',data.summary.totalSessions,'회'],['수치 기록률',data.summary.measuredRatio,'%'],['출석 확인일',data.summary.attendanceDays,'일'],['주력 기록 축',dominant,''],['노쇼 기록',data.summary.noshow,'건']].map(([label,value,unit])=><div className="report-kpi" key={String(label)}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>)}</div>
 <section className="report-card chart-container report-radar"><div className="report-card-heading"><div><span className="report-eyebrow">SIX-AXIS PROFILE</span><h2>6축 활동 프로파일</h2></div><span>기간 내 실제 태그 기반</span></div>{data.axes.some(a=>a.value!==null)?<ResponsiveContainer width="100%" height={280}><RadarChart data={data.axes} outerRadius="72%"><defs><radialGradient id="growthRadarSky"><stop offset="0%" stopColor="#0284C7" stopOpacity={.08}/><stop offset="100%" stopColor="#0284C7" stopOpacity={.24}/></radialGradient></defs><PolarGrid stroke="#E2E8F0"/><PolarAngleAxis dataKey="label" tick={{fontSize:12,fill:'#334155'}}/><PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/><Radar dataKey="value" stroke="#0284C7" strokeWidth={2} fill="url(#growthRadarSky)" fillOpacity={1} isAnimationActive={false}/><Tooltip formatter={(v:any)=>[`${v} / 100`,'상대 기록 비중']}/></RadarChart></ResponsiveContainer>:<div className="report-empty">해당 기간에 분류 가능한 활동 태그가 없습니다.</div>}<p className="report-chart-note">축별 활동 태그 횟수를 가장 많이 기록된 축=100으로 표시합니다. 능력 검사·발달 점수나 치료 효과가 아닙니다. 미기록 축을 임의 점수로 채우지 않습니다.</p></section>
 <section className="report-card chart-container report-donut"><div className="report-card-heading"><div><span className="report-eyebrow">ACTIVITY MIX</span><h2>활동량 분포</h2></div><span>태그 분류 횟수</span></div><div className="report-donut-grid"><div className="report-donut-canvas">{donut.length?<ResponsiveContainer width="100%" height={205}><PieChart><Pie data={donut} dataKey="count" nameKey="label" innerRadius={63} outerRadius={80} paddingAngle={3} stroke="none" isAnimationActive={false}>{donut.map(a=><Cell key={a.key} fill={a.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>:<div className="report-empty">분류 기록 없음</div>}</div><table className="report-legend"><thead><tr><th>영역</th><th>기록</th><th>비중</th></tr></thead><tbody>{data.axes.map(a=><tr key={a.key}><td><i style={{background:a.color}}/>{a.label}</td><td>{a.count}</td><td>{donut.reduce((n,a)=>n+a.count,0)?Math.round(a.count/donut.reduce((n,a)=>n+a.count,0)*100):0}%</td></tr>)}</tbody></table></div><p className="report-chart-note">한 활동 태그가 여러 영역에 해당하면 각 영역에 집계됩니다. 수업 시간 배분 비율과는 다릅니다.</p></section>
 <footer className="report-page-footer"><span>집계 범위: {from} ~ {ctx.effective_to} · 미래·삭제·취소·미실시 수업 제외</span><b>1 / 2</b></footer></section>
 <section ref={page2} className="report-sheet report-page-two" data-page="2"><header className="report-small-header"><b>{ctx.member.name} 회원 · 임상 관찰과 다음 걸음</b><span>{center}</span></header>
 <section className="report-card chart-container report-trend"><div className="report-card-heading"><div><span className="report-eyebrow">CHANGE OVER TIME</span><h2>기간 내 기록 추이</h2></div><select className="print-hide" aria-label="성장 추이 지표" disabled={disabled} value={metric} onChange={e=>setMetric(e.target.value)}><option value="activity">활동 태그 기록량</option>{data.available.map(m=><option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}</select></div><p className="report-trend-label">{metric==='activity'?'활동 태그 기록량 (건) — 기능 향상 점수가 아님':measureLabel+' · 실제 입력값, 구간별 평균'}</p>{trend.length?<ResponsiveContainer width="100%" height={120}><LineChart data={trend} margin={{top:5,right:15,bottom:0,left:-20}}><CartesianGrid stroke="#E2E8F0" vertical={false}/><XAxis dataKey="bucket" tick={{fontSize:9,fill:'#64748B'}} minTickGap={30}/><YAxis tick={{fontSize:9,fill:'#64748B'}}/><Tooltip/>{metric==='activity'?REPORT_AXES.map((a,i)=><Line key={a.key} type="linear" dataKey={a.key} name={a.label} stroke={a.color} strokeDasharray={i>2?'4 3':undefined} strokeWidth={1.7} dot={{r:2}} connectNulls={false} isAnimationActive={false}/>):<Line type="linear" dataKey="value" name={measureLabel} stroke="#0284C7" strokeWidth={2} dot={{r:3}} connectNulls={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer>:<div className="report-empty">추이를 표시할 실제 기록이 없습니다.</div>}<p className="report-chart-note">선택 기간 밖 기록·미측정 구간을 임의 보간하지 않습니다. 실측 지표는 입력 단위와 평가 기준을 담당자가 확인해야 합니다.</p></section>
 <section className="report-card report-analysis summary-section"><h2>임상 분석 리포트</h2><div className="report-prose">{analysis||'실제 세션 기록에 근거한 종합 분석을 작성해주세요.'}</div></section>
 <section className="report-card report-home summary-section"><h2>가정 연계 가이드</h2><div className="report-prose">{home||'기록이 적은 영역과 실제 관찰 필요에 맞춘 안전한 가정 안내를 작성해주세요.'}</div></section>
 <section className="report-signature summary-section"><div><p>발행일 {today}</p><p>{center}</p><p className="report-chart-note">활동 기록 기반 참고 보고서이며 진단서가 아닙니다.</p></div><div className="report-sign-mark"><span>담당 치료사 <b>{therapist||'________________'}</b></span>{signature?<img src={signature} alt="담당 치료사 서명"/>:<span className="report-sign-empty">서명</span>}</div></section>
 <footer className="report-page-footer"><span>{reviewed?'담당자 사실관계 검토 완료':'담당자 검토 전 초안'}</span><b>2 / 2</b></footer></section>
 </div></div>{signOpen&&createPortal(<SignaturePadModal onClose={()=>setSignOpen(false)} onSave={x=>{setSignature(x);setSignOpen(false);}}/>,document.body)}
 </div>;
}

function SignaturePadModal({ onClose, onSave }: { onClose: () => void; onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // HiDPI 지원
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2.5;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
  }, []);

  function getPos(e: any) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: any) {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: any) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setEmpty(false);
  }
  function end() { setDrawing(false); }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setEmpty(true);
  }

  function save() {
    if (!canvasRef.current || empty) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onSave(dataUrl);
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-5 w-full max-w-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold text-slate-800 flex items-center gap-2">
            🖊️ 서명 입력
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-[11px] text-slate-500 mb-2">태블릿에서 손가락/펜, PC에서 마우스로 서명하세요.</div>
        <div className="border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden bg-white" style={{ touchAction: "none" }}>
          <canvas
            ref={canvasRef}
            className="w-full block"
            style={{ height: 220, cursor: "crosshair", touchAction: "none" }}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          />
        </div>
        <div className="flex justify-between mt-4 gap-2">
          <button onClick={clear}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
            🗑️ 지우기
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition">
              취소
            </button>
            <button onClick={save} disabled={empty}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white transition disabled:opacity-40 shadow-md shadow-indigo-200/40">
              ✓ 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

