import { writeFileSync } from "node:fs";
const R="/workspace/oe-feed/src/sim/";
const { runTick } = await import(R+"engine.ts"); const { createPrototypeWorld } = await import(R+"scenario.ts");
const r2=(x:number)=>Math.round(x*100)/100;
const out:any[]=[];
for (const seed of [1847,2718,4096]) {
  const w:any=createPrototypeWorld(seed); const taken:Record<string,number>={};
  const want:Record<string,number>={"secession":2,"desertion":2,"breach":2,"raid":1,"claim":1,"tax":2};
  for(let t=0;t<1200;t++){ const evs=runTick(w).events;
    for(const e of evs){ let kind:string|null=null; const d:any=e.data??{};
      if(e.type==="secession-declared")kind="secession";
      else if(e.type==="character-deserted")kind="desertion";
      else if(e.type==="contract-breached"&&d.cause==="choice"&&d.detail==="better-motive")kind="breach";
      else if(e.type==="battle-started"&&t>0)kind="raid";
      else if(e.type==="settlement-claimed")kind="claim";
      else if(e.type==="tax-rate-set"&&!("commandId" in d)&&d.previousTaxRate!==d.taxRate)kind="tax";
      if(!kind||(taken[kind]??0)>=want[kind])continue; taken[kind]=(taken[kind]??0)+1;
      const a=w.characters[e.actorId]; const fname=(id:any)=>id?(w.factions[id]?.name??null):null;
      const tgtChar=e.targetId&&w.characters[e.targetId]?w.characters[e.targetId]:null;
      const facts:any={event:kind,tick:e.tick,actor:{name:a?.name,archetype:a?.archetype,faction:fname(a?.factionId),morale:a?r2(a.morale):null,personality:a?Object.fromEntries(Object.entries(a.personality).map(([k,v]:any)=>[k,r2(v)])):null}};
      if(e.settlementId){const s=w.settlements[e.settlementId]; facts.port={name:s.name};}
      if(kind==="secession"){facts.leftFaction=fname(d.previousFactionId);facts.newFaction=d.faction.name;facts.followers=d.followerIds.map((i:string)=>w.characters[i].name);facts.garrisonFollowed=d.garrisonFollowed;facts.portStability=r2(d.stability);facts.routes=d.routes;}
      if(kind==="desertion"){facts.leftFaction=fname(d.previousFactionId);facts.nowServes=fname(d.factionId)??"no faction";}
      if(kind==="breach"){const c=d.contract;facts.contract={buyer:w.characters[c.buyerId].name,good:c.good,quantity:c.quantity,price:c.price,deadlineTick:c.deadlineTick};facts.cause="dropped the accepted contract for a better-paying option";
        const rel=a?.relationships?.[c.buyerId]; if(rel)facts.actorTowardBuyer={trust:r2(rel.trust),grievance:r2(rel.grievance)};}
      if(kind==="raid"){const b=d.battle;facts.defenderFaction=fname(b.defenderFactionId);facts.attackerTroops=b.attackerInitialTroops;facts.defenderGarrison=b.defenderInitialGarrison;facts.outlook=b.startingForecast?.outlook;}
      if(kind==="claim"){facts.previousHolder=fname(d.previousFactionId);facts.newHolder=fname(d.factionId);facts.basis=d.basis;facts.garrison=d.garrison;}
      if(kind==="tax"){facts.faction=fname(d.factionId);facts.previousRate=`${Math.round(d.previousTaxRate*100)}%`;facts.newRate=`${Math.round(d.taxRate*100)}%`;facts.scorerCause=d.taxRate>d.previousTaxRate?"treasury short":"unrest in a held port";}
      out.push({id:`${seed}-${e.sequence}`,seed,sequence:e.sequence,eventType:e.type,facts});
    }}
}
writeFileSync("/tmp/hf/set.jsonl",out.map(x=>JSON.stringify(x)).join("\n")+"\n"); console.log(out.length, out.map(x=>x.facts.event).join(","));
