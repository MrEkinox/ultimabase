# Migration de Core, étape 2 : principal neutre, prédicats, `PublicError`, `can()`, résultats lisibles (ADR-0304 à 0306)

Branche `migration/principal-policies` (worktree `../ub-step2`), basée sur
`main` local c1098e7e (étape 1). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md`
(ADR-0180 annoté : lecture de la ligne racine remplacée par ADR-0306) :

- ADR-0304 : `Principal` de Core, fournisseur unique, résolution une fois par
  contexte de requête, héritée, conservée sous `useMasterKey` ;
  `PolicyPredicate`, `isAuthenticated` ; consommateurs Access, Hooks, ACL,
  Roles, GraphQL `execute({ principal })` ; Roles sans dépendance vers Access ;
  `passwordPrincipal` limité à la session ; modèles create-app.
- ADR-0305 : `PublicError` exportée (base interne renommée `ExposableError`),
  REST 400, GraphQL `extensions.code`, route HTTP 400, masquage et
  journalisation des autres erreurs, journalisation seule après commit ;
  `ultimabase.can()`.
- ADR-0306 : contrôle de lisibilité des résultats de mutation, préimage de
  suppression, `softDelete` de Soft Delete en préimage, exemption
  `select: { id: true }`, sélections « id seul » REST et GraphQL.

Hors périmètre (étape 6) : `allowWithoutRule`, refonte des options Access,
autres décisions de revue non écrites dans ces ADR.

## État

- [x] ADR copiés et inscrits
- [x] ADR-0305 `PublicError` (Core, REST, GraphQL, HTTP, post-commit)
- [x] ADR-0304 principal et prédicats (Core, Access, Hooks, ACL, Roles,
      GraphQL, create-app, exemple minimal)
- [x] ADR-0306 résultats lisibles (pipeline, suppressions, mutations de
      plugin, Soft Delete)
- [x] ADR-0305 `can()`
- [x] Tests (unitaires, types, langage, PostgreSQL e2e)
- [x] Documentation (site : 13 pages ; README : core, access, hooks, acl,
      roles, password-auth, rest, graphql, soft-delete, http)
- [ ] Porte finale (validate:full, e2e construits, audit DX, banc)

## Décisions (à confirmer par l'utilisateur)

1. **`Principal` typé par `Register`** : nouvelle clé optionnelle
   `Register.principal: 'TodoUser'` ; sans elle, `Principal` vaut
   `PointerValue` (tout pointeur). Le type du schéma d'identité n'est porté
   par aucun type de plugin tant que Password Auth n'a pas migré (étape 6) ;
   la fabrique d'authentification pourra alors le remplir.
2. **`Pointer<"TodoUser">`** : `Pointer` accepte désormais un nom de classe
   (`TSchema extends SchemaDefinition | string`, `PointerSchema<T>` →
   `SchemaRef<T>`). Deux conversions internes (`pointer.ts`).
3. **Entrées acceptant un principal** (`withPrincipal`, GraphQL
   `execute({ principal })`, `can({ principal })`) : `PointerValue`, car un
   pointeur typé n'est pas assignable à `Pointer<SchemaDefinition>`.
4. **`RequestContext#withPrincipal(principal)`** (nouvelle méthode publique)
   pour nommer le principal d'un contexte côté serveur ; utilisée par GraphQL
   et `can()`.
5. **`getRequestPrincipal(context)` / `getCurrentPrincipal()`** exportés pour
   les plugins ; `resolveRequestPrincipal` et `ResolveRequestPrincipalOptions`
   retirés (remplacés par la résolution de Core).
6. **Contexte des prédicats** : `schema` est le nom de classe (`string`),
   `operation` la clé de politique (`one`, `many`, `count`, `exists`,
   `create`, `update`, `upsert`, `delete` ou clé de mutation de plugin).
7. **Toutes les règles Access** (opération, `where`, `item`, champ, mutation
   de plugin) reçoivent `principal`, `operation`, `schema` ; un prédicat est
   donc accepté partout où une règle rend une décision.
8. **`hasRole()`** renvoie un prédicat nommé `hasRole(<Schéma> <rôle>)` ; le
   membre courant est le principal s'il appartient au schéma des membres,
   `resolveCurrent` reste prioritaire quand il est déclaré.
9. **Codes masqués inchangés** : REST `REST_INTERNAL_ERROR`, GraphQL
   `INTERNAL_SERVER_ERROR` (« stays masked » lu comme comportement existant) ;
   journalisation ajoutée par `console.error` en attendant le journal
   d'application d'ADR-0313 (étape 4), comme les nouvelles tentatives de
   l'étape 1.
10. **Après commit** : seule une `PublicError` est journalisée sans rejeter
    l'appel (texte d'ADR-0305) ; les autres échecs post-commit gardent leur
    comportement (décision 15 de la revue Hooks à l'étape 6).
11. **Route HTTP** : `PublicError` → 400 avec l'enveloppe `error` ; les autres
    erreurs de gestionnaire continuent vers le serveur (inchangé).
12. **`can()`** : `schema` est la classe de schéma ; `read` = lecture d'une
    ligne (`one`) ; Master → `true` ; mutation de plugin réservée à Master →
    `false` pour les autres ; `NOT_FOUND` compte comme refus ; marqueur
    `readPolicyQuery(operation)` exporté par Core pour que les politiques
    ignorent les règles de champ (Access l'utilise) ; la ligne est lue dans
    une transaction toujours annulée (ou dans la transaction active).
13. **Soft Delete** : `softDelete` déclare `returning: 'before'` (préimage) ;
    son résultat montre donc `isDeleted: false`. `softDeleteMany`, `purgeMany`
    et les renommages `…One` sont l'étape 6 ; `purge` déclarait déjà
    `before`.
14. **Écritures imbriquées** : seuls la racine et les appels directs sont
    vérifiés ; les enfants répondent par les inclusions de la racine, qui
    gardent leurs propres règles (ADR-0306, décision 6).
15. **Collections** : `exists` pour un identifiant, un `count` groupé pour
    plusieurs ; `updateMany` par défaut ne sélectionne que `id` (inchangé) et
    n'est donc pas vérifié sans `select`.
16. **create-app** : aucune écriture non Master dans les modèles ; note
    ajoutée au README généré (`select: { id: true }`).

## Reports

- `allowWithoutRule` (ADR-0304 décision 4/5, prédicats dans
  `allowWithoutRule`, journal des noms au démarrage) : appartient à la
  migration d'Access (étape 6) ; les tests correspondants aussi.
- ACL « accepte les prédicats » : ACL n'a aucun emplacement de décision
  booléenne aujourd'hui (`clientSharing` est l'étape 6) ; rien à brancher.
- Les relations filtrées, champs virtuels et opérations de l'exemple minimal
  lisent encore `passwordPrincipal` : ce ne sont pas des règles de politique
  et ADR-0304 ne leur donne pas `principal`.

## Tentatives écartées

- `Principal` sans `Register` = `Pointer` (`Pointer<SchemaDefinition>`) :
  un pointeur typé n'y est pas assignable (préexistant), appeler un prédicat
  avec `User.pointer(id)` échouait au typage ; remplacé par `PointerValue`.
- Rendre `Pointer` générique en nom avec un constructeur
  `schema: PointerSchema<TSchema>` : inférence ambiguë ; constructeur
  `TSchema & SchemaDefinition` retenu.

## Preuves (en cours)

- `yarn typecheck` : 0 erreur ; `yarn lint` : 0 erreur ; `yarn format:check` vert.
- Unitaires ciblés et e2e PostgreSQL nouveaux verts (voir commits).

## Prochaine action vérifiable

Porte finale : suppression de `dist` et `*.tsbuildinfo`, `yarn validate:full`,
`yarn test:e2e:built`, audit DX contre c1098e7e, banc forme D 50/200.
