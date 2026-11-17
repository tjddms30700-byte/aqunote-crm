import {textValue} from './reportText';
export type ReportRecordKind='clinical'|'administrative'|'empty'|'review';
/** Content categories are report evidence hints, never attendance decisions or record deletions. */
export function reportRecordText(row:any):string{
 return ['notes','soap_note','clinical_record','memo','notes_short','raw_memo','ai_source_memo','kakao_draft','parent_message','parentMessage','kakao','kakao_message','kakao_text','soapNote','rawMemo','raw_memo_text','source_memo','ai_parent_message','soap_text','original_memo','comment','content','text','raw_text','raw','description','summary','soap'].map(k=>textValue(row?.[k])).filter((v,i,a)=>!!v&&a.indexOf(v)===i).join('\n');
}
export function reportRecordKind(row:any):ReportRecordKind{
 const original=reportRecordText(row),text=original.replace(/\[자동 태그\][^\[]*/g,'').replace(/\[보호자 메시지\]/g,'').trim();
 if(['administrative','contact','cancellation','scheduling'].includes(String(row?.record_kind||row?.note_kind||'')))return 'administrative';
 if(['breath_hold_sec','gait_distance_m','rom_angle','mmt_score','berg_score'].some(k=>row?.[k]!==null&&row?.[k]!==undefined&&row?.[k]!==''&&Number.isFinite(Number(row[k]))&&Number(row[k])>=0))return 'clinical';
 if(!text||/^(요약\s*미기록|미기록|기록\s*없음)[.!\s]*$/.test(text))return 'empty';
 // Do not infer a treatment session from auto-tags or a short acknowledgement.
 const activity=/발차기|균형|잠수|수중|수영|부력|보행|근력|상호작용|감각|호흡|체간|관절|구강|연하|활동|놀이|훈련|튜브|아쿠아봉|킥판|장난감|교구|자세|쌓기|던지기|협응|발음|선택/;
 const observation=/진행|수행|연습|보였|관찰|유지|시도|참여|표현|했|하였|완료|성공|움직|수업/;
 const soap=/\bO\s*[:：]\s*(?!미기록|기록\s*없음)/.test(text);
 if((soap&&text.length>=35)||(text.length>=80&&activity.test(text)&&observation.test(text))||(text.length>=8&&activity.test(text)&&/유지|관찰|도움|수행|시도|연습/.test(text)&&!/(예약|일정|취소|결석|입금|송금)/.test(text)))return 'clinical';
 if(text.length<180&&/일정|예약|취소|결석|못\s*가|못\s*갈|열이|발열|감기|입금|송금|확인\s*감사|네네|알겠습니다|감사합니다|뵙겠습니다|통화|연락/.test(text))return 'administrative';
 if(text.replace(/\[[^\]]*\]/g,'').replace(/[•·]/g,'').trim().length>=25&&activity.test(text)&&observation.test(text))return 'clinical';
 return 'review';
}
export function reportRecordKey(row:any):string{return String(row?.record_key||row?.id||row?.legacy_key||'');}
