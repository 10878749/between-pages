import { loadEnv } from 'vite';
const normal = loadEnv('development', process.cwd(), '');
const privateEnv = loadEnv('play', process.cwd(), '');
const provider=normal.MODEL_PROVIDER || 'bigmodel';
const key = provider === 'bailian' ? normal.DASHSCOPE_API_KEY : normal.BIGMODEL_API_KEY;
const privateKey = provider === 'bailian' ? privateEnv.DASHSCOPE_API_KEY : privateEnv.BIGMODEL_API_KEY;
const model = provider === 'bailian' ? 'qwen-flash' : 'glm-4.7-flash';
console.log(JSON.stringify({stage:'configuration',normalConfigured:!!key,privateConfigured:!!privateKey,sameKey:key===privateKey,model},null,2));
if (!key) { console.log('请在 .env.local 填写对应 API Key。'); process.exit(1); }
if(provider === 'bailian' && normal.BAILIAN_FREE_QUOTA_CONFIRMED !== 'true') {console.log('请先开启百炼 qwen-flash 免费额度用完即停，再将 BAILIAN_FREE_QUOTA_CONFIRMED 设为 true。尚未发出请求。');process.exit(1);}
const start=Date.now();
try {
 const response=await fetch(provider === 'bailian' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' : 'https://open.bigmodel.cn/api/paas/v4/chat/completions',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000),
  body:JSON.stringify({model,...(provider === 'bailian' ? {enable_thinking:false} : {thinking:{type:'disabled'}}),max_tokens:30,messages:[{role:'user',content:'只回复：连接成功'}]})
 });
 const body=await response.json().catch(()=>({}));
 const redact=value=>typeof value==='string'?value.replaceAll(key,'[redacted]').slice(0,400):value;
 console.log(JSON.stringify({stage:'provider',time:new Date().toISOString(),elapsedMs:Date.now()-start,httpStatus:response.status,code:body.error?.code??null,message:redact(body.error?.message??null),requestId:redact(response.headers.get('x-request-id')??body.request_id??null),hasReply:!!body.choices?.[0]?.message?.content},null,2));
 if(!response.ok)process.exitCode=1;
} catch(error) {
 console.log(JSON.stringify({stage:'network',elapsedMs:Date.now()-start,type:error.name,code:error.cause?.code??null},null,2));
 process.exitCode=1;
}
