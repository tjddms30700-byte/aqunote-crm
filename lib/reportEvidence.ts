import {reportRecordText} from './reportRecords';
export type GrowthEvidence={id:string;date:string;note:string;tags:string[];source_count:number;source_ids:string[];date_to:string;summarized:boolean};
export function reportParagraphs(text:string):string{
 const lines=String(text||'').replace(/\r\n?/g,'\n').split(/(\n[ \t]*\n+)/);let out='';
 for(let i=0;i<lines.length;i++){const part=lines[i];if(/^\n/.test(part)){const complete=/[.!?。！？]["”’')\]]*$/.test(out.trimEnd());out=out.trimEnd()+(complete?'\n\n':' ');}else out+=part.replace(/\n[ \t]*/g,' ');}
 return out.trim();
}
function excerpt(text:string,budget:number):string{
 if(text.length<=budget)return text;
 const sentences=text.match(/[^.!?。！？]+(?:[.!?。！？]+["”’')\]]*|$)/g)?.map(s=>s.trim()).filter(Boolean)||[text];
 if(!sentences.some(s=>s.length<=budget))return text.slice(0,Math.max(20,budget-12))+' [원문 발췌 끝]';
 const chosen=new Set<number>();let size=0;const order=[0,Math.floor(sentences.length/2),sentences.length-1,...sentences.map((_,i)=>i)];
 for(const i of order){if(chosen.has(i))continue;const value=sentences[i];if(size+value.length<=budget){chosen.add(i);size+=value.length;}}
 return [...chosen].sort((a,b)=>a-b).map((i,n,arr)=>(n&&i>arr[n-1]+1?'[중간 원문 생략] ':'')+sentences[i]).join(' ');
}
export function allReportEvidence(notes:any[],memberName:string,maxGroups=200):GrowthEvidence[]{
 const redact=(x:string)=>(memberName?x.split(memberName).join('회원'):x).replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,'[연락처 제외]').replace(/\b\d{6}[-\s]?[1-8]\d{6}\b/g,'[민감정보 제외]');
 const count=Math.min(maxGroups,notes.length);if(!count)return [];
 const budget=Math.max(600,Math.floor(150000/count));const result:GrowthEvidence[]=[];
 for(let i=0;i<count;i++){
  const group=notes.slice(Math.floor(i*notes.length/count),Math.floor((i+1)*notes.length/count));const source=group.map((s,n)=>String(s.record_key||s.legacy_key||s.id||`source-${i}-${n}`));
  const tagCounts=new Map<string,number>();for(const row of group){const tags=[row.activity_tags,row.tags,row.activities,row.labels].find(x=>Array.isArray(x)&&x.length)||[];for(const tag of tags)if(typeof tag==='string')tagCounts.set(redact(tag),(tagCounts.get(redact(tag))||0)+1);}
  const tags=[...tagCounts.keys()];let note='';let summarized=group.length>1;
  if(group.length===1){const raw=reportParagraphs(redact(reportRecordText(group[0])));note=excerpt(raw,budget);summarized=note!==raw;}
  else{
   const samples=group.map((_,n)=>n);
   const stats=[...tagCounts].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([t,n])=>`${t} ${n}건`).join(', ');
   note=`이 기간 ${group.length}개 일지 전체의 활동 태그 집계: ${stats||'태그 없음'}. 태그는 수행 성공이나 향상 점수가 아님. 다음은 이 구간 모든 일지 각각의 핵심 원문 발췌이며 발췌 밖 상세 반응은 추론하지 말 것.\n`+samples.map((n,j)=>`발췌${j+1}: `+excerpt(reportParagraphs(redact(reportRecordText(group[n]))),Math.max(100,Math.floor(budget/samples.length)))).join('\n');
  }
  result.push({id:`E${i+1}`,date:String(group[0].session_date||group[0].date||'').slice(0,10),date_to:String(group.at(-1).session_date||group.at(-1).date||'').slice(0,10),note,tags:tags.slice(0,20),source_count:group.length,source_ids:source,summarized});
 }
 return result;
}
