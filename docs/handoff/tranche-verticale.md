# Tranche verticale de la forme D sur le vrai Core (2026-10-09)

Branche `spike/schema-form-d` (worktree `/Users/mrekinox/Desktop/ub-slice`,
basée sur `main` local `116cf14e`). Ne jamais pousser. Preuve demandée par
ADR-0297 (`docs/adr/0297-declare-schemas-without-typegen.md` sur la branche
`api-challenge`) avant le gel de la décision 4.

## Périmètre

1. Core : capture des cibles `() => X` sans résolution ; `define({ className, fields })`
   chaînable ; méthodes de forme et entrées de règles fournies par les plugins via
   des emplacements génériques ; `.with({...})` final non générique ; `Register` et
   types nommés. L'ancien `define({... access, hooks ...})` + Typegen continue de marcher.
2. Plugins réels : Soft Delete (`.softDelete()`), Access (`access`), Hooks (`hooks`),
   opérateur `where` apporté par un plugin.
3. Fixture : schémas en cycle dans des fichiers séparés, ligne `Register`, usages,
   assertions exactes, 8 fautes du protocole.
4. Preuve depuis les paquets construits (`dist/*.d.ts`).
5. Infobulles TS 6.0.3 (service de langage) et TS 7.0.2 (LSP), source et construit.
6. Exécution PostgreSQL (Testcontainers).
7. Mesures 10/50/200 contre Typegen réel, TS6 et TS7.

## État

- [~] 1 Core : cibles, chaîne, emplacements faits ; `Register` à faire
- [~] 2 Plugins : Access, Hooks, Soft Delete faits ; opérateur `where` à faire
- [ ] 3 Fixture
- [ ] 4 Construit
- [ ] 5 Infobulles
- [ ] 6 Exécution
- [ ] 7 Mesures

## Décisions

- Cibles : `field.pointer/relation({ target })` accepte un thunk ou un nom
  généré ; le type du thunk est capturé dans `DeferredSchemaTarget<F>`
  (`deferred-targets.ts`) et lu paresseusement (`SchemaTypeInfoFor`,
  `SchemaRelationshipSource`). `mappedBy` d'un thunk : `string`, vérifié à
  l'enregistrement.
- Pointeur : la cible n'est inférée que par `Readonly<{ target: TTarget, … }>`
  ajouté hors de `CompatibleFieldOptionsExtension`, la base passant en
  `NoInfer` : l'`Omit` générique de l'extension faisait évaluer le thunk
  (TS7022 sur auto-pointeur `parent`).
- Emplacements Core génériques (ADR-0297) : `schemaRules` (HKT en tuple) et
  `shapeMethods` dans `PluginSourceState` ; `provideSchemaShapeMethods`
  (table d'exécution `sets` + `apply`, WeakMap par plugin) ; espace `Schema`
  par fabrique configurée (`createConfiguredSchemaNamespace`).
- `define(...)` renvoie `DeclaredSchema` = schéma utilisable (ancienne forme
  intacte) + méthodes de forme + `.with(rules)` non générique ; une méthode de
  forme est absente quand la déclaration fixe déjà les options qu'elle pose.
- Plugins : Access `AccessSchemaRules`/`AccessRules<S>`, Hooks
  `HooksSchemaRules`/`HooksRules<S>` (interfaces : un littéral imbriqué
  liait `this` au littéral), Soft Delete `.softDelete()` →
  `{ softDelete: 'replace-delete' }` seulement si `defaultMode` est `disabled`
  (sinon collision avec la mutation `softDelete` du mode explicite).

## Échecs et impasses

- **Cause racine trouvée (TS2589/TS2615 sur auto-relation)** : le type mappé
  écrit dans les branches de `ResolveSourceSchemaTemplate`
  (`source-schema-templates.ts`) capturait les paramètres `infer` non résolus
  des conditionnels englobants ; tout type de schéma paraissait générique, et
  la résolution d'un thunk (`() => Todo` vs instanciation restrictive)
  ré-instanciait puis comparait tout le graphe. Extraire ce type mappé dans un
  alias (`ResolveSourceSchemaObject`) supprime toutes les erreurs. Outil :
  `scratchpad/tools/freetp.mjs` (liste les paramètres libres d'un type).
- Variantes écartées en cours : `Readonly<TResolved>` à
  `source-projections.ts:376` (sans effet) ; branches d'`NestedPointerCreateInput`
  en interfaces (sans effet).

## Commandes et résultats

- `YARN_CACHE_FOLDER=… yarn install --immutable` : code 0 ; `yarn build` : code 0.

- `npx tsc --noEmit -p examples/schema-form-d/tsconfig.source.json` : 0 erreur
  (Todo ↔ TodoUser, auto-relation, `.softDelete().with({ access, hooks })`).
- `yarn vitest run --project types packages/soft-delete-plugin
  packages/core/src/schema/schema/field-builder.test-d.ts` : 1 échec attendu
  (`rejects value-level target callbacks…` : l'ancien contrat refusait les
  thunks, ADR-0297 les impose ; corps de test non modifié).

## Prochaine action vérifiable

`Register` + types nommés : `where` affiché `WhereBuilder<SchemaReference<"Todo">>`.
