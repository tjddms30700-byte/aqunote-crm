export const ORAL_WORDS=/연하|구강|삼킴|설압자|아이스\s*스틱|미각|맛|입술\s*(?:폐쇄|다물)|숟가락|타액/;
const WATER=/수중|물속|물\s*적응|수영|발차기|보드|잠수|호흡|균형/;
const notToday=/미실시|미시행|시행하지|진행하지|안\s*(?:했|함|하)|다음|차회|예정|취소/;
export function sessionStructure(memo:string,combinedFlag=false){const parts=memo.split(/[\n.!?]/),oral=parts.filter(x=>ORAL_WORDS.test(x)&&!notToday.test(x)),aquatic=parts.filter(x=>WATER.test(x)&&!notToday.test(x));const minutes=(after:RegExp,before:RegExp)=>{const m=memo.match(after)||memo.match(before),v=m?Number(m[1]):null;return v!==null&&v>0&&v<=180?v:null;};return {combined:combinedFlag||ORAL_WORDS.test(memo),oral_evidence:oral,aquatic_evidence:aquatic,oral_minutes:minutes(/(?:구강(?:\/연하)?(?:재활|훈련|\s*감각)?|연하(?:\s*재활)?)[ \t:：()\-]{0,8}(\d{1,3})\s*분/,/(\d{1,3})\s*분\s*(?:구강|연하)/),aquatic_minutes:minutes(/수중(?:\s*(?:수업|운동|적응|활동))?[ \t:：()\-]{0,8}(\d{1,3})\s*분/,/(\d{1,3})\s*분\s*수중/)};}
export function combinedPrompt(s:ReturnType<typeof sessionStructure>){return !s.combined?'':`\n[복합 세션 필수 구조]\nparent_message는 예외적으로 정확히 두 소제목으로 분리한다. 첫째 [ 👄 구강 감각 & 연하 기능 훈련${s.oral_minutes===null?'':` (${s.oral_minutes}분)`} ], 둘째 [ 🏊‍♀️ 수중 적응 & 움직임 활동${s.aquatic_minutes===null?'':` (${s.aquatic_minutes}분)`} ]. 시간을 적지 않은 메모는 10분/30분으로 추정하지 말고 제목에서 분량을 빼라.\n구강: ${s.oral_evidence.length?'오늘 입력한 구강 활동·반응을 빠짐없이 다룬다. 입술, 숟가락, 탈감작, 타액 등은 실제 기록에 있는 것만 쓴다.':'연하 병행 설정만 있거나 오늘 시행 기록이 부족하다. 오늘 연하 활동 시행/반응 미기록이라고 명시하고 시행했다고 만들지 않는다.'}\n수중: ${s.aquatic_evidence.length?'오늘 입력한 수중 활동·반응을 별도로 다룬다.':'오늘 수중 활동·반응 미기록임을 명시한다.'}\n두 단락을 섞어 구강 내용을 생략하지 않는다. SOAP는 기존 S/O/A/P 네 항목을 유지하며 실제로 기록된 두 영역을 함께 담는다. 식이 농도·섭취량·강제 삼킴·보호자 구강 자극/도구 사용을 처방하지 말고 사레·흡인 위험은 치료사 확인이 필요하다. tags에는 실제 시행 근거가 있는 구강기능/연하재활 태그와 수중 활동 태그를 함께 포함한다.`;}
export function finalizeCombined(result:{parent_message:string;clinical_record:string;tags:string[]},s:ReturnType<typeof sessionStructure>){
 if(!s.combined)return result;
 if(!/구강 감각\s*&\s*연하 기능 훈련/.test(result.parent_message)||!/수중 적응\s*&\s*움직임 활동/.test(result.parent_message))throw new Error('AI_COMBINED_SECTIONS');
 const oralHeader=result.parent_message.match(/구강 감각\s*&\s*연하 기능 훈련[^\n]*?(\d+)\s*분/),waterHeader=result.parent_message.match(/수중 적응\s*&\s*움직임 활동[^\n]*?(\d+)\s*분/);
 if((oralHeader?Number(oralHeader[1]):null)!==s.oral_minutes||(waterHeader?Number(waterHeader[1]):null)!==s.aquatic_minutes)throw new Error('AI_COMBINED_SECTIONS');
 const observed=result.clinical_record.split('\n').find(x=>/^O[:：]/.test(x))||'';
 if(s.oral_evidence.length&&!ORAL_WORDS.test(observed)||s.aquatic_evidence.length&&!WATER.test(observed))throw new Error('AI_COMBINED_SECTIONS');
 const required:string[]=[],reflex=s.oral_evidence.some(x=>/연하\s*반사/.test(x));
 if(s.oral_evidence.length){required.push('작업치료/연하재활 · 구강기능');if(reflex)required.push('작업치료/연하재활 · 연하 반사');}
 if(s.aquatic_evidence.length&&!result.tags.some(x=>WATER.test(x)))required.push('물 적응·호흡 조절');
 const groundedTags=result.tags.filter(t=>(s.oral_evidence.length||!ORAL_WORDS.test(t))&&(reflex||!/연하\s*반사/.test(t)));
 return {...result,tags:Array.from(new Set([...required,...groundedTags])).slice(0,7)};
}
