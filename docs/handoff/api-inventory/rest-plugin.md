# Fiche : `@ultimabase/rest-plugin`

Sources : `packages/rest-plugin/README.md`, `src/options.ts`, `src/plugin.ts`,
`src/reads.ts`, `src/responses.ts`, Core
`src/runtime/plugin-operations/engine-integration.ts` (diagnostic de
protection). Sondes : projet généré `gen/notes` et `probe/app.ts` contre
PostgreSQL 17 (Docker).

## 1. Rôle et installation

Génère les routes REST v1 des schémas d'application, les routes d'opérations
de plugins sélectionnées et les mutations de schéma de plugins ; décode vers
les commandes Core et exécute via l'exécuteur de requêtes applicatif (jamais de
SQL, jamais d'adaptateur). S'installe **avant** la déclaration des schémas pour
typer l'option `rest`, puis exige `http-plugin` + un serveur pour être servi.

| Option                            | Défaut                         | Remarque                                                                                                                            |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `acknowledgeUnverifiedProtection` | absent → `console.warn`        | Ne fait que **taire un avertissement**. Voir ci-dessous.                                                                            |
| `basePath`                        | `'/api'` (+ `/v1` imposé)      | `v1` interdit dans le chemin.                                                                                                       |
| `bodyLimit`                       | 1 MiB                          | Dupliqué dans `graphqlYogaPlugin({ bodyLimit })`.                                                                                   |
| `default`                         | lecture + create/update/delete | Défaut intégré : find, get, first, exists, create, update, delete **activés** ; count, upsert, bulk désactivés ; `mutations: true`. |
| `instanceId`                      | aucun                          | Deux instances REST.                                                                                                                |
| `maxLimit`                        | 1000 (page par défaut 100)     | GraphQL : 100 (page 25). Pas de vocabulaire commun.                                                                                 |
| `operations`                      | `[]`                           | Liste de jetons d'opérations exposées ; **à répéter** dans `graphqlPlugin({ operations })`.                                         |

Option de schéma : `rest: boolean | { find, get, first, count, exists,
create, update, delete, upsert, bulk, mutations }`.

`acknowledgeUnverifiedProtection` : Core émet
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` **même quand Access/ACL sont
installés** (« presence does not prove coverage », `engine-integration.ts`
l. 92-110). L'option n'ajoute aucune politique ; tout le monde finit par la
mettre (`examples/minimal/src/schema.ts`, `create-app`), ce qui réduit le
diagnostic à du bruit. Parallèlement, sans plugin de politique, **l'écriture
anonyme est ouverte par défaut** : sonde `probe/app.ts`, `POST
/api/v1/classes/Note` sans identifiant → `201 Created`. Le défaut sûr manque
exactement là où l'avertissement prétend aider.

## 2. Ce qu'il apporte

Routes (base `/api/v1`) : `GET /classes/{Schema}` et `POST
/classes/{Schema}/query` (find simple/complexe),
`GET /classes/{Schema}/{id}`, `/first`, `/count`, `/exists`, `POST
/classes/{Schema}` (create), `PATCH`/`DELETE /classes/{Schema}/{id}`, upsert et
`/bulk/*` si activés, `POST /operations/{namespacedOperation}` ou chemin
personnalisé de la liaison (`/auth/login`), `POST
/classes/{Schema}/{id}/{command-kebab}` pour les mutations de plugins.

Réponses : `{ results }`, `{ result }`, `{ count }`, `{ exists }` ; 201 pour
create. GET : `select=a,b`, `orderBy=-title`, `where=<JSON encodé>`,
`limit`, `offset`, `include`. Codecs de champs (bigint en chaîne, binaire en
base64 balisé, pointeurs balisés).

Erreurs : `{ error: { code, message, retryable, requestId, details? } }`.
Mesures sur `gen/notes` (en-tête d'application fourni) :

| Requête                                 | Réponse                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `where={"nope":{"eq":false}}`           | 400 `REST_READ_INVALID_INPUT` « The REST read request is malformed. », **aucun détail** sur le champ |
| `?done=false`                           | même 400 sans détail                                                                                 |
| `/classes/Task/count` (count désactivé) | même 400 : `count` est lu comme un `{id}` non UUID, pas un 404                                       |
| `/classes/Task/not-a-uuid`              | même 400 sans détail                                                                                 |
| `POST /classes/Task` (create désactivé) | 404 `REST_NOT_FOUND` (pas 405)                                                                       |
| `/classes/task` (casse)                 | 404                                                                                                  |

## 3. API pour le développeur

Exposition par schéma :

```ts
const Post = Application.Schema.define({
	className: 'Post',
	rest: { count: true, upsert: true },
	fields: (field) => ({ title: field.string() }),
})
```

Opération personnalisée exposée en REST **et** GraphQL :
`examples/minimal/src/status-plugin.ts` fait **145 lignes** pour une
opération sans entrée : valeur d'entrée/résultat validées à la main, deux
`defineOperationTransport` (`ultimabase.rest@1.0.0`,
`ultimabase.graphql.operation@1.0.0`) recopiés par chaîne, deux
`operationWireCodec` quasi identiques, une métadonnée GraphQL écrite en AST à
la main (`kind: 'non-null', ofType: { kind: 'named', name: 'String' }`), puis
le jeton listé dans `restPlugin({ operations })` **et**
`graphqlPlugin({ operations })` (`examples/minimal/src/schema.ts` l. 32-55 :
mêmes 5 jetons écrits deux fois).

Client : aucun client typé ; `fetch` + en-tête d'application.

## 4. Frictions mesurées

- 7 packages pour REST+GraphQL sur PostgreSQL ; REST seul : 5
  (`core`, `postgres`, `http`, `server-hono`, `rest`).
- `restPlugin()` sans `httpPlugin()` : démarre sans aucun signal
  (`probe/misconfig.ts`).
- Écriture anonyme ouverte par défaut (201 mesuré).
- Erreurs de lecture sans détail exploitable (5 cas différents, même message).
- Noms d'opérations divergents de GraphQL : `find`/`first` contre
  `findMany`/`findOne` ; forme d'option `rest: {…}` contre
  `graphql: { operations: {…}, typeName }`.
- Avertissement console à chaque démarrage tant que l'acquittement manque,
  plus le rapport de privilèges (objets affichés `[Object]`/`[Array]`,
  illisibles).

## 5. Dépendances à Typegen

L'option `rest` est typée depuis la source (fabrique configurée) sans
génération ; l'option déclare néanmoins une référence Typegen
(`RestSchemaRoutesOption`) que le fichier généré importe. Les entrées
`where`/`select` envoyées par HTTP ne sont pas typées côté client (pas de
client généré). Aucune dépendance bloquante.

## 6. Propositions

1. **Défaut sûr en écriture** : sans plugin de politique installé, les routes
   générées sont en **lecture seule** ; les écritures s'activent
   explicitement (`rest: { create: true }`) ou automatiquement quand un
   fournisseur de politique protégée est présent. Le test « présence d'un
   fournisseur » existe déjà dans Core (`providerPresence`), sans nommer de
   plugin.
2. **Supprimer `acknowledgeUnverifiedProtection`** et remplacer le
   `console.warn` par une ligne dans le rapport de démarrage
   (« REST exposes create/update/delete on Post without any policy plugin »),
   émise seulement quand aucune politique n'est installée.
   - Avant : `restPlugin({ acknowledgeUnverifiedProtection: true })`
   - Après : `restPlugin()`
3. **Opérations exposées par défaut quand leur plugin est installé** : une
   opération dont le propriétaire fournit une liaison REST est exposée sans la
   lister ; `operations` devient une liste d'exclusion ou de restriction.
   C'est le propriétaire (Password Auth) qui décide de fournir la liaison :
   aucun lien caché REST → Password Auth.
   - Avant : 5 jetons dans `restPlugin` + les mêmes 5 dans `graphqlPlugin`.
   - Après : rien ; `restPlugin({ hide: [passwordAuthOperations.refresh] })` si besoin.
4. **Codec unique d'opération** : un codec JSON par défaut dérivé des valeurs
   d'entrée/résultat validées, partagé par REST et GraphQL ; la métadonnée
   GraphQL dérivée d'une description de type commune. Cible : opération
   exposée en < 30 lignes au lieu de 145.
5. **Erreurs avec détails** : `details: { parameter: 'where', path:
'nope', reason: 'unknown field' }` (sans fuite d'information interne : le
   schéma exposé est public par définition).
6. **Routes réservées avant `{id}`** : `/count` désactivé → 404
   `REST_ROUTE_DISABLED`, pas une erreur d'UUID. Méthode non activée → 405.
7. **Vocabulaire commun REST/GraphQL** pour l'exposition (mêmes clés
   `findMany`, `findOne`, …) et une option partagée possible
   `expose: { read: true, write: false }` lue par chaque transport (chacun lit
   sa propre clé de schéma ; un preset peut fixer les deux).
8. **Preset** (« liste de plugins », sans code caché) :
   `UltimaBase.use(...httpApi({ rest: true, graphql: true }))` renvoyant
   `[httpPlugin(), restPlugin(), graphqlPlugin(), graphqlYogaPlugin(), honoServerPlugin()]`.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Sans génération        | Conforme pour l'option `rest` ; client non typé.                                              |
| Colocalisation         | Bonne : `rest` dans le schéma ; mais l'exposition des opérations est centrale et doublée.     |
| Concision              | Moyenne pour le CRUD ; très faible pour une opération (145 lignes).                           |
| Une forme par concept  | Faible : noms et formes d'options différents de GraphQL ; liste d'opérations répétée.         |
| Révélation progressive | Faible : acquittement obligatoire de fait ; écriture ouverte sans politique.                  |
| Erreurs                | Faible : 400 identiques sans détail ; `count` désactivé lu comme mauvais UUID.                |
| Hovers                 | Non mesuré.                                                                                   |
| Performance TypeScript | Option de schéma petite ; non mesuré isolément.                                               |
| JavaScript             | Conforme (validation runtime complète des options).                                           |
| Coût de migration      | Moyen : rest-plugin, Core (diagnostic), password-auth (liaisons), exemples, create-app, site. |
