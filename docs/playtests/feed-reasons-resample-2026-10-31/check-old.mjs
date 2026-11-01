import { readFileSync, appendFileSync } from "node:fs";
import { CHECK } from "./probe-check.mjs";
const S=Object.fromEntries(readFileSync("/tmp/hf/set.jsonl","utf8").trim().split("\n").map(l=>{const x=JSON.parse(l);return [x.id,x]}));
const R=Object.fromEntries(readFileSync("/tmp/hf/live-log.jsonl","utf8").trim().split("\n").map(l=>{const x=JSON.parse(l);return [x.id,x.reason]}));
const ids=["1847-535","1847-8249","1847-103495","1847-104074","1847-107491","2718-5502","2718-90685","4096-72116","4096-43430","1847-6695","1847-9846","2718-763","4096-16978","4096-55326"];
let calls=56, spend=0.008034; const key=process.env.JEV_API_KEY;
for(const id of ids){const body=JSON.stringify({model:"jev-1.14.0",state:{facts:S[id].facts,reason:R[id]},questions:{invented:CHECK}});
 const worst=Buffer.byteLength(body)*0.042e-6; if(calls+1>70||spend+worst>0.05){console.log("cap",id);break;}
 calls++; const t0=Date.now(); const r=await fetch("https://api.typesafe.ai/v1/systemone",{method:"POST",signal:AbortSignal.timeout(2000),headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body});
 const j=await r.json(); const tin=j?.usage?.input_tokens??null; const c=tin==null?worst:tin*0.042e-6; spend+=c;
 const rec={id,role:"jev.check",set:"first-sample reasons",status:r.status,latencyMs:Date.now()-t0,responseModel:j?.model,tokensIn:tin,costUsd:c,runSpendUsd:spend,runCalls:calls,reason:R[id],noul:j?.answers?.invented?.noul??null,response:j};
 appendFileSync("/tmp/hf2/live-log-checker.jsonl",JSON.stringify(rec).split(key).join("[redacted]")+"\n"); console.log(id,r.status,rec.noul);}
console.log("calls",calls,"spend",spend.toFixed(6));
