# Migration, sous-étape 6.8a : filtres de relation dans `.with({ relations })` (ADR-0328)

Branche `migration/relation-rules` (worktree `../ub-step6-8a`), basée sur
`main` local e864067e.

## Portée

ADR-0328, décisions 1 à 3 et conséquences :

1. `.with({ relations: { <relation>: { where } } })`, filtre statique ou
   résolveur synchrone ; type public `RelationRule<TTarget>` ; erreurs à la
   déclaration ; clé `relations` absente pour un schéma sans relation.
2. Option `where` retirée de `field.relation(...)` et de `relationField(...)`
   (`RelationFieldOptions.where`).
3. Sémantique inchangée (ADR-0247, amendement 3b d'ADR-0308).

Critère de fin : porte complète sur le dernier commit de code
(`yarn install --immutable`, `yarn validate:full` sans `dist` ni
`*.tsbuildinfo`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué contre une base e864067e construite, banc forme D TS6 à 50 et 200.

## État

Implémentation, tests, exemples, documentation et porte faits. Dernier
commit de code : 76bb0f2f. Rien n'est poussé ni fusionné.

- Core : `schema/schema/relation-rules.ts` (types `RelationRule`,
  `ConfiguredSchemaRelationRules`, `readRelationRules`,
  `applyRelationRules`) ; `.with` extrait `relations` comme `indexes` ;
  `relationField` perd `where` (`normalizeRelationWhereDeclaration` sert
  désormais `.with`) ; `extendFieldCapabilities` partagé par
  `forbidFieldMutationInput` et `attachRelationWhereDeclaration`.
- Exemples : minimal retrouve `ExampleAuthor.articles` (statique) et
  `contributions` (résolveur) ; forme D : `Tag.todos` et `Todo.tags` se
  filtrent l'un l'autre, cinq cas d'erreur 9 à 13 dans `src/typos.ts`.
- Documentation (impact : both) : README Core, minimal et racine,
  `packages/core/docs/schema.md`, `packages/core/examples/schema/relations.md`,
  pages `related-data.mdx`, `relationships.mdx`, `security-model.mdx`,
  `ARCHITECTURE.md`, `docs/current-architecture.md`.

## Décisions (non fixées par l'ADR)

1. **Où vit le filtre.** `.with` valide et normalise `relations` contre les
   champs capturés (`readRelationRules`) et range les filtres dans la
   déclaration (`relationFilters`, comme `ruleIndexes`). À la compilation, le
   champ relation résolu est relié à sa déclaration privée
   (`attachRelationWhereDeclaration`) ; Runtime lit la même capacité privée
   `relationWhere` qu'avant. Le spike réinjectait `where` dans l'appel capturé
   puis le rejouait dans `relationField` ; ce n'est plus possible puisque
   `relationField` refuse `where`.
2. **« Filtre en double »** (une des cinq erreurs de l'ADR) : un `where` au
   niveau du champ n'existe plus ; `field.relation({ where })` est refusé dès
   `define(...)` avec un message qui renvoie vers `.with({ relations })`.
   `relationField({ where })` est refusé comme toute option Core inconnue
   (« Unknown relation field option: where »).
3. **Schéma sans relation** : `ConfiguredSchemaRelationRules` vaut `unknown`
   (clé absente) au lieu de `relations?: never` du spike. Diagnostic :
   « 'relations' does not exist in type … » au lieu de « not assignable to
   type 'never' ».
4. **Nom de relation** : une relation construite par `relationField(...)` et
   rendue telle quelle par le rappel `fields` est acceptée comme un appel
   `field.relation(...)`.
5. **Test retiré** : `execution.test.ts`, « attributes a plugin-contributed
   relation resolver to its exact instance » (un plugin ajoutait une relation
   filtrée par `addSchemaField(relationField({ where }))`) : ADR-0328
   décision 2, un plugin ne peut plus filtrer une relation qu'il ajoute.
6. **Taille de fichier** : `fields/base/definition.ts` passe de 394 à 407
   lignes (nouvel avertissement `max-lines`, pas d'erreur).

## Tests publics modifiés (ancien → nouveau)

- `packages/core/tests/e2e/core-field-builder.e2e.test.ts` : complétions des
  options de relation `arrayContaining(['mappedBy', 'target', 'where'])` →
  `arrayContaining(['mappedBy', 'target'])` et `not.toContain('where')` ;
  ajout : complétions dans `relations: {}` vide → `['owners', 'reviewers']`,
  dans une règle vide → `['where']`. Le montage
  `validation-field-builder.prototype.ts` déclare `filteredTargets` dans
  `.with` et ajoute deux schémas de sonde.
- `packages/core/src/schema/fields/builtins/relation.test-d.ts` :
  `relationField({ target, where })` accepté → `@ts-expect-error` ; les deux
  filtres typés deviennent des constantes `RelationRule<typeof Target>`.
- `tests/e2e/relation-filter-public-vertical.postgres.e2e.test.ts` : ajout
  (aucune assertion modifiée) : sous Master, `A Public` a 0 `articles` et
  2 `contributions`.
- `tests/e2e/schema-form-d-types.e2e.test.ts` : ajout d'un test (cinq
  diagnostics de `typos.ts`, sources et paquets construits).
- `apps/website/tests/security.content.test.ts` :
  'A relation `where`, a UI filter, or a transport projection' →
  'A declared relation filter, a UI filter, or a transport projection'.
- `packages/core/tests/e2e/fixtures/relation-filter-postgres-no-typegen.mjs` :
  déclarations déplacées dans `.with`, assertions inchangées.

Tests internes : déclarations déplacées dans `.with` sans changer
d'assertion (`relation-where-declaration`, `runtime-execution`,
`relation-filters/{execution,inclusions,isolation,predicates}`, Testing
`conformance`, Typegen `generator-relation-where` et
`relation-where-language-service`). `relation.test.ts` : les deux tests
`relationField({ where })` passent par `.with` ; messages
'relationField where must be a plain object or synchronous resolver' et
'relationField where resolver must be synchronous' →
'relations.<nom>.where must be …' et '… resolver must be synchronous'
(testés dans `relation-rules.test.ts`) ; `where` ajouté aux options
refusées. `execution.test.ts` : test du résolveur contribué par un plugin
retiré (décision 5). Nouveau : `relation-rules.test.ts` (4 tests).

## Compilation TypeScript 7

Aucun harnais TypeScript 7 dans le dépôt. Vérification scriptée :

```sh
TS7=/Users/mrekinox/Desktop/ub-typing-spike/ts7/tsc
cd examples/schema-form-d && npx tsc --noEmit -p tsconfig.json && \
  npx tsc --noEmit -p tsconfig.source.json && \
  $TS7 --noEmit -p tsconfig.json && $TS7 --noEmit -p tsconfig.source.json
```

et de même pour `examples/minimal` (`tsconfig.source.json` du spike copié le
temps du contrôle, non commité). `src/typos.ts` de forme D porte les cas
d'erreur en `@ts-expect-error` : EXIT 0 prouve que chaque erreur est signalée
sur sa ligne sous les deux versions.

## Preuves

Sur 76bb0f2f :

- `YARN_CACHE_FOLDER=… yarn install --immutable` → EXIT 0.
- `packages/*/dist` et `*.tsbuildinfo` hors `node_modules` supprimés, puis
  `yarn validate:full` → EXIT 0 : « All matched files use Prettier code
  style! » ; lint 0 erreur (49 + 15 + 2 avertissements, dont le nouveau
  `max-lines` de `fields/base/definition.ts`) ; performance « Test Files 3
  passed (3) / Tests 4 passed (4) » ; couverture « Test Files 744 passed
  (744) / Tests 3802 passed (3802) / Type Errors no errors », All files
  92,38 / 85,76 / 96,7 / 93,09 ; site « Test Files 17 passed (17) / Tests 66
  passed (66) ».
- `yarn test:e2e:built` → EXIT 0, « Test Files 140 passed (140) / Tests 615
  passed (615) » (`create-app-packed` compris, sans relance).
- `yarn website:test` → EXIT 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».
- TypeScript 6.0.3 et 7.0.2 (commande ci-dessus) : minimal et forme D,
  `tsconfig.json` (paquets construits) et `tsconfig.source.json` → EXIT 0
  dans les huit cas.

### Audit DX

Base e864067e construite (worktree détaché depuis `ub-small`, retiré
ensuite), `node tooling/dx-audit/run.mjs ../ub-step6-8a-baseline . --only
<les 24 paquets>,tests,examples/minimal,examples/todo-backend` → 282
différences, toutes attendues :

- Core, déclarations et exports : `RelationFieldOptions` perd `where` ;
  ajout de `RelationRule` (export de type, survol, complétion d'import) et
  des alias privés `ConfiguredSchemaRelationRules`,
  `DeclaredRelationFieldName`, `DeclaredRelationTarget` ;
  `SchemaRulesMethod.with` gagne `& ConfiguredSchemaRelationRules<TFields>` ;
  renommage des morceaux `dist` (hachages).
- Survols de `.with(...)` partout où le schéma a une relation (todo-backend,
  rôles, hooks, `projection-slots.test-d.ts`, Typegen) : paramètre
  `… & Readonly<...>` → `… & Readonly<...> & Readonly<...>` (la clé
  `relations`). Aucun changement pour un schéma sans relation.
- Complétions d'exports de `@ultimabase/core` : + `RelationRule`.
- Sites modifiés par cette étape (minimal, forme D `typos.ts`, `tag.ts`,
  montage `validation-field-builder.prototype.ts`, `relation.test-d.ts`,
  test de service de langage Typegen) : survols déplacés ; paramètre du
  résolveur `reviewers` `WhereBuilder<DeferredSchemaTarget<() => typeof
ExampleAuthor>>` → `WhereBuilder<SchemaRef<"ExampleAuthor">>` ; nouvelles
  clés `relations?: { readonly articles?: RelationRule<SchemaRef<…>>; … }` ;
  documentation de `Tag` (forme D) complétée.

### Banc forme D (TypeScript 6, médianes de 3, base/branche alternées, ms)

| Mesure                 | 50 base | 50 branche |   Δ    | 200 base | 200 branche |   Δ    |
| ---------------------- | ------: | ---------: | :----: | -------: | ----------: | :----: |
| à froid                |   4 670 |      4 672 | 0,0 %  |   16 373 |      16 348 | −0,2 % |
| édition → diagnostics  |   1 964 |      1 964 | 0,0 %  |    6 119 |       6 092 | −0,4 % |
| édition, tous fichiers |   3 775 |      3 776 | 0,0 %  |   16 500 |      16 577 | +0,5 % |
| édition de schéma      |   2 164 |      2 164 | 0,0 %  |    6 144 |       6 094 | −0,8 % |
| tas maximal (Mio)      |     884 |        890 | +0,6 % |    2 107 |       2 015 | −4,3 % |

Diagnostics à froid / après édition 0 / 1 et survol 199 caractères dans les
quatre cas. Dossiers `gen/` supprimés.

## Prochaine action vérifiable

Revue du coordinateur, puis 6.8b (ancienne forme de déclaration).
