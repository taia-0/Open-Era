# directed-relationships.md tables from raw/*.jsonl. Offline.
import json, collections, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
def load(l): return [json.loads(x) for x in open(f"raw/{l}.jsonl")]
PIN={1847,2718,4096}
def tot(rows,k): return sum(r[k] for r in rows)
def routes(rows):
    c=collections.Counter()
    for r in rows: c.update(r["routes"])
    return c
def summary(l):
    rows=load(l); c=routes(rows)
    g=collections.Counter()
    for r in rows: g.update(r["grudges"])
    viol=collections.Counter()
    for r in rows: viol.update(r["violations"])
    return dict(label=l, claims=tot(rows,"claims"), portChanges=tot(rows,"portChanges"), battles=tot(rows,"battles"), captures=tot(rows,"captures"),
      secessions=tot(rows,"secessions"), secSeeds=sum(1 for r in rows if r["secessions"]>0), tax=c["tax"], promise=c["promise"], hated=c["hated"],
      pressed=tot(rows,"pressedPortTicks"), peaces=tot(rows,"peaces"), pacts=tot(rows,"pacts"), allyAttack=tot(rows,"allyAttackBreaks"), purchases=tot(rows,"purchases"),
      offers=tot(rows,"offers"), declines=tot(rows,"declines"), transfers=tot(rows,"transfers"), joins=tot(rows,"joins"),
      allianceDec=tot(rows,"allianceDecisions"), allianceChg=tot(rows,"allianceChanged"), trDec=tot(rows,"transferDecisions"), trOrderChg=tot(rows,"transferOrderChanged"), trFirstChg=tot(rows,"transferFirstChanged"),
      grudges=dict(g), ledgerPairsMax=max(r["ledgerPairs"] for r in rows), ledgerPairs=tot(rows,"ledgerPairs"), ledgerTotal=tot(rows,"ledgerTotal"), ledgerEntriesMax=max(r["ledgerEntries"] for r in rows), ledgerBytesMax=max(r["ledgerBytes"] for r in rows),
      gP90max=max(r["gP90"] for r in rows), gP99max=max(r["gP99"] for r in rows), gMax=max(r["gMax"] for r in rows), gAtHated=tot(rows,"gAtHated"), earnedAtHated=tot(rows,"earnedAtHated"), earnedNonZero=tot(rows,"earnedNonZero"), relEntries=tot(rows,"relEntries"),
      liveness=all(r["claims"]>0 and r["portChanges"]>0 for r in rows), minClaims=min(r["claims"] for r in rows), minPC=min(r["portChanges"] for r in rows),
      wipeouts=sorted({f"{r['seed']}:{w}" for r in rows for w in r["wipeouts"]}), replay=all(r["replayExact"] for r in rows),
      violations=dict(viol), privacyChecks=tot(rows,"privacyChecks"), grudgeChecks=tot(rows,"grudgeChecks"),
      pins={r["seed"]:f'{r["hash72"]}/{r["hash1200"]}' for r in rows if r["seed"] in PIN})
sets=[x.strip() for x in open("raw/sets.txt")]
base={"R":"main","R+Rc":"main","R-exile-off":"main-exile-off","R+Rc-exile-off":"main-exile-off","ATLS+R":"ATLS","ATLS+R+Rc":"ATLS","ATLS+R-exile-off":"ATLS-exile-off","ATLS+R+Rc-exile-off":"ATLS-exile-off","ATLS-NT+R":"ATLS-NT","ATLS-NT+R+Rc":"ATLS-NT","ATLS-NT+R+Rc-exile-off":"ATLS-NT-exile-off"}
S={l:summary(l) for l in sets}
json.dump(S,open("summary.json","w"),indent=1)
order=["main","R","R+Rc","main-exile-off","R-exile-off","R+Rc-exile-off","ATLS","ATLS+R","ATLS+R+Rc","ATLS-exile-off","ATLS+R-exile-off","ATLS+R+Rc-exile-off","ATLS-NT","ATLS-NT+R","ATLS-NT+R+Rc","ATLS-NT-exile-off","ATLS-NT+R+Rc-exile-off"]
print("| Set | Claims | Port changes | Battles | Captures | Secessions (seeds) | tax / promise / hated | Pressed port-ticks | Peaces | Pacts (ally-attack breaks) | Purchases | Transfers (offers / declines) |")
print("| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- | ---: | --- |")
for l in order:
    s=S[l]; print(f"| {l} | {s['claims']} | {s['portChanges']} | {s['battles']} | {s['captures']} | {s['secessions']} ({s['secSeeds']}/13) | {s['tax']} / {s['promise']} / {s['hated']} | {s['pressed']} | {s['peaces']} | {s['pacts']} ({s['allyAttack']}) | {s['purchases']} | {s['transfers']} ({s['offers']} / {s['declines']}) |")
print()
print("| Set | Reader 1: alliance decisions / changed | Reader 2: receiver lists / order changed / first changed | Grudge writes (raid / capture / ransom / seat-lost) | Ledger pairs (max per seed) | Ledger total events | Max live entries / bytes per seed |")
print("| --- | --- | --- | --- | --- | ---: | --- |")
for l in order:
    s=S[l]; gr=s["grudges"]
    print(f"| {l} | {s['allianceDec']} / {s['allianceChg']} | {s['trDec']} / {s['trOrderChg']} / {s['trFirstChg']} | {gr.get('raid',0)} / {gr.get('capture',0)} / {gr.get('ransom',0)} / {gr.get('seat-lost',0)} | {s['ledgerPairs']} ({s['ledgerPairsMax']}) | {s['ledgerTotal']} | {s['ledgerEntriesMax']} / {s['ledgerBytesMax']} |")
print()
print("| Set | Relationship entries | Grievance p90 (max seed) | p99 (max seed) | Max | Entries ≥ 0.12 | Earned ≠ 0 | Earned ≥ 0.12 |")
print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
for l in order:
    s=S[l]; print(f"| {l} | {s['relEntries']} | {round(s['gP90max'],3)} | {round(s['gP99max'],3)} | {round(s['gMax'],3)} | {s['gAtHated']} | {s['earnedNonZero']} | {s['earnedAtHated']} |")
print()
print("| Set | Base | Secessions ≥ 6/13 | Liveness (min claims / port changes) | New wipeouts | Replay exact | R / R-char property + privacy violations (checks) |")
print("| --- | --- | --- | --- | --- | --- | --- |")
for l in order:
    s=S[l]; b=base.get(l); bw=set(S[b]["wipeouts"]) if b else set(); new=[x for x in s["wipeouts"] if x not in bw]
    print(f"| {l} | {b or '—'} | {'pass' if s['secSeeds']>=6 else 'FAIL'} ({s['secSeeds']}) | {'pass' if s['liveness'] else 'FAIL'} ({s['minClaims']} / {s['minPC']}) | {', '.join(new) if new else 'none'}{' (base: '+', '.join(sorted(bw))+')' if bw else ''} | {'pass' if s['replay'] else 'FAIL'} | {sum(s['violations'].values())} {s['violations'] or ''} ({s['privacyChecks']} privacy, {s['grudgeChecks']} grudge) |")
print()
print("Pins (72 / 1,200):")
for l in order: print(f"- {l}: " + "; ".join(f"{k} {v}" for k,v in sorted(S[l]['pins'].items())))
