// Facts and order are validated separately from the expanded professional narrative.
// Never substitute the original source for generated text because wording or length differs.
import {JOURNAL_GENERATION_SCHEMA,JournalFormatError,parseGeneratedJournalResponse,type JournalResult} from './aiJournal';
export {SOURCE_FIRST_RULES} from './journalOrderPrompt';
export const ORDERED_JOURNAL_SCHEMA={type:'object',additionalProperties:false,properties:{tags:JOURNAL_GENERATION_SCHEMA.properties.tags,ordered_units:{type:'array',minItems:1,maxItems:80,items:{type:'object',additionalProperties:false,properties:{index:{type:'integer'},paragraph:{type:'string'},clinical_meaning:{type:'string'}},required:['index','paragraph','clinical_meaning']}},home_coaching:{type:'string'},clinical_record:JOURNAL_GENERATION_SCHEMA.properties.clinical_record},required:['tags','ordered_units','home_coaching','clinical_record']};
export type MemoUnit={index:number;text:string};
export function memoUnits(raw:string):MemoUnit[]{const parts=raw.replace(/\r\n?/g,'\n').split(/\n[ \t]*\n+/).filter(x=>x.trim());if(parts.length>80)throw new JournalFormatError('AI_MEMO_UNITS','입력 문단이 80개를 초과합니다. 원문은 유지됩니다.');return parts.map((text,index)=>({index,text}));}
export function correctMemoTypos(text:string){return text.replace(/주숭재활/g,'수중재활').replace(/이가에게/g,'이에게');}
const compact=(t:string)=>t.normalize('NFC').replace(/\s+/g,'');
const nums=(t:string):string[]=>t.match(/[+-]?\d+(?:[.,]\d+)*/g)||[];
const quotes=(t:string)=>Array.from(t.matchAll(/["“]([^"”]+)["”]/g),x=>x[1]);
// Concrete anchor checks catch common omissions; they are not a claim of complete semantic verification.
const FACT_ANCHORS=['발차기','팔 젓기','오른팔','왼팔','감각패드','퍼즐','탑 쌓기','마리오','돌고래','튜브','바다동물','바구니','분류','잠수','양손','물안경 없이','머리 감기','샤워','재도전'];
const ALIASES:Record<string,string[]>={'팔 젓기':['팔을 젓','팔 젓기','팔젓기'],'탑 쌓기':['탑을 쌓','탑 쌓기','탑쌓기'],'분류':['분류','나누어 담','구분해','종류별'],'양손':['양손','두 손'],'물안경 없이':['물안경 없이','물안경을 쓰지 않','물안경도 없이'],'머리 감기':['머리 감기','머리를 감','머리도 감'],'재도전':['재도전','다시 시도','다시 해']};
function anchorPosition(text:string,anchor:string){const found=(ALIASES[anchor]||[anchor]).map(a=>compact(text).indexOf(compact(a))).filter(i=>i>=0);return found.length?Math.min(...found):-1;}
function sentenceCount(t:string){return t.trim()?t.split(/(?<=[.!?。])\s+|\n+/).filter(x=>x.trim()).length:0;}
function fail(code:string,message:string):never{throw new JournalFormatError(code,message+' 원문과 기존 초안은 유지되며, 기본 문구로 되돌리지 않았어요.');}
export function reconstructOrderedParent(value:any,units:MemoUnit[],home:unknown=''){
 if(!Array.isArray(value)||value.length!==units.length)fail('AI_ACTIVITY_OMISSION','AI 응답의 활동 단위 개수가 입력과 다릅니다.');
 const warnings:string[]=[];const paragraphs=value.map((v:any,i:number)=>{if(!v||v.index!==units[i].index)fail('AI_ACTIVITY_ORDER','활동 단위 순서가 입력과 다릅니다.');if(typeof v.paragraph!=='string'||!v.paragraph.trim()||typeof v.clinical_meaning!=='string')fail('AI_ACTIVITY_FORMAT','활동별 설명 형식이 올바르지 않습니다.');
 const source=correctMemoTypos(units[i].text),fact=v.paragraph,meaning=v.clinical_meaning;
 for(const n of nums(source))if(!nums(fact).includes(n))fail('AI_FACT_OMISSION','입력한 수치가 해당 활동 문단에 반영되지 않았습니다.');
 for(const measure of source.matchAll(/[+-]?\d+(?:\.\d+)?\s*(?:시간|cm|mm|kg|초|분|회|개|단|점|m|도|g)/g))if(!compact(fact).includes(compact(measure[0])))fail('AI_MEASURE_CHANGED','입력한 측정값의 수치/단위가 해당 활동 문단에서 바뀌었습니다.');
 for(const q of quotes(source))if(!compact(fact).includes(compact(q)))fail('AI_QUOTE_OMISSION','아이의 실제 발화가 해당 활동에서 누락되거나 바뀌었습니다.');
 const found=FACT_ANCHORS.filter(a=>compact(source).includes(compact(a)));let prev=-1;
 for(const anchor of found.sort((a,b)=>compact(source).indexOf(compact(a))-compact(source).indexOf(compact(b)))){const index=anchorPosition(fact,anchor);if(index<0){if(ALIASES[anchor]){warnings.push(`${i+1}번째 활동의 '${anchor}'이 다른 표현으로 풀렸는지 확인해주세요. 생성문은 유지했어요.`);continue;}fail('AI_FACT_OMISSION','입력한 활동·교구·도움 조건의 핵심 표현이 누락되었습니다.');}if(index<prev)fail('AI_ACTIVITY_ORDER','한 문단 안의 활동 순서가 입력과 다릅니다.');prev=index;}
 const sourceNumbers=new Set(units.flatMap(u=>nums(u.text)));for(const n of nums(fact+' '+meaning))if(!sourceNumbers.has(n))fail('AI_FACT_INVENTED','입력하지 않은 숫자가 활동 설명에 추가되었습니다.');
 if(/완치|치료 효과가 입증|반드시 (?:좋아|향상)|확실히 (?:향상|개선)/.test(fact+' '+meaning))fail('AI_EFFECT_ASSERTION','근거 없는 치료 효과 단정이 포함되어 있습니다.');
 const count=sentenceCount(meaning);if(found.length&&count<2)warnings.push(`${i+1}번째 활동의 전문 설명이 짧아요. 2~3문장인지 검토해주세요.`);
 return fact+(meaning?'\n\n'+meaning:'');});
 if(home!==undefined&&typeof home!=='string')fail('AI_HOME_FORMAT','가정 코칭 형식을 확인해주세요.');
 const parent=paragraphs.join('\n\n')+(typeof home==='string'&&home?'\n\n'+home:'');
 if(parent.length>100000)fail('AI_FORMAT_LENGTH','카톡이 기술적 저장 상한 100,000자를 초과했습니다. 자동으로 자르거나 원문으로 대체하지 않았습니다.');
 return {parent,fallback:0,warnings};
}
export function parseOrderedJournal(text:string,units:MemoUnit[]):JournalResult & {source_coverage:{units:number;restored_paragraphs:number;mode:string};expansion_warnings:string[]}{let x:any;try{x=JSON.parse(text.replace(/^\uFEFF/,'').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw new JournalFormatError('AI_JSON_PARSE','AI 답변 형식을 읽지 못했습니다. 원문과 기존 초안은 유지됩니다.');}const assembled=reconstructOrderedParent(x?.ordered_units,units,x?.home_coaching);const result=parseGeneratedJournalResponse(JSON.stringify({...x,parent_message:assembled.parent}));return {...result,source_coverage:{units:units.length,restored_paragraphs:0,mode:'fact-fixed-professional-expansion'},expansion_warnings:assembled.warnings};}
