// Feed-reason live sample (slice B). Dry by default; --live needs DEEPSEEK_API_KEY. Key never logged.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const URL="https://api.deepseek.com/chat/completions", MODEL="deepseek-v4-pro", MAX_TOKENS=64;
const PEAK={miss:1.32e-6,hit:0.044e-6,out:3.96e-6}, OFF={miss:0.66e-6,hit:0.022e-6,out:1.98e-6};
const MAX_CALLS=40, MAX_USD=0.25, TIMEOUT_MS=8000;
const SYSTEM="You write the one-line reason shown in a strategy game's event feed. You get one event as JSON: the facts the acting character knows. Write why the character did it, in at most 20 words, plain past tense, third person, no quotes. Use only the facts given: do not add names, places, numbers, events or relationships that are not in the JSON. Personality values run 0 to 1; you may describe them in words but do not quote them. Reply as JSON: {\"reason\": \"...\"}.";
const live=process.argv.includes("--live"); const key=process.env.DEEPSEEK_API_KEY;
if(live&&!key){console.error("no key");process.exit(2);}
const items=readFileSync("/tmp/hf/set.jsonl","utf8").trim().split("\n").map(l=>JSON.parse(l));
const log=live?"/tmp/hf/live-log.jsonl":"/tmp/hf/dry-log.jsonl"; writeFileSync(log,"");
const period=(d)=>{const day=d.getUTCDay(),h=d.getUTCHours(); if(day===0||day===6)return "off-peak"; return (h>=1&&h<4)||(h>=6&&h<10)?"peak":"off-peak";};
let calls=0,spend=0;
for(const it of items){
  const body=JSON.stringify({model:MODEL,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify(it.facts)}],thinking:{type:"disabled"},response_format:{type:"json_object"},max_tokens:MAX_TOKENS,temperature:0});
  const worst=Buffer.byteLength(body)*PEAK.miss+MAX_TOKENS*PEAK.out;
  if(calls+1>MAX_CALLS||spend+worst>MAX_USD){appendFileSync(log,JSON.stringify({id:it.id,outcome:"cap",worstUsd:worst})+"\n");continue;}
  calls++;
  if(!live){spend+=worst;appendFileSync(log,JSON.stringify({id:it.id,outcome:"dry",requestBytes:Buffer.byteLength(body),worstUsd:worst,runWorstUsd:spend})+"\n");continue;}
  const t0=Date.now(); const at=new Date(); const per=period(at); let rec={id:it.id,at:at.toISOString(),pricePeriod:per};
  try{const r=await fetch(URL,{method:"POST",signal:AbortSignal.timeout(TIMEOUT_MS),headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body});
    const j=await r.json(); const u=j?.usage??{}; const hit=u.prompt_cache_hit_tokens??0, miss=u.prompt_cache_miss_tokens??((u.prompt_tokens??0)-hit), out=u.completion_tokens??0;
    const P=per==="peak"?PEAK:OFF; const cost=(u.prompt_tokens==null)?worst:miss*P.miss+hit*P.hit+out*P.out; spend+=cost;
    let reason=null; try{reason=JSON.parse(j.choices[0].message.content).reason??null}catch{}
    rec={...rec,status:r.status,latencyMs:Date.now()-t0,responseModel:j?.model??null,finishReason:j?.choices?.[0]?.finish_reason??null,tokensIn:u.prompt_tokens??null,tokensInCacheHit:hit,tokensOut:out,costUsd:cost,runSpendUsd:spend,reason,outcome:reason?"model":"fallback"};
  }catch(e){spend+=worst;rec={...rec,outcome:"fallback",error:String(e?.name),latencyMs:Date.now()-t0,costUsd:worst,runSpendUsd:spend};}
  appendFileSync(log,JSON.stringify(rec).split(key??"\u0000").join("[redacted]")+"\n");
}
console.log(JSON.stringify({mode:live?"live":"dry",items:items.length,calls,[live?"spendUsd":"worstCaseUsd"]:+spend.toFixed(6)}));
