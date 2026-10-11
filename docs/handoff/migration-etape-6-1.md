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

## Preuves

(complétées après la porte finale)

## Prochaine action vérifiable

Porte finale sur le dernier commit de code, audit DX, banc forme D, puis revue
du coordinateur.
