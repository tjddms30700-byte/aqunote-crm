const failure=(status:number)=>status===504?'일지 서버 응답 시간이 초과됐어요. [HTTP 504]':status>=400?'일지 서버 응답을 확인하지 못했어요. [HTTP '+status+']':'일지 서버 연결이 완료 전에 끊겼어요. 다시 시도해주세요.';
export async function readJournalResponse(response:Response){
 if(!response.headers.get('content-type')?.includes('application/x-ndjson')){
  const x=await response.json().catch(()=>null);if(!response.ok||!x)throw new Error(x?.error||failure(response.status));return x;
 }
 if(!response.body)throw Error(failure(response.status));
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{
  while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});if(buffer.length>300000)throw Error('AI 일지 응답 크기를 초과했습니다.');let i:number;
   while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.trim())continue;const frame=JSON.parse(line);if(frame.type==='result'){if(frame.status>=400)throw Error(frame.body?.error||failure(frame.status));return frame.body;}}
   if(done)throw Error(failure(response.status));
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
