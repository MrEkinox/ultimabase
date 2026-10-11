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

Implémentation, tests, documentation faits ; porte finale, audit DX et banc :
voir « Preuves ».

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

(complétées à la porte finale)

## Prochaine action vérifiable

Porte finale, audit DX, banc ; puis relecture du coordinateur.
