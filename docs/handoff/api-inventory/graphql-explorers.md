# Fiche : `@ultimabase/graphql-http`, `@ultimabase/graphiql-plugin`, `@ultimabase/apollo-sandbox-plugin`

Sources : `packages/graphql-http/{README.md,src/index.ts,src/endpoint.ts}`,
`packages/graphiql-plugin/src/{options,plugin,page}.ts`,
`packages/apollo-sandbox-plugin/src/{options,plugin,page}.ts`. Sondes :
`probe/misconfig.ts`, projet `create-app` `gen/full` (GraphiQL choisi).

## 1. Rôle et installation

- **`graphql-http`** (130 lignes, pas un plugin) : déclare la capacité
  `graphqlHttpEndpointCapability` (`{ path }` seul, cardinalité `single`).
  Yoga la fournit ; les explorateurs la requièrent. Le développeur
  d'application ne l'importe jamais.
- **`graphiql-plugin`** (289 lignes) et **`apollo-sandbox-plugin`** (299
  lignes) : une page HTML d'explorateur servie par
  `httpBrowserBootstrapRoute()` sous
  `/__ultimabase/apps/{appId}/graphiql` ou `/apollo-sandbox`.

Options (identiques dans les deux plugins) :

| Option              | Défaut                           | Remarque                                                                                                                |
| ------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `environment`       | **obligatoire**                  | `'development' \| 'production'` ; « no process-global value is inferred » : chaque projet écrit sa ternaire `NODE_ENV`. |
| `allowInProduction` | absent                           | Doit valoir exactement `true`.                                                                                          |
| `path`              | `/graphiql` ou `/apollo-sandbox` | Suffixe sous le préfixe réservé.                                                                                        |

Les deux `options.ts` sont identiques au nom près (diff mesuré : une seule
différence de mise en forme) ; `plugin.ts` aussi. Seule `page.ts` diffère
(GraphiQL depuis `esm.sh` avec React 19 et import map, Sandbox depuis le CDN
Apollo). Les deux déclarent `environment:network` (ressources distantes
chargées par le navigateur).

## 2. Ce qu'il apporte

- Une page `GET` qui lit l'`appId` dans l'URL et ajoute l'en-tête
  `X-UltimaBase-Application-Id` à ses requêtes ; aucune clé, aucune autorité
  intégrée. CSP stricte avec nonce.
- URL non intuitive : `/__ultimabase/apps/main/graphiql`, pas `/graphiql`.
  Le préfixe existe parce que l'en-tête d'application est obligatoire ; il
  disparaît avec la proposition HTTP n° 1 (en-tête facultatif).
- Aucune route en production sauf `allowInProduction: true`.
- Ne fonctionne que si Yoga a `introspection: true` ; sinon la page s'ouvre
  sans schéma (pas de vérification au démarrage).
- Sans Yoga : erreur claire mais technique (mesuré :
  `requires capability "ultimabase.graphql.http-endpoint"`).

## 3. API pour le développeur

```ts
.use(graphqlYogaPlugin({ introspection: process.env.NODE_ENV !== 'production' }))
.use(graphiqlPlugin({ environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' }))
```

(`gen/full/src/ultimabase.ts`, généré par `create-app`.) Puis ouvrir
`http://127.0.0.1:1337/__ultimabase/apps/main/graphiql`.

## 4. Frictions mesurées

- 2 lignes et 2 réglages d'environnement de formes différentes pour un
  explorateur de développement.
- URL d'explorateur avec préfixe interne et `appId`.
- Couplage implicite explorateur ↔ introspection.
- Deux packages quasi dupliqués (≈ 290 lignes chacun, dont ≈ 200 de code
  commun : options, plugin, route).
- Dépendance réseau à des CDN tiers (`esm.sh`, `cdn.apollographql.com`) :
  hors ligne, l'explorateur ne charge pas.

## 5. Dépendances à Typegen

Aucune.

## 6. Propositions

1. **Un seul plugin d'explorateur** : `graphqlExplorerPlugin({ ui: 'graphiql' | 'apollo-sandbox' })`,
   ou un package `graphql-explorer-plugin` avec deux pages. Supprime ≈ 290
   lignes et un package. `graphql-http` peut rester (contrat de capacité) ou
   rejoindre `graphql-yoga-plugin` s'il n'a qu'un fournisseur — à arbitrer,
   car le contrat neutre permet un autre adaptateur.
2. **Environnement par défaut lu dans la fabrique** : `environment` facultatif,
   défaut `process.env.NODE_ENV === 'production' ? 'production' : 'development'`.
   La lecture se fait dans le plugin, jamais dans Core.
   - Avant : `graphiqlPlugin({ environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' })`
   - Après : `graphiqlPlugin()`
3. **Vérifier l'introspection au démarrage** : publier `introspection` dans la
   valeur de `graphqlHttpEndpointCapability` (`{ path, introspection }`) ;
   l'explorateur échoue au démarrage avec un message actionnable si elle est
   fausse. Pas de lien caché : c'est le contrat de capacité qui porte
   l'information.
4. **URL simple** : `/graphiql` quand l'en-tête d'application devient
   facultatif ; garder le préfixe pour le mode multi-applications.
5. **Preset** : `httpApi({ graphql: { explorer: 'graphiql' } })` ajoute
   l'explorateur seulement hors production.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ |
| Sans génération        | Conforme.                                                                      |
| Colocalisation         | Sans objet.                                                                    |
| Concision              | Moyenne : 2 lignes, ternaires `NODE_ENV`, 3 packages pour un outil.            |
| Une forme par concept  | Faible : deux plugins identiques ; environnement en booléen et en énumération. |
| Révélation progressive | Moyenne : `environment` obligatoire.                                           |
| Erreurs                | Moyenne : pas de contrôle introspection ; jargon de capacité.                  |
| Hovers                 | Non mesuré.                                                                    |
| Performance TypeScript | Sans objet.                                                                    |
| JavaScript             | Conforme.                                                                      |
| Coût de migration      | Faible : 2-3 packages, create-app, site.                                       |
