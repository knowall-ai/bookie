# Bookie image prompts

The exact prompts behind `../images/`. They were made with the `gen-image` skill
(`generate.py`, OpenAI `gpt-image-2.5-flare`, edits endpoint, `--quality high`,
`--input-fidelity high`) with `references/bookie-identity.png` and
`references/bookie-detail-eyeshade-glasses.png` as references. Each image costs money
on the OpenAI account, so keep `--n` small.

Copy this into a shell from the repo root, set `SHOT` to one of the lines below, then run it:

```sh
source agent/assets/prompts/blocks.sh      # IDENTITY, SIGNATURE, FACE, NEVER
GEN=~/GitHub/claude-plugins/skills/gen-image/generate.py
R=agent/assets/references
STUDY="Setting: his bright, warm, sunlit study: dark wood bookshelves with leather-bound books, a brass desk lamp, a tall window with a soft hazy city skyline, golden-hour light, shallow depth of field so the background is softly blurred."
SHOT="Pose: WELCOME. Waist-up, facing the viewer, one hand raised to shoulder height in a gentle open-palm welcome, head tilted very slightly, eyes softly squinted into happy arcs. $STUDY"

python3 "$GEN" --model gpt-image-2.5-flare --input-fidelity high \
  --ref $R/bookie-identity.png --ref $R/bookie-detail-eyeshade-glasses.png \
  --size 1024x1024 --background opaque --quality high \
  --out bookie-welcome.png --prompt "$IDENTITY $SIGNATURE $FACE $SHOT $NEVER"
```

Convert for the web with Pillow: `Image.open(p).convert('RGB').save(out, 'WEBP', quality=82, method=6)`.

## Poses (1024x1024)

- **welcome** (`1024x1024`): Pose: WELCOME. Waist-up, facing the viewer, one hand raised to shoulder height in a gentle open-palm welcome, head tilted very slightly, eyes softly squinted into happy arcs. $STUDY
- **ledger** (`1024x1024`): Pose: READING A LEDGER. Waist-up, seated at a polished wooden desk, holding a large open leather-bound ledger in both hands, head bowed slightly as he reads through his round glasses, eyes solid round discs. The ledger pages show only faint, blurred, unreadable ruled columns, no legible writing or numbers. $STUDY
- **chart** (`1024x1024`): Pose: POINTING AT A CHART. Three-quarter view, standing beside a large wall-mounted screen showing a simple, clean bar chart and rising line in KnowAll green and gold with NO numbers, labels or text, pointing at the top of the line with one ivory finger, his head turned toward the viewer, eyes solid round discs. $STUDY
- **thumbsup** (`1024x1024`): Pose: THUMBS UP. Waist-up, facing the viewer, giving a confident thumbs up with one ivory hand at chest height, eyes softly squinted into happy arcs. $STUDY
- **thinking** (`1024x1024`): Pose: THINKING. Waist-up, three-quarter view, one hand stroking the bottom of his helmet like a chin, the other arm folded across his chest, head tilted, eyes solid round discs looking slightly up and to the side, thoughtful. $STUDY
- **teamscall** (`1024x1024`): Pose: ON A VIDEO CALL. Waist-up, seated at his desk facing a laptop, one hand lifted in a small friendly gesture as he talks to colleagues, eyes solid round discs. The laptop screen shows a softly blurred grid of four video-call tiles with people, no readable names, no logos, no text. $STUDY

## Worked examples

- **Hero** (`1536x1024`, `bookie-hero.webp`): Wide 3:2 WEBSITE HERO banner. Bookie, seen from the chest up, stands entirely within the RIGHT 40% of the frame, his body turned slightly toward the left and his head toward the viewer, eyes softly squinted into happy arcs, one hand resting on an open leather ledger on a desk in front of him; both hands and his whole body stay on the right side. The LEFT 55% of the frame contains no character and no objects in focus: only a calm, softly blurred warm wall and window light, so a headline can sit over it. $STUDY
- **Banner** (`1536x512`, `bookie-banner.webp`): Very wide 3:1 BANNER. Bookie from the chest up on the RIGHT side of the frame, facing the viewer with a calm friendly look, eyes solid round discs, an open leather ledger on the desk in front of him. The left two-thirds are a calm, uncluttered, softly blurred view of his warm study for text. $STUDY
- **Teams call section** (`1536x1024`, `bookie-section-teams.webp`): SECTION IMAGE: Bookie joining a Microsoft Teams-style video meeting. Over the shoulder of a person (seen from behind, out of focus) sitting at a modern office desk, looking at a large monitor that shows a video meeting grid: Bookie, in his sunlit study, fills the large main tile and gives a small friendly wave; three small tiles show blurred human colleagues. No logos, no names, no readable text or numbers on screen. Bright modern office, shallow depth of field.
- **Portrait** (`1024x1536`, `bookie-portrait.webp`; for new body shots also add `--ref $R/bookie-waistup.jpg`): Tall 2:3 PORTRAIT. Bookie standing, full upper body down to the hips, three-quarter view, holding a closed leather-bound ledger under one arm and giving a small nod, eyes softly squinted into happy arcs, plenty of space above the antennae. $STUDY
- **Security section** (`1536x1024`, `bookie-security.webp`, on the site as `web/public/bookie/security.webp`). The one shot that leaves the study: a large, low-key close-up on dark navy for the full-bleed "Your data stays yours" band. Of three options (a plain low-key portrait, holding a padlocked ledger, beside a vault door), the vault door was chosen: it says "kept safe" without a prop in his hands, and leaves the left side clean. Shot line: Wide 3:2 FULL-BLEED SECTION BACKGROUND. A LARGE, CLOSE view of Bookie from the chest up on the RIGHT side of the frame, within the right 40%, three-quarter view with his face turned toward the viewer, a calm, protective, reassuring look, eyes solid round discs. Behind him, softly out of focus, the edge of a great round polished brass vault door, closed, its rim lit by a soft warm gold glow. Low-key cinematic lighting against a deep, dark navy background (#0b1120): warm gold light on his ivory dome, gentle cool shadows. The LEFT 55% of the frame contains no character and no objects in focus: only smooth, calm, deep navy darkness fading to near black, so a headline and text can sit over it. Not at a desk, no study, no furniture. Uncluttered, warm and trustworthy, never menacing; shallow depth of field.
- **Security section, phones** (`1024x1536`, plus `--ref $R/bookie-waistup.jpg`; `bookie-security-portrait.webp`, on the site as `security-portrait.webp`): Tall 2:3 PORTRAIT for a phone screen. A LARGE, CLOSE view of Bookie from the chest up, centred horizontally in the UPPER 60% of the frame, three-quarter view with his face turned toward the viewer, a calm, protective, reassuring look, eyes solid round discs, plenty of space above the antennae. Behind him, softly out of focus, the edge of a great round polished brass vault door, closed, its rim lit by a soft warm gold glow. Low-key cinematic lighting against a deep, dark navy background (#0b1120): warm gold light on his ivory dome, gentle cool shadows. The LOWER 40% of the frame contains no objects: his shoulders fall away into smooth, calm, deep navy darkness fading to near black, so text can sit over it. Not at a desk, no study, no furniture. Uncluttered, warm and trustworthy, never menacing; shallow depth of field.
- **OG card** (`bookie-og-1200x630.jpg`): crop of the hero: `hero.crop((0, 40, 1536, 846)).resize((1200, 630))`.

## Edits (gpt-image-2.5-sunburst, the image itself as the only reference)

**Remove the bow tie** (the earlier look had one). Only the neck region of the result was
pasted back onto the approved image, through a feathered mask, so the head stays pixel-identical:

> Keep this image EXACTLY the same in every detail: same robot, same head shape, size and position, same ivory enamel and gold trim, same green eyeshade, same round gold glasses, same glowing eyes, same dashed line on the visor, same antennae, same ear cups, same shoulders, same lighting and the same bright study background. Make only ONE change: remove the small dark-green bow tie from the front of the neck, and fill that spot with the same dark ribbed graphite neck collar rings that surround it, continuing their horizontal grooves and sheen naturally, so the neck shows only the plain ribbed collar. Nothing else changes.

**Eyes off** (for the presence plate; only the visor region was pasted back):

> Keep this image EXACTLY the same in every detail: [...] Make only ONE change: switch OFF the two glowing eyes. Where the eyes were, the visor is now plain, unlit, glossy dark smoked glass, the same near-black as the rest of the visor, with only a faint soft reflection; no eyes, no glow, no light spots, no pupils, no rings. The round gold glasses frames stay exactly where they are, in front of the dark glass, their lenses clear so the dark visor shows through them. The warm glow that the eyes cast on the glasses rims and visor is gone. Nothing else changes.

**Cut-out matte:** same-size edit, "replace the ENTIRE background ... with a perfectly flat,
uniform, pure magenta (#FF00FF)", then chroma-keyed. The matte came from the edit and
the pixels from the original. Model-made transparent backgrounds and outpainting at a
new size both redrew the head, so don't use them for plates.

**Mouth off** (for the animated Presence mouth): no model edit. The dashed LED line
was filled locally in `bookie-agent.png`, inside x 700-820, y 591-611 only. The fill
interpolates the glass gradient from the box's edges, adds grain taken from the clean
glass just below, and is feathered over 4 px. The alpha channel and every pixel
outside the box are unchanged.

## Presence backdrop: the near-future study (`backdrops/bookie-bg-future.png`)

This is the Teams video backdrop he sits in front of, at `1536x1024` (the same size as
`bookie-bg-study.png`). The scene is empty, so it uses no reference images and none of
the character blocks. It calls the generations endpoint with the same model and settings:

```sh
GEN=~/GitHub/claude-plugins/skills/gen-image/generate.py
python3 "$GEN" --model gpt-image-2.5-flare --size 1536x1024 --background opaque --quality high \
  --out backdrops/bookie-bg-future.png --prompt "$LAYOUT $FUTURE_BASE"
```

**FUTURE_BASE:**

> Wide 3:2 EMPTY BACKDROP PLATE for a video-call avatar: Bookie's study of the near future, the private office of a calm, precise AI bookkeeper. Photoreal cinematic render, eye level, looking straight at the back wall. Dark walnut-wood and brushed-brass shelving holding neat rows of leather-bound ledgers, each shelf edge lit by a thin soft warm gold LED strip. Faint translucent holographic ledgers and simple abstract charts float in the air near the shelves: a few large glowing rounded bars and one smooth curve in soft gold with a hint of KnowAll green (#22C55E), made only of light, with no numbers, labels or text. Palette: deep navy (#0b1120) and warm gold, with small touches of KnowAll green; calm, warm and trustworthy, never cold or menacing. The CENTRE of the frame, where a character will be composited in front, is calm and uncluttered: smooth, softly lit, darker surfaces with no bright objects and no busy detail. Shallow depth of field: the whole scene is slightly soft-focus and gently blurred, so a figure in front stands out. NO people, NO robots, NO characters, NO furniture in the centre foreground, no readable text, letters or numbers anywhere, no logos, no watermark.

**LAYOUT** (three options were made, and option 1 was chosen):

1. **Chosen.** Layout: tall floor-to-ceiling window on the RIGHT showing a night-time city skyline of slender glass towers with warm gold and soft teal lights, gently out of focus; the ledger shelves fill the LEFT side; the centre is a smooth dark navy wall panel with a faint gold edge-light.
2. Layout: symmetrical. A wide, tall window across the middle of the back wall shows a night-time skyline far away, deeply blurred into soft gold and navy bokeh; shelves of ledgers with gold LED strips frame both sides; the holographic charts float faintly over the left and right shelves only, never in the centre.
3. Layout: a curved dark-wood wall of ledger shelves wraps around the scene like a library alcove, gold LED strips tracing every shelf; a tall narrow window on the LEFT shows a night skyline with soft lights; a faint green-and-gold holographic grid glows low across the back wall, deeply blurred; the centre stays dim, soft and empty.

Why option 1: the plain navy panel behind him gives his ivory dome and green eyeshade
the strongest contrast and the calmest centre. Its holograms are only big bars and a
curve. Option 2 put ruled lines on some panels that read as pseudo-text, and its skyline
bokeh sat right behind his head. Option 3 had a green glow in the centre and was busier
around him. Before committing a candidate, check it composited with Bookie:
`python3 scripts/plate_test_render.py . /tmp/out --bg candidate.png --size 1920x1080`.

## Presence backdrop options with motion (`backdrops/`)

The owner wanted more choice than the study above, each with a subtle backdrop motion
like Sallie's and Poppie's. Six more options were made, each a different composition
from the study's shelves-left, navy-wall, window-right layout. Every one is empty,
1536x1024, and keeps a calm, plain area behind his head. Each `bookie-bg-<slug>.json`
is the `backdrop` block for `bookie-avatar.json`; the PNG paths are relative to
`assets_dir`. They were made with the same command as the study, with the prompt
`"$SCENE $BACKDROP_BASE"`:

**BACKDROP_BASE:**

> Wide 3:2 EMPTY BACKDROP PLATE for a video-call avatar, set in the near-future world of a calm, precise AI bookkeeper. Photoreal cinematic render, eye level, looking straight ahead. Palette: deep navy (#0b1120) and warm gold and brass light, with only small touches of KnowAll green (#22C55E); calm, warm, quietly futuristic and trustworthy, never cold or menacing. The CENTRE of the frame (the middle third, from top to bottom), where a character will be composited in front, is calm and uncluttered: smooth, dim, plain dark navy surface or dark sky, with no bright objects, no lights and no busy detail there. NO people, NO robots, NO characters, NO statues, NO furniture in the centre foreground, no readable text, letters, numbers, labels, signs or screens with writing anywhere, no logos, no watermark.

Each scene was drawn to suit how its Presence effect picks pixels
(`robot_avatar.py`). `city_lights` twinkles every bright speck (luminance above 120)
right of the left 16% of the frame, and not under him. White specks count as
"windows" and saturated ones (gold, green) as "neon", each with its own depth.
`rain` treats the lit span of every row (luminance above 22) as glass, so the room
around the window has to be near-black. `flicker_zones` dims a soft disc now and then,
at a position given as a fraction of the 16:9 canvas.

| # | Slug | Motion | SCENE |
|---|---|---|---|
| 1 | `skyline` | `city_lights`: window lights twinkle, 4 red beacons on the spires | Scene: an elevated private office at the very top of a tower, high above a futuristic city at dusk turning to night. One seamless, full-width, gently curved panoramic glass wall wraps the whole room from edge to edge, with only a slim brass frame line along the bottom. Outside, the sky is a smooth gradient from deep navy at the top to a last thin band of amber near the horizon. A vast city of slender glass towers fills the LEFT third and RIGHT third of the view, with thousands of tiny crisp warm gold window lights, a few soft green accent lights, and a tiny red aviation light on the tip of each of the tallest spires. In the CENTRE the towers fall away to a distant low horizon, so the middle of the frame is open, calm, dark navy sky with nothing in it. The window lights are small distinct points, not blurred bokeh. Inside, only a dark polished floor at the very bottom with soft gold reflections. |
| 2 | `rain` | `rain`: Presence's bundled `avatar-rain-loop.mp4` (not copied here) runs down the glass | Scene: a quiet brass-and-glass study at night while it rains. The room interior is almost completely black, in deep shadow, with only a faint brass edge-glint on the window frame. One huge, tall, floor-to-ceiling window fills the frame from about one-fifth in from the left edge all the way to the right edge, top to bottom, divided only by two slim dark brass mullions. The glass is wet with fine rain streaks and droplets. Through the rainy glass a night city has melted into large, soft, out-of-focus bokeh discs of warm gold and amber, with a few soft green and teal discs, over deep navy. The CENTRE of the window is calmer and darker: smooth deep navy with only two or three faint, very soft bokeh discs. The far left fifth of the frame is a plain dark wall in deep shadow. |
| 3 | `observatory` | `city_lights` with `neon` 0: only the white stars twinkle; the gold ribs and frame stay still | Scene: the inside of a private observatory study at night. A great dark navy dome curves overhead, ribbed with a few slim brushed-brass arcs that catch warm gold light from a soft concealed glow along the base of the dome. One large OCTAGONAL window is set into the dome on the RIGHT side of the frame, fully inside the frame with a clear margin above it (its top edge about one-fifth down from the top of the image, its bottom edge just above the middle, spanning from about 62% to 90% of the width), framed in thin brass. Through it: a clear, dark night sky densely scattered with many BRIGHT, crisp, sharp white and pale-gold stars of varied sizes, like a long-exposure astrophotograph, with a very faint gold-and-green nebula haze. The rest of the dome is smooth and dark. The CENTRE of the frame is the plain, smooth, dimly lit curve of the navy dome wall. A low ring of warm gold light runs along the bottom of the frame. No telescope. |
| 4 | `atrium` | `flicker_zones` on the top-left and middle-right lamp globes | Scene: a tall, quiet atrium of a near-future counting house at night, seen straight on and symmetrical. Upper gallery balconies line the far LEFT and far RIGHT sides, each balcony edge traced by a thin warm gold LED strip. Several warm brass pendant lamps with softly glowing amber glass globes hang on long fine cables at different heights, two or three on the left side and two or three on the right side, each casting a soft pool of light. The CENTRE of the frame is a tall, smooth, plain dark navy wall rising into shadow, lit only by a faint soft gradient, with no lamps and no objects in front of it. A dark polished stone floor at the very bottom reflects the lamps faintly. Gently soft-focus, shallow depth of field. |
| 5 | `lights` | `city_lights`, no beacons: the beads shimmer. **Chosen**, and now also a looping video (below) | Scene: a calm, abstract light installation in a dark gallery-like room of the near future, an artwork about ledgers and balance. Hundreds of fine vertical threads hang from the ceiling, each carrying many tiny glowing beads of warm gold light, with a few pale green beads; together the beads form two soft, gently flowing curved waves of light, one filling the LEFT third and one filling the RIGHT third of the frame, rising and falling like a balanced chart drawn in points of light. The beads are small, distinct, crisp points. The background is deep navy darkness. The CENTRE of the frame is empty dark navy space with only a faint soft gradient glow, and no beads or threads in it. A dark reflective floor at the very bottom mirrors a few of the lights. |
| 6 | `vault` | `city_lights`, no beacons: the drawer lights twinkle | Scene: a vast, quiet, vault-like archive of the near future, seen in calm one-point perspective down a long symmetrical hall. Both side walls, LEFT and RIGHT, are floor-to-ceiling banks of brushed-brass ledger drawers in a neat grid, each drawer face plain and unmarked with one small softly glowing warm gold indicator light, and a rare few glowing green. Thin gold light lines run along the floor edges. The hall recedes into the distance, and its far end in the CENTRE of the frame dissolves into a soft, dark navy haze with no detail, so the middle of the frame is calm and dark. Smooth dark ceiling. Gently soft-focus, the drawer lights remaining small distinct points. |

The study (option 0) uses `city_lights` too, on its skyline. Two candidates were made per
scene. The first observatory had faint stars and a window cropped by the 16:9 frame, so
it was re-rolled with brighter stars and a lower window. The `stars` effect was not
used: it draws stars that drift sideways, like a ship in flight, inside a fixed window
rectangle of Sallie's bridge, so it does not suit a still dome.

Preview an option with the real renderer (6 s, 1280x720, one blink, no HUD), from the
repo root, given an agent-presence checkout:

```sh
python3 agent/assets/scripts/backdrop_preview.py ~/GitHub/agent-presence/src/call-bot/media \
  agent/assets agent/assets/backdrops/bookie-bg-skyline.json /tmp/skyline.mp4 --still /tmp/skyline.png
```

## The chosen backdrop as a subtle loop (`backdrops/bookie-bg-lights-loop.mp4`)

The owner chose the ledger light installation (`lights`) and asked for "a subtle looped
animation". `bookie-bg-lights-loop.mp4` is that plate as a **10 s seamless loop**,
1536x1024, 24 fps, H.264, about 4.2 MB. Presence shows it full-frame behind Bookie
through `backdrop.video` (`bookie-bg-lights.json` and `bookie-avatar.json`); the still
PNG stays as `bg`, the first frame and the fallback.

It is **procedural, made from the still**, not generated by a video model:

```sh
python3 agent/assets/scripts/ledger_lights_loop.py \
  agent/assets/backdrops/bookie-bg-lights.png agent/assets/backdrops/bookie-bg-lights-loop.mp4
```

The script splits the plate exactly into a smooth navy background (a grey opening:
min filter, max filter, blur) and a light layer (beads, threads, floor reflections), then
animates only the light layer:

- **Sway:** the threads swing sideways by about 1.5 px at the floor and not at all at the
  ceiling, with a slow drift across the room.
- **Breathing:** every bead brightens and dims by about 20% on its own phase, from two smooth
  random fields at one and two cycles per loop.
- **Travelling light:** one soft glint per loop runs left to right along each wave curve. It is
  weighted to where the beads are densest, so it follows the curves, and the two sides are half a
  loop apart.

Every motion is a function of `2*pi*t/T` with whole-number multiples, so the frame after the last
is the first one again: the script checks it (max difference 1 level, which is rounding). The
dark centre never changes (at most 6 levels of glow spill), and nothing is added to the scene.
The encode uses CRF 16 with the I/P/B quantiser ratios at 1.0, so the key frame at the loop
point matches the rest. A plain encode showed a faint shimmer of coding noise on the threads
there.

Why not an image-to-video model, as for the website intro (`scripts/omni_video.py`)? Those
re-imagine the scene. They drift from the approved plate, invent or melt beads, and need a
crossfade to loop, which ghosts. Procedural is exact, deterministic, loops perfectly and costs
nothing to re-run.

Preview it behind Bookie with an agent-presence checkout that has `backdrop.video`
(`backdrop_preview.py` picks up the `video` key from the JSON):

```sh
python3 agent/assets/scripts/backdrop_preview.py ~/GitHub/agent-presence/src/call-bot/media \
  agent/assets agent/assets/backdrops/bookie-bg-lights.json /tmp/lights.mp4 --still /tmp/lights.png
```

## Backdrops, round 2: a family with Sallie and Poppie (`backdrops/`)

The owner liked the ledger lights but found they fight the HUD: in a live call Presence
draws its usage and telemetry panels down the left third of the frame (from about a
quarter of the height to the bottom) and the KnowAll logo at the top right. He also
asked for backdrops "a little more consistent" with Sallie's bridge
(`sallie-openclaw/.../avatar-bg-bridge.png`) and Poppie's city lounge
(`poppie-hermes/assets/avatar/poppie-bg-city-lounge.png`), and for motion that is
clearly visible yet calm.

**The shared recipe** (what makes Sallie's and Poppie's a family):

- A real room, photoreal and cinematic, shot straight on at seated eye level in one-point
  perspective, with walls, a floor and a window frame you can read; not an abstract void.
- Low-key: the room is near-black, and nearly all the light comes from one feature (a
  window onto stars or a night city), plus at most one small warm practical.
- The bright, detailed feature carries the agent's colour and all the motion (stars,
  twinkling windows, neon, rain); everything else is still and dark.
- Gentle depth of field: the view beyond the glass is soft, the interior edges crisp, no
  foreground furniture.
- A calm, dark, low-detail side for the HUD. For Bookie that is the whole left third, and
  the head area stays plain dark wall so his ivory dome reads, with the top right left
  plain for the logo.
- Bookie's palette inside that frame: near-black and deep navy, warm gold, amber and
  brass, with only a touch of KnowAll green.

Five options, each 1536x1024 and empty, made with the same command as the study
(`gpt-image-2.5-flare`, generations endpoint, `--quality high`, no references), prompt
`"$SCENE $FAMILY_BASE"`. Each `bookie-bg-<slug>.json` is the `backdrop` block.

**FAMILY_BASE:**

> Wide 3:2 EMPTY BACKDROP PLATE for a video-call avatar, set in the near-future world of a calm, precise AI bookkeeper. Photoreal cinematic night interior, like a still from a film, shot at seated eye level, straight on, in calm one-point perspective. LOW-KEY lighting: the room itself is almost black, in deep shadow, lit only by the scene's one bright feature and a faint warm glow; most of the frame is very dark. Palette: near-black and deep navy (#0b1120), warm gold and amber light, brushed brass, and only a few small touches of KnowAll green (#22C55E). Calm, quiet, warm and trustworthy, never cold or menacing. COMPOSITION: the LEFT THIRD of the frame is a plain, smooth, dark wall in deep shadow, nearly black, with no lights, no windows, no shelves, no objects and no detail. The CENTRE third, where a character will stand in front, is calm, dim and plain from top to bottom, with no bright objects. The bright, detailed part of the scene sits in the RIGHT third. The very top of the frame, including the top-right corner, is plain dark ceiling or wall. Gentle shallow depth of field. NO people, NO robots, NO characters, NO statues, NO furniture in the foreground, no readable text, letters, numbers, labels, signs, screens or logos anywhere, no watermark.

| # | Slug | Motion | SCENE |
|---|---|---|---|
| 1 | `tower-office` | `city_lights` (windows 0.45, neon 0.55, 3 beacons): windows twinkle, red aviation lights blink. Poppie's effect | Scene: a private finance office high in a tower in the evening. On the RIGHT, from about 72% of the width to the right edge, one tall window in slim dark brass frames with a single vertical mullion; its top edge is about one-third down from the top of the image, with plain dark walnut wall above it. Through it, slightly out of focus, a night-time financial district: a low, wide skyline of glass towers, none of them taller than the window, with many tiny crisp warm gold window lights, a few soft green accent lights and a small red aviation light on the tip of each of the two or three tallest spires, under a deep navy sky with a last thin band of amber at the horizon. The rest of the back wall is dark walnut panelling in deep shadow. A dark polished floor at the very bottom reflects the city lights faintly. |
| 2 | `rain-library` | `rain`: Presence's bundled `avatar-rain-loop.mp4` runs down the window. Sallie's rain-room effect | Scene: a quiet private library of ledgers at night while it rains. On the RIGHT, from about 64% to 95% of the width, a single tall window in a slim dark brass frame, its top about one-fifth down from the top of the image, reaching down to the floor. The glass is wet with fine rain streaks and droplets; through it a night city has melted into large, soft, out-of-focus bokeh discs of warm gold and amber with a few soft green discs, over deep navy. The room around the window is almost completely black; only the window glows. No lamps. |
| 3 | `vault-door` | `backdrop.video`: a gleam rolls up the brass rim once per loop, dust motes drift in the light, the green status LED breathes | Scene: the quiet anteroom of a near-future vault. At the far RIGHT edge of the frame, the great round door of the vault, seen straight on and closed, cut off by the right edge so that only its left half to two-thirds is visible, starting at about 74% of the width, in polished brushed brass with concentric machined rings and a ring of round locking bolts, its rim catching a warm gold light. The door is modest in size: its circle spans only from about 40% to 92% of the height, so the whole upper third of the right side, above the door, is plain dark navy wall with nothing on it. A soft warm pool of light from a hidden source low on the left lights the door's face, with a few fine dust motes floating in front of it; no visible beam or shaft of light from above. One small soft green status light glows beside the door. A thin line of warm gold light runs along the base of the walls. Every other surface is smooth dark navy wall in deep shadow, nearly black on the left. |
| 4 | `dusk-overlook` | `backdrop.video`: the clouds drift, a distant aircraft light crosses the window, the skyline twinkles | Scene: a glass-walled overlook above a city at dusk, the private office of a finance house. On the RIGHT, from about 64% of the width to the right edge, a tall window in a slim brass frame, its top about one-fifth down from the top of the image, shows the sky at dusk: soft, slow, layered clouds in deep navy and slate blue, lit underneath by a band of warm amber and gold near the horizon, above a distant skyline of towers with tiny crisp gold window lights and a few green ones. A slim brass handrail runs across the bottom of the window. The interior is dark and plain. |
| 5 | `glass-archive` | `backdrop.video`: a soft reflection glides across the cabinet glass once per loop, the LED strips breathe | Scene: a brass-and-glass archive of ledgers in the near future. Seen from further back across the dark room: in the LOWER RIGHT, from about 74% of the width to the right edge, a low, wide glass-fronted cabinet only about chest high, in slim brushed-brass frames, receding slightly in perspective, with neat rows of dark leather-bound ledgers behind the glass, spines plain and unmarked; each shelf is lit from above by a thin warm gold LED strip, with a rare small green indicator light. The glass doors carry soft, faint reflections. The cabinet's top edge is at the vertical middle of the image; above it the upper half of the right side is plain, dark, empty wall. The cabinet does not reach the ceiling. Everything else is dark navy in deep shadow, with a dark polished floor reflecting the gold lines faintly. |

Re-rolls: the first office put a spire under the logo; the first vault doors sat behind
his ear cup and then under the logo; the first archive cabinets reached the ceiling. The
prompts above are the ones that fixed it. Presence cover-fits the 3:2 plate into 16:9, so
about 8% is cropped from the top and bottom, and a feature that starts at 64% of the
width ends up right behind his ear cup: ask for 72% or more.

The three video loops are procedural, from the still, like the ledger lights
(`scripts/backdrop_motion_loop.py`; 10 s, 24 fps, about 0.6-0.8 MB each; the script
checks the seam and that the left third never changes):

```sh
S=agent/assets/scripts/backdrop_motion_loop.py; B=agent/assets/backdrops
python3 $S $B/bookie-bg-vault-door.png $B/bookie-bg-vault-door-loop.mp4 \
  --glint 1.008 0.497 0.282 --motes 0.74 0.20 1.0 0.78 --pulse 0.803 0.449
python3 $S $B/bookie-bg-dusk-overlook.png $B/bookie-bg-dusk-overlook-loop.mp4 \
  --clouds 0.655 0.10 0.995 0.49 --cloud-px 70 --plane 0.19 0.15 --twinkle 0.655 0.50 0.995 0.84
python3 $S $B/bookie-bg-glass-archive.png $B/bookie-bg-glass-archive-loop.mp4 \
  --sheen 0.60 0.38 1.0 0.83 --breathe 0.60 0.38 1.0 0.83
```

The cloud drift is a two-phase flow loop (two copies drift 70 px a loop, half a loop
apart, cross-faded), so the clouds soften slightly at the cross-fade but never jump. The
aircraft and the reflection enter and leave out of view, so they need no cross-fade.

**Preview as on a real call:** `backdrop_preview.py` takes `--hud` (keeps the HUD, REC
dot, PRESENCE badge and logo; the ticker stays off) and `--no-badge`, and the mouth now
moves with a made-up speech level:

```sh
AVATAR_TICKER=0 AVATAR_LASHES=off python3 agent/assets/scripts/backdrop_preview.py \
  ~/GitHub/agent-presence/src/call-bot/media agent/assets \
  agent/assets/backdrops/bookie-bg-vault-door.json /tmp/vault.mp4 --still /tmp/vault.png --hud --no-badge
```

**Hiding the BOOKIE name plate.** Presence has no switch for it (`badge` is also the HUD's
title, "BOOKIE // TELEMETRY", so don't blank it). Setting `badge_style.badge_image` to a
fully transparent PNG works: the renderer finds no bounding box, scales the empty image
and composites nothing. That is what `--no-badge` does; for a live call, add a
transparent PNG to `assets_dir` and point `badge_style.badge_image` at it.

## Backdrops, round 3: the far future (`backdrops/`)

Round 2 kept the family recipe but read as present-day rooms; the owner said they "don't look very
futuristic", next to Sallie's starship bridge and Poppie's neon city. Round 3 keeps every rule of
the recipe (dark room at eye level, one lit feature on the right carrying the motion, a still dark
left third for the HUD, plain wall behind his head, a quiet top right for the logo, empty,
1536x1024) and moves the world firmly into science fiction. Same command as before, prompt
`"$SCENE $FUTURE3_BASE"`. All five use `backdrop.video`: each `bookie-bg-<slug>.json` names the still
(first frame and fallback) and its 10 s loop (1-2.3 MB).

**FUTURE3_BASE:**

> Wide 3:2 EMPTY BACKDROP PLATE for a video-call avatar: a far-future SCIENCE-FICTION interior, the domain of a calm, precise AI bookkeeper, with the production design of a high-end sci-fi film: seamless curved composite panels, recessed light-lines, holographic light, glass and brushed brass. Unmistakably the future, never a present-day room. Photoreal cinematic render, shot at seated eye level, straight on, in calm one-point perspective. LOW-KEY lighting: the room itself is almost black, in deep shadow; nearly all the light comes from the scene's one bright feature on the right; most of the frame is very dark. Palette: near-black and deep navy (#0b1120), warm gold and amber light, brushed brass, and only a few small touches of KnowAll green (#22C55E). Calm, quiet, warm and trustworthy, never cold or menacing. COMPOSITION: the LEFT THIRD of the frame is a plain, smooth, dark curved wall panel in deep shadow, nearly black, with no lights, no windows, no consoles, no objects and no detail. The CENTRE third, where a character will stand in front, is calm, dim and plain from top to bottom, with no bright objects. The bright, detailed part of the scene sits in the RIGHT third, starting no further left than about 70% of the width. The top quarter of the frame, including the top-right corner, is plain dark ceiling or wall. Gentle shallow depth of field. Any holograms are made only of light and show only abstract bars, smooth curves, rings and dots: no glyphs, letters, numbers or symbols. NO people, NO robots, NO characters, NO statues, NO furniture in the foreground, no readable text, letters, numbers, labels, signs, screens with writing or logos anywhere, no watermark.

| # | Slug | Motion | SCENE |
|---|---|---|---|
| 1 | `orbital-deck` | Earth turns below the viewport (flow loop), its city lights and the stars twinkle, a shuttle crosses the stars, the holo panels float and flicker | Scene: the finance deck of an orbital space station. On the RIGHT, from about 70% of the width to the right edge, a large curved viewport in a slim brass frame, its top edge about one-third down from the top of the image. Through it, Earth from orbit at night: the dark curve of the planet fills the lower part of the viewport, covered in a fine web of warm gold city lights, with a thin glowing blue-gold atmosphere line along its horizon and black space with a few stars above. Just in front of the viewport float two or three faint translucent holographic ledger panels in soft gold, showing only abstract rounded bars and one smooth curve. A thin gold light-line runs along the base of the curved wall. |
| 2 | `neon-counting-house` | seven flying craft cross the window with light trails, light climbs the holographic ledger columns, the city twinkles | Scene: a counting-house on a high floor of a megacity tower of the far future, at night. On the RIGHT, from about 70% of the width to the right edge, a tall window, its top edge at about 40% of the height, so the whole upper part of the right side above it, including the top-right corner, is plain dark wall. Through it, slightly out of focus, a vast cyberpunk megacity in warm gold and amber light with a few green accents: towering arcologies with tiny crisp window lights, glowing sky-bridges, and a few small flying vehicles with bright gold and red running lights, under a deep navy sky with soft haze. No signs and no writing. Just inside the window stand three tall, slender holographic ledger columns of soft gold light, made of thin stacked horizontal light bars, translucent. The room is dark. |
| 3 | `holo-vault` | light runs round the rings of the door, the holographic coins float and flicker, data motes drift, the green light breathes | Scene: a sci-fi data vault chamber. At the far RIGHT edge of the frame, a great circular data-vault door seen straight on and closed, cut off by the right edge so that only its left half is visible, starting at about 74% of the width; its circle spans from about 38% to 92% of the height. The door is dark glass and brushed brass, with concentric rings of thin glowing warm gold light-lines tracing its rim and a few segmented arcs of light, and a small soft green light at its edge. In front of it, a few small translucent gold holographic coins and thin ring shapes float in a slow arc, made only of light. The whole upper third of the right side, above the door, is plain dark wall. A thin gold light-line runs along the floor. |
| 4 | `starship-bridge` | the nebula drifts (flow loop), stars twinkle, a ship crosses the viewport, the console charts pulse upwards | Scene: the quiet ledger bridge of a far-future starship, a sibling of a classic starship bridge. On the RIGHT, from about 70% of the width to the right edge, a tall faceted viewport in a dark composite frame with slim brass trim, its top edge at about 40% of the height, so the whole upper part of the right side above it, including the top-right corner, is plain dark panelling. Through it, deep space: a soft, glowing nebula of gold, amber and faint teal clouds, scattered with many crisp bright stars of varied sizes. Below the viewport, a low, sleek console with gold-trimmed edges whose glass surface glows faintly with abstract bar charts and curves only, no text. The rest of the bridge is dark curved panelling in deep shadow. |
| 5 | `data-archive` | packets of gold light flow down the data streams and their floor reflections, the skyline twinkles, one craft crosses the far window | Scene: a far-future data archive of dark glass. On the RIGHT, from about 70% of the width to the right edge, a short corridor of dark glass panels recedes in perspective, and inside the glass run many thin vertical streams of glowing warm gold light, like flowing data, made of fine dots and short dashes of light, with a rare green one. At the far end of the corridor, a tall narrow window shows a futuristic night skyline of slender glowing towers. The top of the glass panels is about one-third down from the top of the image, with plain dark ceiling above. A dark polished floor reflects the gold streams faintly. |

Two candidates were made per scene. Picks: orbital `a` (the `b` panels had rows of short lines
that read as pseudo-text), vault `a`, archive `b` (its streams start clear of his ear cup). The
first counting-house and bridge windows reached the top and put a busy city or bright nebula under
the logo, so they were re-rolled with the window's top edge at 40% of the height (the prompts
above).

Loops (`scripts/backdrop_motion_loop.py`, which gained `--flow`, `--traffic` and `--bob` for these):

```sh
S=agent/assets/scripts/backdrop_motion_loop.py; B=agent/assets/backdrops
python3 $S $B/bookie-bg-orbital-deck.png $B/bookie-bg-orbital-deck-loop.mp4 \
  --clouds 0.76 0.50 0.995 0.69 --cloud-px 60 --twinkle 0.62 0.15 0.995 0.69 --traffic 0.62 0.14 0.995 0.40 2 --bob 0.575 0.37 0.765 0.65
python3 $S $B/bookie-bg-neon-counting-house.png $B/bookie-bg-neon-counting-house-loop.mp4 \
  --traffic 0.63 0.27 0.995 0.62 7 --flow 0.85 0.27 0.965 0.84 -1 --flow 0.75 0.55 0.815 0.84 -1 --twinkle 0.63 0.27 0.995 0.84
python3 $S $B/bookie-bg-holo-vault.png $B/bookie-bg-holo-vault-loop.mp4 \
  --glint 0.969 0.46 0.263 --glint-gain 0.8 --bob 0.665 0.26 0.80 0.62 --motes 0.66 0.20 0.99 0.80 --pulse 0.777 0.454
python3 $S $B/bookie-bg-starship-bridge.png $B/bookie-bg-starship-bridge-loop.mp4 \
  --clouds 0.665 0.19 0.995 0.58 --cloud-px 50 --twinkle 0.64 0.17 0.995 0.60 --traffic 0.64 0.17 0.995 0.58 1 --breathe 0.64 0.62 0.995 0.71 --flow 0.64 0.62 0.995 0.71 -1
python3 $S $B/bookie-bg-data-archive.png $B/bookie-bg-data-archive-loop.mp4 \
  --flow 0.75 0.10 1.0 1.0 1 --twinkle 0.685 0.30 0.745 0.65 --traffic 0.69 0.30 0.742 0.55 1
```

Craft enter and leave outside the window mask, so they need no cross-fade; flow packets move a
whole number of wavelengths per loop; hologram float and flicker are whole cycles per loop. The
script reports the seam (at most 1 level) and that the left third never changes (0).
