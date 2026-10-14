#!/usr/bin/env python3
"""Extract the diorama's bounded vanilla asset subset from a verified local client jar.

Usage: python3 scripts/extract-minecraft.py /path/to/1.21.11-client.jar
No network, runtime extraction, dependency or game executable is included.
Artwork/model data remain © Mojang AB/Microsoft; not covered by our source-code license.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

VERSION = "1.21.11"
SHA1 = "ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd"
URL = f"https://piston-data.mojang.com/v1/objects/{SHA1}/client.jar"
BLOCKS = "red_wool lime_wool red_terracotta red_concrete red_stained_glass packed_ice smooth_quartz_slab quartz_block smooth_quartz glass_pane oak_fence slime_block honey_block ladder oak_door oak_trapdoor scaffolding stone".split()
ROOT = Path(__file__).resolve().parents[1]
jar = Path(sys.argv[1])
assert hashlib.sha1(jar.read_bytes()).hexdigest() == SHA1, "Incorrect client archive/version"
archive = zipfile.ZipFile(jar)
sources = {}

def read(path):
    data = archive.read(f"assets/minecraft/{path}")
    sources[path] = hashlib.sha256(data).hexdigest()
    return data

def canonical(name):
    assert ":" not in name or name.startswith("minecraft:"), name
    return name.removeprefix("minecraft:")

models = {}
textures = set()

def model(name):
    name = canonical(name)
    if name in models:
        return models[name]
    raw = json.loads(read(f"models/{name}.json"))
    parent = model(raw["parent"]) if "parent" in raw else {}
    result = {"textures": {**parent.get("textures", {}), **raw.get("textures", {})},
              "elements": raw.get("elements", parent.get("elements", [])),
              "ao": raw.get("ambientocclusion", parent.get("ao", True))}
    models[name] = result
    return result

states = {}
renderable = set()
for block in BLOCKS:
    state = json.loads(read(f"blockstates/{block}.json"))
    states[block] = state
    applies = list(state.get("variants", {}).values()) + [p["apply"] for p in state.get("multipart", [])]
    for apply in applies:
        for variant in apply if isinstance(apply, list) else [apply]:
            model(variant["model"])
            renderable.add(canonical(variant["model"]))

# Resolve texture variables only after child overrides have been inherited.
baked = {}
for name in sorted(renderable):
    raw = models[name]
    elements = json.loads(json.dumps(raw["elements"]))
    for element in elements:
        assert "rotation" not in element, "Extend the renderer before adding rotated model elements"
        for face in element["faces"].values():
            texture = face["texture"]
            seen = set()
            while texture.startswith("#"):
                assert texture not in seen, "Cyclic texture alias"
                seen.add(texture)
                texture = raw["textures"][texture[1:]]
            face["texture"] = canonical(texture)
            textures.add(face["texture"])
    baked[name] = {"elements": elements}

ambient = {name: False for name in sorted(renderable) if not models[name]["ao"]}

def resolve(textures, ref):
    seen = set()
    while ref.startswith("#"):
        assert ref not in seen, "Cyclic texture alias"
        seen.add(ref)
        ref = textures[ref[1:]]
    return canonical(ref)

particles = {}
for block, state in states.items():
    applies = list(state.get("variants", {}).values()) + [p["apply"] for p in state.get("multipart", [])]
    first = applies[0][0] if isinstance(applies[0], list) else applies[0]
    m = models[canonical(first["model"])]
    particles[block] = resolve(m["textures"], m["textures"]["particle"] if "particle" in m["textures"] else "#all")
    textures.add(particles[block])

out = ROOT / "assets/minecraft/1.21.11"
out.mkdir(parents=True, exist_ok=True)
for texture in sorted(textures):
    target = out / f"{texture}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(read(f"textures/{texture}.png"))
# 1.21.11 moved the sun to textures/environment/celestial/sun.png; we publish it at the stable path environment/sun.png.
(out / "environment").mkdir(parents=True, exist_ok=True)
(out / "environment/sun.png").write_bytes(read("textures/environment/celestial/sun.png"))
bundle = {"version": VERSION, "states": states, "models": baked, "ambientOcclusion": ambient, "particles": dict(sorted(particles.items()))}
(ROOT / "src/registry/vanilla-blocks.json").write_text(json.dumps(bundle, separators=(",", ":")) + "\n")
(out / "provenance.json").write_text(json.dumps({
    "version": VERSION, "source": URL, "clientSha1": SHA1,
    "copyright": "Minecraft artwork and model data © Mojang AB / Microsoft. Not relicensed under the repository's code license.",
    "purpose": "Version-matched Minecraft visualization in @kero-lab/mc-diorama (RemHub, KeroHub Rem Live); no game code or executable distributed.",
    "usageGuidelines": "https://www.minecraft.net/en-us/usage-guidelines",
    "reproduce": "python3 scripts/extract-minecraft.py <verified-client.jar>",
    "sourceSha256": dict(sorted(sources.items()))}, indent=2) + "\n")
print(f"{len(BLOCKS)} blocks; {len(baked)} models; {len(textures)} textures")
