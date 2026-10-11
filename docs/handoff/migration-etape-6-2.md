# Migration, sous-étape 6.2 : Hooks et Validation (ADR-0318, ADR-0319)

Branche `migration/hooks-validation` (worktree `../ub-step6-2`), basée sur
`main` local 50209ff0 (fusion de 6.1). En parallèle : 6.5 (PostgreSQL) dans
`../ub-step6-5` ; `packages/postgres-plugin` n'est pas touché.

## Portée

ADR-0318 (décisions 1 à 8) et ADR-0319 (décisions 1 à 9), conséquences
comprises ; règles dans `.with({ hooks })` / `.with({ validation })` en forme
D, ancienne forme sur les mêmes types jusqu'à 6.8 ; utilitaire de
`@ultimabase/testing` qui attend le travail post-commit ; exemples, gabarit
create-app et documentation.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Implémentation, migration des tests et documentation faites (commits
`wip(hooks-validation)`). Reste : porte finale, audit DX, banc (voir
« Preuves »).

### Core (extensions génériques, sans nommer de plugin)

- `runAfterCommit(work)` et `waitForAfterCommitWork()` (`@ultimabase/core/plugin`,
  `runtime/transactions/after-commit-work.ts`) : file par transaction, lancée
  après le commit hors de la requête (instantané `AsyncLocalStorage` pris au
  chargement), séquentielle, suivie par l'application (`stop()`/`dispose()`
  l'attendent), échec journalisé, rien en cas de rollback ou de rejeu.
- Étape `validateMutationInput` (`RuntimeBehaviorStages`) : reçoit
  `structuralIssues`, renvoie `{ issues, operation }` ; Core fusionne ses
  problèmes structurels et ceux de l'étape en un `VALIDATION_ERROR`, à la
  validation finale (`database-execution.ts`) et quand la validation
  structurelle initiale rejette une mutation (`structural-validation.ts`) ;
  une opération renvoyée avec d'autres valeurs est revalidée et compte comme
  remplacement (réévaluation Access). `guardMutationInput` reste.
- Lots (`createMany`, `updateMany`…) : chemins des problèmes préfixés par
  l'index (`request-engine-batch.ts`, `validation-issues.ts`) ; une erreur qui
  enveloppe l'autre (`cause`) n'est plus agrégée deux fois par la transaction.
- Contexte d'écriture imbriquée : `readRelationChanges()` (connect/disconnect
  par champ de relation, `set` en différence via le préflight).
- Types : marqueurs `PluginSourceFieldPresentValue` (valeur non nulle) et
  `PluginSourceFieldApply<HKT>` (affiche `FieldValidator<string>`) ; une
  contrainte de champ peut répondre par un message (`valid: string`), affiché
  sur l'option ; `-?` sur la validité (sinon le message était perdu).
- `ultimabase.plugin(factory)` : surcharge pour une `PluginFactory` portant
  `pluginId`.

### Hooks

- Contrats réécrits (`authoring/contracts.ts`, `global-contracts.ts`,
  `schema-mutation-contracts.ts`) : `resolveInput` sur `data` / `changes` /
  `{ data, changes }` + `mode`, `beforeOperation.upsert`, `afterCommit`, `all`
  partout, `HookChanges` (opérations atomiques lisibles, `HookRelationChanges`),
  champs : valeur non nulle.
- Moteur : `readable-data.ts` (lecture/écriture des changements, entrées
  inchangées gardées, liens en lecture seule), `planned-handlers.ts`
  (`readHookInternals` pour les contributions), `schema-mutation-dispatch.ts`,
  `dispatcher.ts` réécrit, `execution-runtime.ts` (profondeur 16 avec chaîne,
  `queueAfterCommit`, événements livrés après commit, échecs journalisés).
- Événements : `defineEvent<P>(name)`, `onEvent(event, handler)`,
  `context.emit(event, payload)` (plus de nom en chaîne ni de `delivery`),
  `hooksPlugin({ events, global })`.
- `@ultimabase/testing` : `waitForAfterCommit()`.

### Validation

- `FieldValidator<T>` (Standard Schema ou fonction, async), sortie stockée,
  entrée pouvant accepter `null`, message `validation must accept string, got
  number` / `must return …`, contrôle de schéma `.with({ validation })`
  (fonction ou validateur d'objet), seuls les champs modifiés d'une mise à
  jour, `check()` exposé par `ultimabase.plugin(validationPlugin)`.
- Modules : `standard-schema.ts`, `field-validation.ts`, `schema-validation.ts`,
  `operation-validation.ts`, `arithmetic-validation.ts`, `field-validator.ts`,
  `check.ts`, `options.ts` (option de champ + option de schéma avec descripteur
  Typegen `SchemaValidationOption`).

### Migration et documentation

Tests migrés (liste dans le rapport), exemple todo-backend (crochets de champ
non nuls, déclaration Typegen régénérée), gabarit create-app, README Hooks,
Validation, Core, testing ; pages du site Hooks, Validation, erreurs,
transactions, pipeline ; ARCHITECTURE et règles de domaine (ordre Runtime).

## Décisions prises (non fixées par les ADR, à confirmer)

1. Hooks de champ « la valeur seule » : l'entrée reste `{ context, kind, mode,
   value }` ; la valeur exclut `null` et le hook n'est pas appelé pour `null`.
2. `changes` aussi dans `beforeOperation.update`, `afterOperation.update` et
   `afterCommit.update` (pas seulement `resolveInput`).
3. Liens de relation en lecture seule dans `resolveInput` (erreur si modifiés) ;
   les identifiants sont des chaînes, un pointeur reste un `Pointer`.
4. `resolveInput.all` renvoie l'union (données, changements ou paire
   d'upsert) ; forme vérifiée à l'exécution selon `kind`.
5. `all` couvre les opérations natives, pas les mutations de plugin
   (`softDeleteOne`…), qui gardent leur propre branche (y compris
   `afterCommit`).
6. Hooks d'application : plus d'`operation` ni de `nestedWrite` ; les
   contributions de plugins les lisent par `readHookInternals(input)`
   (nouvel export).
7. `afterCommit` et consommateurs d'événements : hors requête ; l'API normale y
   ouvre sa propre requête (anonyme sauf `useMasterKey`) ; le `HookContext`
   garde le principal et le `requestId` d'origine ; `emit` y échoue
   (pas de transaction).
8. Ordre : contributions de plugins, puis hooks globaux, puis hooks du schéma
   (`afterOperation` dans l'ordre inverse, comme avant ; `afterCommit` dans
   l'ordre direct global → `all` → opération).
9. Profondeur : 16 opérations imbriquées autorisées, la 17ᵉ échoue ; message
   `Hooks nested more than 16 operations: Schema.update-one -> …`.
10. Phases de diagnostic : `resolveInput`, `beforeOperation`, `afterOperation`,
    `afterCommit` (branche dans `declarationBranch`) au lieu de `beforeCreate`…
11. Validation : les validateurs ne sont jamais appelés pour `null` ; un
    contrôle de schéma par validateur Standard Schema ne stocke pas sa sortie ;
    chemins des contrôles de schéma relatifs à l'élément ; chemins des mises à
    jour alignés sur Core (`['update', i, champ, 'value']`, auparavant
    `['update', 'operations', i, 'value']`) ; codes par défaut
    `field.validation` / `schema.validation`.
12. Problèmes de Core et du plugin : à la validation initiale, les validateurs
    tournent sur les valeurs présentes hors chemins en erreur ; les contrôles
    de schéma ne tournent que sur un candidat structurellement valide.
13. Préfixe d'index appliqué à toutes les commandes en lot, pas seulement
    `updateMany`.
14. `check()` : création seulement, chemins de `createOne`, sans les contrôles
    structurels de Core.
15. `ultimabase.plugin(validationPlugin)` : surcharge générique `PluginFactory`
    dans Core (le facteur porte `pluginId`).
16. Nouvelle étape Core `validateMutationInput` à côté de `guardMutationInput`
    (gardé).
17. Survols : `item` imprimé développé (`SchemaResult`) pour garder les champs
    visibles ; la valeur reste une donnée simple (ADR-0310).

## Approches rejetées

- Rendre tout l'après-commit de Core non attendu (`flushPostCommitEvents`) :
  aurait changé `postCommit` et `definePlugin.afterCommit` hors des ADR ;
  remplacé par `runAfterCommit`.
- Message de validateur par intersection simple : perdu tant que la validité
  gardait l'option `?` (ajout de `-?`).
- Nouvelle erreur préfixée sans `cause` : agrégée par la transaction
  (« Transaction callback and an operation both failed ») ; corrigé dans
  `combineErrors`.

## Preuves

À compléter avec la porte finale.

## Prochaine action vérifiable

Porte finale, audit DX, banc ; puis revue du coordinateur et décisions de
l'utilisateur sur les points ci-dessus.
