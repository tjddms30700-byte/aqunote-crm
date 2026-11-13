"use client";
import {useEffect,useRef,useState,useMemo} from 'react';
import {createPortal} from 'react-dom';
import {supabase} from '@/lib/supabase';
import {RadarChart,PolarGrid,PolarAngleAxis,PolarRadiusAxis,Radar,ResponsiveContainer,PieChart,Pie,Cell,AreaChart,Area,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import {X} from 'lucide-react';
import {REPORT_AXES,MEASURE_KEYS,buildGrowthData,trendPoints,cumulativeActivityPoints,reportFallback} from '@/lib/growthReport';
import {paginateGrowthReport,ReportPagination} from '@/lib/growthReportPrint';
type Props={memberId:string;memberName:string;memberLevel?:number;period:'monthly'|'yearly';startDate?:string;endDate?:string;onClose?:()=>void};
export default function ComprehensiveGrowthReport(p:Props){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),from=p.startDate||(p.period==='yearly'?today.slice(0,4)+'-01-01':today.slice(0,7)+'-01'),to=p.endDate||today;
 const [ctx,setCtx]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[aiBusy,setAiBusy]=useState(false),[pdfBusy,setPdfBusy]=useState(false),[consent,setConsent]=useState(true),[reviewed,setReviewed]=useState(false),[analysis,setAnalysis]=useState(''),[home,setHome]=useState(''),[aiMeta,setAiMeta]=useState<any>(null),[metric,setMetric]=useState('sessions'),[hoverPoint,setHoverPoint]=useState<any>(null),[therapist,setTherapist]=useState(''),[signature,setSignature]=useState(''),[signOpen,setSignOpen]=useState(false),[overflow,setOverflow]=useState(false),[capture,setCapture]=useState(false);
 const printLayout=useRef<ReportPagination|null>(null);
 const page1=useRef<HTMLElement>(null),page2=useRef<HTMLElement>(null),version=useRef(0),captureLock=useRef(false),controller=useRef<AbortController|null>(null),layoutLock=useRef(false),autoAttempt=useRef(""),generationLock=useRef<number|null>(null),edited=useRef(0);
 useEffect(()=>{let alive=true;const n=++version.current;controller.current?.abort();setCtx(null);setAnalysis('');setHome('');setAiMeta(null);setReviewed(false);setAiBusy(false);generationLock.current=null;autoAttempt.current="";setSignature('');setTherapist('');setMetric('sessions');setHoverPoint(null);setLoading(true);setError('');edited.current=0;(async()=>{try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('로그인 후 다시 이용해주세요.');const r=await supabase.rpc('growth_report_context',{p_member:p.memberId,p_from:from,p_to:to}).setHeader('Authorization',`Bearer ${session.access_token}`);if(r.error)throw new Error(['PGRST202','42883'].includes(r.error.code)?'v3.87.0 성장보고서 SQL을 먼저 적용해주세요.':r.error.message);if(alive&&version.current===n){setCtx(r.data);const fallback=reportFallback(buildGrowthData(r.data,from,r.data.effective_to));setAnalysis(fallback.analysis);setHome(fallback.home);setAiMeta({kind:'fallback'});}}catch(e:any){if(alive)setError(e.message);}finally{if(alive)setLoading(false);}})();return()=>{alive=false;controller.current?.abort();};},[p.memberId,from,to]);
 const data=useMemo(()=>ctx?buildGrowthData(ctx,from,ctx.effective_to):null,[ctx,from]),isCumulative=metric==='sessions'||metric==='activity',trend=useMemo(()=>data?(isCumulative?cumulativeActivityPoints(data.rows,from,ctx.effective_to):trendPoints(data.rows,metric,from,ctx.effective_to)):[],[data,metric,from,ctx,isCumulative]),selectedMetric=MEASURE_KEYS.find(m=>m.key===metric),measureLabel=selectedMetric?`${selectedMetric.label} (${selectedMetric.unit})`:metric==='activity'?'누적 활동 태그 기록':'누적 활동·경험 기록 (일지 기준)',trendKey=metric==='activity'?'cumulativeTags':metric==='sessions'?'cumulativeSessions':'value',activePoint=hoverPoint||trend.at(-1);
 function moveTrendSummary(event:any){const node=event.currentTarget.querySelector('.recharts-wrapper') as HTMLElement|null;if(!node||!trend.length)return;const rect=node.getBoundingClientRect(),x=(event.touches?.[0]?.clientX??event.clientX)-rect.left,ratio=Math.max(0,Math.min(1,(x-44)/Math.max(1,rect.width-56)));setHoverPoint(trend[Math.round(ratio*(trend.length-1))]);}
 const assess=()=>{const el=page1.current;const bad=!!el&&(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2);setOverflow(bad);return !bad;};
 useEffect(()=>{const t=setTimeout(assess,120);return()=>clearTimeout(t);},[ctx,metric]);
 function makePrintLayout(){printLayout.current?.dispose();if(!page1.current||!page2.current)throw new Error('보고서 출력 영역을 확인해주세요.');const layout=paginateGrowthReport(page1.current,page2.current);printLayout.current=layout;return layout;}
 useEffect(()=>{const before=()=>{try{const layout=printLayout.current||makePrintLayout();layout.host.classList.add('report-print-host');layout.host.removeAttribute('aria-hidden');}catch(e:any){setError(e.message);}};const after=()=>{printLayout.current?.dispose();printLayout.current=null;};window.addEventListener('beforeprint',before);window.addEventListener('afterprint',after);return()=>{window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after);after();};},[ctx,analysis,home,signature,metric,reviewed]);
 async function generate(automatic=false){if(aiBusy||generationLock.current===version.current||!consent||automatic&&edited.current>0)return;if(!automatic&&(edited.current>0||aiMeta?.kind==='ai')&&!window.confirm('현재 작성 내용을 새 AI 초안으로 바꿀까요? 실패하면 기존 내용은 유지합니다.'))return;setAiBusy(true);setError('');const generation=version.current,editAtStart=edited.current;generationLock.current=generation;const c=new AbortController();controller.current=c;const timer=setTimeout(()=>c.abort('timeout'),52000);try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('로그인이 필요합니다.');const r=await fetch('/api/ai?action=growth-report',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({member_id:p.memberId,from,to,consent:true})});let out:any;try{out=await r.json();}catch{throw new Error(`서버 응답을 확인하지 못했어요. 기본 초안은 유지됩니다. (HTTP ${r.status})`);}if(!r.ok||!out.success)throw new Error(out.error||`보고서 생성에 실패했어요. (HTTP ${r.status})`);if(generation!==version.current||edited.current!==editAtStart)return;if(typeof out.analysis!=='string'||!out.analysis.trim()||typeof out.home!=='string'||!out.home.trim())throw new Error('AI 초안이 비어 있어 기본 초안을 유지했어요.');setAnalysis(out.analysis);setHome(out.home);setAiMeta({...out,kind:'ai'});setReviewed(false);}catch(e:any){if(generation===version.current&&edited.current===editAtStart){if(e.name!=='AbortError'||c.signal.reason==='timeout')setError(c.signal.reason==='timeout'?'AI 응답 대기 시간이 초과됐어요. 기본 초안은 유지됩니다. 다시 시도해주세요.':e.message||'AI 연결에 실패했어요. 기본 초안은 유지됩니다.');}}finally{clearTimeout(timer);if(generation===version.current){generationLock.current=null;setAiBusy(false);}}}
 function editText(field:'analysis'|'home',value:string){edited.current++;controller.current?.abort();setAiBusy(false);if(field==='analysis')setAnalysis(value);else setHome(value);setAiMeta({kind:'manual'});setReviewed(false);}
 useEffect(()=>{if(!ctx||!data||loading||!consent||data.notes.length<2)return;const key=p.memberId+':'+from+':'+to+':'+version.current;if(autoAttempt.current===key)return;const timer=setTimeout(()=>{if(autoAttempt.current===key)return;autoAttempt.current=key;void generate(true);},350);return()=>clearTimeout(timer);},[ctx,data,loading,consent,p.memberId,from,to]);
 function canExport(){if(!analysis.trim()||!home.trim()){setError('종합 분석과 가정 연계 가이드를 작성해주세요.');return false;}if(!reviewed){setError('실제 세션 기록과 사실관계를 최종 검토해주세요.');return false;}return true;}
 async function printableDocument(){await document.fonts.ready;await Promise.all([page1.current,page2.current].flatMap(el=>Array.from(el?.querySelectorAll('img')||[])).map(img=>img.decode?.().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
 async function download(){if(captureLock.current||!canExport())return;captureLock.current=true;setPdfBusy(true);setError('');let layout:ReportPagination|null=null;try{await printableDocument();if(!page1.current||!page2.current)throw new Error('출력 영역을 확인해주세요.');layout=paginateGrowthReport(page1.current,page2.current);const [{default:jsPDF},{default:html2canvas}]=await Promise.all([import('jspdf'),import('html2canvas')]);const pdf=new jsPDF('p','mm','a4');for(const [i,el]of layout.pages.entries()){const canvas=await html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,width:el.offsetWidth,height:el.offsetHeight});if(i)pdf.addPage();pdf.addImage(canvas.toDataURL('image/png'),'PNG',12,15,186,267,undefined,'FAST');}pdf.save(`${ctx.member.name}_성장종합보고서_${from}_${to}.pdf`);}catch(e:any){setError(e.message||'PDF 생성에 실패했습니다. 입력한 본문은 그대로 유지됩니다.');}finally{layout?.dispose();setPdfBusy(false);captureLock.current=false;}}
 async function printReport(){if(captureLock.current||!canExport())return;setError('');try{await printableDocument();makePrintLayout();window.print();}catch(e:any){setError(e.message||'인쇄 페이지 구성에 실패했습니다. 본문은 그대로 유지됩니다.');}}
 if(loading)return <div className="growth-report-loading" role="status">실제 세션 기록을 불러오고 있어요…</div>;
 if(!ctx||!data)return <div role="alert" className="growth-report-error">{error||'보고서 데이터를 확인하지 못했습니다.'}</div>;
 const donut=data.axes.filter(a=>a.count>0),dominant=data.summary.dominant,center=ctx.settings?.center_name||'위례아쿠수중운동센터',disabled=pdfBusy||aiBusy;
 return <div className={'growth-report-container report-v3870 report-v3915'+(capture?' report-exporting':'')}>
 <div className="growth-report-toolbar print-hide"><div><h1>성장 종합보고서</h1><p>{ctx.member.name} · {from} ~ {to} · v3.92.0</p></div><div className="report-toolbar-actions"><button onClick={printReport} disabled={disabled}>인쇄</button><button className="report-primary" onClick={download} disabled={disabled}>{pdfBusy?'PDF 생성 중…':'PDF 다운로드'}</button>{p.onClose&&<button onClick={p.onClose}>닫기</button>}</div></div>
 <section className="report-editor print-hide" aria-label="보고서 작성 및 검토"><div className="report-edit-grid"><label>종합 분석 <span>{analysis.length?`${analysis.length}자`:aiBusy?'AI 초안 작성 중…':'자동 초안 대기'}</span><textarea aria-label="종합 분석 수정" value={analysis} disabled={pdfBusy} onChange={e=>editText('analysis',e.target.value)} placeholder="실제 일지에서 AI 초안을 자동으로 불러와요. 생성 후 검토·수정해주세요."/></label><label>가정 연계 가이드 <span>{home.length?`${home.length}자`:aiBusy?'AI 초안 작성 중…':'자동 초안 대기'}</span><textarea aria-label="가정 연계 가이드 수정" value={home} disabled={pdfBusy} onChange={e=>editText('home',e.target.value)} placeholder="실제 관찰에 연결한 가정 안내 초안을 자동으로 불러와요."/></label></div>
 <p className="report-basis-note" role="status">{aiBusy?"AI가 종합 분석과 가정 연계 가이드 초안을 자동 작성하고 있어요…":analysis&&home?aiMeta?.kind==='ai'?"AI 초안이 채워졌습니다. 실제 기록과 대조해 검토해주세요.":aiMeta?.kind==='manual'?"직접 수정한 초안입니다. 자동 응답으로 덮어쓰지 않아요.":"활동 태그 집계 기반 기본 초안입니다. AI 개인화 전이며 담당자 검토가 필요해요.":"자동 초안은 실제 일지 2회 이상과 AI 연결이 필요합니다. 기록이 부족하거나 연결이 실패하면 관찰을 지어내지 않습니다."}</p><div className="report-editor-bottom"><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={disabled}/> 자동 AI 초안 사용 — 선택한 회원·기간의 가명 처리 일지를 외부 AI로 분석합니다.</label><button className="report-primary" disabled={disabled||!consent||data.notes.length<2} onClick={()=>generate(false)}>{aiBusy?'실제 일지 분석 중…':'실제 일지로 AI 분석 재생성'}</button></div>
 <div className="report-review-row"><label><input type="checkbox" aria-label="보고서 사실관계 최종 검토" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} disabled={disabled}/> 실제 기록·인용·가정 안내를 최종 검토했습니다.</label><select aria-label="담당 치료사" disabled={disabled} value={therapist} onChange={e=>setTherapist(e.target.value)}><option value="">담당 치료사 선택</option>{(ctx.staff||[]).map((s:any)=><option key={s.id} value={s.name}>{s.name}</option>)}</select><button onClick={()=>setSignOpen(true)} disabled={disabled}>{signature?'서명 다시 입력':'서명 입력'}</button>{signature&&<button onClick={()=>setSignature('')} disabled={disabled}>서명 지우기</button>}</div>
 <p className="report-basis-note">긴 분석·가정 안내는 원문을 줄이지 않고 A4 페이지를 자동 추가해 인쇄/PDF 저장합니다.</p><p className="report-basis-note">실제 관찰 일지 {data.notes.length}회 · 상위 활동 태그: {data.topTags.map(t=>`${t.tag} ${t.count}회`).join(' / ')||'기록 없음'}. {data.notes.length<2?'AI 개인화에는 서로 다른 세션의 실제 일지 2회 이상이 필요합니다. 직접 작성은 가능합니다.':''} 작성 내용은 이 화면의 초안이며 회원 DB에 자동 저장되지 않습니다.</p>{aiMeta?.kind==='ai'&&<p className="report-basis-note">AI는 실제 인용문 2건을 원문 대조했습니다. {aiMeta.coverage?.provided_notes}/{aiMeta.coverage?.notes}개 일지 제공 · {aiMeta.coverage?.selection}. 내용의 임상적 타당성은 담당자 검토가 필요합니다.</p>}
 {error&&<div role="alert" className="growth-report-error">{error}<button type="button" className="report-ai-retry" disabled={disabled||!consent||data.notes.length<2} onClick={()=>void generate(false)}>↻ AI 초안 재시도</button></div>}{overflow&&<p role="alert" className="growth-report-error">첫 페이지의 요약·차트 배치를 확인해주세요. 분석 본문은 길이에 따라 자동으로 추가 페이지에 배치합니다.</p>}
 </section>
 <div className="report-scroll" data-testid="report-scroll"><div className="growth-report-print">
 <section ref={page1} className="report-sheet report-page-one" data-page="1"><header className="report-header"><div><span className="report-eyebrow">AQU · INDIVIDUAL GROWTH</span><h1>성장 종합보고서</h1><p>{ctx.member.name} 회원 · {from} ~ {to}</p></div><div className="report-center"><b>{center}</b>{ctx.settings?.ceo_name&&<span>대표 {ctx.settings.ceo_name}</span>}{ctx.settings?.phone&&<span>{ctx.settings.phone}</span>}</div></header>
 <div className="report-kpis summary-section">{[['기록된 수업',data.summary.totalSessions,'회'],['수치 기록률',data.summary.measuredRatio,'%'],['출석 확인일',data.summary.attendanceDays,'일'],['주력 기록 축',dominant,''],['노쇼 기록',data.summary.noshow,'건']].map(([label,value,unit])=><div className="report-kpi" key={String(label)}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>)}</div>
 <section className="report-card chart-container report-radar"><div className="report-card-heading"><div><span className="report-eyebrow">SIX-AXIS PROFILE</span><h2>6축 활동 프로파일</h2></div><span>기간 내 실제 태그 기반</span></div>{data.axes.some(a=>a.value!==null)?<ResponsiveContainer width="100%" height={280}><RadarChart data={data.axes} outerRadius="72%"><PolarGrid stroke="#E2E8F0"/><PolarAngleAxis dataKey="label" tick={{fontSize:12,fill:'#334155'}}/><PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/><Radar dataKey="value" stroke="#0284C7" strokeWidth={2} fill="#0284C7" fillOpacity={.12} isAnimationActive={false}/><Tooltip formatter={(v:any)=>[`${v} / 100`,'상대 기록 비중']}/></RadarChart></ResponsiveContainer>:<div className="report-empty">해당 기간에 분류 가능한 활동 태그가 없습니다.</div>}<p className="report-chart-note">축별 활동 태그 횟수를 가장 많이 기록된 축=100으로 표시합니다. 능력 검사·발달 점수나 치료 효과가 아닙니다. 미기록 축을 임의 점수로 채우지 않습니다.</p></section>
 <section className="report-card chart-container report-donut"><div className="report-card-heading"><div><span className="report-eyebrow">ACTIVITY MIX</span><h2>활동량 분포</h2></div><span>태그 분류 횟수</span></div><div className="report-donut-grid"><div className="report-donut-canvas">{donut.length?<ResponsiveContainer width="100%" height={205}><PieChart><Pie data={donut} dataKey="count" nameKey="label" innerRadius={63} outerRadius={80} paddingAngle={3} stroke="none" isAnimationActive={false}>{donut.map(a=><Cell key={a.key} fill={a.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>:<div className="report-empty">분류 기록 없음</div>}</div><table className="report-legend"><thead><tr><th>영역</th><th>기록</th><th>비중</th></tr></thead><tbody>{data.axes.map(a=><tr key={a.key}><td><i style={{background:a.color}}/>{a.label}</td><td>{a.count}</td><td>{donut.reduce((n,a)=>n+a.count,0)?Math.round(a.count/donut.reduce((n,a)=>n+a.count,0)*100):0}%</td></tr>)}</tbody></table></div><p className="report-chart-note">한 활동 태그가 여러 영역에 해당하면 각 영역에 집계됩니다. 수업 시간 배분 비율과는 다릅니다.</p></section>
 <footer className="report-page-footer"><span>집계 범위: {from} ~ {ctx.effective_to} · 미래·삭제·취소·미실시 수업 제외</span><b>1 / 2</b></footer></section>
 <section ref={page2} className="report-sheet report-page-two" data-page="2"><header className="report-small-header"><b>{ctx.member.name} 회원 · 임상 관찰과 다음 걸음</b><span>{center}</span></header>
 <section className="report-card chart-container report-trend"><div className="report-card-heading"><div><span className="report-eyebrow">CUMULATIVE ACTIVITY RECORD</span><h2>{isCumulative?'쌓여가는 활동·경험 기록':'실측 지표 추이'}</h2></div><select className="print-hide" aria-label="성장 추이 지표" disabled={disabled} value={metric} onChange={e=>{setMetric(e.target.value);setHoverPoint(null);}}><option value="sessions">누적 활동·경험 기록</option><option value="activity">누적 활동 태그 기록</option>{data.available.map(m=><option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}</select></div>
 <p className="report-trend-label">{isCumulative?metric==='sessions'?'선택 기간 내 누적 일지 수 (회) — 기능 향상 점수가 아닙니다.':'선택 기간 내 누적 활동 태그 수 (건) — 능력·발달 지수가 아닙니다.':measureLabel+' · 실제 입력값, 구간별 평균'}</p>
 <div className="report-trend-summary" role="status" aria-label="추이 수치 요약"><span>{activePoint?.bucket||'기간 내 기록 없음'}</span><strong>{activePoint?isCumulative?`${Number(activePoint[trendKey]||0).toLocaleString()}${metric==='activity'?'건':'회'} 누적`:activePoint.value==null?'미측정':`${Number(activePoint.value).toLocaleString()} ${selectedMetric?.unit||''}`:'—'}</strong><small>{isCumulative&&activePoint?`해당 구간 ${metric==='activity'?activePoint.periodTags:activePoint.periodSessions}${metric==='activity'?'건':'회'} 추가`:'실측값은 실제 변화 방향을 그대로 표시합니다.'}</small></div>
 {trend.length?<div className="report-trend-canvas" onMouseMove={moveTrendSummary} onMouseLeave={()=>setHoverPoint(null)} onTouchMove={moveTrendSummary}><ResponsiveContainer width="100%" height={145}>{isCumulative?<AreaChart data={trend} margin={{top:8,right:12,bottom:0,left:-16}} onMouseMove={(e:any)=>{if(e?.activePayload?.[0]?.payload)setHoverPoint(e.activePayload[0].payload);}} onMouseLeave={()=>setHoverPoint(null)}><CartesianGrid stroke="#E2E8F0" vertical={false}/><XAxis dataKey="bucket" tick={{fontSize:9,fill:'#64748B'}} minTickGap={32} tickLine={false} axisLine={false}/><YAxis domain={[0,'auto']} allowDecimals={false} tick={{fontSize:9,fill:'#64748B'}} tickLine={false} axisLine={false}/><Area type="linear" dataKey={trendKey} stroke="#0284C7" strokeWidth={2.5} fill="#0284C7" fillOpacity={.12} dot={trend.length===1?{r:4}:false} activeDot={{r:4}} isAnimationActive={false}/></AreaChart>:<LineChart data={trend} margin={{top:8,right:12,bottom:0,left:-16}} onMouseMove={(e:any)=>{if(e?.activePayload?.[0]?.payload)setHoverPoint(e.activePayload[0].payload);}} onMouseLeave={()=>setHoverPoint(null)}><CartesianGrid stroke="#E2E8F0" vertical={false}/><XAxis dataKey="bucket" tick={{fontSize:9,fill:'#64748B'}} minTickGap={32} tickLine={false} axisLine={false}/><YAxis tick={{fontSize:9,fill:'#64748B'}} tickLine={false} axisLine={false}/><Line type="linear" dataKey="value" name={measureLabel} stroke="#0284C7" strokeWidth={2.5} dot={{r:3}} connectNulls={false} isAnimationActive={false}/></LineChart>}</ResponsiveContainer></div>:<div className="report-empty">추이를 표시할 실제 기록이 없습니다.</div>}
 <p className="report-chart-note">{isCumulative?'일지가 추가될 때만 기록이 누적됩니다. 기록 없는 날에 0으로 떨어뜨리거나 경험·기능 향상을 임의 계산하지 않습니다. 연간 그래프는 월별 누적입니다.':'선택 기간 밖 기록·미측정 구간을 임의 보간하지 않습니다. 실측값의 하락을 상승으로 바꾸지 않으며 입력 단위와 평가 기준을 담당자가 확인합니다.'}</p></section>
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

