# Fiche : `@ultimabase/testing`

Sources : `packages/testing/README.md`, `src/index.ts`,
`src/postgres/worker.ts`, `src/operations/fake-public-transport.ts`,
`apps/website/content/docs/1.0.0/guides/test-an-application.mdx`. Sondes :
`probe/honotest.ts`, `probe/route.ts`.

## 1. Rôle et installation

Outils de test, majoritairement **pour auteurs de plugins** :

| Export                                                                                                                                             | Public visé                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `definePluginConformanceSuite`, `createPluginConformanceFixture`, `runPluginConformance`, `withPluginTypegenConformance`, `PluginConformanceError` | auteurs de plugins                           |
| `FakePublicOperationTransport`                                                                                                                     | auteurs de plugins (exposition d'opérations) |
| `PostgresTestWorker`, `readVitestPoolId`                                                                                                           | applications et plugins                      |

Aucune option globale. `PostgresTestWorker({ query, workerId, prefix? })`
crée un schéma PostgreSQL par worker et fournit `connectionOptions`
(`search_path`). Ne dépend ni de `pg` ni de Testcontainers : le développeur
installe `pg` et fournit la fonction `query`.

Les répertoires `src/adapters/` et `src/performance/` sont vides dans la
copie de travail (non suivis par Git).

## 2. Ce qu'il apporte

- Pour une application : seulement l'isolation PostgreSQL par worker.
  Aucun utilitaire pour : construire l'application de test à partir de la
  configuration réelle, obtenir un contexte anonyme/utilisateur/Master,
  réinitialiser les données entre tests, envoyer des requêtes HTTP.
- Pour un plugin : une suite de conformance complète (manifeste, privilèges,
  revendications, déterminisme, isolation, instances multiples) et des
  vérifications facultatives nommées (`operation`, `transport`,
  `persistence`…).

## 3. API pour le développeur

Test d'application recommandé par le site (`test-an-application.mdx`,
l. 89-176) : **≈ 75 lignes** pour deux tests, avec 4 ressources à fermer
dans l'ordre (`ultimabase`, `pool`, `worker`, `adminPool`) via quatre
`try/finally` imbriqués, `process.loadEnvFile('.env.test')`,
`readVitestPoolId(process.env.VITEST_POOL_ID)` et une **reconstruction de
l'application** :

```ts
const Application = UltimaBase.use(
	postgresPlugin({ pool, schemaPolicy: 'override' }),
)
const ultimabase = new Application({ schemas: [Task] })
```

Le test ne réutilise pas la fabrique de production : la liste de plugins
diverge (ici, ni REST ni HTTP ni politique). Avec un schéma déclaré sur une
fabrique qui contient `restPlugin()`/`accessPlugin()`, il faut recopier ces
plugins dans le test.

Tests HTTP : aucune aide. Mesuré :

- `hono.request(...)` en mode « application Hono existante » → 401 (en-têtes
  bruts Node absents) ;
- `honoServerPlugin({ port: 0 })` → port impossible à lire ;
- la seule recette qui marche (tests publics de Password Auth) : Hono externe
  - `@hono/node-server` `serve({ port: 0 })` + lecture de l'adresse + en-tête
    d'application sur chaque requête.

GraphQL sans réseau : possible via
`application.plugin('@ultimabase/graphql-plugin').execute({ context,
document })` avec un contexte fabriqué par
`application.anonymous({ requestId, source: 'internal' })`.

Test de plugin (README) : `definePluginConformanceSuite({ createFixture,
expected })` puis `runPluginConformance(...)` ; c'est la partie la plus
aboutie du package.

## 4. Frictions mesurées

| Mesure                                           | Résultat                                               |
| ------------------------------------------------ | ------------------------------------------------------ |
| Lignes du test d'application de référence        | ≈ 75 pour 2 tests                                      |
| Ressources à fermer à la main                    | 4, ordre imposé                                        |
| Dépendances directes à ajouter                   | `pg` (+ `hono`, `@hono/node-server` pour tester HTTP)  |
| Requête HTTP en mémoire                          | impossible (401)                                       |
| Réutilisation de la configuration de production  | non prévue                                             |
| `FakePublicOperationTransport` sans acquittement | avertissement `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` |

## 5. Dépendances à Typegen

`withPluginTypegenConformance` compare deux générations complètes ; utile
tant que Typegen existe, à retirer avec lui. Le reste n'en dépend pas.

## 6. Propositions

1. **Fixture d'application en une ligne** qui reprend la vraie fabrique et
   remplace seulement la base :
   - Avant : ≈ 75 lignes (pools, worker, quatre `finally`).
   - Après :
     ```ts
     const t = await testApplication(createApplication, {
     	database: 'postgres',
     })
     // t.app démarrée sur un schéma isolé ; t.reset() entre tests ; fermeture automatique (await using)
     ```
   Implémentation : `testApplication` reçoit une fonction qui accepte des
   plugins de remplacement (par exemple le `postgresPlugin({ pool })` du
   worker). Aucune connaissance d'un plugin concret dans Core ; le helper vit
   dans `testing` (qui peut dépendre de `postgres-plugin` en dépendance
   facultative, ou un sous-chemin `@ultimabase/testing/postgres`).
2. **Client HTTP en mémoire** : `t.http.fetch('/api/v1/classes/Task')`
   passant par le dispatcher sûr (voir fiche server-hono, proposition 3),
   en-tête d'application ajouté automatiquement.
3. **Contextes de test** : `t.as.anonymous()`, `t.as.master()`,
   `t.as(context)` pour exécuter requêtes et GraphQL sans fabriquer
   `requestId`/`source`.
4. **Gestion de l'URL de test** : lecture de `TEST_DATABASE_URL` par défaut,
   ou démarrage Testcontainers facultatif.
5. **Séparer le public** : `@ultimabase/testing` (applications) et
   `@ultimabase/testing/plugins` (conformance), pour que l'autocomplétion du
   développeur d'application ne propose pas d'abord la conformance.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                    |
| ---------------------- | -------------------------------------------------------------------------------- |
| Sans génération        | Conforme hors vérification Typegen.                                              |
| Colocalisation         | Faible : le test recopie la configuration de l'application.                      |
| Concision              | Faible : ≈ 75 lignes pour deux tests ; rien pour HTTP.                           |
| Une forme par concept  | Correcte.                                                                        |
| Révélation progressive | Faible : le cas courant (tester son API) exige le montage le plus avancé.        |
| Erreurs                | Faible côté HTTP (401 opaque en mémoire).                                        |
| Hovers                 | Non mesuré.                                                                      |
| Performance TypeScript | Sans objet.                                                                      |
| JavaScript             | Conforme (runner agnostique, pas de Typegen requis).                             |
| Coût de migration      | Faible : ajouts ; guide du site et `create-app` (aucun test généré aujourd'hui). |
