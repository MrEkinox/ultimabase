# @ultimabase/typegen

Deterministic generated application contracts for UltimaBase schemas.

The package compiles only the static application graph, converts it to an
inert snapshot, emits one compact TypeScript declaration, and replaces it
atomically. It never connects
infrastructure, reads database credentials, serializes callbacks, or emits a
Runtime client.

`typegenPlugin()` declares `environment:filesystem` because it directly loads
application sources and atomically writes generated artifacts. This is an
inspectable and denyable startup claim, not a Core filesystem privilege or an
operating-system sandbox. Typegen has no replacement privilege; its public
plugin input is the compiled graph and its owner-scoped public type references.

## Automatic startup generation

Configure the development tooling once in the application plugin graph:

```ts
import { typegenPlugin } from '@ultimabase/typegen'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(typegenPlugin())
const ultimabase = new Application({
	schemas: [Todo],
})

await ultimabase.start()
```

Static schema compilation completes first, then `typegenPlugin()` atomically
replaces `.ultimabase/schema.generated.d.ts` before any plugin connects to
infrastructure. `applicationId` and `outputPath` remain configurable for
multi-application repositories. Core receives only a neutral read-only static
graph and never depends on this tooling package.

Generation runs directly in plugin setup. There is no emitter-selection
capability: ADR-0265 removes Core's `typegenEmitterCapability` marker and its
interface. Install the official plugin once; duplicate plugin identities remain
errors. Core does not arbitrate output paths between unrelated generators.
Plugins requesting `typegen:reference` register their consumed public types
independently of whether automatic Typegen generation is installed.

The lower-level API remains available for build integrations and for the future
manual CLI:

```ts
import {
	generateApplicationTypes,
	loadTypegenApplication,
	writeGeneratedTypeFile,
} from '@ultimabase/typegen'

const application = await loadTypegenApplication({
	sourcePath: './src/ultimabase.ts',
	exportName: 'ultimabase',
})

const generated = generateApplicationTypes({
	application,
	applicationId: 'main',
})

await writeGeneratedTypeFile({
	applicationId: 'main',
	contents: generated.contents,
	outputPath: '.ultimabase/schema.generated.d.ts',
})
```

### Plugin-owned contracts

Core's `CompiledTypegenGraph` is a descriptive projection of the same commands
used by direct execution. Its operation entries contain no snapshot callbacks
and are not executable tokens; surface `schema` values contain only `className`,
not constructors. Consumed nominal type references and owners remain intact.
This inspection contract replaces the earlier executable views without changing
the generated declarations or fingerprints.

Typegen derives application contracts from the compiled graph. Plugins export
reusable public types from their package root and name them with
`defineTypegenReference({ module, exportName })`. Operation value contracts use
that reference as the second argument to `defineOperationValue(snapshot, reference)`.
The declaring plugin requests `typegen:reference`; Core collects exact tokens
reachable from its owned operation and schema-mutation contracts. The explicit
registrar remains only for references not reachable from an owned command.

References are nominal and owner-scoped. Registering one adds no standalone
alias. Plugins cannot append arbitrary declarations, schema/model augmentations,
or extra output files. Field and option definitions retain their existing
structured Typegen metadata. JavaScript runs the same graph without Typegen.

Generic generation reads the final graph and emits plugin-added schemas,
fields, used direct schema and contextual field options, exact namespaced operations,
dynamic schema handles, schema-mutation methods, and query inputs. Plugin owner,
version, contribution ID, static options, imports, and contents
all participate in collision checks and fingerprints.

Core-owned structural metadata that cannot change a TypeScript value shape is
deliberately omitted. Decimal `precision` and `scale`, for example, affect
Runtime validation and adapter storage but produce the same generated string
field contract and fingerprint as an otherwise identical decimal field.
Opaque application artifacts are omitted for the same reason. When the optional
Validation plugin is installed, Typegen emits its direct option and type-only
compatibility reference while omitting validator identities and callbacks.

Operation declarations retain exact input, result, and declared public
`PluginError` code unions. Generated application operation handles add
typing and autocomplete to the same runtime `execute()` method; they never emit
an executable client. Portable plugin scalars receive an exact generic
complete-value filter containing only `eq`, `ne`, `in`, `notIn`, and null
predicates; Typegen does not infer ordered or domain-specific operators from a
JSON codec. Plugin fields that separately enable Core's portable structural
containment name their exact partial operand through `structuralContainsType`.
Plugin schema mutations remain a separate callback-free snapshot. Typegen adds
their direct methods to the selected application's schema class and schema
handle when the `schema` surface is declared, and to persisted model surfaces
when the `model` surface is declared. It omits the target `id` from bound models and `input` for an
`undefined` payload type, and reuses each schema's exact `select`, `include`,
and result contracts. The generated schema-surface registry also retains each
mutation's exact authority, effect, returning mode, dependency selection, and
payload type. Official option packages use that inert registry to expose only
application-valid custom Access and Hook keys. A Master-only mutation is not a
request Access key, but it remains an exact before/after Hook key so trusted
maintenance work can retain transactional auditing. Custom Hook payload,
candidate, preimage, result, and target types come from that same inert entry.
Typegen emits `contains` only for those fields and keeps the executable snapshot
callback out of generated artifacts. These contracts advance the inert snapshot
format to version 11 and the generator format to version 19. Owner-private
collections contribute only an opaque application fingerprint input; their
owners, collection names, fields, indexes, references, options, and records
never enter the snapshot or emitted declarations. An application without
private storage retains no private Typegen field.

The TypeScript loader transpiles the application before a previous generated
registry exists. Static compilation registers configured plugin field types and
the narrower set of public field methods, resolves fields and relationship
targets, and then emits exact models,
operation inputs, filters, projections, includes, embedded objects, and
context-specific builder methods. A plugin declaration is emitted only into
the stored, embedded, virtual, or output interfaces it explicitly supports;
Typegen never copies factories, validators, resolvers, or other executable
implementation code. Those values drive exact contextual options contributed
by installed plugins, including official Access, Hooks, and Validation. Compatible object
and enum `typeName` identities are
reused; incompatible identities and normalized TypeScript name collisions
report both owners.

Generated `Select` contracts mark `id` as `id?: true`: every root or nested
model result contains its stable identifier even when the developer selects
only other fields, while `id: false` is rejected by TypeScript. The same
generated `include` types drive exact relationship projections on reads and on
`createOne`, `createMany`, `updateOne`, and `updateMany`.

Relation declarations also receive the exact target `WhereInput` and
`WhereBuilder` types for their optional `where`. Static inputs and synchronous
`({ context, where }) => ...` resolvers are checked at the source declaration,
including inverse relations. Typegen records only callback-free relationship
metadata: it never copies the resolver body or turns generated declarations
into Runtime behavior. The same source callback therefore executes in
Typegen-free JavaScript, while a stale or missing generated file cannot change
relation visibility.

The emitted file is application-facing rather than an opaque implementation
dump. Concrete named types such as `TodoItem`, `TodoCreateInput`,
`TodoWhereInput`, and `TodoSelect` appear first, followed by one flat `Schemas`
namespace. Each `Schemas.<Name>` type is the source of truth for its item and
operation inputs; there is no duplicate application-wide `TypeInfo` map or
nested per-schema `Item` alias. The lower-level Core augmentation references
those schema types and is isolated in a framework registry section at the
bottom. It adds only logical field kind, list, and relationship metadata that
cannot be recovered safely from the public value types.

Access and hook contracts are derived instead of duplicated in that registry.
They are contextually inferred from the compiled option contracts rather than repeated as standalone
`TodoAccess` or `TodoHooks` wrappers. Extracted code can name the canonical
generated value or operation input directly.

Each schema also receives a concrete object-shaped `TodoOrderByInput` whose
optional fields use the generated local `OrderDirection` union; generated
application code never exposes the Core ordering helper.

Generated schema commands retain the same named inputs while exposing concise
singular identifier aliases. `updateOne({ id, data })` and `deleteOne({ id })`
are typed as mutually exclusive alternatives to their canonical `where` forms;
Core normalizes the alias to `{ id: { eq: id } }` before Query construction.
`createOne` and `updateOne` additionally use recursive schema-specific nested
pointer and relation inputs. The registry retains separate `nestedCreate` and
`nestedUpdate` declarations, while drafts, bulk commands, and upserts keep
their flat input aliases. Typegen emits declarations only; Core normalizes the
same compiled graph for JavaScript applications without loading this file.

Listed fields receive concrete element-aware declarations such as
`ArrayStringFilter`, `ArrayIntFilter`, and named enum/object variants. These
filters expose complete-list `eq`/`ne`, `has`, `hasSome`, `hasEvery`,
`isEmpty`, and complete-value null checks without rebuilding field value types
through Core conditionals. Fields are strictly one-dimensional; nested arrays
are represented explicitly by `jsonField()`.

The emitted declaration augments `@ultimabase/core` with one application-owned
schema registry plus the configured stored, embedded, virtual, and output
builder methods and direct options. Keep that file included by the application's
TypeScript project. Core then resolves
exact drafts, results, Query and mutation inputs, Access, hooks, direct plugin
options, indexes, embedded paths, pointers, and relations directly from the
generated contracts. A schema name absent from the loaded registry remains a
valid source declaration and uses Core's bootstrap contract until the next
automatic startup generation replaces the artifact.

Every artifact embeds a deterministic SHA-256 fingerprint covering the Core
generated-contract ABI, generator version, application identity, plugin field
and Typegen contracts, owners, static options, and resolved schema
snapshot. `writeGeneratedTypeFile()` writes a
complete sibling temporary file and atomically renames it over the destination.
`writeGeneratedTypeFiles()` additionally rejects duplicate resolved output
paths before writing any file.

Command-line generation, check mode, and watch mode are deferred. They will
allow developers to request generation manually without starting the
application. This package currently exposes automatic startup generation plus
the side-effect-free compiler, TypeScript loader, fingerprint, and atomic
writer for explicit build integrations.

## Development checks

`yarn workspace @ultimabase/typegen test:performance` runs the isolated
large-schema editor measurements in `tests/performance`. The package `test`
command includes these checks alongside unit and compile-time tests.
