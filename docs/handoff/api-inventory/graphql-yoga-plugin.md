# Fiche : `@ultimabase/graphql-yoga-plugin`

Sources : `packages/graphql-yoga-plugin/README.md`, `src/options.ts`,
`src/plugin.ts`. Sondes : `gen/notes` (serveur généré), `probe/app.ts`,
`probe/misconfig.ts`, PostgreSQL 17 sous Docker.

## 1. Rôle et installation

Adaptateur GraphQL sur HTTP : monte le schéma de `graphql-plugin` dans
l'application Fetch de `http-plugin` et publie le chemin via
`graphqlHttpEndpointCapability` (`graphql-http`). Dépendances obligatoires
sur `http-plugin` et `graphql-plugin` (erreurs claires si absents, mesuré).

| Option          | Défaut       | Remarque                                                                                          |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `bodyLimit`     | 1 MiB        | Doublon de `restPlugin({ bodyLimit })` ; deux réglages pour la même politique HTTP.               |
| `introspection` | `false`      | Doit valoir `true` pour que GraphiQL/Sandbox découvrent le schéma : lien implicite entre plugins. |
| `path`          | `'/graphql'` |                                                                                                   |

Le plugin ne renvoie aucune valeur via `ultimabase.plugin()`.

Le développeur installe **deux** packages GraphQL (`graphql-plugin` pour
le schéma, `graphql-yoga-plugin` pour HTTP) et la séparation n'est visible
que par l'architecture : aucun autre adaptateur HTTP GraphQL n'existe
aujourd'hui.

## 2. Ce qu'il apporte

- `POST /graphql` uniquement, JSON UTF-8. Refuse : `GET` (mesuré : 405
  `METHOD_NOT_ALLOWED` « accepts POST requests only »), lots, envois de
  fichiers, souscriptions, SSE, GraphiQL intégré de Yoga.
- Introspection désactivée par défaut (mesuré : `{ __schema { … } }` → 400
  `GRAPHQL_VALIDATION_FAILED` « introspection has been disabled »).
- Réponses `application/graphql-response+json`, en-têtes HTTP communs
  (`no-store`, identifiant de requête), erreurs avec `extensions.code`.
- Contexte : celui sélectionné par `http-plugin` (anonyme, session, Master
  vérifié). Pas de résolution d'identifiant propre : invariant respecté.

## 3. API pour le développeur

```ts
.use(graphqlYogaPlugin())
// ou, généré par create-app quand GraphiQL est choisi :
.use(graphqlYogaPlugin({ introspection: process.env.NODE_ENV !== 'production' }))
.use(graphiqlPlugin({ environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' }))
```

Le second extrait (`gen/full/src/ultimabase.ts`) montre la même décision
« développement ou production » encodée deux fois, dans deux plugins, avec
deux formes (`boolean` et énumération).

Client : `fetch` POST + en-tête d'application ; aucun client typé.

## 4. Frictions mesurées

| Mesure                                      | Résultat                                                       |
| ------------------------------------------- | -------------------------------------------------------------- |
| Lignes pour le cas courant                  | 1 ligne + 1 import                                             |
| Sans `httpPlugin()`                         | `requires missing plugin "@ultimabase/http-plugin"` (clair)    |
| Sans `graphqlPlugin()`                      | `requires missing plugin "@ultimabase/graphql-plugin"` (clair) |
| `GET /graphql?query=…`                      | 405 ; pas de requêtes GET cachables                            |
| Explorateur installé, introspection `false` | démarre ; l'explorateur s'ouvre sans schéma                    |

## 5. Dépendances à Typegen

Aucune.

## 6. Propositions

1. **Fusionner l'adaptateur HTTP dans le preset**, pas dans Core :
   `graphqlPlugin({ http: true })` resterait un lien caché, donc refusé ; à
   la place, un preset (`httpApi({ graphql: true })`) qui renvoie
   `[graphqlPlugin(), graphqlYogaPlugin()]`. Le développeur n'écrit plus
   qu'une ligne et garde la possibilité de remplacer Yoga.
2. **`bodyLimit` au niveau HTTP** : `httpPlugin({ bodyLimit })` lu par REST et
   Yoga via la capacité HTTP existante (valeur par défaut commune), chaque
   transport gardant une surcharge locale facultative.
3. **Introspection déduite de l'explorateur** sans lien caché : l'explorateur
   **requiert** une capacité « introspection disponible » publiée par
   l'adaptateur quand `introspection` est vrai ; à défaut, erreur de démarrage
   explicite (« GraphiQL needs graphqlYogaPlugin({ introspection: true }) »)
   au lieu d'une page vide.
4. **Un seul réglage d'environnement** : `environment` lu une fois (option de
   preset ou `NODE_ENV` lu par la fabrique), passé aux deux plugins.
   - Avant : 2 expressions `NODE_ENV` différentes.
   - Après : `...httpApi({ graphql: { explorer: 'graphiql' } })`, explorateur et
     introspection actifs seulement hors production.
5. **`GET` pour les requêtes** (option `get: true`), conforme à GraphQL over
   HTTP, pour le cache HTTP ; mutations toujours en `POST`.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Sans génération        | Conforme.                                                                                 |
| Colocalisation         | Sans objet.                                                                               |
| Concision              | Bonne seul ; deux packages GraphQL pour un seul besoin.                                   |
| Une forme par concept  | `bodyLimit` dupliqué ; environnement exprimé deux fois.                                   |
| Révélation progressive | Bonne (défauts prudents) ; introspection à activer pour les outils.                       |
| Erreurs                | Bonnes pour les dépendances manquantes ; silence sur le couple explorateur/introspection. |
| Hovers                 | Non mesuré.                                                                               |
| Performance TypeScript | Sans objet.                                                                               |
| JavaScript             | Conforme.                                                                                 |
| Coût de migration      | Faible : options + preset ; exemples et create-app.                                       |
