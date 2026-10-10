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
- [x] Porte finale (validate:full, e2e construits, audit DX, banc)

## Décisions (à confirmer par l'utilisateur)

1. **`Principal` typé par `Register`** : nouvelle clé optionnelle
   `Register.principal: 'TodoUser'` ; sans elle, `Principal` vaut
   `PointerValue` (tout pointeur). Le type du schéma d'identité n'est porté
   par aucun type de plugin tant que Password Auth n'a pas migré (étape 6) ;
   la fabrique d'authentification pourra alors le remplir.
2. **`Pointer<"TodoUser">`** : `Pointer` accepte désormais un nom de classe
   (`TSchema extends SchemaDefinition | string`, `PointerSchema<T>` →
   `SchemaRef<T>`). Deux conversions internes (`pointer.ts`). Le constructeur
   prend `schema: TSchema` (l'inférence par `TSchema & SchemaDefinition`
   perdait l'alias `DeclaredSchema<…>` dans les infobulles) : `new
Pointer('Nom', id)` se compile donc mais est refusé à l'exécution.
3. **Entrées acceptant un principal** (`withPrincipal`, GraphQL
   `execute({ principal })`, `can({ principal })`) : `PointerValue`, car un
   pointeur typé n'est pas assignable à `Pointer<SchemaDefinition>`.
4. **`RequestContext#withPrincipal(principal)`** (nouvelle méthode publique)
   pour nommer le principal d'un contexte côté serveur ; utilisée par GraphQL
   et `can()`.
5. **`getRequestPrincipal(context)`** exporté pour
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
  `schema: PointerSchema<TSchema>` : les appels génériques internes ne
  compilaient plus. `TSchema & SchemaDefinition` : infobulles développées
  (alias perdu, vu par l'audit DX). `Extract<TSchema, SchemaDefinition>` :
  appels génériques refusés. Retenu : `schema: TSchema`.
- Ordre d'impression des unions de genres d'opération (`"count" | "exists"`
  avant `"find-many"`) : artefact des identifiants de type de TypeScript
  (les littéraux de `PolicyOperation` sont créés plus tôt) ; non corrigé.

## Preuves

- `yarn typecheck`, `yarn lint` (0 erreur), `yarn format:check`, `yarn constraints` : verts.
- Relancés sur c711cdf5 (dernier commit de code 9d732ea0), mêmes comptes :
  `yarn validate:full` exit 0 et `yarn test:e2e:built` exit 0 (112 / 464).
- `yarn validate:full` (dist et `*.tsbuildinfo` supprimés) sur 27238b59 :
  exit 0 ; performance 3 fichiers / 4 tests ; couverture 668 fichiers /
  3219 tests ; website 17 fichiers / 66 tests.
- `yarn test:e2e:built` sur 27238b59 : exit 0, 112 fichiers, 464 tests.
  (Premier passage : `rest-application.e2e.test.ts` échouait sur les
  déclarations générées de l'exemple minimal, régénérées en 27238b59.)
- Audit DX contre `main` construit (c1098e7e), `--only` tous les paquets,
  `tests`, `examples/minimal`, `examples/todo-backend`, sur 9d732ea0 :
  983 différences, toutes rattachées :
  - fichiers de test nouveaux (327), sources modifiées (5) ;
  - ADR-0304 : entrées des règles Access (120), surface principal de Core
    (106), `Pointer<"Nom">` (42), Roles (27), ACL (19), Hooks (7), GraphQL (3) ;
  - ADR-0305 : `PublicError` / `ExposableError` (113), `can()` (33) ;
  - ADR-0306 : `softDelete` en `returning: 'before'` (51) ;
  - exemple minimal modifié (principal de Core, `isAuthenticated`,
    `select: { id: true }`) (109) ;
  - ordre d'impression d'unions de genres d'opération et de
    `ValidationPresence` (19) : artefact d'identifiants de type, effet indirect
    de `PolicyOperation` (ADR-0304, décision 5), non annoncé — à trancher.
- Banc forme D TS6, même session, alternance main/branche, 3 exécutions
  (médianes) : 50 schémas, édition→diagnostic 2,75 s (main) / 2,85 s,
  froid 6,16 / 6,13 s ; 200 schémas, édition 8,75 / 9,02 s, froid
  22,54 / 22,28 s. Édition +3 % à 200 (reproductible : 9,01–9,08 contre
  8,61–8,78).

## Prochaine action vérifiable

Relecture du diff par le coordinateur ; décisions 1 à 16 et artefact
d'ordre d'unions à confirmer par l'utilisateur ; fusion `--no-ff` dans `main`.
