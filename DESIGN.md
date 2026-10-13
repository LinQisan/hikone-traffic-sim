# DESIGN.md — Hikone Traffic Simulator

The design language of the interface: colours, type, shapes, components, motion and accessibility, shared by the simulator (`index.html`, `style.css`) and the scenario editor (`editor/`, `editor/editor.css`). Follow it when you add or change any screen, so the two pages keep reading as one product.

- **Scope:** the HTML interface only. The painted 3D town (impressionist look, the bear, the props) is explained in [RATIONALE.md](RATIONALE.md), its models in [docs/art-and-performance.md](docs/art-and-performance.md).
- **Source of truth:** the tokens live as CSS custom properties at the top of `style.css` and `editor/editor.css`. This file says what each one is for. If the CSS and this file disagree, the CSS wins — fix this file in the same change.

## 1. Principles

1. **The town comes first.** The interface is a dark, quiet frame around the 3D view: translucent navy panels, no decoration that competes with the painting.
2. **One obvious next step.** Each screen has a single amber primary action (開始 / Start, 保存, タイトルへ, 送る). Everything else is a plain button.
3. **Colour carries meaning, consistently.** Sky blue = selected / where you are; amber = do this; coral = accident, danger, error; lime = safe, done, OK. Never reuse a meaning colour for decoration.
4. **Legible on a phone in daylight.** Text contrast at least 4.5:1 (7:1 for body text where possible), touch targets at least 44 px.
5. **Bilingual, Japanese first.** Labels read `日本語 / English` where space allows; Japanese alone where it does not (the editor, which is a tool for Japanese-speaking staff).

## 2. Colour

Dark theme only (`color-scheme: dark`). Contrast ratios are against `--bg` unless stated.

| Token | Value | Role | Contrast |
| --- | --- | --- | --- |
| `--bg` | `#0b1220` | page background, panel base (cards use it at 94–97 % opacity over the 3D view) | — |
| `--card` | `#16213a` | raised surfaces: buttons, tiles, list rows, toasts | — |
| `--edge` | `#2c3c5e` | 1 px borders and dividers | — |
| `--text` | `#f1f5f9` | main text | 17.1 |
| `--sub` | `#94a3b8` (editor `#a3b1c6`) | secondary text, hints, labels. The editor uses the lighter value because its panels carry much 11–13 px text | 7.3 (editor 8.0 on its panel) |
| `--accent` | `#7dd3fc` | selection, active tab or tool, headings, links, the time readout | 11.2 |
| `--amber` | `#f59e0b` | the primary action; ink `#0f172a` on it | ink 8.3 |
| `--coral` | `#ff6b5e` | accident chip, danger buttons, errors, the "not safe" verdict; ink `#0f172a` on it | 6.7 · ink 6.4 |
| `--lime` | `#4ade80` | success heading, OK states, the goal area | 10.7 |
| `--gold` | `#fde68a` (a token in the editor, a literal in `style.css`) | focus ring, map handles | 15.0 |

Editor-only tokens (`editor/editor.css`): `--panel #111a2e` (side panels), `--field #0f172a` (inputs), `--hover #1d2a47`, `--accent-soft` (selected rows, accent at 14 %), `--warn #fbbf24` (warnings), and the map roles `--spawn #38bdf8`, `--goal` (= lime), `--trigger` (= coral).

**Text on colour.** Amber, sky blue and coral fills take dark ink `#0f172a`, never white. Blue fills that need white text use `#0369a1` or darker (5.9:1), and darken rather than brighten on hover.

**Map colours (editor).** Carriageway blue 28 %, sidewalk gold 26 %, ramps amber 38 %, invisible walls magenta (`#e879f9`), built-in lanes dashed white, signals gold. Vehicle routes use an eight-colour categorical palette (`PALETTE` in `editor/app.js`); the accident car is always coral, whatever its index. The legend under the map must list every colour used.

## 3. Type

- **Family:** `system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif` — native on every platform, good kana and kanji, no web font to download.
- **Simulator scale:** title `h1` 28 px (20 px on phones, the English line below the Japanese), result heading `h2` 26 px (20 px), group heading `h3` 15 px in accent, body 16 px, tile subtitles and help 13 px, loading text 14 px. Start button 20 px.
- **Editor scale:** base 14 px; panel headings 13 px bold in accent with `.04em` tracking; form labels 13 px in `--sub`; notes 12 px; nothing below 11 px (chips, ids, legends).
- **Weight:** 400 for text, 600 for labels and tabs, 700 for headings, primary buttons and values; 800 only for the coral accident chip.
- **Numbers** that change (time, coordinates, speeds) use `font-variant-numeric: tabular-nums` so they do not jitter.
- **Keys** are shown as `<kbd>` (editor) or in parentheses after the label: `もう一度体験 / Try again (R)`.

## 4. Shape, space and depth

- **Radius:** 18 px for cards and dialogs (14 px on phones), 12 px for buttons, segmented controls and toasts, 10 px (`--radius`) for list rows and editor controls, 8 px for inputs, 999 px for chips, pills and the loading bar.
- **Borders before shadows.** Every surface has a 1 px `--edge` border. Shadows only for things floating over the map or the 3D view (tool groups, toasts, dialogs, menus): `0 4px 16px` to `0 20px 60px` of black at 35–55 %.
- **Spacing:** a 4 px rhythm — 4 / 6 / 8 / 10 / 12 / 14 px gaps; 24–28 px card padding (14–16 px on phones); 14 px panel padding in the editor.
- **Control height:** editor `--control` 36 px (44 px on coarse pointers); simulator buttons pad to about 44 px, and every button on a touch device has `min-height: 44px`.
- **Safe areas:** fixed elements near the screen edge add `env(safe-area-inset-*)`.

## 5. Components

| Component | Look | Rules |
| --- | --- | --- |
| **Button** | `--card` fill, `--edge` border, 12 px radius; hover turns the border accent | Label is a verb; add the key hint if there is one |
| **Primary** (`.primary`) | amber fill, dark ink, bold | One per screen or dialog |
| **Accent** (`.accent`, editor) | `#0369a1` fill, white bold text; hover `#075985` | Secondary "go" action that leaves the page (▶ ブラウザで試す) |
| **Danger** (`.danger`) | transparent, coral text and 45 % coral border | Destructive actions; always behind a confirmation |
| **Tile** (`.tile`) | button with a bold name and a `--sub` subtitle; selected = `--accent` fill with dark ink (subtitle `#0c4a6e`), light border `#e0f2fe`, `aria-pressed="true"` | Scenario choice; numbers `01`–`10` are 1-based |
| **Card / overlay** (`.card`) | navy at 94 %, 18 px radius, centred, scrolls inside | Title, results; never wider than 1100 px |
| **Bar** (`.bar`) | floating pill-shaped strip at the bottom centre | Replay controls; wraps on phones |
| **Segmented control** (`.views`, editor `.segmented`, `.tabs`) | joined buttons, active part sky blue with dark ink | 2–4 mutually exclusive choices |
| **Chip / pill** | 999 px radius, small bold text | Status only (事故, 歩行, OK, 注意 2), not clickable |
| **List row** (editor) | 48 px min height, two-line name, status dot (lime / amber / coral) | Active row: `--accent-soft` with an accent border |
| **Input** | `--field` fill, `--edge` border, accent border on focus | Units sit to the right in `--sub` |
| **Problem** (editor) | 4 px left bar in coral (error) or amber (warning) over a 12–14 % tint | Clicking jumps to the place on the map |
| **Toast** | card above the timeline, coral border for errors | 3 s, errors 6 s; never the only place an error is reported |
| **Dialog** | native `<dialog>`, 18 px radius, dimmed backdrop | Title in accent, buttons right-aligned, primary last but one, 閉じる last |
| **HUD** | top-left translucent box | Short state only; hides its help line on phones |

The editor's header uses the loading screen's bear (head only) as its logo and links back to the simulator; the simulator's title links to the editor (`.editor-link`, accent text).

## 6. The loading screen

The one light screen, on purpose: it is the first thing people see and should feel friendly before the dark frame takes over. A warm radial gradient (`#fff4dc` → `#f4dcc0` → `#c9b8d8`), ink `#3a3350` (9.0:1), the animated bear crossing the road while a small car waits, a progress bar in teal → honey → pink, and one safety tip under a "ひとこと" label (white on `#2f7a6e`, 5.1:1). Errors appear on a white card with the reason and a reload button. Keep the bear's palette (fur `#e0b47c`, muzzle `#ffe7c4`, cheeks `#eba091`, scarf teal `#4ea596`) when drawing new bear art.

## 7. Motion

- **Short and functional:** hover and state changes 120–200 ms; the loading screen fades out in 450 ms; the impact flash is red at 55 % for 50 ms in and 600 ms out.
- **No motion in the 3D view that the participant did not cause,** except the fall after contact.
- **`prefers-reduced-motion`:** animations and transitions collapse to near zero, the bear stands still mid-road, the impact flash drops to 25 %, and the view does not roll when the body falls (`player.reducedMotion`).

## 8. Accessibility

- Focus is always visible: a 3 px gold outline (`#fde68a`, 2 px offset) plus a 5 px gold halo on buttons and inputs. Never remove it.
- Every control works by keyboard (Tab, Enter, the shortcuts shown on the buttons).
- State changes the eye might miss (start, contact, goal, replay, results) are announced through an `aria-live` region; selected tiles and tabs use `aria-pressed`.
- `forced-colors`: buttons keep a `ButtonText` border, the selected tile a `Highlight` outline, the loading bar `Highlight`.
- Colour is never the only signal: errors carry ✕ / ! icons and text, the accident car is labelled, the legend names every map colour.

## 9. Known gaps

None. List new ones here with their contrast ratio and the fix to make.

## 10. Changing the design

- Add a colour, size or radius as a token first, then use the token. Do not hard-code a new hex value in a component.
- When a token changes in one stylesheet, change it in the other one too (or record the deliberate difference in §2).
- Check new colour pairs against §1 rule 4 and write the ratio into §2.
- Look at the result on a phone-sized viewport (375 × 812) and on a desktop (1440 × 900), with reduced motion on.
