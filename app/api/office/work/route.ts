import {NextRequest} from 'next/server';
import {createHash,randomBytes} from 'crypto';
import {officeDb,officeJson,officeRpc,limitedBody,publicOrigin,providerConfigured,officeDeliveryDb} from '@/lib/officeServer';
import {collectOfficeGrants} from '@/lib/officeGrants';
import {submitAlimtalk} from '@/lib/officeMessaging';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(req:NextRequest){try{const db=await officeDb(req),data=await officeRpc(db,'dashboard');return officeJson({...data,provider_ready:providerConfigured('reminder'),sources:{bizinfo:!!process.env.BIZINFO_API_KEY,kstartup:!!process.env.KSTARTUP_API_KEY&&!!process.env.KSTARTUP_API_URL}});}catch(e){return officeJson({error:e instanceof Error?e.message:'업무 조회 실패'},400);}}
export async function POST(req:NextRequest){try{const body=await limitedBody(req),care=body.channel==='care',db=await officeDb(req,!care),action=String(body.action||''),p=body.payload||{};
 if(care&&!['issue-link','detail','approve','send'].includes(action))return officeJson({error:'직원용 케어·서명 요청만 지원합니다.'},403);
 if(action==='grants-refresh'&&!care){const gathered=await collectOfficeGrants();await officeRpc(db,'grants-import',{items:gathered.items});return officeJson({ok:true,...gathered});}
 if(action==='send'){
  const task=await officeRpc(db,'detail',{id:p.id},care);if(p.confirm!==true||!providerConfigured(task.kind))return officeJson({error:'수신자·최종 초안 확인과 알림톡 발송업체/검수 템플릿 연결이 필요합니다.',code:'OFFICE_SEND_NOT_READY'},409);
  if(task.status!=='approved')return officeJson({error:'최종 검토 승인 후 전송해주세요.'},409);
  if(String(task.body).length>900)return officeJson({error:'검수 템플릿의 안내문 길이를 확인해주세요. 최대 900자입니다.'},400);
  const delivery=officeDeliveryDb(),claim=await delivery.rpc('office_delivery_3911',{p_org:task.org_id,p_id:p.id,p_action:'claim'});if(claim.error)throw Error('이미 처리 중이거나 유효하지 않은 승인 요청입니다. 중복 발송하지 않았습니다.');
  const receipt=await submitAlimtalk(claim.data);const settled=await delivery.rpc('office_delivery_3911',{p_org:task.org_id,p_id:p.id,p_action:'settle',p_status:receipt.status,p_ref:receipt.provider_ref});if(settled.error)return officeJson({error:'업체 접수 후 DB 결과 확인에 실패했습니다. 재전송하지 말고 관리자에서 발송 내역을 확인해주세요.'},409);
  return officeJson({ok:receipt.status==='accepted',...receipt,delivery_confirmed:false,message:receipt.status==='accepted'?'발송업체 접수 완료입니다. 실제 수신 완료는 업체 발송 내역에서 확인해주세요.':receipt.status==='unknown'?'결과가 불확실합니다. 중복 방지를 위해 재전송을 잠갔습니다. 발송업체 내역을 확인해주세요.':'발송업체가 요청을 거절했습니다.'},receipt.status==='accepted'?200:409);
 }
 if(action==='issue-link'){
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex'),url=publicOrigin()+'/office-confirm#token='+token;
  const data=await officeRpc(db,action,{...p,hash,url},care);return officeJson({...data,url});
 }
 const allow=['policy','new-lead','holiday','members','slot-list','task-edit','detail','approve','cancel','sync-makeup','book-makeup','voucher'];if(!allow.includes(action))return officeJson({error:'지원하지 않는 요청입니다.'},400);
 return officeJson(await officeRpc(db,action,p,care));
 }catch(e){return officeJson({error:e instanceof Error?e.message:'업무 처리 실패. 기존 입력을 유지해주세요.'},400);}}
