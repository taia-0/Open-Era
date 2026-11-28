#!/usr/bin/env python3
"""Build compact tables from measure.ts JSONL rows."""
import json, pathlib, statistics

ROOT = pathlib.Path(__file__).resolve().parent / "results"
TICKS_SHOW = (72, 1200, 5000)
PINS = {
    "flag-off": {1847: ("7f76e474", "94de9c02"), 2718: ("976c40bd", "7a3741c9"), 4096: ("08943ea5", "af6eeaea")},
    "ATLS": {1847: ("85658e53", "5367691c"), 2718: ("aa54ada1", "faf5798a"), 4096: ("e4361ee1", "7e93eab2")},
}

def load(path):
    rows = []
    for line in pathlib.Path(path).read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            print(f"skip incomplete line in {path} ({len(line)} chars)")
    return rows

def snap(row, tick):
    return next(s for s in row["snaps"] if s["tick"] == tick)

def fmt_int(n):
    if isinstance(n, float):
        if abs(n - round(n)) < 1e-6:
            n = int(round(n))
        else:
            return f"{n:,.1f}"
    return f"{int(n):,}"

def fmt_bytes(n):
    n = int(n)
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n/1024:.1f} KB"
    return f"{n/(1024*1024):.2f} MB"

def rng(vals, fmt=fmt_int):
    vals = list(vals)
    if not vals:
        return "—"
    lo, hi = min(vals), max(vals)
    if lo == hi:
        return fmt(lo)
    return f"{fmt(lo)}–{fmt(hi)}"

def med(vals, fmt=fmt_int):
    vals = list(vals)
    if not vals:
        return "—"
    return fmt(statistics.median(vals))

def load_all():
    out = {}
    for name, path in [("flag-off", ROOT / "flag-off-t5000.jsonl"), ("ATLS", ROOT / "atls-t5000.jsonl")]:
        if path.exists():
            out[name] = sorted(load(path), key=lambda r: (0 if r["seed"] in (1847, 2718, 4096) else 1, r["seed"]))
    return out

def main():
    data = load_all()
    lines = ["# State prune measurement summary", "", f"Seeds completed: " + ", ".join(f"{k} {len(v)}/13" for k, v in data.items()), ""]
    for label, rows in data.items():
        lines.append(f"## {label}")
        lines.append("")
        # pins
        lines.append("### Pins (t72 / t1200) vs expected")
        lines.append("")
        lines.append("| seed | t72 | t1200 | t5000 | expected t72/t1200 | match | replay |")
        lines.append("| ---: | --- | --- | --- | --- | --- | --- |")
        for row in rows:
            s72, s12, s50 = snap(row, 72), snap(row, 1200), snap(row, 5000)
            exp = PINS.get(row["label"], PINS.get(label, {})).get(row["seed"])
            match = "yes" if exp and s72["hash8"] == exp[0] and s12["hash8"] == exp[1] else ("n/a" if not exp else "NO")
            lines.append(f"| {row['seed']} | {s72['hash8']} | {s12['hash8']} | {s50['hash8']} | {exp[0]+' / '+exp[1] if exp else '—'} | {match} | {'exact' if row['replayExact'] else row['replayExact']} |")
        lines.append("")
        # world + events
        for tick in TICKS_SHOW:
            lines.append(f"### World and event log at t{tick} ({label}, {len(rows)} seeds)")
            lines.append("")
            lines.append("| seed | world | events | event bytes | contracts n / bytes | news n / bytes | carried n | orders | rels | chars (dead) | factions |")
            lines.append("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
            worlds, evs, evb = [], [], []
            for row in rows:
                s = snap(row, tick)
                st = s["structures"]
                worlds.append(s["worldBytes"]); evs.append(s["eventCount"]); evb.append(s["eventBytes"])
                ch = st["characters"]
                lines.append(
                    f"| {row['seed']} | {fmt_bytes(s['worldBytes'])} | {fmt_int(s['eventCount'])} | {fmt_bytes(s['eventBytes'])} | "
                    f"{st['contracts']['n']} / {fmt_bytes(st['contracts']['bytes'])} | "
                    f"{st['settlementNews']['n']} / {fmt_bytes(st['settlementNews']['bytes'])} | "
                    f"{st['carriedNews']['n']} | {st['standingOrders']['n']} | {st['relationships']['n']} | "
                    f"{ch['n']} ({ch['extra']['dead']}) | {st['factions']['n']} |"
                )
            lines.append(f"| range | {rng(worlds, fmt_bytes)} | {rng(evs)} | {rng(evb, fmt_bytes)} |  |  |  |  |  |  |  |")
            lines.append("")
        # structure ranges at 1200 and 5000
        for tick in (1200, 5000):
            lines.append(f"### Structure ranges at t{tick} ({label})")
            lines.append("")
            lines.append("| structure | entries | bytes | notes |")
            lines.append("| --- | --- | --- | --- |")
            keys = [
                ("contracts", "contracts", lambda s: f"open {s['contracts']['extra']['open']['n']}, closed {s['contracts']['extra']['closed']['n']}, closed>240 {s['contracts']['extra']['closedOlderThan240']}"),
                ("settlementNews", "settlement.news", lambda s: f">24 {s['settlementNews']['extra']['olderThan24']}, >180 {s['settlementNews']['extra']['olderThan180']}, max/port {s['settlementNews']['extra']['maxPerPort']}"),
                ("carriedNews", "character.carriedNews", lambda s: f"carriers {s['carriedNews']['extra']['carriers']}"),
                ("standingOrders", "character.standingOrders", lambda s: f"open {s['standingOrders']['extra']['open']}, closed>180 {s['standingOrders']['extra']['closedOlderThan180']}"),
                ("conversationMessages", "conversationMessages", lambda s: f"threads {s['conversationThreads']['n']}, replies {s['scheduledReplies']['n']}"),
                ("relationships", "character.relationships", lambda s: ""),
                ("knowledge", "character.knowledge", lambda s: ""),
                ("goals", "character.goals", lambda s: ""),
                ("debts", "character.debts", lambda s: f"remaining>0 {s['debts']['extra']['remainingPositive']}"),
                ("scars", "character.scars", lambda s: ""),
                ("homeService", "character.homeService", lambda s: ""),
                ("partySightings", "character.partySightings", lambda s: f"viewers {s['partySightings']['extra']['viewers']}"),
                ("factions", "factions", lambda s: ""),
                ("characters", "characters", lambda s: f"dead {s['characters']['extra']['dead']}"),
                ("aftermathRecords", "secessionAftermath.records", lambda s: f"peace {s['aftermathPeace']['n']}"),
                ("alliances", "alliances", lambda s: f"memory {s['allianceMemory']['n']}, raids {s['allianceRaids']['n']}"),
                ("scheduledReplies", "scheduledReplies", lambda s: f"pending {s['scheduledReplies']['extra']['pending']}"),
            ]
            for key, name, note in keys:
                ns, bs, notes = [], [], []
                for row in rows:
                    s = snap(row, tick)
                    ns.append(s["structures"][key]["n"])
                    bs.append(s["structures"][key]["bytes"])
                    notes.append(note(s["structures"]))
                # note range if varies
                uniq = sorted(set(notes))
                note_s = uniq[0] if len(uniq) == 1 else (f"{uniq[0]} … {uniq[-1]}" if uniq else "")
                lines.append(f"| `{name}` | {rng(ns)} | {rng(bs, fmt_bytes)} | {note_s} |")
            worlds = [snap(r, tick)["worldBytes"] for r in rows]
            evs = [snap(r, tick)["eventCount"] for r in rows]
            evb = [snap(r, tick)["eventBytes"] for r in rows]
            lines.append(f"| world (canonical JSON) | — | {rng(worlds, fmt_bytes)} | entire `WorldState` |")
            lines.append(f"| in-memory event log | {rng(evs)} | {rng(evb, fmt_bytes)} | not on `WorldState`; would sit in SQLite |")
            lines.append("")
        # growth per 1000
        lines.append(f"### Growth per 1,000 ticks ({label})")
        lines.append("")
        lines.append("| interval | world bytes / 1k ticks | events / 1k | event bytes / 1k | news entries / 1k | contracts / 1k |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        intervals = [(0, 1000), (1000, 2000), (2000, 3000), (3000, 4000), (4000, 5000), (0, 1200), (1200, 5000)]
        for a, b in intervals:
            wb, ev, eb, news, con = [], [], [], [], []
            ok = True
            for row in rows:
                try:
                    sa, sb = snap(row, a), snap(row, b)
                except StopIteration:
                    ok = False
                    break
                dt = b - a
                scale = 1000 / dt
                wb.append((sb["worldBytes"] - sa["worldBytes"]) * scale)
                ev.append((sb["eventCount"] - sa["eventCount"]) * scale)
                eb.append((sb["eventBytes"] - sa["eventBytes"]) * scale)
                news.append((sb["structures"]["settlementNews"]["n"] - sa["structures"]["settlementNews"]["n"]) * scale)
                con.append((sb["structures"]["contracts"]["n"] - sa["structures"]["contracts"]["n"]) * scale)
            if not ok or not wb:
                continue
            lines.append(
                f"| t{a}–t{b} | {rng(wb, fmt_bytes)} (med {med(wb, fmt_bytes)}) | "
                f"{rng(ev, lambda n: fmt_int(round(n)))} (med {med(ev, lambda n: fmt_int(round(n)))}) | "
                f"{rng(eb, fmt_bytes)} | {rng(news, lambda n: fmt_int(round(n)))} | {rng(con, lambda n: fmt_int(round(n)))} |"
            )
        lines.append("")
        # top events at 5000, first pin seed
        if rows:
            s = snap(rows[0], 5000)
            lines.append(f"### Top event types at t5000, seed {rows[0]['seed']} ({label})")
            lines.append("")
            lines.append("| type | count |")
            lines.append("| --- | ---: |")
            for ev in s["topEventTypes"]:
                lines.append(f"| `{ev['type']}` | {fmt_int(ev['n'])} |")
            lines.append("")
    text = "\n".join(lines) + "\n"
    out = ROOT / "summary.md"
    out.write_text(text)
    print(f"wrote {out} ({len(text)} bytes)")

if __name__ == "__main__":
    main()
