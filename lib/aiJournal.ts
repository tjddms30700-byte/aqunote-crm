import {SOURCE_FIRST_RULES} from './journalOrderPrompt';
import {aquaticParentRules3908} from './aquaticJournalPrompt';
import {oralJournalPrompt} from './oralJournalPrompt';
export const JOURNAL_STYLES = [
 {value:'A',label:'🧸 수중감각통합형 (다정·공감)'},
 {value:'B',label:'🩺 수중재활형 (전문·정중)'},
 {value:'C',label:'🥄 연하·구강기능형 (전문·가이드)'}
] as const;
export const JOURNAL_PLACEHOLDER='진행한 순서대로 적어주세요. 활동·도구·좌우 차이·도움 정도·아이 발화·수치·마무리를 빠짐없이 입력하면 그 순서를 유지해요.';
export const STANDARD_TAGS=['물 적응·호흡 조절','숨 참기·잠수 놀이','균형 잡기 훈련','코어 안정화 운동','과제 집중력 훈련','수중보행','관절가동 훈련','감각통합','고유수용감각 활동','전정감각 자극','도수이완','보행교정','충격파케어','소근육 조작 활동','의사소통·상호작용','또래 순서·협동 활동','호흡 조절','근력 강화 운동','스트레칭·유연성 개선','작업치료/연하재활 · 구강기능','작업치료/연하재활 · 연하 반사'];
export type JournalResult={tags:string[];parent_message:string;clinical_record:string;session_components?:{kind:string;duration_minutes:number|null}[]};
export const JOURNAL_SCHEMA={type:'object',additionalProperties:false,properties:{tags:{type:'array',items:{type:'string'}},parent_message:{type:'string'},clinical_record:{type:'string'}},required:['tags','parent_message','clinical_record']};
// 모델 출력 계약은 화면/DB 계약과 분리한다. S/O/A/P를 문자열에서 추측하지 않는다.
export const JOURNAL_GENERATION_SCHEMA={
 type:'object',additionalProperties:false,
 properties:{
  tags:{type:'array',minItems:1,maxItems:7,items:{type:'string'}},
  parent_message:{type:'string'},
  clinical_record:{type:'object',additionalProperties:false,
   properties:{S:{type:'string'},O:{type:'string'},A:{type:'string'},P:{type:'string'}},
   required:['S','O','A','P']}
 },required:['tags','parent_message','clinical_record']
};
export class JournalFormatError extends Error {
 code:string;
 constructor(code:string,message:string){super(message);this.name='JournalFormatError';this.code=code;}
}
function formatError(code:string,message:string):never{throw new JournalFormatError(code,message);}
export function normalizeSoap(value:unknown):string{
 let sections:string[]=[];
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const o=value as Record<string,unknown>;
  if(!['S','O','A','P'].every(k=>typeof o[k]==='string'&&(o[k] as string).trim()))formatError('AI_FORMAT_SOAP','SOAP의 S/O/A/P 항목이 누락되었습니다. 초안을 저장하지 않았습니다.');
  sections=['S','O','A','P'].map(k=>String(o[k]));
 }else if(typeof value==='string'){
  let t=value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if(!t.includes('\n')&&t.includes('\\n'))t=t.replace(/\\n/g,'\n');
  // 표제 장식과 줄바꿈만 정리한다. 누락된 임상 내용이나 측정치는 만들지 않는다.
  const re=/(?:^|\n)[ \t]*(?:#{1,3}[ \t]*)?(?:\*\*)?([SOAP])(?:[ \t]*[（(][^\n)）]*[)）])?[ \t]*(?:\*\*)?[ \t]*[:：][ \t]*(?:\*\*)?[ \t]*/g;
  const m=Array.from(t.matchAll(re));
  if(m.length!==4||m.map(x=>x[1]).join('')!=='SOAP'||t.slice(0,m[0]?.index||0).trim())formatError('AI_FORMAT_SOAP','SOAP의 S/O/A/P 네 항목을 확인하지 못했습니다. 메모는 유지됩니다.');
  sections=m.map((h,i)=>t.slice((h.index||0)+h[0].length,i<3?m[i+1].index:t.length));
 }else formatError('AI_FORMAT_SOAP','AI의 임상 기록 항목이 없거나 올바른 텍스트가 아닙니다.');
 sections=sections.map(v=>v.replace(/\s*\n\s*/g,' ').trim());
 if(sections.some(v=>!v))formatError('AI_FORMAT_SOAP','SOAP 중 내용이 비어 있는 항목이 있습니다. 사실 확인 후 다시 작성해주세요.');
 const out=sections.map((v,i)=>`${'SOAP'[i]}: ${v}`).join('\n');
 if(out.length>10000)formatError('AI_FORMAT_LENGTH','임상 기록이 너무 깁니다. 메모를 나눠 작성해주세요.');
 return out;
}
export function validateJournal(value:unknown):JournalResult{
 if(!value||typeof value!=='object'||Array.isArray(value))formatError('AI_FORMAT_OBJECT','AI 응답을 일지 객체로 확인하지 못했습니다.');
 const x=value as Record<string,unknown>;
 if(!Array.isArray(x.tags)||x.tags.length>30||x.tags.some(t=>typeof t!=='string'))formatError('AI_FORMAT_TAGS','AI 활동 태그 형식을 확인하지 못했습니다.');
 const tags=Array.from(new Set((x.tags as string[]).map(t=>t.trim().replace(/^#+\s*/,'' )).filter(Boolean)));
 if(!tags.length||tags.length>7||tags.some(t=>t.length>60))formatError('AI_FORMAT_TAGS','활동 태그는 중복 없이 1~7개의 짧은 텍스트여야 합니다.');
 if(typeof x.parent_message!=='string'||!x.parent_message.trim())formatError('AI_FORMAT_PARENT','AI가 학부모 안내문을 반환하지 않았습니다. 메모는 유지됩니다.');
 const parent=x.parent_message.replace(/\r\n?/g,'\n').trim();
 if(parent.length>100000)formatError('AI_FORMAT_LENGTH','카톡이 기술적 저장 상한 100,000자를 초과했습니다. 내용을 자르거나 기본 초안으로 바꾸지 않았습니다.');
 return {tags,parent_message:parent,clinical_record:normalizeSoap(x.clinical_record),...(Array.isArray(x.session_components)?{session_components:x.session_components as {kind:string;duration_minutes:number|null}[]}:{})};
}
function decodeJournalJson(text:unknown):unknown{
 if(typeof text!=='string'||!text.trim())formatError('AI_EMPTY_RESPONSE','AI가 답변 텍스트를 반환하지 않았습니다. 메모는 유지됩니다.');
 let t=(text as string).replace(/^\uFEFF/,'').trim();
 const fence=t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);if(fence)t=fence[1].trim();
 try{return JSON.parse(t);}catch{formatError('AI_JSON_PARSE','AI 답변의 JSON이 불완전합니다. 메모는 유지됩니다.');}
}
export function parseJournalResponse(text:unknown):JournalResult{
 return validateJournal(decodeJournalJson(text));
}
export function parseGeneratedJournalResponse(text:unknown):JournalResult{
 const value=decodeJournalJson(text);
 if(!value||typeof value!=='object'||Array.isArray(value))formatError('AI_GENERATION_SCHEMA','AI가 정해진 일지 데이터 구조를 반환하지 않았습니다. 초안을 저장하지 않았습니다.');
 const x=value as Record<string,unknown>,soap=x.clinical_record;
 if(!soap||typeof soap!=='object'||Array.isArray(soap))formatError('AI_GENERATION_SCHEMA','AI가 S/O/A/P 분리 필드 대신 다른 형식을 반환했습니다. 초안을 저장하지 않았습니다.');
 const o=soap as Record<string,unknown>;
 const absent=['S','O','A','P'].filter(k=>typeof o[k]!=='string'||!(o[k] as string).trim());
 if(absent.length)formatError('AI_SOAP_FIELDS_MISSING',`AI 임상 기록의 ${absent.join('/')} 내용이 비어 있습니다. 임의로 채우지 않고 저장을 중단했습니다.`);
 // 객체 경로만 사용해 정규식 없이 4줄 SOAP를 만든다. 임상 내용은 생성/추측하지 않는다.
 return validateJournal(value);
}
export function hasBatchim(name:string){const c=Array.from(name.trim()).at(-1)||'';const n=c.charCodeAt(0)-0xAC00;return n>=0&&n<11172?n%28!==0:false;}
export function withJosa(name:string,pair:'이가'|'은는'|'을를'){const parts={이가:['이','가'],은는:['은','는'],을를:['을','를']};return name+parts[pair][hasBatchim(name)?0:1];}
export function friendlyName(name:string){let n=name.trim();const clean=n.replace(/[A-Z]$/,'');if(/^[가-힣]{3,5}$/.test(clean)){n=/^(남궁|황보|제갈|선우|독고|서문|사공)/.test(clean)?clean.slice(2):clean.slice(1);}return n+(hasBatchim(n)?'이':'');}
export function personalizeJournal(text:string,name:string){const full=name.trim(),friendly=friendlyName(full);const t=text.replace(/\{회원명\}|\{회원이름\}/g,'회원이름').replace(/\{친근이름\}/g,'친근이름');return t.replace(/(친근이름|회원이름)(이\/가|은\/는|을\/를|이는|이가|이를|이|가|은|는|을|를)?/g,(_,key,particle)=>{const n=key==='친근이름'?friendly:full;if(!particle)return n;const pair=particle==='이/가'||particle==='이'||particle==='가'||particle==='이가'?'이가':particle==='을/를'||particle==='을'||particle==='를'||particle==='이를'?'을를':'은는';return withJosa(n,pair);});}
export const CLINICAL_THEMES={sensory:['전정','고유수용','촉각','감각 조절','각성 수준'],motor:['운동 기획','Motor Planning','코어','체간','둔근','대퇴','자세 조절'],breathing:['비강','날숨','호기','흉곽','복부','호흡'],aquatic:['부력','정수압','유체 저항','물의 저항','추진','발차기']} as const;
export function messageThemeCount(text:string){return Object.values(CLINICAL_THEMES).filter(words=>words.some(w=>text.toLowerCase().includes(w.toLowerCase()))).length;}
// Parent-message formatting only: never change clinical SOAP or stored source memo.
export function narrativeParentMessage(text:string,name:string,child:boolean){
 let t=text.replace(/\r\n?/g,'\n');
 if(child)t=t.replace(/회원이름|\{회원명\}|\{회원이름\}/g,'친근이름');else t=t.replace(/친근이름/g,'회원이름');
 t=personalizeJournal(t,name);
 const full=name.trim(),nick=friendlyName(full);
 if(child&&full&&nick!==full){const escaped=full.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('(^|[^가-힣A-Za-z0-9])'+escaped+'(이/가|은/는|을/를|이는|이가|이를|은|는|이|가|을|를|의|아|야)?(?=$|[^가-힣A-Za-z0-9])','g');
  t=t.replace(pattern,(_,before,particle)=>{if(!particle)return before+nick;if(particle==='의')return before+nick+'의';if(particle==='아'||particle==='야'){const given=nick.endsWith('이')?nick.slice(0,-1):nick;return before+given+(hasBatchim(given)?'아':'야');}const pair=particle==='은/는'||particle==='은'||particle==='는'||particle==='이는'?'은는':particle==='을/를'||particle==='을'||particle==='를'||particle==='이를'?'을를':'이가';return before+withJosa(nick,pair);});
 }
 t=t.replace(/^[ \t]*(?:#{1,4}[ \t]*)?(?:[🌱🔄🤍📌💡🏠✨\uFE0F][ \t]*)*(?:\*\*)?(?:오늘의?[ \t]*관찰[ \t]*포인트|앞으로[ \t]*(?:함께[ \t]*)?도와줄[ \t]*(?:부분|점)|가정[ \t]*연계(?:[ \t]*(?:활동|안내|홈티))?)(?:\*\*)?[ \t]*(?:(?:[:：])[ \t]*|$)/gm,'');
 return t.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n').trim();
}
export function finalizeParentMessage(text:string,name:string,style:'A'|'B'|'C',child:boolean=true){let t=narrativeParentMessage(text,name,child);if(style==='B')t=t.replace(/\p{Extended_Pictographic}[\uFE0F\u200D]?/gu,'').replace(/[:;]\s*[-~]?\s*[)(]|\^\^/g,'');return t.replace(/[\p{Regional_Indicator}\uFE0F\u200D\u20E3]/gu,style==='B'?'':'$&').replace(/\r\n?/g,'\n').trim();}
export function journalPrompt(style:'A'|'B'|'C',track:string,child:boolean){return SOURCE_FIRST_RULES+`

[대상과 말투]
실제 담당자가 최종 검토할 알림장과 SOAP 초안이다. ${child?"성은 빼고 친근이름을 사용한다.":"회원이름 회원님으로 정중하게 부른다."} ${style==='A'?'다정한 감각통합 문체':style==='B'?'정중하고 이해하기 쉬운 수중재활 문체':'구강·연하 관찰을 신중히 설명하는 문체'}를 쓴다. 원문 문장 그대로 복사하는 데 그치지 않고 자연스러운 사실 서술과 전문적 설명 2~3문장으로 충분히 풀어 쓴다. 길어졌다는 이유로 활동을 생략하지 않는다.
[추가 내용의 구분]
오늘 실제 관찰은 paragraph, 근거 있는 기능 설명과 다음에 살펴볼 방향은 clinical_meaning, 앞으로 해볼 부모 반응 말과 낮은 부담의 가정 연계는 home_coaching에 둔다. 새로 제안한 다음 방향은 확정 치료 계획/이미 수행한 활동이 아니다. 부모에게 제안한 칭찬 멘트는 아이가 실제 말한 발화와 구분한다. 비교 호전은 의무가 아니며 미기록 성공·도구·수치를 생성하지 않는다.
[내부 SOAP]
S는 실제 주관적 호소·발화, O는 실제 관찰·측정, A는 신중한 임상적 해석과 한계, P는 다음 관찰 방향/가정 코칭 제안과 실제 합의 계획을 구분한다. 카톡에 붙인 일반 기능 설명을 실제 측정 성과로 O에 옮기지 않는다. 계획/목표를 수행 결과로 바꾸지 않는다.
[안전]
통증·사레·호흡 변화·의식 변화·명시적 금기를 삭제하거나 긍정적 성과로 바꾸지 않는다. 무감독 물놀이·잠수·숨참기·강한 압박·도수 조작·구강/연하 가정 실습·통증 참기·약물 처방을 새로 권하지 않는다. 연하 식이 질감·자세·횟수·도구 압력을 임의 처방하지 않는다. 해당 제한이 있으면 편안한 의사소통/칭찬 멘트와 담당자 개별 계획 확인에 초점을 둔다.
[태그]
오늘 실제 활동만 1~7개를 선택한다. 임상 기능 설명·다음 계획·새 가정 제안으로 오늘 활동 태그를 늘리지 않는다. 표준 태그: ${STANDARD_TAGS.join(', ')}.
JSON에는 tags, ordered_units(index, paragraph, clinical_meaning), home_coaching, clinical_record(S/O/A/P 객체)를 반환한다. 설명을 확장하되 교구·실제 수행·발화·수치·도움 조건과 순서는 원문에 근거해야 한다.`;}
