import {createHmac,randomBytes} from 'crypto';
import {providerConfigured} from './officeServer';
export async function submitAlimtalk(task:any):Promise<{status:'accepted'|'rejected'|'unknown';provider_ref:string}>{
 if(!providerConfigured(task.kind))throw Error('알림톡 발송은 연결 대기입니다. 발송업체 인증·검수 템플릿과 OFFICE_SEND_ENABLED를 확인해주세요.');
 const to=String(task.recipient||'').replace(/\D/g,''),from=String(process.env.SOLAPI_FROM||'').replace(/\D/g,'');if(!/^01[016789]\d{7,8}$/.test(to)||!/^\d{8,12}$/.test(from))return {status:'rejected',provider_ref:'INVALID_RECIPIENT'};
 if(String(task.body).length>900)return {status:'rejected',provider_ref:'TEMPLATE_VARIABLE_TOO_LONG'};
 const date=new Date().toISOString(),salt=randomBytes(32).toString('hex'),signature=createHmac('sha256',process.env.SOLAPI_API_SECRET!).update(date+salt).digest('hex');
 // Register approved informational templates using #{안내문}, and #{링크} for care/signature.
 const variables:Record<string,string>={'#{안내문}':task.body};if(task.variables?.link)variables['#{링크}']=task.variables.link;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch('https://api.solapi.com/messages/v4/send-many/detail',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`HMAC-SHA256 apiKey=${process.env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`},body:JSON.stringify({messages:[{to,from,type:'ATA',kakaoOptions:{pfId:process.env.SOLAPI_PFID,templateId:process.env['SOLAPI_TEMPLATE_'+task.kind.toUpperCase().replace(/-/g,'_')],variables,disableSms:true}}]}),signal:controller.signal,cache:'no-store'});
 if(!response.ok)return {status:response.status>=500?'unknown':'rejected',provider_ref:'PROVIDER_HTTP_'+response.status};
 const data=await response.json();if(Array.isArray(data.failedMessageList)&&data.failedMessageList.length)return {status:'rejected',provider_ref:'PROVIDER_REJECTED'};
 if(typeof data.groupInfo?.groupId==='string'&&data.groupInfo?.count?.registeredSuccess===1&&!(data.groupInfo?.count?.registeredFailed>0))return {status:'accepted',provider_ref:data.groupInfo.groupId};
 return {status:'unknown',provider_ref:'UNVERIFIED_PROVIDER_RECEIPT'};
 }catch{return {status:'unknown',provider_ref:'PROVIDER_NETWORK_OR_TIMEOUT'};}finally{clearTimeout(timer);}
}
