# Migration, sous-étape 6.1 : règles Access, ouvertures explicites et permissions de plugin (ADR-0317)

Branche `migration/access` (worktree `../ub-step6-1`), basée sur `main`
local 97607147 (fusion de 6.0).

## Portée (ADR-0317, décisions 1 à 7)

1. Une règle d'opération (`true` / `false` / filtre, ne rien renvoyer est une
   erreur de type) avant chargement ; forme détaillée `{ where, item }` des
   mutations ; granularité `read` à membres facultatifs ; clés de commandes de
   plugin, même forme, avec `input`.
2. `allowWithoutRule` remplace `default` (clés, priorité, valeurs `true` /
   `'development'` / prédicat / `false` ; refus de `'development'` au
   `start()` en production ; une ligne `warn` par ouverture ; une ouverture
   `write` est une politique explicite pour ADR-0294).
3. Règles de champ partielles.
4. `anyOf`, `allOf`, `not` gardés ; `allowAll`, `denyAll`, `allOperations`,
   `allMutations` retirés.
5. Diagnostic de refus (`info` hors production, `debug` en production).
6. Ligne `info` au démarrage : schémas sans règle Access.
7. Permissions de plugin génériques dans Core ; Access les accorde ; Soft
   Delete `readDeleted`.

Hors portée : décisions des autres revues (ACL 6.3, transports 6.6…),
`publicWrites` lui-même (ADR-0294 n'est pas implémenté sur `main` ; il arrive
avec les transports en 6.6).

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Fait et vérifié par tests ciblés (commits `wip(access)`) :

- ADR-0317 copié depuis `api-challenge` ; ADR-0293 et ADR-0294 (acceptés,
  absents de `main`) copiés aussi pour marquer les parties remplacées ; index
  mis à jour (ADR-0222 : option `default` remplacée ; ADR-0293 : étapes
  `allow`/`where` séparées et résultat omis remplacés).
- Core : `provideSchemaPermissions`, `schemaPermissionsCapability`,
  `holdsSchemaPermission` (`@ultimabase/core/plugin`), gestionnaire
  `permission` de `protectedPolicy` (types `ProtectedPolicyPermission`,
  `ProtectedPolicyPermissionInput` à la racine), porteur de type
  `SchemaPermissions` / `PluginSourceSchemaPermissions`, et
  `SchemaRulesSource` (schéma enregistré d'un `SchemaRef`, lu seulement dans
  `.with`).
- plugin-kit : `shapeMethod({ permissions })` ; `definePlugin` ajoute un
  fournisseur `permissions` et le porteur dans l'emplacement statics.
- Access : contrats réécrits (`AccessRule`, `AccessRuleResult`,
  `SchemaReadAccess` à membres facultatifs, formes détaillées `{ where, item }`,
  `SchemaPermissionAccessMap`, `AllowWithoutRule`), normalisation
  (`declarations.ts`, `allow-without-rule.ts`), compilateur (scindé :
  `plan-drafts.ts`), évaluation (`operation-rules.ts`), journal de refus
  (`denial-log.ts`), démarrage (`startup.ts`), réponse aux permissions.
- Soft Delete : `readDeleted` déclaré par `.softDelete()`, filtre protégé levé
  pour les lectures d'un détenteur (Master compris).
- Migration de tous les usages (tests, fixtures, exemples, gabarit
  create-app, sondes de banc forme D) et documentation (README Access, Soft
  Delete, Core, plugin-kit, todo-backend, minimal ; ARCHITECTURE ; concept
  Soft Delete ; pages du site Access, Soft Delete, Roles, schémas, création de
  plugin, exposition publique).

## Décisions prises (non fixées par l'ADR, à confirmer)

1. **Combinaison des réponses de permission** : détenue si au moins une
   politique répond `true` et aucune `false` ; `undefined` = pas d'avis ;
   aucune réponse = refus. Master court-circuite avant toute politique.
2. **Déclaration** : capacité Core `schemaPermissionsCapability` (multiple,
   sans privilège dérivé) alimentée par `provideSchemaPermissions` ; doublon
   ou schéma étranger refusés au démarrage ; demander une permission non
   déclarée est une `TypeError`.
3. **`definePlugin`** : ajout minimal `shapeMethod({ permissions: [...] })`.
4. **`create` détaillé** : `{ where, item }` où `where` est une décision
   booléenne (rien n'est chargé) ; les deux membres de la forme détaillée sont
   obligatoires (`{ where: true, item }` pour un contrôle d'objet seul).
5. **Plus d'objets `where` statiques** : une règle est `true`, `false` ou une
   fonction ; `() => ({ published: true })` remplace l'objet statique (évite
   l'ambiguïté avec `read: { one, many }`).
6. **Clés d'`allowWithoutRule`** : signature d'index pour les commandes et
   permissions ; validation des clés inconnues à la compilation de
   l'application (« Unknown Access allowWithoutRule key »). `default` est
   refusé avec un message qui cite `allowWithoutRule`.
7. **Message des clés inconnues** dans `access` : « Unknown Access rule:
   access.X is neither a request command nor a permission of Schema » ; les
   commandes Master gardent « Unknown request schema mutation Access branch ».
8. **Étapes du diagnostic** : `operation` (règle simple, ouverture, absence de
   règle), `row filter` (membre `where` d'une forme détaillée qui renvoie
   `false`), `item`, `field`. L'omission d'une valeur de sortie (lecture de
   champ refusée sans sélection explicite) n'est pas journalisée ; les
   réponses de `can()` non plus ; les refus de permission non plus.
9. **Ligne de démarrage** : émise seulement s'il existe des schémas sans
   aucune règle de schéma (opération, commande ou permission), calculée sur
   les déclarations du développeur. Cas limite : un schéma qui n'a qu'une
   règle de permission n'est pas listé, bien que ses opérations soient
   refusées.
10. **Clés de commande et de permission avec `Register`** : `.with` reçoit
    `SchemaRef<"Todo">` sans statiques ; Access lit les clés sur le schéma
    enregistré (`SchemaRulesSource`). Corrige aussi la limite héritée de 6.0
    (les clés de commandes étaient refusées sous `Register`). Les
    contributions de fournisseurs (`schemaAccess`) ne lisent jamais le
    registre (sinon cycle TS7022 dans le gabarit create-app).
11. **Ordre des filtres** : la conjonction garde l'ordre compilé (règles de
    fournisseurs d'abord) pour un SQL stable.
12. **Typegen / ancienne forme** : les clés de permission ne sont pas typées
    dans `define({ access })` (Typegen ne les génère pas) ; la normalisation
    les accepte et la compilation les valide. Retrait de l'ancienne forme en
    6.8.
13. **Exemples** : todo-backend passe à `accessPlugin()` (chaque schéma règle
    chaque opération) ; minimal garde `allowWithoutRule: { all: true }` avec
    un commentaire ; create-app avec authentification ouvre `read`.

## Approches rejetées

- Repli sur le registre dans `PluginSourceSchemaMutations` /
  `PluginSourceSchemaPermissions` (Core) : provoque un cycle TS7022 dès qu'une
  contribution `schemaAccess(AppUser, …)` fait partie de la liste de plugins
  de l'application enregistrée (gabarit create-app). Remplacé par
  `SchemaRulesSource`, lu seulement depuis `.with`.

## Preuves (porte finale sur fe647810, dernier commit de code)

- `packages/*/dist` et `*.tsbuildinfo` hors `node_modules` supprimés, puis
  `yarn validate:full` : code 0 (13 min 42 s). « All matched files use
  Prettier code style! » ; lint 0 erreur (49 + 19 + 2 avertissements, tous de
  taille de fichier, aucun nouveau : `schema-mutation-access.test.ts` passe de
  664 à 663 lignes) ; performance « Test Files 3 passed (3) / Tests 4 passed
  (4) » ; couverture « Test Files 702 passed (702) / Tests 3415 passed (3415) /
  Type Errors no errors », All files 92,58 / 86,28 / 97,28 / 93,25 ; site
  « Test Files 17 passed (17) / Tests 66 passed (66) ». Une première exécution
  avait échoué au typecheck (fixture `rule-forms.test.ts`), corrigée par
  fe647810.
- `yarn test:e2e:built` : code 0, « Test Files 123 passed (123) / Tests 529
  passed (529) ».
- `yarn website:test` : code 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».

### Audit DX (`--only` 23 paquets, `tests`, `examples/minimal`, `examples/todo-backend`)

Base : worktree détaché de 97607147 (construit puis supprimé). 1 027
différences (37 231 / 37 646 enregistrements), classées par script puis lecture
d'échantillons :

| Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Nombre |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Sites d'usage ajoutés ou retirés (nouveaux tests, règles réécrites qui décalent les index d'identifiants)                                                                                                                                                                                                                                                                                                                                                 |    475 |
| Une règle par opération (`AccessRule`, formes `{ where, item }`, `SchemaReadAccess`, types retirés, entrée des règles avec `where`)                                                                                                                                                                                                                                                                                                                       |    138 |
| Règles de champ partielles (membres facultatifs, JSDoc)                                                                                                                                                                                                                                                                                                                                                                                                   |    137 |
| Permissions de plugin (Core, plugin-kit, Soft Delete, `SchemaRulesSource`, clés `readDeleted`)                                                                                                                                                                                                                                                                                                                                                            |    129 |
| `allowWithoutRule` remplace `default`                                                                                                                                                                                                                                                                                                                                                                                                                     |     53 |
| Utilitaires retirés                                                                                                                                                                                                                                                                                                                                                                                                                                       |     39 |
| Décalages d'index (même survol à une autre occurrence d'un fichier réécrit)                                                                                                                                                                                                                                                                                                                                                                               |     23 |
| Sources de sites d'usage modifiées par l'étape                                                                                                                                                                                                                                                                                                                                                                                                            |     10 |
| Reste lu à la main : reformulations JSDoc (`AccessDecisionRule`, `AccessPluginOptions`, `FieldAccess*`), alias privés (`SchemaMutationMap<…, TSource>`, `schemaOperationAccessSlots`, retrait de `schemaFilterAccessFamilies`), import de type `@ultimabase/plugin-kit`, marque de `SoftDeletePlugin` (tuple de permissions), complétions de règle avec `where` (test principal), survols typegen des fixtures réécrites, décalage de ligne de `typos.ts` |     23 |

### Banc forme D (base = 97607147, branche = fe647810 ; alterné, médianes)

TypeScript 6.0.3 (3 exécutions, `tools/bench.mjs`) :

| N   | Arbre   | Charges     | Éd.→diag (s) | Exécutions     | Froid (s) | Schéma (s) | Tas (Mio) | Hover `q0` |
| --- | ------- | ----------- | -----------: | -------------- | --------: | ---------: | --------: | ---------: |
| 50  | base    | 3,9 4,0 3,8 |         2,04 | 2,02/2,05/2,04 |      4,80 |       2,08 |       849 |        199 |
| 50  | branche | 3,7 3,6 3,7 |         2,06 | 2,08/2,06/2,06 |      4,79 |       2,09 |       846 |        199 |
| 200 | base    | 3,8 3,1 2,9 |         6,86 | 6,86/6,84/7,06 |     16,46 |       6,81 |     2 553 |        199 |
| 200 | branche | 3,6 3,5 3,0 |         6,97 | 7,10/6,97/6,88 |     16,55 |       6,84 |     2 581 |        199 |

TypeScript 7.0.2 (`tools/lsp-bench.mjs`, 3 exécutions à 50, 2 à 200 ; médiane
haute à 200) : éd.→diag 50 : 0,69 → 0,70 ; 200 : 2,31 → 2,31 ; premier
diagnostic 50 : 0,78 → 0,79 ; 200 : 2,48 → 2,52 ; édition de règle 50 :
0,44 → 0,47 ; 200 : 1,36 → 1,31 ; RSS serveur 669 → 503 Mio (50),
1 919 → 1 783 Mio (200). Aucun diagnostic inattendu (0 au départ, 1 après
l'édition volontaire). Lecture : neutre (écarts ≤ 1,6 %, dans le bruit des
charges). Dossiers `gen/` supprimés.

## Amendement 6.1 (2026-10-11, option B validée par l'utilisateur)

Master garde toutes les permissions, mais le filtre de corbeille de Soft
Delete reste un défaut pour ses lectures : une lecture Master ne renvoie des
lignes supprimées que si son propre `where` contraint `isDeleted` (toute
condition sur le champ `isDeleted` du schéma lu, à toute profondeur de
`AND`/`OR`/`NOT` ; une condition dans un prédicat de relation ne compte pas ;
une inclusion se lit avec son propre `where`). Les détenteurs non Master de
`readDeleted` gardent la décision 7 ; les non-détenteurs ne voient jamais les
lignes supprimées ; restore et purge sont inchangés. Implémentation :
`constrainsTombstones` dans `packages/soft-delete-plugin/src/visibility.ts`.
Section ajoutée à ADR-0317 ; README et page Soft Delete, concept, ARCHITECTURE
mis à jour. Les deux tests publics qui faisaient voir la corbeille à Master
reviennent aux attentes de `main`.

## Prochaine action vérifiable

Revue du coordinateur, décisions de l'utilisateur sur les points non fixés
par l'ADR, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion.
