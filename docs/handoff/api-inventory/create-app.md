# Fiche : `@ultimabase/create-app`

Sources : `packages/create-app/README.md`, `src/{cli,prompts,catalog,generate,api-template,security-template,base-template}.ts`.
Sondes : projets générés par `node packages/create-app/dist/cli.js` dans
`node_modules/.cache/inventory-transport/gen/` : `notes` (REST + GraphQL,
Docker), `full` (+ Password Auth, Access, Hooks, GraphiQL), `exist`
(défauts `--yes`). `notes` a été typé, construit et démarré contre
PostgreSQL 17 (Docker), puis interrogé par `curl`.

## 1. Rôle et installation

Initialiseur de projet (non publié : `npm create @ultimabase/app` ne
fonctionne pas encore ; seul `node dist/cli.js` marche dans le dépôt).

Questions interactives (`prompts.ts`) : nom, répertoire, langage (TS/JS),
API (REST, GraphQL, multi-sélection), plugins officiels (16, groupés),
starter (Task ou vide), base (existante ou Docker Compose), gestionnaire de
paquets, installation, confirmation : **10 questions**. Drapeaux
équivalents (`--api`, `--plugin`, `--starter`, `--database`, `--yes`).

Défauts `--yes` : TypeScript, **aucune API HTTP**, PostgreSQL existant,
starter Task, npm. Le projet par défaut n'a donc pas de serveur : il crée une
tâche et s'arrête.

Le catalogue propose `PostgreSQL Vector`, inutilisable avec PostgreSQL
(voir fiche pg-vector).

## 2. Ce qu'il apporte (projet `notes`, REST + GraphQL + Docker)

11 fichiers, 150 lignes (TS, JSON, Markdown) :

| Fichier                                                                            | Contenu                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/schema.ts` (34 l.)                                                            | `UltimaBase.use(typegenPlugin()).use(restPlugin({ acknowledgeUnverifiedProtection: true, default: {…6 clés à false} })).use(graphqlPlugin({ …identique… }))`, schéma `Task`.           |
| `src/ultimabase.ts` (23 l.)                                                        | lecture `DATABASE_URL`, `postgresPlugin({ schemaPolicy: 'override' })`, `httpPlugin({ appId: 'main' })`, `graphqlYogaPlugin()`, `honoServerPlugin({ host: '127.0.0.1', port: 1337 })`. |
| `src/main.ts` (18 l.)                                                              | `start()`, **crée une tâche à chaque lancement**, attend SIGINT.                                                                                                                       |
| `scripts/generate-types.mjs`                                                       | chargeur Typegen.                                                                                                                                                                      |
| `package.json`                                                                     | 8 dépendances `@ultimabase/*` ; `typecheck`/`build` = génération + `tsc` via `node --env-file=.env`.                                                                                   |
| `compose.yaml`, `.env`, `.env.example`, `README.md`, `tsconfig.json`, `.gitignore` |                                                                                                                                                                                        |

Le projet `full` (sécurité) passe à 139 lignes de TS dont un plugin Access
de 20 lignes pour permettre à un utilisateur de lire son propre profil, et
la liste des 4 opérations Password Auth recopiée dans `restPlugin` et
`graphqlPlugin`.

Défauts de sécurité générés : écoute sur `127.0.0.1`, écritures Task
désactivées dans REST et GraphQL, CORS et Master HTTP désactivés. Ces choix
sont bons, mais ils compensent des défauts de plugins moins sûrs (écritures
ouvertes, écoute sur toutes les interfaces, `override`).

## 3. Les 15 premières minutes d'un nouveau venu (mesurées sur `notes`)

1. `docker compose up -d`, `npm install` (non rejoué : paquets non publiés ;
   remplacé par la résolution du workspace).
2. `npm run typecheck` : génération Typegen 1,4 s (imprime le rapport de
   privilèges illisible `[Object]`) + `tsc` 1,6 s.
3. `npm run build`, puis `npm start` : pas de script `dev` ni de
   rechargement ; chaque modification de schéma = `build` + redémarrage, et
   chaque démarrage insère une tâche de plus.
4. `curl http://127.0.0.1:1337/api/v1/classes/Task` (sans en-tête, réflexe
   courant) → **401** « application or credentials were rejected ». Le README
   généré donne bien l'en-tête `X-UltimaBase-Application-Id: main`.
5. Avec l'en-tête : `200 {"results":[…]}` ; GraphQL `findManyTask` → 200.
6. Premier `POST` (créer une tâche) → **404** `REST_NOT_FOUND` (écritures
   désactivées par le starter, rien n'indique quelle option changer) ;
   GraphQL `createTask` → « mutation operation is not supported ».
7. Pour activer l'écriture, le développeur supprime `create: false` du
   `default` → l'écriture devient **anonyme et publique** (pas de politique
   dans ce starter), avec un avertissement que le starter a déjà réduit au
   silence par `acknowledgeUnverifiedProtection: true`.

## 4. Frictions mesurées

- 8 packages `@ultimabase/*` pour un REST + GraphQL minimal.
- Artefacts de gabarit : lignes vides multiples (3 dans `schema.ts`, 3 dans
  `ultimabase.ts` du projet `exist`), imports séparés du même package
  (`full/src/ultimabase.ts` : `@ultimabase/core` et
  `@ultimabase/password-auth-plugin` importés deux fois chacun).
- `typegenPlugin()` dans le graphe d'exécution **et** script de génération :
  double génération, et le serveur déployé écrit un fichier à chaque
  démarrage (échec `EACCES` sur système en lecture seule, voir fiche
  Typegen).
- `typecheck` exige `.env` (mode base existante : `node: .env: not found`
  tant que le développeur n'a pas copié `.env.example`).
- `schemaPolicy: 'override'` écrit dans le code, pas dépendant de
  l'environnement : le même fichier part en production.
- `NODE_ENV` interprété deux fois sous deux formes quand un explorateur est
  choisi.
- Aucun test généré (ni script `test`, ni exemple), alors que
  `@ultimabase/testing` existe.

## 5. Dépendances à Typegen

Le projet TypeScript dépend de Typegen pour `typecheck` et `build` (scripts)
et l'installe dans le runtime. Le projet JavaScript n'en dépend pas.

## 6. Propositions

1. **Preset HTTP** et défauts de plugins sûrs (voir fiches http, rest,
   graphql, server-hono, postgres) pour que le gabarit rétrécisse :
   - Avant (`notes`, 57 lignes dans `schema.ts` + `ultimabase.ts`).
   - Après (cible) :
     ```ts
     export const App = UltimaBase.use(
     	...httpApi({ rest: true, graphql: true }),
     ).use(postgresPlugin())
     export const Task = App.Schema.define({
     	className: 'Task',
     	fields: (f) => ({
     		title: f.string({ required: true }),
     		done: f.boolean({ default: false }),
     	}),
     })
     export const ultimabase = new App({ schemas: [Task] })
     ```
2. **Script `dev`** (`node --watch --env-file=.env src/main.ts` avec
   suppression de types de Node 24, sans build) et **seed idempotent** (créer
   la tâche seulement si la table est vide).
3. **Pas de Typegen dans le runtime** ; génération par script/commande
   seulement (ou suppression si le plan aboutit).
4. **Défaut `--yes` avec API REST** (ou question « Expose an HTTP API? »
   cochée) : un nouveau venu veut voir une requête HTTP répondre.
5. **Gabarit sans en-tête d'application** quand la proposition HTTP n° 1 est
   adoptée ; `curl …/api/v1/classes/Task` doit marcher tel quel.
6. **Écritures guidées** : starter avec Access (`create: true` pour les
   sessions, lecture publique) plutôt qu'écritures coupées, pour montrer la
   voie sûre au lieu d'un 404.
7. **Retirer `PostgreSQL Vector` du catalogue** tant qu'il ne persiste pas.
8. **Générer un test** (`tests/task.test.ts`) basé sur la fixture proposée
   dans la fiche testing, et un script `test`.
9. **Nettoyer les gabarits** (imports regroupés, lignes vides) : vérifiable
   en lançant Prettier/ESLint sur les projets générés dans les tests de
   `create-app`.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Sans génération        | Non conforme en TS (Typegen avant `typecheck`/`build` et au démarrage).            |
| Colocalisation         | Moyenne : exposition dans le schéma, opérations listées deux fois.                 |
| Concision              | Faible : 57 lignes de configuration pour un schéma à deux champs (REST + GraphQL). |
| Une forme par concept  | Faible : deux flux Typegen, `NODE_ENV` sous deux formes.                           |
| Révélation progressive | Moyenne : défauts locaux sûrs, mais 401/404 dès les premières requêtes.            |
| Erreurs                | Faible pour le premier contact (401 « credentials », 404 sans indice).             |
| Hovers                 | Non mesuré.                                                                        |
| Performance TypeScript | 1,4 s génération + 1,6 s `tsc` pour 1 schéma.                                      |
| JavaScript             | Conforme (variante JS sans Typegen).                                               |
| Coût de migration      | Moyen : gabarits à réécrire à chaque changement d'API ; tests de `create-app`.     |
