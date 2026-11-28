import json,collections
for lab in ["defaults","ATLS"]:
    rows=[json.loads(l) for l in open(f"raw/faction-{lab}.jsonl")]
    S=lambda k: sum(r[k] for r in rows)
    kinds=collections.Counter()
    for r in rows:
        for k,v in r["kinds"].items(): kinds[k]+=v
    print(lab,"harm/goodwill events",dict(kinds))
    print(" ordered harm pairs per seed min/max",min(r["orderedHarmPairs"] for r in rows),max(r["orderedHarmPairs"] for r in rows),"total",S("orderedHarmPairs"))
    print(" unordered pairs",S("unorderedPairs"),"both ways",S("pairsBothWays"),"one way",S("pairsOneWay"),"skew>=3:1",S("pairsSkewAtLeast3to1"))
    print(" window-count at harm event: p50 range",[r["windowCountAtHarmEvent"]["p50"] for r in rows],"p90",[r["windowCountAtHarmEvent"]["p90"] for r in rows],"max over seeds",max(r["windowCountAtHarmEvent"]["max"] for r in rows))
    print(" goodwill ordered pairs",S("goodwillOrderedPairs"),"factions end per seed",[r["factionsEnd"] for r in rows])
    print(" alliance clock checks",S("clockChecks"),"with any candidate",S("clockWithAnyCandidate"),"with a faction having >1 candidate partner",S("clockWithMultiPartner"))
