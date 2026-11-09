export const CLINICAL_METRICS=[
 {key:'rpe_borg',label:'Borg 자각운동강도',unit:'6–20',min:6,max:20,step:1},
 {key:'breath_hold_sec',label:'호흡 유지',unit:'초',min:0,max:100000,step:0.1},
 {key:'gait_distance_m',label:'보행 거리',unit:'m',min:0,max:100000,step:0.1},
 {key:'mmt_score',label:'MMT 근력',unit:'0–5',min:0,max:5,step:0.5},
 {key:'rom_angle',label:'ROM 관절각도',unit:'°',min:0,max:180,step:1},
 {key:'berg_score',label:'센터 균형 관찰',unit:'기존 0–4 척도',min:0,max:4,step:0.5}
] as const;
export type ClinicalMetricKey=typeof CLINICAL_METRICS[number]['key'];
export function clinicalMetrics(values:Record<string,any>,previous:Record<string,any>={}):Record<string,number|null>{const out:Record<string,number|null>={};if(Object.keys(values).some(k=>!CLINICAL_METRICS.some(f=>f.key===k)))throw new Error('허용되지 않은 정밀 수치 항목입니다.');for(const field of CLINICAL_METRICS){const raw=values[field.key];if(raw==null||String(raw).trim()===''){if(previous[field.key]!=null)out[field.key]=null;continue;}if(typeof raw!=='number'&&typeof raw!=='string')throw new Error(`${field.label}는 직접 측정한 숫자로 입력해주세요.`);const n=Number(raw);if(!Number.isFinite(n)||n<field.min||n>field.max)throw new Error(`${field.label} 범위(${field.min}~${field.max})를 확인해주세요.`);out[field.key]=n;}return out;}
export function formatClinicalMetrics(values:Record<string,any>):string{return CLINICAL_METRICS.filter(f=>values[f.key]!=null).map(f=>`${f.label}: ${values[f.key]} (${f.unit})`).join('\n');}
export function clinicalTags(row:any):string[]{const source=Array.isArray(row?.activities)?row.activities:Array.isArray(row?.labels)?row.labels:Array.isArray(row?.tags)?row.tags:[];return [...new Set<string>(source.filter((v:any)=>typeof v==='string'&&!v.startsWith('status:')))];}
export function clinicalDay(row:any):string{return String(row?.session_date||row?.date||'').slice(0,10);}
export function clinicalSummaryLine(row:any):string{return String(row?.notes_short||row?.ai_source_memo||row?.memo||row?.notes||row?.kakao_draft||'요약 미기록').replace(/\s+/g,' ').trim();}
