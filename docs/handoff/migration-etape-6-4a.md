# Migration, sous-étape 6.4a : socle d'authentification et méthode mot de passe (ADR-0326)

Branche `migration/auth-foundation` (worktree `../ub-step6-4a`), basée sur
`main` local 48a448e8 (fusion de 6.6c). En parallèle : un agent d'exploration
dans `../ub-spike-with` (non touché).

## Portée

ADR-0326, décisions 1 à 5, 8 (sans le changement d'e-mail), 9 et 10 :

- paquet socle `@ultimabase/auth-plugin` : `authPlugin({ methods, session,
linking, http, events })`, fabrique `App.UserSchema.define` (forme D, nom de
  classe libre, une par instance), sessions communes, principal de Core,
  routes HTTP (Bearer et cookie sous un préfixe), résultats typés, inscription
  par le privilège d'élévation, erreurs nommant le champ manquant ;
- paquet méthode `@ultimabase/auth-password` : `password({ identifier,
policy })` ; retrait de `@ultimabase/password-auth-plugin` (sans alias) ;
- liaison de comptes, prouvée par une méthode factice de test
  (`packages/auth-plugin/tests/e2e/fake-method.ts`) ;
- limitation des tentatives par compte et par compte + adresse ;
- sessions (`listSessions`, `revokeSession`, `logoutEverywhere`, Master
  `listSessions(user)` / `revokeSessions(user)`, `revokeOnPasswordChange`) ;
- `changePassword`, `reauthenticate`, `deleteAccount`, `unlinkMethod` avec
  réauthentification récente ;
- événements typés sans secret.

Reporté à 6.4b : réinitialisation du mot de passe, vérification d'e-mail,
changement d'e-mail (événements `afterPasswordReset`, `afterEmailVerified`,
`afterEmailChanged` déclarés, non émis). OAuth hors portée.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Implémentation, tests, migration des consommateurs (exemples, create-app,
tests racine, sondes de performance Typegen) et documentation faits ; porte
finale verte sur 7eacc64c, audit DX expliqué, banc forme D mesuré. En attente
de revue par le coordinateur.

## Décisions prises (non fixées par l'ADR, à confirmer)

Sécurité (à confirmer en priorité) :

1. **Élévation d'un plugin sans `masterAuthority`** (Core,
   `runtime/engine/application-binding.ts`) : un `useMasterKey: true` émis par
   du code de plugin détenant `authority:elevate` réussit sans autorité
   configurée, par une autorité interne par application dont la clé n'est
   jamais exposée ; chaque élévation est une ligne `debug` du journal
   (« Plugin elevated to Master », raison et `requestId`). Avec une
   `masterAuthority` configurée, rien ne change (son `onUse` audite). Le code
   d'application exige toujours une autorité. Effet de bord : Roles (`ensure`,
   requêtes internes) et ACL élèvent aussi sans clé.
2. **Seuils de limitation** (constantes, sans option) : par compte + adresse,
   5 échecs libres puis verrou de 1 s doublé à chaque échec, plafond 15 min ;
   par compte, 20 échecs libres, même croissance. Un succès remet les deux à
   zéro ; un essai verrouillé échoue avant tout Argon2 (`AUTH_TOO_MANY_ATTEMPTS`,
   429 + `Retry-After`) sans compter. Clés : SHA-256 de (méthode, identifiant
   normalisé[, adresse]) ; identifiants inconnus comptés aussi. Changement de
   mot de passe et réauthentification comptés sous `user:<id>`. Compromis : une
   attaque distribuée (≥ 20 adresses) peut retarder la victime jusqu'à 15 min.
3. **Réauthentification récente** : `session.recentAuthenticationMs`, 5 min par
   défaut (1 à 60 min) ; date `authenticatedAt` par session, mise à jour par la
   connexion, `reauthenticate({ password })` et `changePassword`.
   `deleteAccount` et `unlinkMethod` l'exigent.
4. **Jetons et secrets** : jetons `ub_s1.` de 32 octets, seul le SHA-256 est
   stocké ; `listSessions` ne renvoie jamais de jeton ; événements sans mot de
   passe ni jeton (testé) ; `afterLoginFailed` porte l'identifiant normalisé et
   l'adresse. `lastUsedAt` écrit au plus une fois par minute et par session.
5. **Cookie** : les routes `/auth/*` répondent par le cookie `__Host-` aux seules
   requêtes avec `Origin` (navigateurs), qui doivent venir d'une origine
   autorisée en JSON ; un client sans `Origin` garde Bearer (le jeton dans la
   réponse). Toute requête non sûre authentifiée par cookie exige la preuve
   d'origine ; Bearer + cookie rejetés ; cookie périmé ignoré par l'inscription
   et la connexion.

Architecture :

6. **Routes HTTP du socle** : préfixe unique `http.basePath` (`/auth`), `POST
/auth/<opération en kebab>`, corps JSON = entrée, réponse `{ result }`,
   codes d'erreur mappés (400/401/403/404/409/429), corps invalide →
   `AUTH_INVALID_REQUEST` 400. REST ne peut pas poser de cookie : les routes
   sont celles du socle, pas des liaisons REST. Les opérations restent publiques
   (ADR-0324) : REST les expose à `/api/operations/<nom>` (erreurs déclarées →
   400), GraphQL par des liaisons typées.
7. **User applicatif désigné par option** : le User n'est pas revendiqué (un
   schéma revendiqué refuse `.with({ access })`) ; `App.UserSchema.define` pose
   l'option opaque `ultimabase.auth.user` (comme Roles) ; le socle la définit.
   Une instance d'`authPlugin` possède un User (état de l'instance) ; toute
   application qui enregistre ce User installe la même instance ; une instance
   sert une application à la fois (liaison HTTP refaite à chaque démarrage).
8. **GraphQL `owned-schema`** (`graphql-plugin`) : `{ kind: 'owned-schema' }`
   (référence de type ou `createFieldsFrom`) désigne l'unique schéma ajouté,
   revendiqué ou désigné par une option définie par le plugin de la liaison ;
   `createFieldsFrom` accepte aussi un tel schéma.
9. **Adresse du client** : `clientAddress` dans `HttpContextResolverInput`
   (`http-plugin`), calculée comme pour la limitation (`trustProxy`).
10. **Stockage des listes sans nouvelle API Core** : une ligne d'état par
    utilisateur (génération, ids de sessions et de comptes liés, `version` pour
    le compare-and-swap) ; table `verified-emails` pour la liaison automatique.
    Au plus 100 sessions vivantes listées par utilisateur ; les sessions mortes
    sont supprimées à l'émission suivante.
11. **Méthodes** : `defineAuthMethod({ name, contributions, userFields,
checkUserData, collections, routes, errorStatuses, statics, unlink,
environment })` ; les services du socle (`createUser`, `signIn`,
    `authenticateAccount`, `linkAccount`, limitation, réauthentification) ;
    types via `AuthMethod<Nom, Champs, StaticsHKT, Opérations>`. Noms publics
    des opérations : `signUp`, `login`, `changePassword`, `reauthenticate`
    (méthode) ; `current`, `refresh`, `logout`, `logoutEverywhere`,
    `listSessions`, `revokeSession`, `listMethods`, `unlinkMethod`,
    `deleteAccount` (socle).
12. **Identifiant immuable** : `email` (comme `username`) est requis, unique,
    immuable et normalisé (NFKC, minuscules, format) ; la création directe doit
    fournir la forme normalisée (`VALIDATION_ERROR` sinon). 6.4b décidera du
    changement d'e-mail.
13. **Erreurs** : `AUTH_*` remplacent `PASSWORD_AUTH_*` ; une inscription
    invalide nomme les champs (`details.fields`), un doublon reste opaque.
14. **Événements** : option `events: { afterLogin(event) {…} }` (gestionnaires
    d'application) exécutés par `runAfterCommit` ; pas de capacité
    d'observateurs pour les autres plugins (non demandé). `revokeSessions` de
    Master n'émet pas `afterLogout`.
15. **create-app** : `authPlugin({ methods: [password({ identifier: 'email' })]
})` sur la fabrique, `AppUser` par `UserSchema` avec règle de lecture de son
    propre profil ; plus de clé Master pour l'authentification seule ; REST
    masque toutes les opérations d'authentification (servies sous `/auth`),
    GraphQL les expose toutes ; la `Task` se termine par `.with(...)` (sinon
    TS7022 dans `Register`, même limite connue qu'en 6.3).
16. **Exemple minimal** : `ExampleUser` (`identifier: 'username'`), cookie
    `__Host-minimal-session` ; REST masque l'authentification, GraphQL masque
    `changePassword` et `logoutEverywhere`.

## Approches rejetées

- `findMany` dans le stockage privé de Core (index non uniques) : changeait
  le vocabulaire borné d'ADR-0234 et une assertion publique
  (`contracts.test-d.ts`) hors de l'annonce de l'ADR ; remplacé par la ligne
  d'état par utilisateur (décision 10).
- Revendiquer le User (`schemas.claim`) : Access refuse alors `.with({ access
})` (« Inline Access … is owned by @ultimabase/auth-plugin »).
- Réponse cookie via REST : REST ne peut pas poser d'en-tête ; routes du socle.
- Insertion puis capture d'`UNIQUE_VIOLATION` dans une transaction (e-mails
  vérifiés) : PostgreSQL abandonne la transaction ; lecture préalable.

## Preuves

Porte sur 7eacc64c, après suppression de `packages/*/dist` et `*.tsbuildinfo` :

- `yarn validate:full` : code 0 ; format « All matched files use Prettier code
  style! » ; lint 0 erreur (48, 15 et 2 avertissements) ; performance « Test
  Files 3 passed (3) / Tests 4 passed (4) » ; couverture « Test Files 730
  passed (730) / Tests 3608 passed (3608) / Type Errors no errors », All files
  92.5 / 85.83 / 96.81 / 93.2 ; site « Test Files 17 passed (17) / Tests 66
  passed (66) ».
- `yarn test:e2e:built` : code 0, « Test Files 132 passed (132) / Tests 580
  passed (580) ».
- `yarn website:test` : code 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) » (124 pages statiques).
- Forme D sans TS7022 : TS7 construit 0, TS7 source 0, TS6 construit 0, TS6
  source 0 diagnostic.

Audit DX contre 48a448e8 construit (`--only` tous les paquets, `tests`,
`examples/minimal`, `examples/todo-backend`) : 2706 différences (39430 /
39432 observations). password-auth-plugin 1061 (retiré), auth-plugin 604 et
auth-password 379 (nouveaux), examples/minimal 292 (migration vers
`ExampleUser`), examples/schema-form-d 134 (inclus par ses sites d'usage
malgré l'exclusion ; `TodoUser` migré), tests 205 (fixtures
`optional-product-public-api` décalées de 2 et nouvelles entrées), create-app
14 (identifiant de catalogue `auth-plugin`), core 4 (hash de chunk privé ;
ordre des membres de l'union `QueryRelationshipPredicateNode.operator`, dû à
la composition du programme), http-plugin 3 (`clientAddress` ; ordre de
l'union `HttpPreDispatchErrorCode`), graphql-plugin 4, rest-plugin 5 et
api-server 1 (exemple JSDoc `hide` sur `authOperations` ; ordre de l'union
`RestResponseErrorCode`).

Banc forme D (base 48a448e8 / branche, alternés, 3 passes, médianes en ms) :

| TS6         | froid | 1re diag. | édition → diag. | schéma | tas MiB | charge  |
| ----------- | ----- | --------- | --------------- | ------ | ------- | ------- |
| 50 base     | 4525  | 2074      | 1928            | 1953   | 862     | 4.7–5.8 |
| 50 branche  | 4524  | 2104      | 1914            | 1944   | 862     | 4.5–5.2 |
| 200 base    | 14766 | 6350      | 6123            | 6016   | 2222    | 3.2–4.6 |
| 200 branche | 14881 | 6399      | 6137            | 6045   | 2249    | 3.1–3.9 |

| TS7         | 1re diag. | édition → diag. | toutes | schéma | règle | RSS MiB | charge  |
| ----------- | --------- | --------------- | ------ | ------ | ----- | ------- | ------- |
| 50 base     | 718       | 632             | 1272   | 1072   | 448   | 733     | 3.3–3.7 |
| 50 branche  | 712       | 641             | 1289   | 1061   | 402   | 532     | 3.1–3.7 |
| 200 base    | 2243      | 2098            | 5640   | 3242   | 1097  | 1620    | 2.3–2.9 |
| 200 branche | 2233      | 2082            | 5676   | 3185   | 1075  | 1552    | 2.4–2.6 |

Écarts dans le bruit (≤ 2 % en temps) ; le RSS de TS7 varie de 450 à
1750 MiB d'une passe à l'autre sans tendance. Survols identiques (199
caractères). Dossiers `gen/` supprimés ; worktree de référence retiré.

## Prochaine action vérifiable

Revue du diff par le coordinateur et confirmation des décisions de sécurité
1 à 5 ; puis 6.4b (réinitialisation, vérification et changement d'e-mail).
