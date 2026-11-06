# Architecture Decision Records

One short file per decision that would be expensive to rediscover. Format: Context, Decision, Consequences.
Status is `accepted`, `superseded by NNNN`, or `proposed`. **Add a new ADR (or supersede one) whenever a decision changes**, and add a line to the index below and to the Log in [../CONTEXT.md](../CONTEXT.md).

| # | Decision | Status |
|---|---|---|
| [0001](0001-polar-outline-as-hero-input.md) | Shape is a mirrored polar outline, not lobe sliders | accepted |
| [0002](0002-own-catmull-clark-on-quad-sphere.md) | Own Catmull-Clark on a welded quad sphere | accepted |
| [0003](0003-manifold-3d-for-casing-solids.md) | manifold-3d for hollow, cuts and split | accepted |
| [0004](0004-framework-free-reusable-core.md) | Framework-free core, DOM/scene-free geometry layers | accepted |
| [0005](0005-placeholder-core-dims-and-reference-scale.md) | Placeholder core dims (1 inch puck) and reference scale | accepted |
| [0006](0006-validate-before-swap-reliability.md) | Validate before swap; never break Explore | accepted |
| [0007](0007-eyes-separate-meshes.md) | Eyes are separate meshes, not booleans | accepted |
| [0008](0008-rhino-roundtrip-unverified.md) | Rhino round trip is stated as unverified | accepted |
| [0009](0009-unified-design-system-folder.md) | One design-system folder, tokens-only app styling | accepted |
| [0010](0010-side-profile-as-second-input.md) | Side profile is a second input; puck plateau stays flat | accepted |
| [0011](0011-freehand-outline-fitting.md) | Freehand drawing fits into the same editable outline | accepted |
| [0012](0012-core-as-global-shaped-module.md) | The Core is a global, shaped module; magnets behind a thin floor | accepted |
| [0013](0013-materials-drive-finishes.md) | Materials drive finishes and weight | accepted |
| [0014](0014-analysis-views-and-designer-checks.md) | Analysis views and designer checks replace the wall heatmap | accepted |
| [0015](0015-library-global-vs-iteration.md) | Library with global vs per-iteration parameters | accepted |
| [0016](0016-variable-outline-points.md) | Variable outline points with a smoothness control | accepted |
| [0017](0017-constant-width-edge-and-kink-fixes.md) | Constant-width edge roll-off; curved-by-default drawings | accepted |
| [0018](0018-step-export-and-optional-seat.md) | STEP export (faceted B-rep) and an optional flat core seat | accepted |
| [0019](0019-poisson-inflation-and-offset-inner-shell.md) | Poisson inflation for the body; inner shell is a normal offset | accepted |
| [0020](0020-library-is-the-source-of-truth.md) | Library is the source of truth; stars drive the pill; Save; sketch dock | accepted |
- [0021](0021-top-bar-pads-and-check-pointers.md) · One top bar, zoomable pads, checks that point
- [0022](0022-pad-component-variable-side-points-and-complete-exports.md) · One Pad component, editable side points, a plain sanity check, complete exports
- [0023](0023-nurbs-step-export.md) · NURBS STEP export of the outer body
