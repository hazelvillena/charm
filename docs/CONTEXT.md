# Charmer Lab: Living Context

**Read this first when picking the project up.** Keep it short and current. Update it in the same commit as any change that alters what is true here.
Last updated: 2026-11-05 (v0 built).

## What this is
A browser tool to shape a Charmer (interchangeable character shell around a fixed AI puck): drag a mirrored 2D outline, it inflates into a SubD body, live checks hold the hardware constraints, Accept builds hollow front/back shells with an exploded view and spec card, then export cage OBJ / STL / spec JSON.
Demo: **Nov 6, 2026**, screen share, technical design interview.

## Where things are
- Plan and status checklist: [PLAN.md](PLAN.md) (milestones M0 to M7, cut lines A/B/C)
- Decisions: [adr/](adr/README.md)
- Original spec (superseded where PLAN.md says so): [HANDOFF.md](HANDOFF.md)
- Run/build/test: root [README.md](../README.md)
- Reference model: `reference/charmer-body.obj` (+ meta). Original `charmerv1.obj` stays on Hazel's Drive.

## Current state
See the checklist in PLAN.md section 12 and the Log below. **v0 is built end to end** (outline editor, SubD, checks, Accept, exploded view, spec card, export, share link). Remaining: backup recording, Rhino round-trip test, real core dims. See PLAN.md section 12.

## Key facts to not rediscover
- Units mm, front +Z, up +Y, body stands on y = 0. Puck center C is the polar origin.
- Core dims are placeholders (puck 1 inch). `REFERENCE_SCALE = 1.78`.
- Presets: Ghost (fitted from reference via `node scripts/fitReference.mjs`, regenerates `src/params/presets.generated.ts`), Blob, Star, Cloud, Drop.
- Rhino round trip unverified (ADR 0008).

## Maintenance rules
1. New or changed decision -> new/superseding ADR + index line + Log line below.
2. Finished milestone -> tick PLAN.md section 12, add a Log line.
3. Changed run commands or structure -> update root README.md.
4. Never leave the plan describing something that is no longer true.

## Log
- 2026-11-05: Plan written; core geometry (quad sphere, profile, Catmull-Clark, shape map), presets, fit script, tests (incl. 1000-case sweep) done. ADRs 0001 to 0008 recorded.
- 2026-11-05: v0 built and verified (tests, production build, browser). DEMO.md written. See PLAN.md Log for bugs found and fixed.
