export type AgentId='scheduler'|'cs'|'content'|'finance'|'grants'|'tech';
export type AgentStatus='running'|'idle'|'waiting';
export type OfficeLog={id:string;time:string;unit:string;message:string;level:'info'|'success'|'warn'};
export type Approval={id:string;title:string;detail:string;status:'pending_approval'|'approved'|'rejected'};
export const OFFICE_AGENTS:{id:AgentId;name:string;label:string;description:string;action:string;initial:AgentStatus;recent:string;cost:number;approval:boolean}[]=[
 {id:'scheduler',name:'예약·스케줄 유닛',label:'SCHEDULER',description:'예약 현황과 안내문 준비를 한곳에서 확인해요.',action:'수동 동기화',initial:'running',recent:'schedule.csv 파싱 · 익일 리마인드 2건 큐잉',cost:1800,approval:true},
 {id:'cs',name:'CS·상담 분류 유닛',label:'INQUIRY',description:'건강·임상 문의는 자동 답변 대신 치료사 검토로 분류해요.',action:'문의큐 스캔',initial:'idle',recent:'문의 분류 대기 · 치료사 이관 규칙 확인',cost:900,approval:true},
 {id:'content',name:'콘텐츠·브랜딩 유닛',label:'CONTENT',description:'콘텐츠 캘린더와 브랜드 문구의 초안을 검토해요.',action:'초안 생성',initial:'waiting',recent:'reports/content-calendar-2026-W47 초안 준비',cost:2600,approval:true},
 {id:'finance',name:'행정·재무 통계 유닛',label:'FINANCE',description:'정산 자료와 마감 결과를 읽기 전용으로 검토해요.',action:'일일 마감',initial:'idle',recent:'finance.csv 집계 · 일일 마감 준비',cost:1200,approval:true},
 {id:'grants',name:'기획·지원사업 유닛',label:'STRATEGY',description:'지원사업 후보와 검토 항목을 정리해요.',action:'공고 스캔',initial:'running',recent:'소프트웨어·DB 업태 기반 과제 탐색',cost:2100,approval:true},
 {id:'tech',name:'테크·엔지니어링 유닛',label:'ENGINEERING',description:'접속 상태와 운영 연결 범위를 점검해요.',action:'헬스체크',initial:'idle',recent:'애플리케이션 접속 점검 · 실행기 연결 대기',cost:500,approval:false},
];
export const OFFICE_APPROVALS:Approval[]=[{id:'demo-reminder',title:'익일 체험 리마인드 초안',detail:'샘플 승인 요청입니다. 수신자·예약 데이터는 포함하지 않으며 실제 알림톡 발송은 하지 않습니다.',status:'pending_approval'},{id:'demo-blog',title:'주간 블로그 칼럼 초안',detail:'샘플 콘텐츠 검토 요청입니다. 실제 게시물 작성·게시 또는 외부 AI 호출은 실행하지 않습니다.',status:'pending_approval'}];
export function routeOfficeCommand(input:string):AgentId{if(/예약|스케줄|리마인드|시간표/.test(input))return 'scheduler';if(/상담|문의|CS/i.test(input))return 'cs';if(/블로그|콘텐츠|홍보|브랜드|SNS/i.test(input))return 'content';if(/정산|매출|재무|마감/.test(input))return 'finance';if(/지원|공고|사업|R&D/i.test(input))return 'grants';return 'tech';}
export function validateOfficeCommand(input:string){if(!input.trim())return '지시 내용을 입력해주세요.';if(input.length>1000)return '지시는 1,000자 이내로 입력해주세요.';if(/01[016789][\s-]?\d{3,4}[\s-]?\d{4}|\d{6}[\s-]?[1-8]\d{6}/.test(input))return '연락처·주민번호 등 개인정보를 지시에 넣지 마세요.';if(/진단|복용약|수술력|연하\s*상태|삼킴\s*상태|임상\s*(?:기록|SOAP)|SOAP\s*원문|NRS|MMT/i.test(input))return '민감 건강정보는 이 관제실에 입력하지 마세요. 회원 임상 기록에서 처리해주세요.';return '';}
export function reserveOfficeBudget(used:number,budget:number,cost:number){if(!Number.isFinite(used)||!Number.isFinite(budget)||!Number.isFinite(cost)||used<0||cost<0||budget<=0||used>budget)throw new Error('Invalid simulation budget');return used+cost<=budget?{allowed:true,used:used+cost,paused:used+cost===budget}:{allowed:false,used,paused:true};}
