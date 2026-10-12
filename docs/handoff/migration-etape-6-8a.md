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

En cours. Core, tests migrés, exemples ; documentation à migrer.

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

À compléter.

## Prochaine action vérifiable

Migrer la documentation (README Core et minimal, `packages/core/docs`,
`packages/core/examples`, pages du site, `ARCHITECTURE.md`,
`docs/current-architecture.md`), puis la porte complète.
