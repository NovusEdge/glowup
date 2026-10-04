import json, sys
from pathlib import Path

HERE = Path(__file__).parent
SHEET = HERE.parent.parent / "hooks" / "sprites" / "clawd.ts"
VIEWER = HERE / "viewer.html"
W, H = 24, 12

lines = (HERE / "clawd.art").read_text().splitlines()
palette, shiny, anims, transitions, outfits, named = {}, {}, {}, {}, {}, {}
errors = []
cur = None
i = 0


def kv(tokens):
    return dict(t.split("=", 1) for t in tokens if "=" in t)


def xy(s):
    return list(map(int, s.split(",")))


def block():
    global i
    out = []
    while lines[i].strip() != "end":
        out.append(lines[i])
        i += 1
    i += 1
    return out


while i < len(lines):
    p = lines[i].split()
    i += 1
    if not p:
        continue
    if p[0] in ("palette", "shiny"):
        (palette if p[0] == "palette" else shiny).update(l.split() for l in block())
    elif p[0] == "anim":
        o = kv(p[3:])
        cur = anims[p[1]] = {"loop": p[2] == "loop", "frames": []}
        cur["_exits"] = {int(n) for n in o["exits"].split(",")} if "exits" in o else set()
    elif p[0] == "trans":
        o = kv(p[2:])
        cur = transitions[p[1]] = {"from": o["from"], "to": o["to"], "frames": [], "_exits": set()}
    elif p[0] == "frame":
        o = kv(p[2:])
        fr = {"ms": int(p[1])}
        if "dx" in o:
            fr["dx"] = int(o["dx"])
        fr["head"] = xy(o["head"])
        if "hand" in o:
            fr["hand"] = xy(o["hand"])
        if "copy" in o:
            fr["px"] = list(named[o["copy"]])
        else:
            fr["px"] = lines[i : i + H]
            i += H
        if "name" in o:
            named[o["name"]] = fr["px"]
        # fx=x,y,c;... drops single particles (confetti) onto empty cells only
        if "fx" in o:
            g = [list(r) for r in fr["px"]]
            for spec in o["fx"].split(";"):
                x, y, c = spec.split(",")
                if g[int(y)][int(x)] == ".":
                    g[int(y)][int(x)] = c
            fr["px"] = ["".join(r) for r in g]
        if len(cur["frames"]) in cur["_exits"]:
            fr["exit"] = True
        cur["frames"].append(fr)
    elif p[0] == "outfit":
        o = kv(p[2:])
        px = block()
        if len({len(r) for r in px}) != 1:
            errors.append(f"outfit {p[1]} ragged rows")
        outfits[p[1]] = {"slot": o.get("slot", "head"), "anchor": xy(o["anchor"]), "px": px}


def check(name, a, minimum):
    a.pop("_exits")
    if len(a["frames"]) < minimum:
        errors.append(f"{name}: only {len(a['frames'])} frames")
    if a.get("loop") and not any(f.get("exit") for f in a["frames"]):
        errors.append(f"{name}: looping animation has no exit frame")
    for n, fr in enumerate(a["frames"]):
        if len(fr["px"]) != H:
            errors.append(f"{name}[{n}] has {len(fr['px'])} rows")
        if not 80 <= fr["ms"]:
            errors.append(f"{name}[{n}] ms {fr['ms']} < 80")
        for r, row in enumerate(fr["px"]):
            if len(row) != W:
                errors.append(f"{name}[{n}] row {r} len {len(row)}: {row!r}")
            if set(row) - set(palette) - {"."}:
                errors.append(f"{name}[{n}] row {r} unknown {set(row) - set(palette) - {'.'}}")
    seen = [tuple(f["px"]) for f in a["frames"]]
    ex = [n for n, f in enumerate(a["frames"]) if f.get("exit")]
    print(f"{name:14} {len(seen):2} frames, {len(set(seen)):2} distinct, {sum(f['ms'] for f in a['frames']):5} ms  exits {ex}")


for name, a in anims.items():
    check(name, a, 8)
for name, t in transitions.items():
    check(name, t, 4)
    if t["to"] not in anims or (t["from"] != "*" and t["from"] not in anims):
        errors.append(f"transition {name}: unknown from/to")

if errors:
    print("\n".join(errors))
    sys.exit(1)


def js(v):
    return json.dumps(v, separators=(",", ":"), ensure_ascii=False)


def pt(a):
    return "[" + ",".join(map(str, a)) + "]"


def frame(f):
    parts = [f"ms: {f['ms']}"]
    if "dx" in f:
        parts.append(f"dx: {f['dx']}")
    parts.append(f"head: {pt(f['head'])}")
    if "hand" in f:
        parts.append(f"hand: {pt(f['hand'])}")
    parts.append(f"px: {js(f['px'])}")
    if f.get("exit"):
        parts.append("exit: true")
    return "      { " + ", ".join(parts) + " },"


ts = [
    "// Hand-drawn by the artist; data only. Generated from art/clawd/clawd.art by art/clawd/build.py",
    "import type { PetSheet } from '../pets.ts'",
    "",
    "export const CLAWD_SHEET: PetSheet = {",
    f"  w: {W},",
    f"  h: {H},",
    f"  palette: {js(palette)},",
    f"  shiny: {js(shiny)},",
    "  animations: {",
]
for n, a in anims.items():
    ts += [f"    {js(n)}: {{ loop: {'true' if a['loop'] else 'false'}, frames: ["] + [frame(f) for f in a["frames"]] + ["    ] },"]
ts += ["  },", "  outfits: {"]
for n, o in outfits.items():
    ts.append(f"    {js(n)}: {{ slot: {js(o['slot'])}, anchor: {pt(o['anchor'])}, px: {js(o['px'])} }},")
ts += ["  },", "  transitions: {"]
for n, t in transitions.items():
    ts += [f"    {js(n)}: {{ from: {js(t['from'])}, to: {js(t['to'])}, frames: ["] + [frame(f) for f in t["frames"]] + ["    ] },"]
ts += ["  },", "}"]
SHEET.write_text("\n".join(ts) + "\n")

blob = js({"w": W, "h": H, "palette": palette, "shiny": shiny, "animations": anims,
           "transitions": transitions, "outfits": outfits})
VIEWER.write_text((HERE / "viewer.template.html").read_text().replace("__SPRITES__", blob))
print("wrote", SHEET.relative_to(HERE.parent.parent), "and", VIEWER.relative_to(HERE.parent.parent))
