# 6206: Reduce the unsupported public Core surface

- Status: completed
- Milestone: 62
- Packages: `@ultimabase/core`, official consumers
- Depends on: 6205
- ADR: ADR-0016

## Goal

Remove Core exports that exist only for repository-internal consumers or
superseded construction paths without scattering ordinary developer APIs across
new packages or entry points.

## Acceptance criteria

- [x] Core exports are classified as developer API, plugin-author API, adapter or transport SPI, or repository-internal detail.
- [x] Every removed export has a complete consumer audit and no lost capability.
- [x] Official packages use the same supported boundary available to equivalent community integrations.
- [x] Root autocomplete remains focused; no speculative package or generic registry is introduced.
- [x] Public export counts and declaration bytes decrease or every retained exception is justified.
- [x] Website, README, source, and packed-package public API tests are updated.
- [x] Documentation impact is recorded.

## Tests

- [x] Root-export and deep-import guards.
- [x] Source and packed-package editor contracts.
- [x] Complete debt-refactor validation gate.

## Out of scope

- Splitting Core into multiple foundation packages.
- Hiding a still-required community integration contract.
- Compatibility barrels for removed exports.

## Public-surface audit

| Classification             | Retained surface                                                                                                                           | Reason                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Developer API              | `UltimaBase`, schema and field builders, `QueryBuilder`, request values, application handles, focused contextual helpers, framework errors | Direct application authoring and execution                                                     |
| Plugin-author API          | plugin definitions, manifests, contributions, capabilities, schema declarations, Runtime policy and behavior helpers, private collections  | The same open kernel used by official and community plugins                                    |
| Adapter or transport SPI   | database and persistence contracts, Runtime stages and pipeline, application request and transport-planning capabilities, wire codecs      | Required to implement community infrastructure integrations without private imports            |
| Repository-internal detail | capability-inventory construction and the aggregate asynchronous context record                                                            | Core already owns inventory construction; focused context helpers expose every supported value |

The audit retained `PluginGraph`, `normalizePlugins`, `SchemaRegistry`,
`RuntimePipeline`, `RequestEngine`, and `TrackedExecutionLifetime`. Although
some have few production imports outside Core, each is an existing documented
inspection, authoring, adapter, Runtime, or lifecycle SPI. Hiding them would
make official integrations privileged over equivalent community packages.

The removed root names are `CapabilityInventory`, its three inspection entry
types, `getCurrentFrameworkContext`, and `ActiveFrameworkContext`. Repository
search found no consumer of the inventory constructor outside Core; callers
retain the same immutable inspection through `PluginGraph.capabilities`.
Repository search found no consumer of the aggregate context outside Core;
`getCurrentUltimaBase()`, `getCurrentEngine()`, and `getCurrentRequest()` expose
the same three derived references without a duplicate aggregate API.

## Completion evidence

- Core public exports: 1,100 → 1,094.
- Core declaration output: 593,013 → 592,149 bytes (-864 bytes).
- Handwritten production: 122,655 → 122,645 lines (-10 lines).
- `yarn validate:full`: 548 ordinary files / 2,597 tests, 623 coverage
  files / 2,845 tests, 17 website files / 66 tests, and 1 issue file / 9
  checks passed. Typecheck, lint, build, package analysis, and formatting passed;
  lint reported only the existing line-budget warnings.
- Coverage: 90.91% statements (23,707/26,075), 84.49% branches
  (14,686/17,381), 96.07% functions (5,000/5,204), and 91.47% lines
  (22,995/25,137).
- Documentation impact: both. The Core README and Runtime engineering guide
  now describe focused contextual access and graph-owned capability inspection;
  the public application guide documents the focused helpers.
