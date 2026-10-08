# Fiche : `@ultimabase/postgres-plugin`

Sources : `packages/postgres-plugin/README.md` (855 lignes),
`src/plugin/postgres-plugin.ts`, `src/options.ts`,
`src/synchronization/{planner,sql-renderer}.ts`. Sondes :
`node_modules/.cache/inventory-transport/probe/{evolve,evolve2,app}.ts`
contre PostgreSQL 17 (conteneur Docker temporaire, supprimé).

## 1. Rôle et installation

Adaptateur de base de données officiel (Drizzle interne, pilote `pg`) :
compilation des schémas, requêtes, CRUD, transactions, introspection,
synchronisation directe du schéma physique, index, contraintes, stockage
privé des plugins. Aucun type Drizzle exporté, aucun SQL brut public.

| Option         | Défaut           | Remarque                                                                                                  |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `url`          | — (ou `pool`)    | Union exclusive `url` / `pool`. Pool créé depuis `url` : possédé et fermé par l'application.              |
| `pool`         | —                | Pool `pg` fourni : reste au développeur (à fermer après `dispose()`).                                     |
| `schemaPolicy` | **`'override'`** | `override` applique les changements au démarrage ; `fail` refuse toute dérive ; `ignore` n'inspecte rien. |

Aucune option de pool (taille, délai, SSL) en mode `url` : il faut passer au
mode `pool` et installer `pg` soi-même. Pas de lecture de `DATABASE_URL` par
défaut : chaque projet écrit `if (databaseUrl === undefined) throw …`.

Options de schéma/champ fournies par le plugin (typées sans Typegen) :
`postgres: { table: 'ContentItems-v2' }` sur le schéma,
`postgres: { renamedFrom: 'headline' }` sur un champ stocké.

**Défaut dangereux** : `override` est le défaut (`postgres-plugin.ts`
l. 150), alors que `create-app` et le README le présentent comme réservé aux
bases jetables. En production sans migrations, chaque démarrage applique
silencieusement des `ALTER TABLE` sur la base réelle.

## 2. Ce qu'il apporte

- Noms de tables : `className` → pluriel `snake_case` (`BlogPost` →
  `blog_posts`) ; colonnes au nom du champ (`createdAt` en camelCase
  quoté). `field.int()` → `bigint`.
- Synchronisation `override` : crée tables, colonnes, index, clés ; change
  type (`ALTER … TYPE x USING col::x`), nullabilité, défaut, identité. Ne
  supprime **jamais** une colonne ni une table (pas d'historique pour prouver
  la propriété). Aucun journal des changements appliqués.
- Pas de migrations (ADR-0266) ; `renamedFrom` est le seul outil de
  transition.

## 3. API pour le développeur

```ts
const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
const Article = Application.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ postgres: { renamedFrom: 'headline' } }),
	}),
})
```

Que se passe-t-il en production sans migrations ? Scénario rejoué
(`probe/evolve.ts`, une ligne de données, politique `override` sauf mention) :

| Étape                                                         | Résultat mesuré                                                                                                                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 `title` requis, `views: float`                             | table créée, une ligne insérée                                                                                                                                                                                  |
| v2 renommer `title`→`headline` **sans** `renamedFrom`, `fail` | `PostgreSQL schema differs…` ; le détail (`internalDetails.changes`) liste les changements, pas le message                                                                                                      |
| idem, `override`, `headline` requis                           | `PostgreSQL direct schema synchronization failed.` sans table ni colonne (seul `driverCode` en détail interne)                                                                                                  |
| idem, `headline` facultatif                                   | **démarre** : nouvelle colonne vide, l'ancienne `title NOT NULL` reste ; **toute insertion échoue** ensuite (« PostgreSQL rejected an operation value or constraint »). Les données de `title` sont invisibles. |
| v3 `views`→`hits` **avec** `renamedFrom`                      | colonne renommée, données conservées (bon)                                                                                                                                                                      |
| v4 `renamedFrom` laissé en place                              | sans effet (sans risque, mais le code garde une trace à nettoyer un jour)                                                                                                                                       |
| v5 `hits: float` → `string`                                   | **converti silencieusement** (`1.5` → `'1.5'`)                                                                                                                                                                  |
| v6 `hits: string` → `int`                                     | échec générique ; l'application ne démarre plus tant que le schéma n'est pas corrigé à la main                                                                                                                  |

Conclusions : un renommage oublié corrompt l'usage (insertions bloquées) sans
erreur au démarrage ; `fail` donne un détail utile mais seulement dans
`internalDetails` ; `fail` ne signale pas les colonnes orphelines `NOT NULL`
qui cassent les écritures.

## 4. Frictions mesurées

- Démarrage minimal : 1 import, 1 ligne, plus 2 lignes de lecture de
  `DATABASE_URL`.
- `schemaPolicy` présent explicitement dans tous les exemples et projets
  générés (« override ») : le défaut n'est jamais laissé tel quel, signe qu'il
  n'est pas le bon.
- Messages d'échec de synchronisation sans table/colonne/ordre SQL.
- Champ inconnu (`field.number()`) : `Schema Article fields declaration could
not be resolved` (erreur Core, sans nom de méthode ; signalée ici car
  rencontrée en sonde).
- Rapport de privilèges imprimé à chaque démarrage, objets imbriqués affichés
  `[Object]`.

## 5. Dépendances à Typegen

Options `postgres.table` et `postgres.renamedFrom` typées depuis la fabrique
configurée ; elles déclarent aussi des références Typegen
(`PostgresSchemaOption`, `PostgresFieldOption`) importées par le fichier
généré. Aucune dépendance bloquante.

## 6. Propositions

1. **Défaut sûr** : `schemaPolicy` par défaut `'fail'` quand
   `NODE_ENV === 'production'`, `'override'` sinon (lu dans la fabrique), ou
   `'fail'` partout avec `override` explicite. Le message de `fail` doit
   contenir la liste lisible des changements.
   - Avant : `postgresPlugin({ schemaPolicy: 'override', url: databaseUrl })`
   - Après : `postgresPlugin()` (URL depuis `DATABASE_URL`, politique selon l'environnement)
2. **`url` par défaut depuis `DATABASE_URL`** avec erreur claire à `start()`
   si absente (pas à l'import, pour que Typegen et les outils chargent le
   module sans base).
3. **Journal des changements appliqués** en `override` (une ligne par
   `ALTER`) et message d'échec avec table, colonne, changement, code SQLSTATE.
4. **Détecter les colonnes orphelines bloquantes** : une colonne non gérée
   `NOT NULL` sans défaut dans une table gérée rend les insertions
   impossibles ; `override` doit refuser (ou proposer `renamedFrom`) au lieu
   de démarrer.
5. **Refuser les conversions de type avec perte** en `override` (`float` →
   `int`, `string` → `int`) sauf option explicite par champ.
6. **Options de pool** en mode `url` (`max`, `ssl`, `statementTimeout`) pour
   éviter de devoir installer `pg`.
7. **Migrations** : volet parallèle du plan ; `renamedFrom` devrait devenir
   une étape de migration plutôt qu'une option de champ permanente.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Sans génération        | Conforme pour les options.                                                          |
| Colocalisation         | Bonne : `table` et `renamedFrom` dans le schéma ; mais `renamedFrom` y reste à vie. |
| Concision              | Bonne (1 ligne) hors gestion de l'URL.                                              |
| Une forme par concept  | Correcte (union `url`/`pool`).                                                      |
| Révélation progressive | Faible : défaut `override` dangereux, explicité partout.                            |
| Erreurs                | Faible : échecs de synchronisation sans détail ; casse silencieuse des insertions.  |
| Hovers                 | Non mesuré.                                                                         |
| Performance TypeScript | Options petites ; non mesuré isolément.                                             |
| JavaScript             | Conforme.                                                                           |
| Coût de migration      | Faible pour les défauts ; élevé pour les migrations (nouveau volet).                |
