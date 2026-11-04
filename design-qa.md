# CoachMate — Native Sideline across the app

Date: 2026-10-16. Scope: Overzicht, Beschikbaarheid, Statistieken and their attendance, management, player and historical-entry details. Prior Live QA is preserved in `outputs/ios-all-screens/previous-live-design-qa.md`.

## Source and normalized evidence

- Style source: approved functional Live page, captured as `outputs/ios-all-screens/live-reference.png`. This extends the previously approved Native Sideline direction; the user's request explicitly transfers its visual and interaction language to other tasks. It does not require identical content or layout on unrelated screens.
- Rendered implementation: `overview-after.png`, `availability-after.png`, `statistics-after.png` in the same directory, captured through the in-app browser at the running local preview.
- All four source/implementation captures are 390 × 843 pixels from an IAB CSS viewport reporting 390 × 844, devicePixelRatio approximately 1. The browser capture rounds off one bottom pixel; all four have the same dimensions and are displayed unscaled, without phone bezels. No density resizing was used.
- Full-view comparison with source and all three implementations together: `comparison-full.png`, 1650 × 911, opened and inspected as a single input.
- Focused composition/type/control comparison with all four together: `comparison-detail.png`, 1586 × 458, crops at x8/y80 through x382/y470, opened and inspected as a single input.
- Full sheet comparison: `comparison-sheets.png`, 1242 × 911, puts the approved Live goal sheet beside shared attendance and player details. Live source is `outputs/ios-live-refinement/04-goal-after.png` (390 × 844); new sheets are 390 × 843. One bottom pixel difference is irrelevant to the compared content. Both sets were opened together, not reviewed from separate image memories.
- Additional inspected UI captures: `management-after.png`, `entry-after.png`, `history-after.png`, `player-after.png`, `attendance-after.png`. Before-change captures of all three screens and attendance are retained. Source snapshots before this task: `Prototype.before.tsx` and `prototype.before.css`.
- Fixture: development-only, isolated account/team/season storage, HFC Edo JO10-2, 2026/2027, round 1, two completed matches; eight available for the live match, two absent. Attendance evidence shows one staged unsaved correction. Live reference is first-quarter, away, home score 2–1. This is a style transfer across different screens/states, not a claim of pixel-identical screen replication.

## Findings and comparison result

No actionable P0/P1/P2 mismatches remain in the combined final comparisons. The final combined visual comparison required no follow-up visual fixes.

Implementation refinements before final comparison: stable attendance roster order prevents rows moving after edits; its confirmation stays reachable above the sheet's bottom edge. Advice/disclosure actions were brought to a 44px touch height and date years use a normal secondary weight. Management is separate from daily response work. Player statistics are disclosed through readable rows and a focused sheet instead of a cramped five-column mobile table.

Intentional differences: Overzicht uses a stronger full-width blue action to enter Live; statistical metrics use a two-column summary; attendance uses semantic green/orange/neutral states, rather than goal-specific green confirmation. These map the same system to different tasks. The longer ranking/player list scrolls; historical-entry save remains at the end of that form, per product decisions. No scores, missing minutes or readiness conclusions are invented.

## Required fidelity surfaces

- **Typography:** same platform system font/fallback as Live, compact 16px grouped headings, 22–28px important match/metric values, 14–15px primary row names and 10–12px secondary labels. Long opponent names can wrap; dates use separate day and month/year without truncation or a blue tile. Windows uses Segoe UI while iPhone will use its native system font; raster identity across platforms is not claimed.
- **Spacing/layout:** 14px phone gutters, 16px card padding/radii, mostly 12px section rhythm, grouped disclosure rows, restrained dividers and shared segmented controls. Sheets share rounded top corners, handle, close action and opaque surfaces. The scroll viewport continues to end at the navigation boundary. Narrow phone checks at 320, 390 and 427px found no horizontal overflow; confirmation/cancel stay reachable. The calibrated desktop frame remains 393 × 852.
- **Color/tokens:** shared midnight ink, neutral page/white surfaces, blue primary controls and selected navigation. Attendance available/absent/unknown use green/orange/gray plus text/counts, not color alone. Selected tabs use the same neutral track and white segment as Live. Settings gears remain blue lines without a tile. Navigation and its bottom safe area stay opaque.
- **Assets/icons:** reuse existing Radix and established football/player icons. No new decorative artwork or fake club logos were introduced. Live shield PNGs remain unchanged; new screens have no requirement for shield imagery. Number circles are functional roster identifiers, consistent with Live.
- **Copy/content:** Dutch, task-specific labels. Management says Speelronde and separates matches/forms from viewing responses. Completed-match availability is read-only and links to actual statistics. Unknown data retains ?/+?; new empty states state what is missing and where it appears. Attendance explicitly says processing is batched; historical entry says only Save processes the figures.

## Interaction validation

33 browser tests passed in the final serial run across `ios-all-screens`, `attendance-batch-review`, `round-review`, `local-cache-review`, `ios-upgrade` and `live-refinement`.

Covered: shared scoped attendance draft between both entry points; local changes across tabs/reload; cancel; one Google request for multiple players; failed-save retention/retry; new round/matches without resetting prior responses; one round Form; readable date formats; keyboard segmented tabs; advice details; ranking modes with unknown values; player-sheet focus return; exact match navigation; staged historical corrections and explicit save; search/clear; notes; empty/archived seasons; 320/390/427px widths and calibrated frame. Existing Live home/away scoring, timer, own goals, undo, drag/touch/keyboard substitutions, goal picker, idempotent local journal and navigation clipping also passed.

The production build and integrity checks for all 28 protected runtime files passed. No protected runtime file changed. The existing bundle-size advisory remains non-blocking. IAB console checked after the updated flows: no warnings or errors. Tests use isolated demo fixtures or mocked Google requests; no production Sheet writes or deployment were performed.

Test maintenance: old inline-accordion tests now close the new modal before navigating, and form management is reopened explicitly. Initial new-test failures were invalid unknown-data fixtures (unknown minutes must store zero) and ambiguous test locators; fixed the tests without weakening product validation. Final run has zero failures.

## Limits and checklist

- [x] Source and implementations opened together at matched density.
- [x] Full-view and focused comparisons, including sheets.
- [x] Typography, layout, color, assets, icons and copy reviewed.
- [x] New primary interactions, saving/errors, archived and empty states tested.
- [x] Live regressions, footer clipping, runtime and production build passed.
- [ ] Physical iPhone Safari, Dynamic Type and VoiceOver review after publication. Automated keyboard/focus checks do not establish full accessibility conformance.

The requested three screens are implemented and reviewable locally. Settings retain their existing layout, with inherited shared styles only. Source archive: `outputs/deploy/coachmate-v15.tar.gz`. Not deployed.

## Follow-up: reselecting the Statistics tab

2026-10-16: switching to another tab and back retains the current Statistics subpage. Reselecting the already active Statistics tab returns to the season overview, preserving all match/own-goal drafts without processing them. This is an ordinary extra tap, not a timed double tap. Explicit match links and returning from Settings retain their intended targets.

Five existing all-screen integration checks and four focused navigation regressions passed. These cover search state after tab switching, root return, scroll-to-top, raw typed draft values, own-goal drafts, no implicit save/discard, concept restoration after reload, Settings, direct match links and the framed phone. Browser focus had also scrolled the clipped phone ancestor, exposing the offscreen keyboard asset despite `data-visible=false`; app-owned root navigation now resets that ancestor as well as MobileScroll. A focused framed regression and final IAB inspection confirm screen scrollTop=0 and keyboard data-visible=false. No protected runtime files changed.

Production build and the 28-file runtime integrity check passed. Final preview evidence: `outputs/stats-tab-navigation/02-season-overview.png` (normal calibrated phone preview, not a new visual redesign). The IAB retained-history accessibility state was checked before the extra tab tap. Existing visual design is unchanged. Source package including this follow-up: `outputs/deploy/coachmate-v16.tar.gz`. Not deployed.

## Follow-up: attendance ranking

2026-10-16: added Aanwezigheid to Rangschik op, showing actual present=true appearances against the distinct processed team match total in the selected season (for example 8 van 10 wedstrijden). Sort descending, then alphabetically. Planned availability and a running/unprocessed match are excluded; unknown playing or keeper minutes do not obscure known attendance.

Seven all-screen browser checks passed, including two new attendance checks: 2/2, 1/2 and 0/2 with deliberately conflicting planned availability, unknown minutes, ordering, 320px fit, retained selection across tabs, updates after an attendance correction, and the no-processed-match empty state. Production build and all 28 protected runtime checks passed. No protected runtime changes. Final IAB screenshot `outputs/attendance-ranking/preview.png` was visually inspected in the existing framed preview; no clipping or console warnings/errors. Existing ranking row styles are retained with a compact secondary denominator. This is a small feature addition, not a visual redesign. Latest source package: `outputs/deploy/coachmate-v17.tar.gz`. Not deployed.

## Follow-up: player details and ranking clarity

2026-10-16: player detail uses the full name once in the sheet header. Removed the redundant identity row/shirt-number circle and attendance subtitle, keeping the attendance tile. A compact blue rank block identifies the metric and an explicit large position. Known ties share competition positions (1, 1, 3) in both list and detail; alphabetical ordering within ties stays unchanged. Unknown/empty data stays unranked. Previous/next buttons and an Other player native selector browse within the same sheet, following the originating ranking or roster order. Selecting a player updates all metrics and match links without saving or mutating statistics; history entry expands the chosen player's figures.

15 browser checks passed: seven existing all-screen flows, four navigation checks and four new player-detail checks covering the single full name, no repeated attendance subtitle, list/detail tied-rank agreement, previous/next wrap, direct selection, correct metrics/history/editor, no implicit statistics write, close focus return, unknown/empty ranks, long names at 320 × 640 and 44px browsing targets. Build and all 28 runtime integrity checks passed. Protected runtime files are unchanged. IAB inspection confirmed Daan (#1, tied attendance) → Finn (#10, attendance 1/2) → Daan in place; console has no errors/warnings. Evidence: `outputs/player-detail-refinement/preview.png` and `finn.png`, normal 643 × 668 framed browser preview; these are interaction/layout proof, not unscaled pixel-fidelity comparisons. Latest source package `outputs/deploy/coachmate-v18.tar.gz`. Not deployed.

## Follow-up: integrated metric ranks, player selection and view-before-edit

2026-10-16: the latest three annotated requests supersede the standalone rank banner/dropdown and direct history-to-editor behavior. Each season metric tile now contains its own tied/known/unknown rank, with shared memoized rankings used by both the list and all four tiles. The standalone rank banner is removed. A quiet Speler kiezen action replaces the dropdown, opening a searchable full-name list inside the same sheet; previous/next remain available. Match rows open saved per-player figures first, with an explicit Cijfers wijzigen action. The chosen player can also be changed while keeping that match for comparison. Known match scores follow home-away order; missing values and missing scores remain unknown. Archived figures have no edit action.

The editor retains its existing local draft/save semantics. Its return context brings Save, Back, keep-concept and discard-concept back to the originating player/match, rather than unexpectedly returning to a generic history list. The read view shows stored figures with a concept notice while an unsaved draft exists. Generic history entry retains its previous destination. Explicit match links and Statistics re-selection remain functional.

18 unique browser checks passed across the 17-check integration run and seven focused final player-detail checks (including one added framed regression). Coverage includes four independent metric ranks and shared positions, one name, searchable selection/no-results, in-place browsing, read-only match figures before input, keeping/restoring a draft, save returning to the same player/match, updated season ranks, match comparison, absent/unknown data, archived home-away scores, long names at 320 × 640, root/tab behavior and local draft persistence. The focused final run also confirms picker/match navigation resets a clipped phone ancestor if browser focus has scrolled it, preventing an offscreen simulated keyboard asset appearing through the preview. This is app-owned navigation code; no protected runtime was changed. Build and the 28-file runtime check passed; existing bundle-size advisory remains non-blocking.

IAB evidence: `outputs/player-stat-views/overview.png`, `player-picker.png`, `match-view.png`, each 1280 × 720 normal browser capture with a calibrated scaled phone; screenshot states checked against the DOM and no console warnings/errors. `updated-flow.png` combines crops retaining the whole observed phone-frame bounds (x460–820, y24–696), removing only blank canvas. This is task/interaction proof, not a 1:1 pixel-fidelity comparison. The user continued interacting with their own preview during work, so remaining captures used an isolated development fixture and its temporary tab was closed afterwards. No production writes/deployment. Physical Safari/VoiceOver remain unverified.

Latest source archive: `outputs/deploy/coachmate-v19.tar.gz`.


## Follow-up: HFC EDO availability Form, 2026-10-17

The real round-2 Form was restyled in place using the club website's official crest and red (#bf1e2e), black and white. A dedicated 4:1 header was uploaded and checked in the live parent view. Restored the red accent and neutral grey background after Google's image palette automatically selected beige. Updated the title and parent instructions. All seven existing match questions now show Aanwezig / Afwezig; their original questions and required personal-code field remain intact. No availability answers were submitted or fabricated, and no invitations were sent.

Creation, readiness validation and import now accept the new labels, while retaining legacy Ja/Nee answers, idempotency, newest-response handling and manual/processed-match protection. Invalid answers remain ignored. Parent-email mailto links reject control characters, backslashes and colon injection, with only the selected player's invitation in the body. The browser regression's malformed email fixture was corrected to contain actual CR/LF characters.

27 backend checks and two complete mocked Forms browser flows passed. The browser flows include new labels, legacy updates, explicit import, copying an invitation, parent-email recipients, invalid email handling, failed import/retry, question changes, reload and coach precedence. Production build and all 28 protected runtime hashes passed. Live parent view confirms the header, red accent, neutral background, seven required pairs and intact personal-code question. Proof: outputs/edo-form-theme/form-full.png and form-detail.png. These Google Form edits are live; the CoachMate source changes still require publishing before using the new choices with the hosted import flow. Real parent-response import remains pending the user's own submission. Personal links with prefilled codes are recommended, not implemented.

## Follow-up: personal availability links and explicit submission, 2026-10-17

Personal links are now implemented. Forms stores an optional codeEntryId; FormInvites retains the existing form/player/code identity, and URLs are derived without preselected availability. Old seven-column Forms tables remain readable and upgrade on explicit save. The real round 2 form's verified entry ID was saved through CoachMate; all ten invitation links are available. One actual player link was opened and its prefilled value matched its invitation, with all 14 availability choices unselected. No player response was submitted and no invitation was sent.

The live Google Form has bold question headings, a shorter introduction, response editing enabled, and a confirmation explaining the edit-response link and repeat submission. Editor selection stripes and card spacing are Google-controlled. A prefilled invitation starts a form; the Google edit-response link reopens the submitted answers. These are explicitly distinguished in the app and invitations. Unsent drafts never reach import, and incomplete submitted records are applied atomically as nothing. Later submitted edits remain timestamp-ordered, idempotent and subordinate to manual coach corrections.

30 backend tests and four browser tests passed; production build and 28 protected runtime hashes passed. Tests cover legacy schema migration, personal URL validation, no implicit writes, selected-player mail drafts, complete submission, edits, repeated imports, failure/retry and manual precedence. Real parent submission and import remain pending the user's own answer. The Form changes are live; new CoachMate code still requires publishing. Proof: outputs/edo-form-theme/personal-link-preview.png and personal-link-detail.png.

final result: passed


## Attendance defaults follow-up, 2026-10-17

User supersedes blank match defaults: personal start links now include Aanwezig for every round match, using verified Google entry IDs stored in optional Forms.prefillDefaults. Seven- and eight-column legacy Forms remain readable. Setup requires one code marker and exactly the expected number of affirmative choices; sharing stays disabled until configured. Codes and submitted availability are unchanged by opening or copying links. Edit-response links retain the submitted answers.

Live round 2 form introduction and confirmation now explain the confirmation-screen edit link, bookmarking that response page, and resubmission. A placeholder link visibly selected all seven Aanwezig choices without submission. 30 backend tests, two Forms browser flows and the production build passed; all 28 protected runtime files remain intact. Updated invitation behavior requires publishing CoachMate. No parent answers or emails were sent. Proof: outputs/edo-form-theme/attendance-defaults.png.


## Parent-email confirmations and stored links, 2026-10-17

User chose existing Players.parentEmail over asking parents to type email and explicitly authorized the Forms/Sheets/outgoing-mail/trigger permissions. Personal start URLs are now physically persisted in FormInvites.personalUrl, retaining all other invitations and response metadata. Live Sheet D1 reads personalUrl, D2 contains the verified code entry and Aanwezig defaults; E:H reserve editUrl/responseId/submittedAt/mailSentAt.

Prepared the separate Google Apps Script project CoachMate � beschikbaarheid en bewerklinks (1hjLFLC5BzBjrEkeef9I2wMZgQrr8kSvU8NArXKjn6mv25tJWP4l_fKIh). It resolves the recipient through stable form/code/team-season/player keys, stores the genuine Google edit-response URL, mails one confirmation per response, registers newly created active-season Forms, and catches up post-activation submissions made before the registration check. Install does not mail pre-activation responses. Three isolated script tests cover scoped recipients, retries/new response IDs, invalid/missing emails, invalid codes, incomplete answers and archived seasons. Thirty backend tests and production build passed; 28 protected runtime hashes unchanged.

Activation is NOT confirmed: the Google permission dialog could not open in the in-app browser. The user has been asked to complete account consent from Edge/Chrome. Installation was cancelled while waiting; no triggers or outgoing mails are claimed active and no real parent answer was fabricated. Actual first confirmation email/edit-link import remains pending a truthful user submission after authorization. Proof: outputs/edo-form-theme/mail-script-ready.png.

2026-10-17 activation verified: the user ran coachMateInstallAvailabilityMail. Google execution history reports Voltooid (5.188 s); the trigger page shows both coachMateAvailabilitySubmitted (form submission) and coachMateRegisterAvailabilityForms (time-driven). Authorization and installation are now confirmed. No real response or outgoing confirmation mail has yet been verified; that acceptance test remains pending the user's truthful submission.

2026-10-17 v22 published: fixed the production Docker runtime to include src/form-links.ts, verified the runtime import graph and actual Forms module import, and rebuilt with all 28 protected runtime hashes intact. Uploaded coachmate-v22.tar.gz (SHA256 ae6b6906940f3e5c88937c1e35fd95e44b752de594a1a2a74b1026811944d72e) to the explicitly authorized Cloud Shell. Google Cloud build 0eb459f6-2a51-4835-8200-508d324cce87 succeeded. Cloud Run revision coachmate-v22-20261017 serves 100% traffic at the existing URL; service maxScale and revision max instances were set to 1, concurrency 1, min 0. Existing OAuth/env/secret settings were preserved. Public app Google login succeeded, real HFC EDO JO10-2 2026/2027 loaded automatically, round 2 passed live publication validation, all ten personal URLs contained the code plus seven Aanwezig defaults, and exactly one player had an enabled email invitation. No invitations, response submissions or availability imports were performed. Screenshot: outputs/deploy/coachmate-v22-live.png. User will perform the real email/edit-response test from the published app.
