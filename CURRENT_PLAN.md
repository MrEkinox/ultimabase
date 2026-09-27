# Current plan: Runtime field-input roots

- Status: completed
- Milestone: 53
- Baseline: `0e530840`
- Completed issue: 5301

The user authorized another debt-reduction pass after milestone 52. The audit
found that Core's canonical field-input traversal repeats collector setup for
every native mutation shape and plugin schema mutation effects.

Core may normalize only those existing private create/update roots before the
unchanged field collectors run. Field order, item indexes, modes, exact value
paths, update decoding, plugin mutation identity, and every public contract
remain unchanged. The implementation must delete production lines overall and
introduce no public export.

No push is authorized.

## Outcome

Every supported operation wrapper now normalizes to one private create/update
root sequence before one shared collection loop. A traversal context removes
repeated recursive parameters without changing exact field visits. Production
TypeScript adds 135 lines and removes 185, a net reduction of 50, while
`field-values.ts` falls from 585 to 535 lines.
