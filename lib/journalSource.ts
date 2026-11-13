// Immutable source units, deterministic coverage checks and conservative spelling correction.
import {JOURNAL_GENERATION_SCHEMA,JournalFormatError,parseGeneratedJournalResponse,type JournalResult} from './aiJournal';
export {SOURCE_FIRST_RULES} from './journalOrderPrompt';
export const ORDERED_JOURNAL_SCHEMA={type:'object',additionalProperties:false,properties:{tags:JOURNAL_GENERATION_SCHEMA.properties.tags,ordered_units:{type:'array',minItems:1,maxItems:80,items:{type:'object',additionalProperties:false,properties:{index:{type:'integer'},paragraph:{type:'string'},clinical_meaning:{type:'string'}},required:['index','paragraph','clinical_meaning']}},clinical_record:JOURNAL_GENERATION_SCHEMA.properties.clinical_record},required:['tags','ordered_units','clinical_record']};
export type MemoUnit={index:number;text:string};
export function memoUnits(raw:string):MemoUnit[]{const parts=raw.replace(/\r\n?/g,'\n').split(/\n[ \t]*\n+/).filter(x=>x.trim());if(parts.length>80)throw new JournalFormatError('AI_MEMO_UNITS','원문 문단이 80개를 초과합니다. 원문은 유지되며 메모를 나누어 생성해주세요.');return parts.map((text,index)=>({index,text}));}
export function correctMemoTypos(text:string){return text.replace(/주숭재활/g,'수중재활').replace(/이가에게/g,'이에게');}
function exactContent(text:string){return correctMemoTypos(text).normalize('NFC').replace(/[\s，,。.!！?？:：;；“”"‘’'()（）]/g,'');}
function numbers(text:string){return text.match(/[+-]?\d+(?:[.,]\d+)*/g)||[];}
function quotes(text:string){return Array.from(text.matchAll(/["“]([^"”]+)["”]/g),x=>x[1]);}
export function reconstructOrderedParent(value:any,units:MemoUnit[]){
 if(!Array.isArray(value)||value.length!==units.length)throw new JournalFormatError('AI_ACTIVITY_OMISSION','입력 문단의 개수와 AI 응답이 달라 누락 가능성이 있습니다. 원문과 기존 초안을 유지했어요. 다시 생성하거나 직접 작성해주세요.');
 let fallback=0;const paragraphs=value.map((v:any,i:number)=>{if(!v||v.index!==units[i].index)throw new JournalFormatError('AI_ACTIVITY_ORDER','AI가 입력 활동의 순서를 바꾸었습니다. 해당 응답은 적용하지 않았으며 원문과 기존 초안은 유지됩니다.');if(typeof v.paragraph!=='string'||!v.paragraph.trim()||typeof v.clinical_meaning!=='string')throw new JournalFormatError('AI_ACTIVITY_FORMAT','원문별 문단 형식이 올바르지 않습니다. 원문은 유지됩니다.');
 const source=correctMemoTypos(units[i].text),candidate=correctMemoTypos(v.paragraph);const same=exactContent(source)===exactContent(candidate)&&JSON.stringify(numbers(source))===JSON.stringify(numbers(candidate))&&JSON.stringify(quotes(source))===JSON.stringify(quotes(candidate));if(!same)fallback++;
 let meaning=v.clinical_meaning.trim();if(meaning.length>220||/\r|\n|[0-9]|["“”]|부력|정수압|물의 저항|완치|치료 효과|발달을 시사|촉진시|판단됩니다/.test(meaning))meaning='';
 return (same?candidate:source)+(meaning?'\n'+meaning:'');});
 const parent=paragraphs.join('\n\n');if(parent.length>8000)throw new JournalFormatError('AI_FORMAT_LENGTH','원문을 누락하지 않고 담기에는 카톡 분량이 큽니다. 자동으로 자르지 않았으며 메모를 나누어 생성해주세요.');return {parent,fallback};
}
export function parseOrderedJournal(text:string,units:MemoUnit[]):JournalResult & {source_coverage:{units:number;restored_paragraphs:number}}{let x:any;try{x=JSON.parse(text.replace(/^\uFEFF/,'').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw new JournalFormatError('AI_JSON_PARSE','AI 답변 형식을 읽지 못했습니다. 원문은 유지됩니다.');}const assembled=reconstructOrderedParent(x?.ordered_units,units);const result=parseGeneratedJournalResponse(JSON.stringify({...x,parent_message:assembled.parent}));return {...result,source_coverage:{units:units.length,restored_paragraphs:assembled.fallback}};}
