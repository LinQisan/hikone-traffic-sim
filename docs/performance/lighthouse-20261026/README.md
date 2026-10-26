# Lighthouse audit — 2026-10-26

[All samples and checks](summary.json) · [Representative HTML/JSON reports (ZIP)](reports.zip)

The current production build was audited locally under `/hikone-traffic-sim/`, before and after three small semantic changes. This was not an audit of the deployed Pages version or a real phone. No rendering, traffic, model or transport code changed.

## Navigation results

Lighthouse 13.5.0 and Chrome 155 used the built-in desktop and mobile presets, default simulated throttling, and a fresh Chrome profile for each run. Each condition has three serial runs alternating desktop and mobile. Both builds used the same URL, gzip responses and a 600-second cache lifetime, matching the observed Pages response policy. Local HTTP delivery does not reproduce the Pages CDN or a mobile radio.

| Preset | Performance median (range), before → after | Accessibility | Best practices | SEO, before → after |
| --- | --- | --- | --- | --- |
| Desktop | 100 (86–100) → 100 (100–100) | 100 → 100 | 100 → 100 | 90 → 100 |
| Mobile | 93 (83–95) → 94 (91–94) | 100 → 100 | 100 → 100 | 90 → 100 |

| Preset / condition | FCP median | LCP median | TBT median | CLS median |
| --- | ---: | ---: | ---: | ---: |
| Desktop before | 0.495 s | 0.495 s | 63 ms | 0 |
| Desktop after | 0.491 s | 0.491 s | 14 ms | 0 |
| Mobile before | 2.404 s | 2.404 s | 133 ms | 0 |
| Mobile after | 2.404 s | 2.404 s | 103 ms | 0 |

The score differences fall within baseline variation. GPU/host warm-up and task scheduling were not controlled; these figures do not establish a first-load speedup. In particular, the navigation audit's LCP node is **the loading title**, and its final screenshot still shows the loader while native models are being constructed. A fast loading screen is not a ready 3D scene. Use the separate startup instrumentation in [art and performance](../../art-and-performance.md#startup-diagnosis-and-optimization-2026-10-26) for first-frame measurements.

## Ready-menu checks and fixes

Separate Lighthouse snapshots waited until `vrlearn.state === 'title'` and the loading overlay was hidden. Desktop menu accessibility changed from **98 to 100**; mobile remained **100**. Ready-menu SEO changed from **75 to 100** in both snapshots; the snapshot scoring has fewer eligible SEO audits than navigation scoring. All failed audits in these snapshots were resolved.

- Added the missing Japanese document description. This improves the search snippet without adding visible copy.
- Wrapped application content in one native `main` landmark.
- Corrected card accessible names to start with the exact visible number and short name, then supply the category and movement mode. Previously, inserting the category between number and visible name failed `label-content-name-mismatch` for ten desktop cards and seven mobile cards. That experimental audit has zero score weight, so a score of 100 alone had hidden this voice-control issue.

The menu snapshots are unthrottled state audits, not a second performance benchmark. Their readiness observations must not be compared with the navigation LCP or treated as measured optimization gains.

## Changes deliberately deferred

- The approximately 22 MB model transfer remains a meaningful slow-network cost. Model streaming would need readiness and replay-view fallback rules; that exceeds this bounded pass.
- Reported unused JavaScript includes features that the loading screen has not exercised, including practice and replay. It is not evidence that those features can be deleted.
- Pages controls cache lifetimes. Raising a local fixture's cache headers would improve the audit without changing deployment behavior, so it was not done.
- Level-9 gzip was tried on the largest recipe: 4,086,524 → 4,050,905 bytes, only **0.87%** less, for 2.04 s elapsed in an isolated packaging trial. Existing level-6 transport was retained.
- The source-map and small stylesheet suggestions do not justify a new bundler pipeline, dependencies or CI gate for this pass. Existing Three.js chunk-size warnings remain visible.

## Verification and reproduction

Production browser checks passed 22 groups with no page/console or HTTP errors: all ten cards and keyboard selection, 320–1440 px layouts, touch/reduced-motion/forced-colour operation, profile settings, file import and retry, editor handoff, walking/cycling replay/results/menu and exploration resume. Syntax checks, source-derived documentation checking, the production build and `git diff --check` passed. No real phone, deployed-site, assistive-technology or Unity/Quest session was tested.

For an installed Chrome and a production server, repeat each command three times, alternating presets. Save the reports outside the production input directory. The audit utility was installed temporarily, without changing project dependencies.

```sh
npx --yes lighthouse@13.5.0 http://127.0.0.1:8776/hikone-traffic-sim/ \
  --chrome-flags='--headless --use-angle=metal' \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output=html --output-path=/tmp/hikone-mobile

# Same options, plus the desktop preset and a separate output path:
npx --yes lighthouse@13.5.0 http://127.0.0.1:8776/hikone-traffic-sim/ \
  --preset=desktop --chrome-flags='--headless --use-angle=metal' \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output=html --output-path=/tmp/hikone-desktop
```

The fixture at port 8776 is a local session server, not a project startup command. For a new run, use a production server with equivalent response compression and document its cache policy. Also run Lighthouse's `snapshot(page)` after the loader is hidden; a navigation audit alone misses the final interface. Method references: [Lighthouse CLI](https://github.com/GoogleChrome/lighthouse#using-the-node-cli), [throttling](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md), [user-flow and snapshot API](https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md).
