# Summarise raw/*.jsonl into the tables in wg-picker-cap-atl.md. Usage: python3 summarize.py > raw/summary.txt
import json, collections
SEEDS=[1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]
CF=['off','A','T','L','AL','AT','TL','ATL','ATLS']
def load(m,k): return {r['seed']:r for r in (json.loads(l) for l in open(f'raw/{m}-{k}.jsonl'))}
R={k:load('readonly',k) for k in CF}; S={k:load('stub',k) for k in CF}
def tot(k,f,src=R): return sum(f(src[k][s]) for s in SEEDS)
print('## Per-seed eligible WG consults (read-only recount method) and stub consult records (uncapped)')
print('| Seed | '+' | '.join(CF)+' |'); print('|---|'+'---|'*len(CF))
for s in SEEDS: print(f'| {s} | '+' | '.join(f"{R[k][s]['eligible']:,} / {S[k][s]['stubRecords']:,}" for k in CF)+' |')
print('| total | '+' | '.join(f"{tot(k,lambda r:r['eligible']):,} / {tot(k,lambda r:r['stubRecords'],S):,}" for k in CF)+' |')
print('| max (13) | '+' | '.join(f"{max(R[k][s]['eligible'] for s in SEEDS):,} / {max(S[k][s]['stubRecords'] for s in SEEDS):,}" for k in CF)+' |')
print('| max (1847/2718/4096) | '+' | '.join(f"{max(R[k][s]['eligible'] for s in SEEDS[:3]):,} / {max(S[k][s]['stubRecords'] for s in SEEDS[:3]):,}" for k in CF)+' |')
print('| seeds > 1,853 | '+' | '.join(f"{sum(R[k][s]['eligible']>1853 for s in SEEDS)} / {sum(S[k][s]['stubRecords']>1853 for s in SEEDS)}" for k in CF)+' |')
print()
print('## Decomposition (read-only, 13-seed totals)')
cols=[('WG decisions',lambda r:r['wgDecisions']),('haul gate open',lambda r:r['gateOpen']),('governor decisions',lambda r:r['govGated']),('holder',lambda r:r['role'].get('holder',0)),
 ('gov: raid/claim legal',lambda r:r['govEsc']),('gov: <2 legal',lambda r:r['govLt2']),('gov: dup',lambda r:r['govDup']),('eligible',lambda r:r['eligible']),
 ('gov away from seat',lambda r:r['govAway']),('eligible away',lambda r:r['govAwayEligible']),('gov at pact/peace port',lambda r:r['govPactBlockedHere']+r['govPeaceBlockedHere']),('eligible at pact/peace port',lambda r:r['eligiblePactBlocked']),
 ('WG port-ticks',lambda r:r['seats']['wgPortTicks']),('seated port-ticks',lambda r:r['seats']['seatedTicks']),('vacant port-ticks',lambda r:r['seats']['vacantTicks']),
 ('seated by promoted',lambda r:r['seats']['seatedByOrigin'].get('promoted',0)),('eligible by promoted',lambda r:r['eligibleByOrigin'].get('promoted',0)),
 ('WG promotions',lambda r:r['wgPromotions']),('WG retirements',lambda r:r['wgRetirements']),('WG purchases',lambda r:sum(1 for p in r['purchases'] if 'world-government' in json.dumps(p)))]
print('| Measure | '+' | '.join(CF)+' |'); print('|---|'+'---|'*len(CF))
for name,f in cols: print(f'| {name} | '+' | '.join(f"{tot(k,f):,}" for k in CF)+' |')
print()
print('## Eligible per seated port-tick (rate) and eligible by seat (13-seed totals)')
for k in CF:
    seat=collections.Counter(); ptick=collections.Counter(); seated=collections.Counter()
    for s in SEEDS:
        seat.update(R[k][s]['eligibleBySeat']); ptick.update(R[k][s]['seats']['wgPortTicksBySettlement']); seated.update(R[k][s]['seats']['seatedBySettlement'])
    el=tot(k,lambda r:r['eligible']); st=tot(k,lambda r:r['seats']['seatedTicks'])
    print(f"{k}: eligible/seated-port-tick {el/st:.3f}; eligible by seat {dict(sorted(seat.items()))}; WG port-ticks {dict(sorted(ptick.items()))}; seated {dict(sorted(seated.items()))}")
print()
print('## Eligible by 200-tick bin (13-seed totals)')
bins=[str(b) for b in range(0,1200,200)]
print('| Config | '+' | '.join(f'{b}–{int(b)+199}' for b in bins)+' |'); print('|---|'+'---|'*len(bins))
for k in CF: print(f'| {k} | '+' | '.join(f"{tot(k,lambda r,b=b:r['eligibleByBin'].get(b,0)):,}" for b in bins)+' |')
print('| Config (seated port-ticks) | '+' | '.join(f'{b}–{int(b)+199}' for b in bins)+' |'); print('|---|'+'---|'*len(bins))
for k in CF: print(f'| {k} | '+' | '.join(f"{tot(k,lambda r,b=b:r['seats']['seatedBin'].get(b,0)):,}" for b in bins)+' |')
print()
print('## By consulter, per seed (read-only): off | ATL | ATLS  (character: eligible)')
for s in SEEDS:
    for k in ['off','ATL','ATLS']:
        r=R[k][s]; m=r['actorMeta']
        print(f"{s} {k}: "+', '.join(f"{a} {m[a]['name']} ({m[a]['origin']}): {n}" for a,n in sorted(r['eligibleByActor'].items(),key=lambda x:-x[1]))+f" | seats {r['eligibleBySeat']}")
print()
print('## Per-seed WG port-ticks and seated port-ticks: off -> ATL')
for s in SEEDS:
    a,b=R['off'][s]['seats'],R['ATL'][s]['seats']
    print(f"{s}: port-ticks {a['wgPortTicks']}->{b['wgPortTicks']}, seated {a['seatedTicks']}->{b['seatedTicks']}, maxWgPorts {a['maxWgPorts']}->{b['maxWgPorts']}, by port off {a['wgPortTicksBySettlement']} ATL {b['wgPortTicksBySettlement']}, purchases ATL {R['ATL'][s]['purchases']}")
print()
print('## Stub mode (uncapped stubUniform): hook eligible == engine records?', all(S[k][s]['eligible']==S[k][s]['stubRecords'] for k in CF for s in SEEDS))
print('| Measure | '+' | '.join(CF)+' |'); print('|---|'+'---|'*len(CF))
for name,f in cols: print(f'| {name} | '+' | '.join(f"{tot(k,f,S):,}" for k in CF)+' |')
for k in ['off','ATL','ATLS']:
    seat=collections.Counter()
    for s in SEEDS: seat.update(S[k][s]['seats']['wgPortTicksBySettlement'])
    print(f"stub {k}: WG port-ticks by port {dict(sorted(seat.items()))}")
print()
print('## Leave-one-out per seed (read-only eligible): ATL, minus A (=TL), minus T (=AL), minus L (=AT)')
print('| Seed | off | ATL | TL (−A) | AL (−T) | AT (−L) | WG port-ticks off→ATL | Verdant Cay WG port-ticks ATL |'); print('|---|---|---|---|---|---|---|---|')
for s in SEEDS:
    print(f"| {s} | {R['off'][s]['eligible']:,} | {R['ATL'][s]['eligible']:,} | {R['TL'][s]['eligible']:,} | {R['AL'][s]['eligible']:,} | {R['AT'][s]['eligible']:,} | {R['off'][s]['seats']['wgPortTicks']:,}→{R['ATL'][s]['seats']['wgPortTicks']:,} | {R['ATL'][s]['seats']['wgPortTicksBySettlement'].get('verdant-cay',0):,} |")
