# Bookie character and voice sheet

Bookie is KnowAll AI's bookkeeper agent. This sheet is a recipe for making **more
images and videos of the same Bookie** (website heroes, banners, video frames) with
GPT-image and video models, and keeping him consistent. Paste the blocks
**verbatim**: identical wording plus the same reference images is what keeps him on-model.

## What's in this kit

| Path | What it is |
|---|---|
| `bookie-profile-1024.png`, `-512.png`, `-48.png` | The approved look. The 512 is the Teams/M365 photo. |
| `bookie-avatar.svg` | Standalone animated avatar: the 512 image plus one soft sunlight sweep across the study window (backdrop only, stops under `prefers-reduced-motion`). |
| `bookie-avatar-preview.html` | Developer-only side-by-side with Sallie and Poppie, at 256 px and 48 px. |
| `bookie-overlay-sallie.png`, `bookie-48-check.png` | Head-shape overlay against Sallie, and the 48 px check. |
| `bookie-agent.png` | Presence plate: 1536×1024 transparent cut-out, **eyes and the dashed LED line removed** (plain dark visor, glasses kept). The renderer draws both the eyes and his animated mouth. The LED line was filled from the surrounding glass inside x 700-820, y 591-611 only; the alpha channel is unchanged. |
| `bookie-bg-study.png` | Presence backdrop plate: the empty study. |
| `bookie-avatar.json` | Presence renderer identity (Poppie's schema). |
| `presence-test/` | Plate + backdrop + drawn eyes: eyes off, eyes on, a blink and glow-pulse GIF, and an "opaque lamp" preview (see Presence). |
| `references/` | The reference pack for image and video models (below). |
| `images/` | Example stills: six poses and four worked examples (WebP), plus a 1200×630 OG crop. |
| `prompts/blocks.sh` | The prompt blocks as shell variables. |
| `prompts/images.md` | The exact commands and shot lines behind `images/`. |
| `prompts/video-intro-*.txt` | The Gemini Omni prompts for the website intro video. |
| `prompts/narration-intro.txt` | The intro narration script. |
| `scripts/omni_video.py` | Generates or extends a Gemini Omni video (from Zaplie's kit). |
| `scripts/realtime_voice.py` | Records Bookie's real voice (gpt-realtime-2.1, voice `cedar`) reading a script. |
| `scripts/eye_glow_sync.py` | Pulses the eye glow on generated video with the narration's loudness. |
| `scripts/plate_test_render.py` | Composes the presence plates exactly like the renderer, to prove the eyes land. |

The website video lives in `web/public/bookie/` (`bookie-intro.mp4`, poster, captions, `bookie-loop.mp4`).

## Identity

- **Who:** Bookie, KnowAll AI's open-source bookkeeper. He watches a firm's books in
  Xero and Business Central, answers "who owes us, what's due, how does cash look", and
  joins Teams calls. He checks the real figures; he never guesses and never stores accounts.
- **Personality:** calm, precise, quietly reassuring. Dry British wit, used sparingly:
  a raised eyeshade rather than a punchline. Never flustered, never salesy.
- **Voice:** Azure OpenAI realtime voice **`cedar`** (the call-bot's `VOICE_REALTIME_VOICE`):
  a warm, unhurried, British-leaning male voice. British spelling and phrasing
  ("Shall we have a look?", "every client, one sign-in").
- **House style:** a non-human robot from the Sallie family. Glowing eyes, **no mouth,
  no lip-sync**. In video his eyes may glow brighter with his voice; nothing else on his face moves.

## Visual spec

| Part | Spec |
|---|---|
| Chassis | Glossy ivory enamel `#F2E8D8` (reads `#F0D6A8` in warm light), clean and polished |
| Trim | Thin polished gold lines `#D4A64A` on the dome, visor edge, ear cups, shoulders and chest seams |
| Head | Sallie's rounded helmet dome and rounded ear cups, unchanged in shape and size |
| Visor | Wide rounded rectangle of dark smoked glass `#110B06`, edged in gold |
| Eyes | Two round, solid, warm gold-white discs: centre `#FFF1C2`, rim `#FFC85A`, soft warm halo. Happy squint = soft arcs |
| Dashed line | A short, dim, dashed amber line `#F7DF77` low on the visor. Static, never a mouth |
| Neck | Bare dark ribbed graphite collar `#19110B`. **No bow tie** |
| Backdrop | His bright, sunlit study: dark wood bookshelves, brass lamp and globe, tall window onto a hazy city skyline, golden-hour light, shallow depth of field |

### Signature items

1. **The eyeshade.** A translucent KnowAll-green (`#22C55E`) celluloid banker's eyeshade
   on a dark headband, worn on the dome just above the visor. Short brim, held **flat**,
   almost horizontal. Its green tints the top of the dome. It never covers the visor.
   (When he looks down, you see the top of the brim, so it looks taller. That's
   perspective, not a different hat.)
2. **The glasses.** Thin gold wire-rim **round** glasses with clear lenses, in front of
   the visor, one lens centred on each eye, arms back to the ear cups.
3. **The antennae.** The family standard: two thin straight gold stalks with small
   ball tips, rising behind the eyeshade band.

## Reference pack

Pass these as `--ref`, **in this order**. The first reference carries the most weight.

| # | File | Why |
|---|---|---|
| 1 | `references/bookie-identity.png` | The approved look: head shape, colours, materials, eyes. Always first. |
| 2 | `references/bookie-detail-eyeshade-glasses.png` | Close-up of the eyeshade, glasses and antennae: the parts models drift on most. |
| 3 | `references/bookie-waistup.jpg` | Waist-up body, hands and shoulders, for any shot below the chest. Add it for body shots. |
| (4) | `bookie-agent.png` | Eyeless plate. Only for "eyes off", presence plates or edits where the eyes must be removed. Never for normal shots: it teaches the model "no eyes". |

For video (Gemini Omni) use 1 and 3 plus one still closest to the scene (for example `images/bookie-ledger.webp` converted to PNG).

## Prompt template

Build every prompt from four fixed blocks plus one slot. The blocks are in
`prompts/blocks.sh` as `$IDENTITY`, `$SIGNATURE`, `$FACE` and `$NEVER`:

```
$IDENTITY $SIGNATURE $FACE {SCENE / POSE / FRAMING} $NEVER
```

**IDENTITY**
> Bookie, KnowAll AI's bookkeeper: EXACTLY the robot in the reference images, same design, proportions and materials. A friendly, calm, non-human robot with a smooth rounded helmet dome and two matching rounded ear cups, all in glossy ivory enamel (#F2E8D8) with thin polished gold trim lines (#D4A64A); a wide rounded-rectangle visor of dark smoked glass (#110B06) edged in gold; a dark ribbed graphite neck collar; rounded ivory shoulder pads and chest panels with fine gold seams. Clean, polished, well-kept finish: no wear, scratches, grime or patina. There is exactly ONE Bookie; he never splits, duplicates or changes design. Photoreal cinematic render, never a plastic toy, never a cartoon.

**SIGNATURE ITEMS**
> His signature items, always present and always the same: (1) a translucent KnowAll-green (#22C55E) celluloid banker's eyeshade on a dark headband, worn on the dome just above the visor like a cap brim, with a SHORT brim held FLAT, almost horizontal; its green light tints the top of the dome; it never covers the visor. (2) Thin gold wire-rim ROUND glasses with clear lenses, resting on the front of the visor directly in front of his two eyes, a small gold bridge between them and the arms running back to the ear cups. (3) The standard family antennae: two thin straight gold stalks with small round gold ball tips, one each side of the dome, rising behind the eyeshade band. NO bow tie, no tie, no scarf, no clothing: the ribbed neck collar is bare.

**FACE RULES** (paste into every prompt)
> FACE RULES: his face is the dark glass visor with exactly TWO separate round glowing warm gold-white eyes (#FFF1C2 centre, #FFC85A rim) and nothing else, one centred behind each round lens. Each eye is a SOLID, evenly glowing disc with no pupil, no iris, no dark centre and no ring; the eyes are only ever solid round discs or, when he smiles, softly squinted happy arcs, never with pupils, never merged into a bar. A short, dim, dashed amber line sits low on the visor below the eyes and never moves. He has NO mouth, no nose, no eyebrows and no eyelashes; the visor never turns into a screen and never shows a drawn or cartoon face.

**NEVER**
> NEVER: no bow tie, no human face, no mouth, no lip-sync, no pupils, no extra eyes, no screen face, no different glasses shape (no half-moon, square or sunglasses), no tinted lenses, no different hat, no cap, no curled or bent antennae, no receipt tape, no nameplate, no logos on him, no readable text, letters or numbers anywhere in the image, no watermark.

**{SCENE / POSE / FRAMING}**: one short paragraph covering the pose, eyes (discs or happy
arcs), framing (where he sits in the frame and what space is left for text) and setting.
The default setting line:

> Setting: his bright, warm, sunlit study: dark wood bookshelves with leather-bound books, a brass desk lamp, a tall window with a soft hazy city skyline, golden-hour light, shallow depth of field so the background is softly blurred.

## Commands

GPT-image edits endpoint, `gpt-image-2.5-flare`, references attached. From the repo root:

```sh
source agent/assets/prompts/blocks.sh
GEN=~/GitHub/claude-plugins/skills/gen-image/generate.py
R=agent/assets/references
SHOT="Pose: ... Setting: ..."
python3 "$GEN" --model gpt-image-2.5-flare --input-fidelity high \
  --ref $R/bookie-identity.png --ref $R/bookie-detail-eyeshade-glasses.png \
  --size 1024x1024 --background opaque --quality high \
  --out bookie-new.png --prompt "$IDENTITY $SIGNATURE $FACE $SHOT $NEVER"
```

| Use | `--size` | Notes |
|---|---|---|
| Square, poses, social | `1024x1024` | |
| Website hero (3:2) | `1536x1024` | Say which side he stands on and what stays empty |
| Wide banner (3:1) | `1536x512` | Works directly |
| Portrait (2:3) | `1024x1536` | Add `--ref $R/bookie-waistup.jpg` |
| OG / social card | crop the hero | 1200×630: crop 1536×806 from the hero and resize (see `prompts/images.md`) |

`gpt-image-2.5-sunburst` is slower but better for **precision edits** of an existing
image (removing an item, switching the eyes off). For an edit, pass the image itself as
the only `--ref` and say "Keep this image EXACTLY the same... Make only ONE change: ...".
If anything else drifts, paste back only the edited region with a feathered mask
(that's how the bow tie was removed without touching the head).

## Worked examples and consistency checklist

All in `images/`, made with the commands above (shot lines in `prompts/images.md`).

Checklist for every new image. Reject and regenerate on any failure:

1. **Head shape:** rounded dome and ear cups as in the profile (for profile framing,
   check with `bookie-overlay-sallie.png`'s method: 50% blend plus edges against Sallie).
2. **Eyeshade:** green, translucent, short flat brim, above the visor, not covering it.
3. **Glasses:** round, gold wire, clear lenses, one lens per eye.
4. **Antennae:** two straight gold stalks with ball tips.
5. **Eyes:** two solid warm discs or happy arcs. No pupils, no rings, no mouth.
6. **Colours:** ivory and gold, not white plastic, chrome or bronze.
7. **No bow tie;** the collar is bare.
8. **No text:** nothing readable on screens, pages or walls; no logos or watermark.

| Example | File | 1 Head | 2 Shade | 3 Glasses | 4 Antennae | 5 Eyes | 6 Colours | 7 No tie | 8 No text |
|---|---|---|---|---|---|---|---|---|---|
| Website hero, Bookie on the right, empty left | `bookie-hero.webp` | ✓ | ✓ | ✓ | ✓ | ✓ arcs | ✓ | ✓ | ✓ |
| Wide 3:1 banner | `bookie-banner.webp` | ✓ | ✓ | ✓ | ✓ | ✓ discs | ✓ | ✓ | ✓ |
| Teams call section image | `bookie-section-teams.webp` | ✓ | ✓ | ✓ | ✓ | ✓ discs | ✓ | ✓ | ✓ |
| 2:3 portrait | `bookie-portrait.webp` | ✓ | ✓ | ✓ | ✓ | ✓ arcs | ✓ | ✓ | ✓ |
| Security band: low-key close-up by a vault door, on dark navy, empty left | `bookie-security.webp` | ✓ | ✓ | ✓ | ✓ | ✓ discs | ✓ | ✓ | ✓ |
| Security band, 2:3 phone version (separate render) | `bookie-security-portrait.webp` | ✓ | ✓ | ✓ | ✓ | ✓ discs | ✓ | ✓ | ✓ |
| Poses: welcome, ledger, chart, thumbs up, thinking, video call | `bookie-*.webp` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

The first hero attempt failed check "empty left": his raised hand reached into the
headline space. Saying "stands entirely within the RIGHT 40% ... both hands stay on the
right ... the LEFT 55% contains no character" fixed it.

## Do and don't

**Do**
- Start every prompt with the reference pack and the four blocks, unchanged.
- Put him in his sunlit study unless the scene needs somewhere else; keep backgrounds soft.
- Say where he sits in the frame and what must stay empty for text.
- Keep screens abstract: a few big glowing bars and a curve, out of focus.

**Don't**
- Don't add a bow tie, a tie, clothes, a nameplate or logos on him.
- Don't give him a mouth or pupils, or let the eyes "widen" (models turn wide eyes into eyeballs).
- Don't swap the glasses or eyeshade for another style, and don't tint the lenses.
- Don't let dashboards, ledgers or call grids carry readable text or numbers.
- Don't use the eyeless plate as a reference for normal shots.

## Video (Gemini Omni, Sora and similar)

Use the same four blocks, plus these motion rules:

> MOTION RULES: his body, arms, hands and head may move naturally (welcomes, nods,
> turning to a screen, reading). His two eyes stay two separate warm gold-white discs
> (or soft happy arcs) on dark glass in every frame. He has NO mouth: nothing on his face
> moves like talking, and the dashed line never moves. The eyeshade, the round gold
> glasses and the two ball-tipped antennae never change, slip, vanish or change shape.

Plus a sound block when the voice is added separately (it always is):

> SOUND: NO speech, NO voice, NO narration, NO singing and NO music at all. Only gentle,
> quiet room ambience: soft room tone, a faint clock tick, a distant hush of the city.

Making the website intro (`prompts/video-intro-*.txt`, about $4 at 720p):

```sh
S=agent/assets/scripts/omni_video.py; P=agent/assets/prompts; R=agent/assets/references
python3 -I $S --prompt-file $P/video-intro-part1.txt --ref $R/bookie-identity.png \
  --ref welcome.png --ref ledger.png --out part1.mp4 | tee part1.log
ID=$(grep -o 'interaction: [^ ]*' part1.log | cut -d' ' -f2)
python3 -I $S --prompt-file $P/video-intro-part2-extend.txt --ref $R/bookie-identity.png \
  --previous "$ID" --out part2.mp4 | tee part2.log          # returns 20 s
ID=$(grep -o 'interaction: [^ ]*' part2.log | cut -d' ' -f2)
python3 -I $S --prompt-file $P/video-intro-part3-extend.txt --ref $R/bookie-identity.png \
  --previous "$ID" --out part3.mp4                           # returns 30 s
```

Then: record the voice (`scripts/realtime_voice.py`), pulse the eyes with it
(`scripts/eye_glow_sync.py base.mp4 narration.wav glow.mp4 --offset 1.0`), and mix with
ffmpeg: narration loudness-normalised to -16 LUFS and starting at 1.0 s, and the Omni
ambience raised 10 dB, side-chain ducked under the voice, fading out over the last 1.7 s.

### Lessons from the intro

- The first dashboard screen came back covered in fake UI text and numbers. What
  fixed it: "kept softly OUT OF FOCUS ... shows ONLY four large, simple, glowing rounded
  bars ... and one smooth gold curve ... not even blurred pseudo-text".
- Omni ignored "pull back so he sits in the right third" (it pushed in, then cut to a
  centred wide shot). The title space at the end is a crossfade to `images/bookie-hero`
  with a slow push. Don't rely on Omni camera moves for layout.
- With no speech in the prompt, Omni gave him no mouth and kept the eyes as discs or
  arcs across all 30 s. Asking for "no speech, no music" gave a clean, steady
  ambience track (about -47 dB) to mix under the voice.
- Omni extensions cut to a new angle at about 11 s. That's fine, but check every
  extension's stills before paying for the next one.

## Voice

The narration is Bookie's real Teams voice: Azure OpenAI **`gpt-realtime-2.1`**, voice
**`cedar`**, on Bookie's own resource `ka-bookie-ai-swc` (resource group `ka-bookie-prod`). A TTS
deployment wasn't possible: `gpt-4o-mini-tts` isn't offered in swedencentral, and
`tts`/`tts-hd` don't have `cedar`. So `scripts/realtime_voice.py` asks the realtime model
to read the script verbatim over WebSocket and records the audio. Check the printed
transcript matches the script, and pick the take with the calmest pace.

```sh
export AZURE_OPENAI_KEY=$(az cognitiveservices account keys list -n ka-bookie-ai-swc \
  -g ka-bookie-prod --query key1 -o tsv)
python3 agent/assets/scripts/realtime_voice.py --script agent/assets/prompts/narration-intro.txt --out take.wav
```

## Presence (live call avatar)

`bookie-avatar.json` drives the shared renderer (`agent-presence`'s `robot_avatar.py`,
`PRESENCE_AVATAR_CONFIG`). The plate is the approved profile, centred on a 1536×1024
canvas, with the eyes switched off. The renderer draws the eyes, and the
`eye` fractions put them exactly where the approved image's eyes are (checked by
`scripts/plate_test_render.py`). The eyes are 39 px discs and the lenses' inner rim is
about 64 px, so the renderer's glass patch (1.35×) and halo (1.5×) stay inside the glasses.

Three renderer gaps, for whoever wires Bookie in:

1. `mouth_style: "none"` isn't implemented yet: anything other than `dotted` draws a bar.
   It needs a one-line guard (`if MOUTH_STYLE != "none":` around the mouth drawing).
2. Set `AVATAR_LASHES=off` in Bookie's renderer env (lashes default on).
3. The lamp is drawn at alpha `235 × glow` (about 74% at idle), so on dark glass the
   eyes look duller than the approved gold-white. `presence-test/bookie-plate-eyes-on-opaque-lamp.jpg`
   shows the fix (an opaque lamp with `eye_hot`), which matches the approved image; it
   would need a small renderer option, for example `plate.eye_opaque: true`.
