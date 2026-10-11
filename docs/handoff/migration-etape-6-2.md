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

Implémentation, migration des tests, documentation, porte finale, audit DX
et banc faits (voir « Preuves »). Dernier commit de code : 98c4141f.

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
5. Remplacée par l'amendement du 2026-10-11 : `all` couvre aussi les
   commandes de plugin (voir ci-dessous).
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

## Amendement 6.2 (2026-10-11, validé par l'utilisateur)

Consigné dans ADR-0318, section « 6.2 amendment (2026-10-11) ».

1. Aucun échec après commit ne rejette l'appel. `runPostCommitEffect` journalise
   (niveau `error`, `requestId`, plugin et étape, jamais les valeurs) au lieu
   d'agréger et de relancer ; l'étape `postCommit` composée isole chaque
   fournisseur (identité de plugin via `BehaviorProvider.owner`) ; les
   effets différés (`deferCurrentTransactionEffect(effect, identity?)`)
   portent une identité ; `definePluginEvent` diffère un effet par
   observateur. Preuve : `tests/e2e/post-commit-failures.postgres.e2e.test.ts`
   (appel résolu, trois lignes d'erreur, effets suivants exécutés, aucune
   valeur dans le journal). Commit 2798b48b.
2. `all` couvre les commandes de plugin (`beforeOperation`, `afterOperation`,
   `afterCommit` ; schéma et global), avant la branche de la commande, avec
   `kind` = nom de la commande. Types : `SchemaMutationAllHookInput`
   (rétrécissement sur `kind` pour un schéma) et `GlobalCommandHookInput`
   (`kind: string` en global, les commandes dépendant du schéma). Décision :
   `resolveInput` n'a pas de forme commande, son `all` reste natif. Preuve :
   `packages/soft-delete-plugin/tests/e2e/soft-delete-all-hooks.postgres.e2e.test.ts`
   (audit `all` voyant `softDeleteOne`, `restoreOne`, `softDeleteMany`,
   `purgeMany` ; branche `softDeleteOne` après `all` ; global avant le schéma).
   Assertion de test public modifiée : `hooks-rules.test-d.ts`, `kind` du `all`
   global `'create' | 'delete' | 'update' | 'upsert'` → `string`.

## Preuves (porte finale sur 98c4141f, dernier commit de code)

- `packages/*/dist` et `*.tsbuildinfo` hors `node_modules` supprimés, puis
  `yarn validate:full` : code 0. « All matched files use Prettier code
  style! » ; lint 0 erreur (49 + 18 + 2 avertissements, tous de taille de
  fichier ; 70 sur 50209ff0) ; performance « Test Files 3 passed (3) / Tests 4
  passed (4) » ; couverture « Test Files 711 passed (711) / Tests 3445 passed
  (3445) / Type Errors no errors », All files 92,62 / 86,3 / 97,22 / 93,3 ;
  site « Test Files 17 passed (17) / Tests 66 passed (66) ».
- `yarn test:e2e:built` : code 0, « Test Files 127 passed (127) / Tests 560
  passed (560) » (un premier passage avait révélé la déclaration générée de
  l'exemple minimal périmée, régénérée par 98c4141f).
- `yarn website:test` : code 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».

### Audit DX (`--only` 23 paquets, `tests`, `examples/minimal`, `examples/todo-backend`)

Base : worktree détaché de 50209ff0 (construit puis supprimé). 1 481
différences (37 695 / 38 239 enregistrements), classées par script puis
lecture d'échantillons :

| Cause                                                                                                                               | Nombre |
| ----------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Sites d'usage dans des fichiers modifiés ou ajoutés par l'étape (tests, fixtures, exemples)                                         |    523 |
| Validation : `FieldValidator`, contrôle de schéma, `check()`, exports, survols de l'option                                          |    318 |
| Hooks : entrées sur données, phases, `all`, `afterCommit`, événements typés, hooks globaux                                          |    287 |
| Exports ajoutés ou retirés (Hooks, Validation, Core, testing) et leurs survols                                                      |    210 |
| État de source configuré : Validation déclare une option de schéma (`fieldOptions … & object`)                                      |     38 |
| Core : JSDoc de `guardMutationInput`, marqueurs privés, contexte d'écriture imbriquée                                               |     38 |
| Core : étape `validateMutationInput`, `runAfterCommit`, marqueurs de source, `PluginFactory`                                        |     36 |
| `ultimabase.plugin(...)` : `+2 overloads` → `+3 overloads`                                                                          |     11 |
| Reste lu à la main : `hooksPlugin(options?)`, JSDoc de `context`/`originalItem`, `waitForAfterCommit`, suggestions « Did you mean » |     20 |

### Banc forme D (base = 50209ff0, branche = 98c4141f ; alterné, médianes)

TypeScript 6.0.3 (3 exécutions, `tools/bench.mjs`) :

| N   | Arbre   | Charges     | Éd.→diag (s) | Exécutions     | Froid (s) | Schéma (s) | Tas (Mio) | Hover `q0` |
| --- | ------- | ----------- | -----------: | -------------- | --------: | ---------: | --------: | ---------: |
| 50  | base    | 4,8 4,0 4,0 |         2,05 | 2,04/2,05/2,08 |      4,84 |       2,12 |       849 |        199 |
| 50  | branche | 4,3 3,9 3,9 |         2,09 | 2,09/2,11/2,08 |      4,78 |       2,12 |       863 |        199 |
| 200 | base    | 3,6 3,1 5,2 |         7,14 | 7,14/7,03/7,49 |     16,72 |       7,30 |     2 539 |        199 |
| 200 | branche | 3,2 4,3 5,2 |         7,55 | 7,34/7,58/7,55 |     17,61 |       7,43 |     2 478 |        199 |

TypeScript 7.0.2 (`tools/lsp-bench.mjs`, 3 exécutions à 50, 2 à 200 ; médiane
haute à 200) : éd.→diag 50 : 0,77 → 0,77 ; 200 : 2,49 → 2,59 ; premier
diagnostic 50 : 0,86 → 0,86 ; 200 : 2,69 → 2,74 ; édition de règle 50 :
0,51 → 0,54 ; 200 : 1,46 → 1,48 ; RSS serveur 651 → 725 Mio (50),
1 813 → 1 755 Mio (200). Aucun diagnostic inattendu.

Lecture : +2 % à 50 et +5,7 % à 200 en TS6 (éd.→diag), +4 % à 200 en TS7,
sous des charges de 3 à 5 (sous-étape 6.5 en parallèle). Coût probable : les
contrats de Hooks plus riches (`all`, `upsert`, `afterCommit`, `changes`)
évalués pour chaque `.with({ hooks })` du banc. Dossiers `gen/` supprimés.

## Prochaine action vérifiable

Revue du coordinateur, décisions de l'utilisateur sur les points ci-dessus,
puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la fusion.
Suivi hors portée : l'extrait de `packages/postgres-plugin/README.md` (émission
d'un événement par nom) est à migrer vers `defineEvent` (6.5 ou après fusion).
