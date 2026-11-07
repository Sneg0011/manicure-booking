# DIRECTION SHEET — The name as a monument
seed 1858698963 · drawn 2026-11-07 · sector fashion
Brief: студия маникюра Лунка: две мастерицы, запись онлайн на свободное время, перенос и отмена без звонка

| | |
| --- | --- |
| Direction | The name as a monument |
| Hero | Film title, bottom edge |
| Type | Gambarino / General Sans |
| Colour | Frost and slate |
| Sections | list (One item per poster line) → about (Pinned title, portraits pass) → how-it-works (Lines that step across) → contact (Address in display rows) → footer (Columns above, wordmark below) |
| Motion | Slow crossfade |
| Photographs | the "City by day" set, as atmosphere |

This is the direction for this build. Adopt it. Do not blend it with the layout you would have made anyway,
and do not redraw because it is unfamiliar: unfamiliar is the point. Redraw a slot only when it conflicts
with a stated brand constraint or needs an asset that does not exist, and say why in your report.

The parts of this sheet were written separately and will disagree in small ways. Settle every disagreement in this order:
**house rules** (including type no smaller than 13px and body text of 16px or more) → **the direction** (the idea, the composition habits, where the
one accent goes) → **the type system and the palette** (which face does which job, the five size steps, which colour is the ground and where the
accent goes) → **the hero blueprint** → **the section blueprints**. Under each blueprint below, "Adjusted for this page" lists where it disagrees.
In practice: take geometry from blueprints (columns, proportions, what sits where) and take everything else from above them. Map every size a
blueprint names onto one of your five type steps instead of adding a sixth. Use one button shape, one corner radius and one pair of page margins on
the whole page, whatever individual blueprints say. If a blueprint names a kind of typeface (a light serif, a heavy grotesk), use the dealt face.

## 1. The idea
The name is the headline. Set it so large that it becomes architecture: as wide as the viewport, cropped by an edge, or stacked to fill the screen. Nothing else on the first screen competes; the description of what this is drops to a single small sentence. The idea comes from treating the name's letters as material. Ask what the subject can do to its own name: a photograph of the work sits inside a counter or replaces a letter, the name repeats down the page like a reel, the letters are split to opposite corners and the page happens between them. In the study this was the single most common device among sites scoring 7.5 or more.

Before anything else, write one sentence in your notes: "On this page, <the subject's own material> becomes <the device>."
Fill the first blank from your inventory of what only this client has (its name and what it means, its street, its numbers, its
constraint), then put the nearest competitor in the sentence: if it still works, the idea is the category's, not the client's.
Then name the one live thing the visitor can do on the page (SKILL.md step 4).

## 2. Composition
First screen: the wordmark spans 88–100% of the viewport width (font-size 16–24vw, set with a clamp so it never wraps), anchored either to the bottom edge with its descenders nearly touching it, or dead centre with everything else pushed to the corners. One line of supporting text at 16–20px sits in a corner on a shared margin; navigation is three or four words in the opposite corner. After the hero the page is deliberately small and calm: a narrow text column or a simple two-column grid, so the contrast with the monument holds. The name returns once more at full width as the footer, in the inverse colours. Margins are tight (20–32px) so the type reaches the edges. Two type sizes do nearly all the work: the monument and a small text size, with one mid size for section headings.

## 3. Type — Gambarino / General Sans
A narrow, sharp display serif for headlines against a small plain sans: a five-to-one jump with nothing between. Suits agencies, bakeries and restaurants, fashion and editorial brands.
```html
<link rel="preconnect" href="https://api.fontshare.com">
<link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>
<link href="https://api.fontshare.com/v2/css?f[]=gambarino@400&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500&display=swap" rel="stylesheet">
```
- Display: **Gambarino** — weight 400 (single cut) · tracking -0.02em · leading 0.92 · sentence case
- Text: **General Sans** — 400 for body, navigation and buttons, 500 for emphasis · leading 1.5
```css
:root {
  --step-small: clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem);
  --step-body: clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem);
  --step-lead: clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem);
  --step-head: clamp(2rem, 1.3rem + 3.2vw, 4rem);
}
```
One family. The display cut must survive enormous sizes: tight tracking (-0.04 to -0.07em), leading 0.8–0.9, optical kerning on. Section headings are modest (28–40px) on purpose.
The direction decides sizes and how many of them; the type system decides how this face is set. Where the two give different tracking or leading, use the values of the type system: they are tuned to this face.
The display size itself comes from the hero blueprint below.

## 4. Colour — Frost and slate
```css
:root {
  --bg: #f7f9fa;
  --surface: #ecf0f2;
  --ink: #1f3038;
  --muted: #5d6b72;
  --accent: #0d7480;
  --accent-ink: #ffffff;
}
```
Cool white and one paler blue-grey step hold everything, with type in dark slate instead of black. Teal appears once per screen at most, as the primary button or one small detail beside the product photograph.
Two values carry the page (ground and ink). The accent, if used at all, appears on one thing only: the single action or the inset image frame. The footer inverts ground and ink.

## 5. Imagery
**The project has no photographs of its own yet.** First choice: **real pictures of the subject's world from the open collections**: its city and street in old postcards and photographs, an old map of the neighbourhood, its materials up close, its trade in engravings, museum objects of its kind (references/imagery.md §3). Start with `node "C:/Users/Пухлый/Desktop/Claude MAIN/.claude/skills/design-taste-frontend/scripts/assets.mjs" "студия маникюра"`, then queries from your inventory (its street, its materials, its trade's tools and history). Download what you use into the project with `--get` and credit every one on the page (`--credits` prints the footer line). They show the world around the client, never the client's own room, dish, product, person or team. Second, for what no honest picture exists of: draw the subject's own things in code, large, in one flat graphic language and the palette's real colours (its tiles, its windows, its objects; references/imagery.md §8). Third: the dealt photographs, only where an honestly generic picture fits (the sea, the weather, a material), never one a visitor could take for the thing itself and never an unrelated scene. One treatment for all of them. If this direction is built on photographs, plan the set before building (four to six pictures of one family) and reuse them at different crops and scales instead of finding or drawing a new picture for every slot; keep drawings as `<symbol>` + `<use>` or generate them with a small script so the page stays light. List every found picture (with its source and licence), every dealt photograph and every drawing that stands in for photography in your report.

Few images, used as inserts in the typography rather than as illustrations beside it: one photograph inside or behind the name (a 4:5 or 1:1 frame replacing a letter, or tucked between two words), then a short run of large full-width or half-width photographs further down. Square corners. No collage of small thumbnails.

**Floor (the inspector checks it):** at least four real pictures on the page, usually six to twelve; SVG drawings do not count. One moving picture where an honest clip exists: `node <skill>/scripts/assets.mjs --video "<query>"`, used as a muted loop with a poster frame. Whatever this direction says about pictures, it is carried out with real ones.

Photographs dealt for this build, from the "City by day" set (streets and buildings in daylight)
Order of preference for imagery: (1) the project's own photographs and product shots; (2) images you generate, if an image tool is
available; (3) real pictures of the subject's world found in the open collections (assets.mjs, downloaded and credited on the page);
(4) drawings of the subject in code; (5) these. They are real photographs (Unsplash licence, served by picsum.photos) of places, light and
texture. They are atmosphere, never a stand-in for a specific product, dish, person or interface. List the ones you use in your report so
they can be replaced.
- `https://picsum.photos/id/57/1600/1000` — Narrow city street lined with brick buildings in shadow · mid tone · brick red, teal blue, dark grey · calm area: bottom · native portrait · photo: Nicholas Swanson
- `https://picsum.photos/id/868/1600/1000` — Aerial view of a dense city skyline fading into haze · mid tone · grey blue, slate, pale grey · calm area: top · native square · photo: Jeffrey Swanson
- `https://picsum.photos/id/1029/1600/1000` — Aerial view of a large city park surrounded by towers · mid tone · forest green, grey, pale haze · calm area: top · native landscape · photo: freddie marriage
- `https://picsum.photos/id/344/1600/1000` — Hazy golden city skyline reflected in still water · mid tone · muted gold, olive, pale yellow · calm area: top · native landscape · photo: Alex Gindin
- `https://picsum.photos/id/299/1600/1000` — City street between tall brick buildings with a glass tower beyond · mid tone · warm brown, pale blue, grey · native landscape · photo: Matthew Wiebe
- `https://picsum.photos/id/826/1600/1000` — Boat on a canal between tall brick warehouses in hazy light · dark tone · dark brown, hazy cream, dark teal · native landscape · photo: Nick Scheerbart
- `https://picsum.photos/id/1065/1600/1000` — Narrow alley between old stone buildings opening onto the sea · mid tone · stone beige, sea blue, dark brown · native portrait · photo: Bertrand Zuchuat
- `https://picsum.photos/id/308/1600/1000` — Narrow street of colourful houses with laundry hung between them · mid tone · terracotta red, pale yellow, sky blue · native landscape · photo: Charles L.
The last two path numbers are width and height: request the exact crop you render (`/1200/1500` for a 4:5 portrait, `/2400/1350` for a hero) and
add `?grayscale` to desaturate. Use three to six of them, not all eight. Always set `width`, `height`, `alt` and `loading="lazy"` (not on the hero image).
Other sets that fit this brief: fog-and-quiet, coast, desert-and-road, city-night — `node draw.mjs --photos <set>` prints one in full; `--photos list` shows all sets. Taking photographs from another set is your call and is not a redraw; keep them to one light and one treatment.

## 6. Hero — Film title, bottom edge
One photograph fills the viewport at 100vw by 100svh, `object-fit: cover`, with its subject in the upper two-thirds and a calmer, darker zone along the bottom. The name is one condensed uppercase word, or a short name in a high-contrast serif, set at clamp(150px, 17.5vw, 290px) and sized to span the full width between 32px margins. It is centred and anchored so its baseline sits 34px above the bottom edge, covering roughly the lowest quarter of the frame. A soft neutral dark scrim lies under that bottom band only, about 40% of the height; the rest of the image is untouched. Directly above the name's left end, on the same margin, sits the supporting sentence at 16px on two short lines. Directly above its right end, right-aligned, sits the single action as a small paper-coloured rectangular button. The top edge carries a small emblem or wordmark at the left margin and up to five text links at 15px grouped at the right, all in white. The central half of the screen belongs to the view.

On a phone: The photograph is re-cropped to portrait with `object-position` on its subject and fills 100svh. The name stays on the bottom edge at 22vw on one line, or two lines at 20vw beyond eight characters, 20px above the edge. The supporting sentence sits above the name's left end at 15px. The action button moves to the top-right corner and the links collapse to a menu word beside the emblem.
Headline: The name of the place: one word of up to about 12 characters at 17.5vw, or two words stacked on a phone.

Adjusted for this page:
- It names a kind of typeface: use the dealt faces (display Gambarino, text General Sans) and their settings; capitals only where the type system sets them.
- It names colours (white): map them onto this palette's roles (ground `--bg`, panels `--surface` and the fields, text `--ink`/`--muted`, the accent `--accent` on the primary action only).

## 7. Sections, in order
Each is a composition to rebuild with this project's content. Keep the geometry; change the subject. Re-order or drop a
section when the argument of the page needs it (see references/copy.md), never to fall back to a card grid.

### 1. list — One item per poster line (statement)
A short list set as a poster. Four to seven items (services, headline acts, courses, opening days) stack one per line at clamp(64px, 10vw, 150px) in the display weight, all capitals or all lowercase, leading 0.92, flush left at a 20px margin on a flat field. Its one detail (a price, a date, a time range) sits at the right margin on the same baseline at 18–20px with tabular figures, so the page has two alignments only: giant words left, small facts right. Items too long for one line at this size are shortened, not shrunk. Between items there is only the tight leading. Hovering an item swaps its ink for the accent. There is no heading: the first item starts 80px below the section top and the last ends 80px above the bottom. The list reuses the hero title's exact type size, so it reads as another poster.
On a phone: Items at 15vw, one per line, flush left with 16px margins. Each detail moves beneath its item at 15px, left-aligned, with 6px above and 22px below. If any single word is wider than the screen at 15vw, drop the whole list to 12vw rather than breaking a word.

Adjusted for this page:
- It names a kind of typeface: use the dealt faces (display Gambarino, text General Sans) and their settings; capitals only where the type system sets them.

### 2. about — Pinned title, portraits pass (pinned)
A wrapper tall enough for its portraits: about 90svh per person, up to six people. A `position: sticky; top: 0` layer of 100svh holds the heading, two words at clamp(88px, 12vw, 180px), leading 0.85, centred at mid-height, in white with `mix-blend-mode: difference` so it reads over ground and photographs alike. Beneath it in the stacking order, portraits scroll past in normal flow: each a 4:5 photograph 26–30vw wide, alternately starting at column 2 and ending at column 11, 60svh apart, so each one passes behind a different half of the heading. Under each portrait's left corner: the name at 18px, the role at 14px in the soft ink, and one sentence of up to 30 words in a 280px measure. The last portrait is followed by 40svh of empty ground before the heading releases. Square corners. Nothing else is on screen.
On a phone: The heading shrinks to 17vw and pins 16px from the top instead of at mid-height. Portraits become 72% wide, alternating between the left and right margins, 48px apart, each with name, role and sentence beneath at the portrait's width.

Adjusted for this page:
- It names colours (white): map them onto this palette's roles (ground `--bg`, panels `--surface` and the fields, text `--ink`/`--muted`, the accent `--accent` on the primary action only).
- It blends text with `difference`: over anything but black, white or grey that gives random hues. Use a solid ink chosen for each ground instead.

### 3. how-it-works — Lines that step across (statement)
The sequence is written, not counted. Four lines of display type, one stage per line, each a complete short clause that begins with its order word: 'First you send it.' 'Then we take it apart.' 'You choose one.' 'It ships on Friday.' Set at clamp(36px, 4.6vw, 76px), leading 1.0, one line each. The first line starts on column 1 and each following line starts two columns further right (grid-column-start 1, 3, 5, 7), so the block descends as a staircase and the eye follows the diagonal. Under each line, on that line's own left edge and 12px below, a sentence of up to 34ch at 17px in the soft ink. 56px between stages. The last line may take the accent colour as the single emphasis. The first line serves as the heading; there is no title above. Leave the columns to the left of the final stage empty.
On a phone: Lines drop to 8.4vw and may wrap onto a second line. The staircase becomes a smaller indent of 6vw per stage, so the fourth line starts 18vw in. Each sentence sits under its line at 16px on the same indent. 40px between stages.

### 4. contact — Address in display rows (list)
The contact block is a stack of five full-width rows, every one set at the same size, clamp(44px, 6vw, 88px), regular weight, left-aligned with a 20px inset and leading 1.0: the building or venue name, the street, the city with postcode, the opening hours as one compact line, the phone number. Each row is about 150px tall with the text sitting in its lower third; rows are told apart by alternating two flat tones of the section colour as full-width bands, or by 28px of space alone. A sixth row holds a one-word greeting at the same size followed, 24px to its right and centred on the x-height, by a solid round button 0.9em across with an arrow, which opens the email or booking link. Street and phone rows are links (map, call). No heading and no form. Optionally, one small round photograph sits at the right end of the first row.
On a phone: Rows at 9.6vw with 16px insets, about 84px tall; the hours break onto two rows (days, then times). The greeting row becomes a full-width band in the accent colour with the round arrow button at its right end, 56px across.

### 5. footer — Columns above, wordmark below (stack)
The footer inverts ground and ink and fills a whole viewport (min-height 100svh), arranged as three rows in a grid (auto 1fr auto). Top row, 40px from the edge: four small columns on the 12-column grid (address, navigation, social, hours or contact), each a plain list at 15–16px with its first line in the full ink and the rest in the softer ink. Middle row: empty. Bottom row: the wordmark alone, sized to run from the left margin to the right margin on one line. Set it as inline SVG text with a `viewBox` fitted to the word and `width: 100%`, or tune `font-size` in `vw` to the letter count, so it never wraps; its baseline sits 20px above a single line of legal text at 13px. With `position: sticky; bottom: 0` and a lower `z-index` than the page, the last section slides away to uncover it.
On a phone: Columns become two by two at 15px with 32px between rows, at the top. A gap of about 20svh follows. The wordmark spans the full width at the bottom; a name longer than ten letters stacks on two lines, each fitted to the width. Legal line beneath at 12px.

Adjusted for this page:
- It sets text at 12px: use your small step (13px or more) instead.

## 8. Motion — Slow crossfade
The principal photograph quietly changes: three or four images of the same framing crossfade over about 1.6 seconds, holding five to six seconds each, or the fixed image changes when its matching section arrives. It should feel like light shifting in a room. Pause when the tab is hidden; under reduced motion show only the first image.
This is the signature move, the one loud moment. Around it the page still needs the rest of the motion layer (SKILL.md step 9): an entrance for the parts of every section, feedback on every control, and one moving picture. The inspector fails a page that barely moves. Recipes: references/motion.md.

## 10. Where the richness comes from
Scale. The size of the name against the smallness of everything else is the entire visual event, so protect both ends: do not shrink the name to make room, and do not let body text creep above 20px.

## 11. How this direction goes wrong
A long name set small is just a logo. If the name has more than about 12 characters, stack it on two lines or crop it with the viewport edge; never drop below 12vw. Do not add a second big headline under the name. Do not decorate the letters.

## 12. Real references
Studied sites that work this way. Take the principle, never the specifics: no names, copy, images or signature assets of theirs.
- **Paul Kalkbrenner** (Awwwards Site of the Day, studied score 8.1) `aww-paul-kalkbrenner`
  Idea: Swiss poster typography for a techno artist: the name as one black line with a photo set inside it like a glyph, then every chapter gets its own flat colour and visible grid.
  Hero: Pure white viewport. The artist's name sits on one line at exact vertical centre in bold black neo-grotesk, about 10.4vw, spanning roughly 78% of the width with equal side margins. The space between first and last name is replaced by a small landscape black-and-white photo, x-height tall and resting on the baseline. Top-left is a tiny circular monogram; eight nav links in 13px bold are spread at even intervals across the right half of the top edge. Bottom edge: equaliser bars with a grey label over a track title at left, a three-line bold blurb starting just left of centre, a sound toggle hard right. About 85% is empty.
  Worth taking: Replace the space between the two words of a giant name with a small photo cropped to x-height.
- **Produx Design** (Awwwards Site of the Day, studied score 7.4) `aww-produx-design`
  Idea: The wordmark is the hero, and the showreel image assembles itself from scattered square fragments as you scroll.
  Hero: Near-black field with 80px side margins. The wordmark, in a wide, light-weight uppercase sans with a slashed O, runs margin to margin (about 89% of the width) with a cap height near 20% of the viewport, starting 9% from the top. A large empty gap follows. In the lower half a two-line statement at 5.1vw sits flush left; opposite it, bottom-aligned to the statement and flush to the right margin, is a three-line paragraph in small monospace about a quarter of the width. No nav bar, button or image in the first viewport; the bottom quarter is empty.
  Worth taking: Run the wordmark margin to margin in a light weight rather than a heavy one; thin strokes at huge size read as assured instead of loud.
- **Miu Miu A House That We Shaped** (Awwwards Site of the Day, studied score 7.4) `aww-miu-miu-a-house-that-we-shaped`
  Idea: A bag campaign set inside one furnished room, a period salon with hand-painted vermilion and emerald doors rendered in real time: you find the products by touching objects in the room rather than by scrolling, so the house is the interface and the brand mood comes from the paint on the set.
  Hero: An entry gate on a flat deep navy field: a centred white block about 500px wide, a 26px bold uppercase kicker and three 58px (≈4vw) bold uppercase title lines at a 108px pitch, each force-justified so the words hug both edges and the last word is letter-spaced across the full measure; then a two-line 14px deck, a small sound notice at the top and a light Enter button about 100x48 at the bottom centre, a spinner until 1.2s. After Enter the room fills the screen: the camera opens tight on a hand-painted vermilion door and pulls back over a few seconds to the wide set while yellow subtitle lines cross-fade; then one pulsing hotspot on a notebook and a 273x100 paper-beige card at the bottom centre name the first task. No header, logo or menu.
  Worth taking: Put the colour in the set, not the interface: keep about 90% of the frame in muted greige, taupe and mushroom, let two saturated accents on objects carry the brand mood, and keep the interface to one warm paper tone with black text.
Full notes on any of them: `node draw.mjs --site <id>`.

## Always
Headlines two lines or fewer at every width. No eyebrow labels, no monospace, no 01/02/03, no thin rules, no gradients, no shadows at rest,
no cream-and-terracotta, no violet. The frame: one h1 on the first screen that says what this is, equal outer margins, no
section huddled on one side with the other half empty, no blank stretch over half a screen, a heading on every section.
`inspect.mjs` measures all of it.

Saved to C:/Users/Пухлый/Desktop/Claude MAIN/manicure-booking/.taste-skill/direction.json · reprint with `node draw.mjs --show`
