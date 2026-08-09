# Generated schema authoring prototype

This directory is the disposable issue-801 proof. It is not exported, built,
or presented as a second Core implementation.

The prototype answers four blocking questions before an ADR can select the
production architecture:

1. Can schema modules record `fields(field) { ... }` without resolving plugin
   methods during module evaluation?
2. Can an application-owned, pure plugin declaration phase install
   `field.vector()` before those callbacks execute?
3. Can one transpilation-first generator produce exact stable-TypeScript
   completions for fields, Query selection, Access, hooks, objects, pointers,
   and relations?
4. Can constructible schema models retain their current immediate behavior
   when field definitions do not exist until application compilation?

The runtime proof intentionally binds a schema's first successful compiled
definition as its canonical model definition. This permits `new Model()` after
compilation and rejects a later application that compiles the same schema
differently. It also deliberately throws before compilation. The result makes
the tradeoff visible: deferred application-local field discovery cannot also
provide the current declaration-time model validation without an earlier
configured schema environment, generated runtime preload, or a documented
post-compilation construction boundary.

The user accepted the post-compilation model-construction boundary demonstrated
by this prototype on 2026-08-09. Issue 802 may now formalize that boundary in an
ADR; this disposable proof still makes no production API change.

## Verified behavior

The automated proof runs with Node.js 24.18.0 and the repository's stable
TypeScript 6.0.3 dependency.

- A schema callback executes zero times during declaration and once when the
  application compiles it.
- A plugin-owned `vector` method is registered before the callback resolves.
- Before generation, the language service reports that `field.vector` is
  absent. `transpileModule` still emits and loads the configuration, allowing
  generation to bootstrap itself.
- The generated declaration adds `field.vector()` and exact model, create,
  selection, Access, hook, nested-object, enum, pointer, and relation types
  without `any`.
- A generated application without the vector plugin does not complete
  `field.vector`.
- Missing methods, duplicate owners, and incompatible recompilation of one
  schema class fail deterministically. Two applications may compile the same
  class only when the resulting static definition is identical.

## Editor observation

One warm-process observation used 80 scalar fields. It is evidence that both
approaches remain functional, not a performance conclusion:

| Contract                    | Semantic diagnostics | Completion |    Fields completed |
| --------------------------- | -------------------: | ---------: | ------------------: |
| Recursive inference fixture |            140.51 ms |    2.02 ms | 79 remaining fields |
| Generated named fixture     |            148.99 ms |    1.12 ms | 79 remaining fields |

Heap readings were inconclusive because garbage collection occurred between
the two language-service runs. Issue 810 must benchmark separate processes and
a representative large application before claiming a memory reduction. The
prototype nevertheless proves that compact generated types can expose the
required editor surface on stable TypeScript without the current backward
contextual-inference dependency.

## Blocking model-construction decision

The proof cannot preserve all three properties simultaneously without another
mechanism:

1. plugin methods are discovered from an application before field resolution;
2. applications retain isolated plugin registries; and
3. `new Model()` validates immediately before any application has compiled the
   schema.

The minimal demonstrated contract keeps the model constructor but makes the
compilation boundary explicit: static `fields` and `new Model()` throw before
successful application compilation, then behave normally. A schema class may
be reused by another application only when it compiles to the same static
definition.

Alternatives such as a generated runtime preload or an explicitly configured
Schema environment add another mechanism and remain unapproved. The accepted
direction is therefore to permit model construction only after the application
has completed static schema compilation.
