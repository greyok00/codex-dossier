# Luxury Product UX Research For Dossier

Date: 2026-04-14

## Goal

Make Dossier feel less like a workflow utility and more like a premium mobile product.

That does **not** mean adding more visual noise. In the best mobile products, "luxury" usually means:

- immediate clarity
- fewer visible decisions at once
- strong material quality
- confident typography
- precise motion
- polished transitions between states
- visible trust and system reliability

## Current Mobile Context

The app market is mature. Growth is increasingly concentrated in products that feel simple, fast, and habit-forming rather than complex.

Current global download leaders for 2025 included:

- ChatGPT
- Instagram
- TikTok
- WhatsApp
- CapCut
- Netflix
- Facebook
- Temu
- Snapchat

Source:
- AppTweak 2025 global download ranking: https://www.apptweak.com/en/reports/most-downloaded-apps-globally-android-ios

Sensor Tower's 2025 mobile report also shows why polish matters now:

- downloads were roughly flat year over year
- time spent remained extremely high
- monetization kept rising

That means mature apps are increasingly competing on retention, trust, usability, and perceived quality, not just discoverability.

Source:
- Sensor Tower 2025 State of Mobile: https://sensortower.com/blog/2025-state-of-mobile-consumers-usd150-billion-spent-on-mobile-highlights

## What Popular Apps Consistently Do

This section combines current app-market context with direct inference from widely used mobile products like ChatGPT, Instagram, WhatsApp, Netflix, and CapCut.

This is an inference from public products, not a quoted claim from those companies.

### 1. They reduce visible complexity

Top apps rarely present the whole system up front.

Common pattern:
- one dominant action
- one obvious next step
- secondary options collapsed or contextual

This matches Apple guidance on hierarchy and progressive disclosure.

Sources:
- Apple HIG overview: https://developer.apple.com/design/human-interface-guidelines/
- Apple HIG layout: https://developer.apple.com/design/human-interface-guidelines/layout

### 2. They separate control chrome from content

Premium-feeling apps create a clean distinction between:

- navigation and controls
- primary content
- transient actions

Apple explicitly recommends using material to create a distinct functional layer for controls and navigation, while avoiding overuse inside the content layer.

Source:
- Apple HIG materials: https://developer.apple.com/design/human-interface-guidelines/materials

### 3. They launch fast into usefulness

The best apps do not make users feel like they are entering a setup wizard unless setup is absolutely necessary.

Apple's launch guidance is blunt:
- launch instantly
- downplay launch
- restore previous state

Source:
- Apple HIG launching: https://developer.apple.com/design/human-interface-guidelines/launching/

### 4. They keep navigation shallow

Popular mobile apps usually orient around 3-5 top-level destinations, with one primary flow emphasized.

Android's navigation guidance for bottom navigation matches this.

Source:
- Android bottom navigation guidance: https://developer.android.com/reference/com/google/android/material/bottomnavigation/BottomNavigationView

### 5. They use motion sparingly and precisely

Luxury products use animation to communicate structure, not to decorate.

Apple's motion guidance is clear:
- add motion purposefully
- avoid motion on frequent interactions
- prefer brief, precise feedback

Source:
- Apple HIG motion: https://developer.apple.com/design/human-interface-guidelines/motion

### 6. They make the primary object feel tangible

In top consumer apps, the main object is visually obvious:

- a chat thread
- a reel
- a story
- a message list
- a film card
- an edit timeline

The user always knows what the app is "about" from the first screen.

Dossier's equivalent should be the **case**.

Not the settings card.
Not the runtime model.
Not the workflow label.
The case.

### 7. They make trust visible without sounding technical

Good apps show confidence through:

- stable loading states
- clear progress
- visible source/verification cues
- polished empty states
- consistent language

They do not force infrastructure language into the main user flow unless the user explicitly needs it.

## What "Luxury" Should Mean For Dossier

For Dossier, luxury should mean:

- it feels calm under pressure
- it looks expensive but restrained
- it turns evidence into a high-confidence artifact
- every important object looks official, preserved, and intentional
- the app feels discreet, serious, and trustworthy

The design reference should be closer to:
- a premium banking app
- a high-end travel app
- an Apple system app
- a modern evidence vault

It should be farther away from:
- a settings dashboard
- an admin workflow
- a wizard with too many steps exposed at once

## Current Dossier Mismatches

This section is based on the current frontend structure in:

- `frontend/src/app/screens.tsx`
- `frontend/src/app/shell.tsx`
- `frontend/src/app/ui.tsx`

### 1. Too many screens announce the workflow instead of the object

Current screen labels are clearer than before, but the app still behaves like a linear process map.

Examples in `screens.tsx`:
- `Review transcript`
- `Check case details`
- `Choose where to report`
- `Write report`
- `Send report`
- `Save confirmation`
- `Download case packet`

That is understandable, but it still feels operational rather than premium.

Luxury products usually make the user feel they are inside one durable object with multiple facets.

For Dossier, the object should be:
- Case
- Evidence
- Report
- Filing

Not a sequence of steps as the main identity.

### 2. The app still overuses the same card language everywhere

A large portion of the interface is repeated `settings-card` structure.

That creates consistency, but not hierarchy.

When nearly everything is a similar card, nothing feels truly important.

### 3. Runtime status is too prominent for a premium consumer surface

`RuntimeStatusPanel` in `shell.tsx` is technically useful, but it reads like a developer or ops overlay.

That belongs in:
- a secondary status drawer
- settings/system screen
- a small connectivity chip

It should not compete with the core product surface unless the app is actually degraded.

### 4. Setup is still too visible

`PrepareLocalAiScreen` is better than before, but it is still a setup experience that foregrounds models and downloads.

Users do not care about model names first.
They care about whether the app is getting ready to protect their record.

### 5. The case should feel more like a dossier and less like form sections

The report preview improved, but the app still needs:
- stronger document framing
- richer evidence presentation
- better use of seals, source markers, attachment visuals, and chronology

The output should feel like a record you could hand to a lawyer, regulator, or newsroom.

### 6. Navigation is serviceable, not luxurious

Bottom navigation currently exposes:
- Record
- Cases
- Report options
- Settings

This is functional, but the experience is still tab-driven rather than centered around a live primary object.

## Recommended Luxury Direction

## Direction 1: Reframe the app around the Case

Top-level destinations should support one central object.

Suggested mental model:
- Home / Cases
- Record
- Report
- Vault
- Settings

But the core screen after entry should usually land on:
- most recent case
- most important case
- a premium case dashboard

## Direction 2: Replace "workflow screen" feeling with a dossier workspace

Instead of many isolated utility screens, the premium version should feel like a dossier room with layered panels:

- case header
- evidence strip
- timeline
- verified facts
- destinations
- report draft
- filing receipt

This does not necessarily mean one giant screen. It means the screens should feel like views into the same artifact.

## Direction 3: Make hierarchy more dramatic

Use three visual levels only:

- Level 1: hero surfaces for the case, report, and filing state
- Level 2: structured content sections
- Level 3: metadata chips and controls

Right now too many surfaces live at the same visual weight.

## Direction 4: Make the report and filing artifacts beautiful

The strongest luxury opportunity in Dossier is not the capture screen.
It is the artifact layer.

The report should look like:
- an official brief
- a premium document
- a preserved evidence packet

The filing confirmation should look like:
- a receipt
- a chain-of-custody checkpoint
- a proof-of-submission record

## Direction 5: Reduce words, increase cues

Premium apps do not explain everything with paragraphs.
They rely on:
- strong labels
- iconography
- status chips
- visual grouping
- previews
- obvious primary actions

Dossier currently still explains too much in some places.

## Direction 6: Use fewer, better motions

Recommended motion system:
- one short entry transition for screen changes
- one tactile press animation for primary actions
- one card expansion motion for report destination details
- one document reveal motion for report/filing artifacts

Avoid adding animation to frequent taps or routine transitions.

## Direction 7: Make trust visible visually

Luxury in this product depends on confidence.

Introduce visual trust primitives such as:
- verified source badge
- official destination badge
- evidence sealed badge
- transcript generated locally badge
- submission recorded badge
- export ready badge

These should be visually distinct and used consistently.

## Concrete Design Moves I Recommend Next

### Highest-value product moves

1. Turn the current case summary into the real home screen.
2. Collapse runtime status into a compact chip unless degraded.
3. Replace the setup-first visual language with trust-first language.
4. Convert report destinations into premium expandable list items instead of equal-weight cards.
5. Make the report preview and filing receipt the most visually refined surfaces in the app.

### Highest-value visual moves

1. Increase whitespace and reduce generic card repetition.
2. Use larger, quieter typography for titles and denser typography for metadata.
3. Use one restrained material system instead of repeating the same glass treatment everywhere.
4. Add deeper document styling: dividers, stamps, attachment thumbnails, provenance rows.
5. Tighten icon scale and button density so actions feel engineered, not decorative.

### Highest-value UX moves

1. Minimize exposed choices on first touch.
2. Always show the single best next action.
3. Keep the current case recoverable from anywhere.
4. Make errors sound calm and exact.
5. Preserve state aggressively so the app feels dependable.

## Recommended Implementation Order

1. Redesign the shell and home surface around the active case.
2. Redesign the route selection screen into a premium destination picker.
3. Redesign the report document screen into a true "official brief".
4. Redesign the filing/proof screen into a premium receipt artifact.
5. Reduce the prominence of settings, runtime, and setup screens.

## Decision

If the goal is "luxury product," the app should move toward:

- fewer screens feeling like tasks
- more surfaces feeling like artifacts
- less technical framing
- more confidence, calm, and hierarchy

The correct inspiration is not a prettier admin panel.
The correct inspiration is a premium mobile product built around one precious object.

For Dossier, that object is the case.

## Sources

- AppTweak, 2025 global app downloads: https://www.apptweak.com/en/reports/most-downloaded-apps-globally-android-ios
- Sensor Tower, 2025 State of Mobile: https://sensortower.com/blog/2025-state-of-mobile-consumers-usd150-billion-spent-on-mobile-highlights
- Apple Human Interface Guidelines overview: https://developer.apple.com/design/human-interface-guidelines/
- Apple HIG materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Apple HIG layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple HIG motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Apple HIG launching: https://developer.apple.com/design/human-interface-guidelines/launching/
- Android bottom navigation guidance: https://developer.android.com/reference/com/google/android/material/bottomnavigation/BottomNavigationView
- Android app quality UX guidance: https://developer.android.com/quality/user-experience
