# Fiche : `@ultimabase/server-hono-plugin`

Sources : `packages/server-hono-plugin/README.md`, `src/options.ts`,
`src/plugin.ts`, `src/provider.ts`. Sondes :
`node_modules/.cache/inventory-transport/probe/{app,honotest,misconfig}.ts`.

## 1. Rôle et installation

Fournisseur de serveur Node basé sur Hono pour la capacité
`httpApplicationCapability` de `http-plugin`. Ouvre l'écoute pendant
`startTransports`, la ferme à l'arrêt. Hono et `@hono/node-server` restent
confinés au package.

Deux modes exclusifs (union de types `ManagedHonoServerPluginOptions` /
`ExistingHonoServerPluginOptions`) :

| Mode                  | Options                                                                      | Défaut                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Écoute gérée          | `host?`, `port?`                                                             | `port: 1337` ; `host` non transmis s'il est absent, donc écoute sur **toutes les interfaces** (défaut Node). |
| Application existante | `app` (Hono), `browserPolicyOwner: 'ultimabase' \| 'external'` (obligatoire) | `host`/`port` interdits ; le développeur appelle `serve()` lui-même.                                         |

Remarques :

- Aucune lecture de `PORT`/`HOST` : chaque projet réécrit
  `Number(process.env.PORT ?? 1337)`. `create-app` et tous les exemples
  passent `host: '127.0.0.1'` explicitement, ce qui montre que le défaut réel
  (toutes interfaces) n'est pas celui qu'on veut en développement.
- `browserPolicyOwner` est obligatoire en mode `app` même quand aucune
  politique CORS n'est configurée.
- Le plugin n'exporte **rien** (`exports: undefined`) : avec `port: 0`
  (documenté « pour les tests »), il est impossible de connaître le port
  attribué. L'adresse existe en interne (`provider.ts`, getter `address`).
- Nommage : package `server-hono-plugin`, fabrique `honoServerPlugin`, id
  `@ultimabase/server-hono-plugin` (ordre inversé entre package et fabrique).

## 2. Ce qu'il apporte

- Un serveur HTTP, sans route propre : toutes les routes viennent de
  `http-plugin` et des plugins de protocole.
- Transmission des `rawHeaders` Node ordonnés pour détecter les en-têtes
  sensibles dupliqués. Conséquence mesurée (`probe/honotest.ts`) : en mode
  `app`, l'outil de test natif de Hono `hono.request('/api/v1/classes/Note',
{ headers: { 'X-UltimaBase-Application-Id': 'n' } })` répond **401
  HTTP_APPLICATION_REJECTED**, car `incoming.rawHeaders` n'existe pas hors
  d'un vrai socket Node. Le message ne mentionne pas la cause.
- Propriété CORS : en mode `app`, UltimaBase ou un middleware externe, jamais
  les deux (vérifié au démarrage et à la réponse).
- Pas de TLS, proxy de confiance, compression, limitation de débit (hors
  périmètre, assumé par le README).

## 3. API pour le développeur

Cas courant (exemple généré `gen/notes/src/ultimabase.ts`) :

```ts
.use(honoServerPlugin({ host: '127.0.0.1', port: 1337 }))
```

Ajouter une route `GET /health` sans en-tête d'application oblige à passer en
mode `app` : installer `hono` et `@hono/node-server`, créer `new Hono()`,
déclarer la route sur Hono, passer `{ app, browserPolicyOwner }`, puis appeler
`serve({ fetch: app.fetch, port })` soi-même et gérer sa fermeture
(README, section « Existing Hono application »). Soit 2 dépendances et une
gestion de cycle de vie en plus pour une sonde de santé.

Tests HTTP : la recette des tests publics
(`packages/password-auth-plugin/tests/e2e/password-http-sessions.postgres.e2e.test.ts`)
crée un Hono externe et `serve({ port: 0 })` pour lire le port. Un
développeur d'application doit reproduire ce montage.

## 4. Frictions mesurées

| Mesure                         | Résultat                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Lignes pour le cas courant     | 1 ligne + 1 import (bon)                                                                         |
| `host` omis                    | écoute sur toutes les interfaces                                                                 |
| `port: 0`                      | accepté, port non lisible depuis l'application                                                   |
| `hono.request()` en mode `app` | 401, cause (`rawHeaders` absents) invisible                                                      |
| Sans `httpPlugin()`            | `requires capability "ultimabase.http.application"` : correct mais formulé en jargon de capacité |
| Health check sans en-tête      | impossible sans le mode `app` ou la proposition HTTP n° 1                                        |

## 5. Dépendances à Typegen

Aucune.

## 6. Propositions

1. **Défauts d'environnement** : `port` = `process.env.PORT` sinon 1337,
   `host` = `127.0.0.1` sauf configuration explicite (ou `HOST`). Lire
   l'environnement dans la fabrique du plugin (pas dans Core) reste conforme.
   - Avant : `honoServerPlugin({ host: '127.0.0.1', port: Number(process.env.PORT ?? 1337) })`
   - Après : `honoServerPlugin()`
2. **Exporter l'adresse** : `ultimabase.plugin('@ultimabase/server-hono-plugin').address`
   (`{ host, port, url }`) après `start()`, pour `port: 0` et les tests.
3. **Requêtes en mémoire pour les tests** : un export `fetch(request)` (ou
   `inject`) qui passe par le même dispatcher sûr, en construisant les
   en-têtes originaux à partir de `Headers` (un objet `Headers` ne peut pas
   contenir de doublon invisible : la preuve d'unicité est triviale quand la
   requête ne vient pas du réseau). Le mode réseau garde la vérification
   `rawHeaders`.
   - Avant : Hono externe + `@hono/node-server` + `serve({ port: 0 })` + lecture du port.
   - Après : `await server.fetch(new Request('http://local/api/v1/classes/Task'))`.
4. **Message explicite** quand `rawHeaders` manque : « request did not come
   from a Node listener; use … for in-process tests ».
5. **`browserPolicyOwner` facultatif** quand `httpPlugin` n'a pas de
   politique `browser` (défaut `'external'` dans ce cas, `'ultimabase'` sinon) ;
   le conflit reste détecté.
6. **Message d'erreur en termes de package** pour les capacités HTTP
   manquantes : « install @ultimabase/http-plugin (provides
   ultimabase.http.application) ». Le texte peut venir du jeton de capacité
   (champ « hint » facultatif), sans que Core connaisse le plugin.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ |
| Sans génération        | Conforme.                                                                      |
| Colocalisation         | Sans objet.                                                                    |
| Concision              | Bonne pour le cas courant ; mauvaise dès qu'il faut une route hors UltimaBase. |
| Une forme par concept  | Deux modes justifiés ; `browserPolicyOwner` imposé même sans CORS.             |
| Révélation progressive | Moyenne : défaut d'écoute non local, rien pour les tests.                      |
| Erreurs                | Moyenne : 401 opaque en test en mémoire, jargon de capacité.                   |
| Hovers                 | Non mesuré ; union de modes lisible dans le source.                            |
| Performance TypeScript | Sans objet.                                                                    |
| JavaScript             | Conforme.                                                                      |
| Coût de migration      | Faible : 1 package, exemples et `create-app` (simplification).                 |
