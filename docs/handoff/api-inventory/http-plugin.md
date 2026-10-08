# Fiche : `@ultimabase/http-plugin`

Sources : `packages/http-plugin/README.md`, `src/plugin.ts`,
`src/browser-policy.ts`, `src/endpoints.ts`, `src/request-boundary.ts`.
Sondes : `node_modules/.cache/inventory-transport/probe/{app,route,misconfig}.ts`
et le projet généré `gen/notes`, contre PostgreSQL 17 sous Docker.

## 1. Rôle et installation

Frontière HTTP Fetch commune à REST, GraphQL/Yoga, Password Auth et aux
explorateurs. N'ouvre aucun socket (c'est `server-hono-plugin`) et ne connaît
ni REST ni GraphQL. Fournit la capacité `httpApplicationCapability` (graphe de
routes + dispatcher), `httpBrowserPolicyCapability`, et consomme les
contributions `provideHttpEndpoints` / `provideHttpContextResolvers`.

```ts
httpPlugin({ appId: 'blog' })
```

| Option             | Défaut          | Remarque                                                                                                                                                 |
| ------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appId`            | **obligatoire** | Identité publique, ne donne aucune autorité. Doit être répétée dans chaque requête (en-tête) et dans chaque client.                                      |
| `browser`          | désactivé       | Les **cinq** champs sont obligatoires (`allowedOrigins`, `allowedMethods`, `allowedHeaders`, `credentials`, `maxAgeSeconds`) : aucun défaut raisonnable. |
| `master`           | désactivé       | Forme imposée `{ enabled: true }` exactement ; un objet à une seule clé qui ne peut valoir que `true` est un booléen déguisé.                            |
| `requestTimeoutMs` | aucun délai     | Pas de délai par défaut : une requête lente n'est jamais coupée.                                                                                         |

Options à discuter :

- `appId` obligatoire alors que le noyau impose **une seule application par
  royaume JavaScript** (ADR-0258). Le serveur connaît déjà l'unique
  application ; l'en-tête n'apporte qu'une vérification d'égalité.
- `browser.allowedHeaders` doit contenir `X-UltimaBase-Application-Id` (sinon
  rien ne marche depuis un navigateur), et le développeur doit aussi penser à
  `Content-Type`, `Authorization`… L'exemple `examples/minimal/src/create-application.ts`
  liste 5 en-têtes, 4 méthodes, 1 origine, `credentials`, `maxAgeSeconds`
  (14 lignes) pour un cas banal.
- `master: { enabled: true }` : forme spéciale pour un booléen.

Pour obtenir « REST + GraphQL sur HTTP avec PostgreSQL » il faut aujourd'hui
**7 packages** : `core`, `postgres-plugin`, `http-plugin`,
`server-hono-plugin`, `rest-plugin`, `graphql-plugin`, `graphql-yoga-plugin`
(8 avec `typegen` dans un projet TypeScript `create-app`). Sonde
`probe/app.ts` : 7 imports, 22 lignes.

## 2. Ce qu'il apporte

- **En-tête obligatoire** `X-UltimaBase-Application-Id: <appId>` sur toute
  requête applicative, y compris une route personnalisée `GET /health`.
  Mesuré : `curl /health` sans en-tête → `401 HTTP_APPLICATION_REJECTED`,
  message « The application or credentials were rejected. » alors qu'aucun
  identifiant n'est en jeu. Un mauvais `appId` donne la même réponse ; un
  en-tête dupliqué donne `400 HTTP_BAD_REQUEST`.
- Seule exception : `httpBrowserBootstrapRoute()` (`GET` exact sous
  `/__ultimabase/apps/{appId}/…`), réservée aux pages d'outils (GraphiQL,
  Sandbox).
- Contexte de requête : chaque requête démarre en `anonymous` ; les résolveurs
  (`httpContextResolver`) dérivent des valeurs (Password Auth) ; Master
  uniquement via `X-UltimaBase-Master-Key` si `master` est activé, vérifié par
  la `MasterAuthority` de l'application. Infalsifiable depuis le transport :
  invariant respecté.
- En-têtes de réponse imposés : `Cache-Control: private, no-store` (même pour
  des lectures publiques cachables) et `X-UltimaBase-Request-Id`.
- Erreurs avant dispatch : enveloppe `{ error: { code, message, requestId,
retryable } }`, codes `HTTP_APPLICATION_REJECTED` (401), `HTTP_BAD_REQUEST`,
  `HTTP_NOT_FOUND`, `HTTP_REQUEST_TIMEOUT` (408), `HTTP_INTERNAL_ERROR`.
- CORS désactivé par défaut. Mesuré : un préflight `OPTIONS` depuis
  `http://localhost:5173` sans politique `browser` reçoit `401
HTTP_APPLICATION_REJECTED` (pas une réponse CORS explicite), ce qui égare le
  développeur front.

## 3. API pour le développeur

Route personnalisée (sonde `probe/route.ts`, 23 lignes, 4 concepts : `plugin`,
`provideHttpEndpoints`, `contributionId`, `httpRoute` + `protocol`) :

```ts
const healthPlugin = plugin({
	id: 'app.health',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		provideHttpEndpoints({
			contributionId: 'health',
			create: () => [
				httpRoute({
					method: 'GET',
					path: '/health',
					protocol: { name: 'app.health', version: '1' },
					handle: () => Response.json({ ok: true }),
				}),
			],
		}),
	],
})
```

Depuis l'ADR-0290, plus besoin de déclarer `transport:expose` à la main
(vérifié : la sonde démarre sans `permissions`). Restent : un plugin complet
avec `id`/`version`/`core` pour une route, un `protocol` nommé et versionné que
le développeur d'application n'a aucune raison de connaître, et un handler
`(request: Request) => Response` qui ne reçoit pas le `RequestContext` (il
faut connaître `getCurrentRequest()` de Core, documenté dans
`core/application.mdx` mais pas dans la fiche HTTP).

Client : chaque client doit poser l'en-tête d'application
(`examples/minimal/src/client.ts`, 28 lignes, existe uniquement pour ça).

## 4. Frictions mesurées

| Mesure                                                  | Résultat                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /health` (route perso) sans en-tête                | 401, message parlant d'« identifiants »                                                             |
| Préflight CORS sans `browser`                           | 401 au lieu d'un refus CORS lisible                                                                 |
| `restPlugin()` sans `httpPlugin()`                      | démarre sans erreur ni avertissement, aucune route exposée                                          |
| `httpPlugin()` sans serveur                             | démarre sans erreur ni avertissement, rien n'écoute                                                 |
| `honoServerPlugin()` sans `httpPlugin()`                | erreur claire mais formulée en capacité (`ultimabase.http.application`), pas en package à installer |
| `hono.request()` (test en mémoire) avec en-tête correct | 401 : les en-têtes bruts Node manquent (voir fiche server-hono)                                     |
| Lignes de config CORS de l'exemple minimal              | 14                                                                                                  |

## 5. Dépendances à Typegen

Aucune. Les options sont des valeurs ; les routes n'ont pas de type lié au
schéma.

## 6. Propositions

1. **En-tête d'application facultatif pour une application seule.** Puisque
   le royaume n'a qu'une application, l'absence d'en-tête vaut sélection de
   l'unique application ; un en-tête présent et différent reste refusé. Option
   `requireApplicationId: true` pour les déploiements multi-applications
   derrière un même proxy. Sécurité inchangée : l'`appId` n'a jamais été une
   autorité.
   - Avant : `curl -H 'X-UltimaBase-Application-Id: main' …/api/v1/classes/Task`
   - Après : `curl …/api/v1/classes/Task`
2. **`appId` facultatif** (défaut `'main'`, déjà celui de `create-app` et de
   Typegen) : `httpPlugin()` sans argument.
3. **Messages distincts** : `HTTP_APPLICATION_MISSING` (« add header X… or
   remove requireApplicationId ») et `HTTP_APPLICATION_UNKNOWN`, au lieu d'un
   401 « credentials ». Statut 400/404 plutôt que 401 pour l'absence d'en-tête.
4. **CORS par origines seules** : `browser: { origins: ['https://app.example'] }`
   avec méthodes = celles des routes montées, en-têtes = ceux que les plugins
   installés déclarent (application, `Content-Type`, `Authorization` si un
   résolveur d'identifiants est installé, Master seulement si `master`).
   Chaque plugin déclare ses en-têtes via la capacité existante, pas de lien
   caché.
   - Avant : 14 lignes. Après : `browser: { origins: [browserOrigin], credentials: true }`.
5. **`master: true`** au lieu de `{ enabled: true }`.
6. **Routes simples sans plugin** : un helper `httpRoutes('app.routes', [httpRoute(...)])`
   qui fabrique le plugin (id dérivé, `protocol` facultatif) ; et un handler
   `(request, { context }) => Response` qui reçoit le contexte.
7. **Diagnostic au démarrage** quand des endpoints sont fournis mais qu'aucun
   serveur ne consomme `httpApplicationCapability` (ou quand REST est installé
   sans HTTP) : avertissement « routes contributed but no server installed ».
8. **`requestTimeoutMs` par défaut** (ex. 30 s) plutôt qu'aucun délai.

Aucune proposition ne fait connaître un plugin à Core ni n'ouvre Master au
transport.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                   |
| ---------------------- | ------------------------------------------------------------------------------- |
| Sans génération        | Conforme, aucun type généré.                                                    |
| Colocalisation         | Neutre ; CORS séparé des en-têtes que chaque plugin ajoute.                     |
| Concision              | Faible : `appId` + en-tête client + 14 lignes CORS ; 23 lignes pour une route.  |
| Une forme par concept  | `master: { enabled: true }` est une forme spéciale de booléen.                  |
| Révélation progressive | Faible : `appId` obligatoire, CORS tout-ou-rien en 5 champs.                    |
| Erreurs                | Faible : 401 « credentials » pour un en-tête absent ; silence si rien n'écoute. |
| Hovers                 | Non mesuré ; JSDoc présente sur les options.                                    |
| Performance TypeScript | Sans objet (aucun type dépendant des schémas).                                  |
| JavaScript             | Conforme, validation runtime de toutes les options.                             |
| Coût de migration      | Faible : 1 package + clients/tests qui posent l'en-tête (restent valides).      |
