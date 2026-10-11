# Migration, sous-étape 6.6a : socle HTTP et serveur Hono (ADR-0323)

Branche `migration/http` (worktree `../ub-step6-6a`), basée sur `main` local
a0d7ff3c. En parallèle : 6.3 (ACL et Roles) dans `../ub-step6-3` ;
`packages/acl-permissions-plugin` et `packages/roles-plugin` ne sont pas
touchés.

## Portée

ADR-0323, décisions 1 à 13 et conséquences : en-tête d'application
facultatif, CORS par origines, `master: true`, routes d'application,
route de santé, valeurs par défaut (délai, taille du corps, en-têtes de
sécurité), limitation par adresse, journal des requêtes, `fetch()` sans port,
paquet renommé `@ultimabase/hono-server-plugin`, arrêt borné, compression,
`browserPolicyOwner` facultatif. REST et GraphQL gardent leurs options (6.6b,
6.6c) ; seulement adaptés là où le socle l'impose.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6.

## État

Implémentation, tests, documentation, porte finale, audit DX et banc faits
(voir « Preuves »). Dernier commit de code : 60f45ada.

### HTTP (`packages/http-plugin`)

- `options.ts` : `HttpPluginOptions` (tout facultatif), analyseur unique.
- `application-identity.ts` : en-tête absent → l'application ; en-tête
  différent → `HTTP_APPLICATION_UNKNOWN` (404) ; `requireApplicationId` →
  `HTTP_APPLICATION_REJECTED` (401) ; démarrage navigateur inchangé ; requête
  avec en-têtes Fetch mais sans en-têtes d'origine → `HTTP_BAD_REQUEST` avec un
  message nommant les deux remèdes.
- `browser-policy-options.ts` : `browser: { origins, credentials?, maxAgeSeconds? }`,
  politique effective dérivée (méthodes des routes, toutes pour un montage ;
  en-têtes `Content-Type`, application, request ID, `Authorization` si un
  résolveur de contexte est installé et origines exactes, Master si activé).
  `browser-policy.ts` : préflight sans politique → `HTTP_CORS_DISABLED` (403,
  « CORS is not enabled: configure browser.origins »), le reste transmis sans
  préparation.
- `http-routes.ts` : enregistrement partagé `httpRoutes` / `httpPlugin({ routes })`,
  valeur = gestionnaire ou `{ handle, bodyLimit?, rateLimit? }` ; gestionnaires
  `(request, { context })` partout (`HttpRequestHandlerInput`).
- `health.ts` : `GET /health` intégré (200/503 depuis `requestExecution.health()`).
- `body-limit.ts` : garde en flux (lecture à la demande) ; 413
  `HTTP_PAYLOAD_TOO_LARGE`, sauf si le gestionnaire a déjà répondu 413.
- `rate-limit.ts` : `trustProxy` (sauts ou adresses), magasin mémoire par
  défaut, `HttpRateLimitStore.increment(key, expiresAt)`, limites de route en
  plus, 429 `HTTP_RATE_LIMITED` + `Retry-After`, échec du magasin → 500.
- `security-headers.ts` : `nosniff`, `DENY`, HSTS sur HTTPS (URL ou
  `X-Forwarded-Proto` d'un proxy de confiance), valeur du gestionnaire gardée.
- `plugin.ts` : fabrique `httpPlugin` avec `pluginId`, exports
  `{ appId, browser, master, requestTimeoutMs, fetch }`.
- Core : `ApplicationRequestExecutor.health()` générique et
  `readApplicationHealth` partagé avec `ultimabase.health()`.

### Hono (`packages/hono-server-plugin`)

Renommé ; `shutdownTimeoutMs` (10 s, puis `closeAllConnections`),
`compression` (`hono/compress` sur le seul répartiteur), `browserPolicyOwner`
facultatif (exigé au démarrage si CORS est actif), `remoteAddress` transmis.

### Adaptations imposées

- REST et Yoga : `bodyLimit` sans valeur hérite de celle d'HTTP (lecture
  interne non bornée, HTTP borne) ; avec valeur, déclarée sur leur montage.
- Password Auth : champ `origins` de la politique (`http-session-resolver.ts`).
- Gabarit create-app : `httpPlugin()`, `curl` sans en-tête, note README.

## Décisions prises (non fixées par l'ADR, à confirmer)

1. Codes nouveaux : `HTTP_CORS_DISABLED` (403), `HTTP_PAYLOAD_TOO_LARGE` (413),
   `HTTP_RATE_LIMITED` (429), en plus d'`HTTP_APPLICATION_UNKNOWN` (404).
2. `browser.maxAgeSeconds` gardé (facultatif, 600) ; `origins: '*'` gardé sans
   identifiants ni Master ; avec `'*'`, `Authorization` n'est jamais autorisé.
3. « En-têtes déclarés par les plugins » : `Authorization` dès qu'un résolveur
   de contexte est installé (capacité existante), pas de nouvelle option.
4. Méthodes dérivées globalement ; un montage autorise toutes les méthodes.
5. Le chemin réservé `/__ultimabase/apps/…` sans démarrage possédé tombe en
   404 (`HTTP_NOT_FOUND`) en mode par défaut, 401 en mode strict.
6. Santé : route ordinaire du graphe (collision avec un montage `/`), `GET`
   seulement, soumise aux résolveurs et limites comme toute route ; exclue de
   l'avertissement « routes sans serveur ».
7. Limite de corps : comptage en flux sans pré-contrôle `Content-Length` ; un
   413 du transport est conservé ; REST/GraphQL héritent quand leur option est
   absente.
8. Limitation désactivée par défaut ; clé par client « unknown » sans adresse
   (tests `fetch()`), fenêtre fixe d'une minute, magasin en défaut → 500.
9. En-têtes de sécurité : `securityHeaders: false | { contentTypeOptions,
frameOptions, hsts }`, HSTS par défaut `max-age=31536000; includeSubDomains`.
10. Journal : `info`, préfixe du plugin, chemin sans requête ; les préflights
    traités par la couche navigateur ne sont pas journalisés.
11. `fetch()` : en-tête `Host` ajouté depuis l'URL ; exports `fetch` en
    propriété (déstructurable) ; `requestTimeoutMs` exporté est un nombre.
12. Hono : `compression` aussi en mode application existante (répartiteur
    seul) ; `shutdownTimeoutMs` refusé en mode application existante.

## Approches rejetées

- Garde de corps en `TransformStream` : lit en avance, le transport ne voit
  jamais son propre dépassement.
- Livrer le bloc qui franchit la limite puis échouer au suivant : undici
  pompe le flux en recréant la `Request` (Yoga), l'erreur arrive avant la
  détection du transport ; une erreur stricte au franchissement est gardée.
- Préparer la requête dans la couche navigateur sans politique : refusait les
  doublons avant le fournisseur (test Hono « forwards original duplicate
  headers »).

## Preuves

Sur 60f45ada, `packages/*/dist` et `*.tsbuildinfo` supprimés :

- `yarn validate:full` → exit 0 (lint : 0 erreur, avertissements préexistants ;
  performance 3 fichiers / 4 tests ; couverture 722 fichiers / 3 558 tests,
  « Type Errors no errors », lignes 93,43 % ; site 17 fichiers / 66 tests).
  Deux exécutions précédentes en échec sous charge (machine partagée avec
  6.3, charge 12 à 26) : budget `hybrid-authoring` (2 667 ms contre 2 505 ms,
  vert seul) et `password-user-language-service` (délai de 20 s) ; relancées
  sur machine calme.
- `yarn test:e2e:built` → 573/574 ; seul `create-app-packed` dépasse 120 s
  sous charge, vert seul (7/7 ; 58,6 s contre 75,2 s pour la base dans les
  mêmes conditions).
- `yarn website:test` → exit 0 (8 fichiers / 59 tests).

### Audit DX (base a0d7ff3c, tous les paquets des deux arbres, `tests`, `examples/minimal`, `examples/todo-backend`)

545 différences, toutes expliquées :

- `server-hono-plugin` (144, base seule) / `hono-server-plugin` (159,
  branche seule) : après remplacement du nom, 136 enregistrements identiques ;
  les 23 restants sont `shutdownTimeoutMs`, `compression`,
  `browserPolicyOwner` facultatif et les nouveaux appels du test de types.
- `http-plugin` (200) : nouveaux exports (`HttpPluginFactory`,
  `HttpRouteRecord`, `HttpRouteSettings`, `HttpRequestHandlerInput`,
  `HttpEndpointLimits`, `HttpRateLimit*`, `HttpTrustProxy`,
  `HttpSecurityHeadersOptions`, `HttpStrictTransportSecurityOptions`,
  `HttpHealthOptions`), `HttpMasterTransportOptions` retiré, options et
  politique navigateur réécrites, gestionnaire `(request, { context })`,
  `remoteAddress`, quatre codes d'erreur, `requestTimeoutMs: number`, survols
  des tests modifiés.
- `core` (3) : `ApplicationRequestExecutor.health()` et l'alias
  `ApplicationHealthStatus` désormais visible dans les déclarations.
- `rest-plugin` (5), `graphql-yoga-plugin` (4) : JSDoc de `bodyLimit`
  (héritage) et survols `httpPlugin` des fixtures.
- `create-app` (8) : identifiant `hono-server-plugin` dans le catalogue.
- `graphql-plugin` (3), `examples/minimal` (15), `tests` (4) : survols de
  `httpPlugin`/`browser` dans les sites d'usage modifiés, nom retiré ajouté
  à la liste des noms supprimés.

### Banc forme D, TypeScript 6 (alterné, 3 exécutions, médianes)

| N   | Arbre   | Charges     | Éd.→diag (s) | Exécutions     | Froid (s) | Schéma (s) | Tas (Mio) | Hover |
| --- | ------- | ----------- | -----------: | -------------- | --------: | ---------: | --------: | ----: |
| 50  | base    | 7,9 6,6 6,3 |         2,24 | 2,13/2,24/2,45 |      5,23 |       2,30 |       867 |   199 |
| 50  | branche | 7,1 6,0 6,7 |         2,26 | 2,30/2,26/2,17 |      5,17 |       2,34 |       866 |   199 |
| 200 | base    | 6,2 4,6 4,6 |         7,07 | 7,07/7,35/6,80 |     17,11 |       6,94 |     2 386 |   199 |
| 200 | branche | 5,1 5,0 3,8 |         7,26 | 7,34/7,26/7,03 |     17,12 |       6,88 |     2 414 |   199 |

Écarts dans le bruit (+0,9 % à 50, +2,7 % à 200 sous charge 4 à 8) ; le banc
n'utilise pas le paquet HTTP. TS7 non mesuré (types de Core inchangés hors
`health()`). Dossiers `gen/` supprimés, worktree de base retiré.

## Prochaine action vérifiable

Relecture du coordinateur, décisions de l'utilisateur sur les points
ci-dessus, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion.
