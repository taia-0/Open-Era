// Feed-reason live sample (slice B). Dry by default; --live needs DEEPSEEK_API_KEY. Key never logged.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const URL="https://api.deepseek.com/chat/completions", MODEL="deepseek-v4-pro", MAX_TOKENS=64;
const PEAK={miss:1.32e-6,hit:0.044e-6,out:3.96e-6}, OFF={miss:0.66e-6,hit:0.022e-6,out:1.98e-6};
const MAX_CALLS=70, MAX_USD=0.05, TIMEOUT_MS=8000;
const SYSTEM="You write the one-line reason shown in a strategy game's event feed. You get one event as JSON: the facts the acting character knows. Write one sentence of at most 20 words, plain past tense. Start with the acting character's full name exactly as given in actor.name. Never use a pronoun for any person (no he, she, him, her, his, hers, they, them, their); repeat a name instead. Give as the cause only what the trigger field says. If the trigger says no cause was recorded, state what happened without a motive. Personality values run 0 to 1: you may use one as a describing word, never as the cause, and never quote the numbers. Do not add names, places, numbers, motives, events or relationships that are not in the JSON. Reply as JSON: {\"reason\": \"...\"}.";
const JEV_URL="https://api.typesafe.ai/v1/systemone", JEV_MODEL="jev-1.14.0", JEV_PRICE=0.042e-6; const jkey=process.env.JEV_API_KEY;
export const CHECK={type:"noul",instructions:"Does the reason state any motive, cause or fact that is not in the facts? Wording that only restates the facts, or describes a listed personality trait, is not new. Answer yes if it adds a cause, a feeling, a relationship, a gender, a person, a place or a number that the facts do not contain."};
const live=process.argv.includes("--live"); const key=process.env.DEEPSEEK_API_KEY;
if(live&&(!key||!jkey)){console.error("no key");process.exit(2);}
const items=readFileSync("/tmp/hf2/set.jsonl","utf8").trim().split("\n").map(l=>JSON.parse(l));
const log=live?"/tmp/hf2/live-log.jsonl":"/tmp/hf2/dry-log.jsonl"; writeFileSync(log,"");
const period=(d)=>{const day=d.getUTCDay(),h=d.getUTCHours(); if(day===0||day===6)return "off-peak"; return (h>=1&&h<4)||(h>=6&&h<10)?"peak":"off-peak";};
let calls=0,spend=0;
for(const it of items){
  const body=JSON.stringify({model:MODEL,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify(it.facts)}],thinking:{type:"disabled"},response_format:{type:"json_object"},max_tokens:MAX_TOKENS,temperature:0});
  const worst=Buffer.byteLength(body)*PEAK.miss+MAX_TOKENS*PEAK.out;
  if(calls+1>MAX_CALLS||spend+worst>MAX_USD){appendFileSync(log,JSON.stringify({id:it.id,outcome:"cap",worstUsd:worst})+"\n");continue;}
  calls++;
  if(!live){const jw=(Buffer.byteLength(JSON.stringify(it.facts))+600)*0.042e-6;calls++;spend+=worst+jw;appendFileSync(log,JSON.stringify({id:it.id,outcome:"dry",requestBytes:Buffer.byteLength(body),worstUsd:worst,runWorstUsd:spend})+"\n");continue;}
  const t0=Date.now(); const at=new Date(); const per=period(at); let rec={id:it.id,role:"brain.feedReason",at:at.toISOString(),pricePeriod:per};
  try{const r=await fetch(URL,{method:"POST",signal:AbortSignal.timeout(TIMEOUT_MS),headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body});
    const j=await r.json(); const u=j?.usage??{}; const hit=u.prompt_cache_hit_tokens??0, miss=u.prompt_cache_miss_tokens??((u.prompt_tokens??0)-hit), out=u.completion_tokens??0;
    const P=per==="peak"?PEAK:OFF; const cost=(u.prompt_tokens==null)?worst:miss*P.miss+hit*P.hit+out*P.out; spend+=cost;
    let reason=null; try{reason=JSON.parse(j.choices[0].message.content).reason??null}catch{}
    rec={...rec,status:r.status,latencyMs:Date.now()-t0,responseModel:j?.model??null,finishReason:j?.choices?.[0]?.finish_reason??null,tokensIn:u.prompt_tokens??null,tokensInCacheHit:hit,tokensOut:out,costUsd:cost,runSpendUsd:spend,reason,outcome:reason?"model":"fallback"};
  }catch(e){spend+=worst;rec={...rec,outcome:"fallback",error:String(e?.name),latencyMs:Date.now()-t0,costUsd:worst,runSpendUsd:spend};}
  appendFileSync(log,JSON.stringify(rec).split(key??"\u0000").join("[redacted]")+"\n");
  if(!rec.reason)continue;
  const jbody=JSON.stringify({model:JEV_MODEL,state:{facts:it.facts,reason:rec.reason},questions:{invented:CHECK}});
  const jworst=Buffer.byteLength(jbody)*JEV_PRICE;
  if(calls+1>MAX_CALLS||spend+jworst>MAX_USD){appendFileSync(log,JSON.stringify({id:it.id,role:"jev.check",outcome:"cap"})+"\n");continue;}
  calls++; const j0=Date.now(); let jr={id:it.id,role:"jev.check"};
  try{const r=await fetch(JEV_URL,{method:"POST",signal:AbortSignal.timeout(2000),headers:{"Content-Type":"application/json",Authorization:`Bearer ${jkey}`},body:jbody});const j=await r.json();const tin=j?.usage?.input_tokens??null;const c=tin==null?jworst:tin*JEV_PRICE;spend+=c;
    jr={...jr,status:r.status,latencyMs:Date.now()-j0,responseModel:j?.model??null,tokensIn:tin,tokensOut:j?.usage?.output_tokens??null,costUsd:c,runSpendUsd:spend,noul:j?.answers?.invented?.noul??null,response:j};
  }catch(e){spend+=jworst;jr={...jr,outcome:"error",error:String(e?.name),costUsd:jworst,runSpendUsd:spend};}
  appendFileSync(log,JSON.stringify(jr).split(jkey).join("[redacted]").split(key).join("[redacted]")+"\n");
}
console.log(JSON.stringify({mode:live?"live":"dry",items:items.length,calls,[live?"spendUsd":"worstCaseUsd"]:+spend.toFixed(6)}));
