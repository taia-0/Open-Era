# Ruling 2 readout (report, not a gate): per governor and seat, share of seat-ticks spent docked at the seat.
# A seat is FLAGGED only if it was held for > 0 ticks in the run and had 0 docked ticks. Reads count.ts `dockRead`.
# Usage: python3 readout.py raw/readout-docked-readonly-ATL.jsonl [more.jsonl ...]
import json, sys
for path in sys.argv[1:]:
    print(f'## {path}')
    tot = {}
    for r in map(json.loads, open(path)):
        seats = {}
        for x in r['dockRead']:
            seats.setdefault((x['faction'], x['seat']), [0, 0])
            seats[(x['faction'], x['seat'])][0] += x['seatTicks']; seats[(x['faction'], x['seat'])][1] += x['dockedTicks']
        flags = [f'{f}:{p}' for (f, p), (a, b) in sorted(seats.items()) if a > 0 and b == 0]
        print(f"seed {r['seed']}: flagged seats {flags or 'none'}")
        for x in sorted(r['dockRead'], key=lambda x: (x['faction'], x['seat'], -x['seatTicks'])):
            print(f"  {x['faction']:<24} {x['seat']:<13} {x['governor']:<13} {x['name']:<14} seat-ticks {x['seatTicks']:>5}  docked {x['dockedTicks']:>5}  {x['dockedTicks']/x['seatTicks']:.1%}")
            t = tot.setdefault((x['faction'], x['seat']), [0, 0]); t[0] += x['seatTicks']; t[1] += x['dockedTicks']
    print('13-seed totals by seat:')
    for (f, p), (a, b) in sorted(tot.items()): print(f'  {f:<24} {p:<13} seat-ticks {a:>6}  docked {b:>6}  {b/a:.1%}')
