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
| 5 | `lights` | `city_lights`, no beacons: the beads shimmer | Scene: a calm, abstract light installation in a dark gallery-like room of the near future, an artwork about ledgers and balance. Hundreds of fine vertical threads hang from the ceiling, each carrying many tiny glowing beads of warm gold light, with a few pale green beads; together the beads form two soft, gently flowing curved waves of light, one filling the LEFT third and one filling the RIGHT third of the frame, rising and falling like a balanced chart drawn in points of light. The beads are small, distinct, crisp points. The background is deep navy darkness. The CENTRE of the frame is empty dark navy space with only a faint soft gradient glow, and no beads or threads in it. A dark reflective floor at the very bottom mirrors a few of the lights. |
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
