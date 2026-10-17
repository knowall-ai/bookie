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
