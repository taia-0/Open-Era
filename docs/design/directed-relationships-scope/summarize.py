import json,sys,collections
for lab in ["defaults","ATLS","ATLS-exile-off"]:
    rows=[json.loads(l) for l in open(f"raw/{lab}.jsonl")]
    S=lambda k: sum(r[k] for r in rows)
    trig=collections.Counter()
    for r in rows:
        for k,v in r["relTrig"].items(): trig[k]+=v
    print(lab, "seeds",len(rows))
    print(" relEntries total",S("relEntries"),"min/max per seed",min(r["relEntries"] for r in rows),max(r["relEntries"] for r in rows),"cross",S("cross"),"same",S("same"),"noFaction",S("noFaction"))
    print(" relEvents",S("relEvents"),"per-seed min/max",min(r["relEvents"] for r in rows),max(r["relEvents"] for r in rows))
    print(" trig",dict(trig))
    print(" events total/seed", [sum(r["types"].values()) for r in rows][:3], " relEvents share", round(S("relEvents")/sum(sum(r["types"].values()) for r in rows),3))
    print(" grievanceMax over seeds",max(r["grievanceMax"] for r in rows),"p90 max",max(r["grievanceP90"] for r in rows), "earnedMax",max(r["earnedMax"] for r in rows),"earnedNonZero total",S("earnedNonZero"))
    print(" captures",S("captures"),"withEntry",S("capturesWithEntry"),"withGrievance",S("capturesWithGrievance"),"crossRaids",S("crossRaidPairs"),"withEntry",S("crossRaidPairsWithEntry"))
    print(" bytesPerEntry",rows[0]["bytesPerEntry"], "max entries*bytes", max(r["relEntries"] for r in rows)*rows[0]["bytesPerEntry"])
    ty=collections.Counter()
    for r in rows:
        for k,v in r["types"].items(): ty[k]+=v
    print(" types", {k:ty[k] for k in ["character-captured","captivity-released","battle-started","settlement-claimed","alliance-formed","alliance-broken","settlement-purchased","faction-peace","secession-declared","character-promoted","character-retired","character-returned","debt-repaid","contract-breached","contract-fulfilled","settlement-transferred","transfer-offered"] if k in ty})
