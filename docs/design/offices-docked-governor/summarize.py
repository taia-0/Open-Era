# offices-docked-governor.md tables from raw/*.jsonl. Usage: python3 summarize.py > raw/summary.txt
import json, math, collections
SEEDS=[1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]; STD=SEEDS[:3]
def L(t,m,c): return {r['seed']:r for r in (json.loads(l) for l in open(f'raw/{t}-{m}-{c}.jsonl'))}
COST=0.0000544
def cap(x): return math.ceil(x*1.25)
def usd(n): return math.ceil(round(n*COST,6)*100)/100
# columns: (label, tree, config, rule) ; rule current = 'eligible' (readonly) / stubRecords from current-rule tree; docked = eligibleDocked (readonly) / stubRecords from docked tree
cols=[('off','base','docked','off'),('ATL','base','docked','ATL'),('ATLS (pre-fix)','base','docked','ATLS'),('ATL + fix','fix','fixdocked','ATL'),('ATLS + fix','fix','fixdocked','ATLS')]
print('## Hash checks')
for lab,t,td,c in cols:
    a=L(t,'readonly',c); b=L(td,'readonly',c)
    print(f'{lab}: read-only end hash, current tree == docked tree on 13/13:', all(a[s]['hash1200']==b[s]['hash1200'] for s in SEEDS), '| docked read-only eligible == eligibleDocked of current tree:', all(a[s]['eligibleDocked']==b[s]['eligibleDocked'] for s in SEEDS))
for c in ['ATL','ATLS']:
    a=L('base','readonly',c); b=L('fix','readonly',c)
    print(f'{c}: fix changes end hash on', [s for s in SEEDS if a[s]['hash1200']!=b[s]['hash1200']])
print()
rows={}
for lab,t,td,c in cols:
    ro=L(t,'readonly',c); st=L(t,'stub',c); sd=L(td,'stub',c)
    rows[lab]={s:(ro[s]['eligible'],st[s]['stubRecords'],ro[s]['eligibleDocked'],sd[s]['stubRecords']) for s in SEEDS}
print('## Per-seed consults: current rule read-only / stub → docked rule read-only / stub')
print('| Seed | '+' | '.join(l for l,*_ in cols)+' |'); print('|---|'+'---|'*len(cols))
for s in SEEDS: print(f'| {s} | '+' | '.join('{:,} / {:,} → {:,} / {:,}'.format(*rows[l][s]) for l,*_ in cols)+' |')
for name,idx in [('total',None)]:
    print('| total | '+' | '.join(' / '.join(f"{sum(rows[l][s][i] for s in SEEDS):,}" for i in (0,1))+' → '+' / '.join(f"{sum(rows[l][s][i] for s in SEEDS):,}" for i in (2,3)) for l,*_ in cols)+' |')
for nm,ss in [('max 3 std',STD),('max 13',SEEDS)]:
    print(f'| {nm} | '+' | '.join(' / '.join(f"{max(rows[l][s][i] for s in ss):,}" for i in (0,1))+' → '+' / '.join(f"{max(rows[l][s][i] for s in ss):,}" for i in (2,3)) for l,*_ in cols)+' |')
print()
print('## Caps (read-only recount rule: max × 1.25, ceil; $ at 0.0000544/call, ceil to cent)  [stub uncapped max shown for headroom check]')
print('| Set | Rule | 3-seed max (seed) | 3-seed cap | 3-seed $ | 13-seed max (seed) | 13-seed cap | 13-seed $ | stub max 3 / 13 |'); print('|---|---|---|---|---|---|---|---|---|')
for l,*_ in cols:
    for rule,i,j in [('current',0,1),('docked',2,3)]:
        m3=max(STD,key=lambda s:rows[l][s][i]); m13=max(SEEDS,key=lambda s:rows[l][s][i])
        v3=rows[l][m3][i]; v13=rows[l][m13][i]
        print(f"| {l} | {rule} | {v3:,} ({m3}) | {cap(v3):,} | ${usd(cap(v3)):.2f} ({cap(v3)*COST:.4f}) | {v13:,} ({m13}) | {cap(v13):,} | ${usd(cap(v13)):.2f} ({cap(v13)*COST:.4f}) | {max(rows[l][s][j] for s in STD):,} / {max(rows[l][s][j] for s in SEEDS):,} |")
print()
print('## Docked consults by port and by 200-tick bin (read-only, 13-seed totals)')
for lab,t,td,c in cols:
    ro=L(t,'readonly',c); seat=collections.Counter(); b=collections.Counter(); org=collections.Counter()
    for s in SEEDS: seat.update(ro[s]['dockedBySeat']); b.update(ro[s]['dockedByBin']); org.update(ro[s]['dockedByOrigin'])
    print(f"{lab}: by port {dict(sorted(seat.items()))}; by bin {[b.get(str(x),0) for x in range(0,1200,200)]}; by origin {dict(org)}")
print()
print('## Docked consults by consulter (read-only), per seed')
for lab,t,td,c in cols:
    ro=L(t,'readonly',c)
    for s in SEEDS:
        r=ro[s]; m=r['actorMeta']
        print(f"{lab} {s}: "+', '.join(f"{a} {m.get(a,{}).get('name','?')}: {n}" for a,n in sorted(r['dockedByActor'].items(),key=lambda x:-x[1])))
