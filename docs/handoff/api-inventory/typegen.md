# Fiche : `@ultimabase/typegen`

Sources : `packages/typegen/README.md`, `src/plugin.ts`, `src/loader.ts`,
`examples/minimal/src/{generate-types,check-generated-types,schema}.ts`,
`examples/todo-backend/src/create-application.ts`, projet `create-app`
`gen/notes`. Sondes : `gen/notes` (avec et sans fichier généré),
`probe/typegenro.ts` (système de fichiers en lecture seule).

## 1. Rôle et installation

Produit **un fichier de déclarations** `.ultimabase/schema.generated.d.ts`
qui augmente `@ultimabase/core` avec le graphe nommé des schémas
d'application. Ne génère aucun client ni code exécutable. Le plan veut le
retirer « si possible ».

Deux formes d'installation :

| Forme                                            | Usage                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typegenPlugin({ applicationId?, outputPath? })` | Plugin du graphe ; écrit le fichier **à chaque `start()`**, avant toute connexion. Défauts `'main'` et `.ultimabase/schema.generated.d.ts` (relatif au répertoire courant). Revendique `environment:filesystem`. |
| API bas niveau                                   | `loadTypegenApplication({ sourcePath, exportName })` (transpile la source), `generateApplicationTypes`, `writeGeneratedTypeFile(s)`.                                                                             |

Pas de CLI, pas de mode `--check`, pas de mode surveillance (« deferred »).

Trois flux différents coexistent dans le dépôt :

1. `examples/todo-backend` : `typegenPlugin` dans le graphe, génération au
   démarrage du serveur ;
2. `examples/minimal/src/generate-types.ts` (31 lignes) : construit
   l'application avec une **fausse URL de base et une fausse clé Master**
   (`'postgres://typegen.invalid/…'`, `'typegen-static-key'`) puis génère ;
   plus `check-generated-types.ts` (113 lignes) ;
3. `create-app` : `typegenPlugin()` **et** `scripts/generate-types.mjs`
   (chargeur), lancé avant `typecheck` et `build` via `node --env-file=.env`.

## 2. Ce qu'il apporte

Ce qui dépend encore de Typegen (README, section « Plugin-owned
contracts ») :

- la correspondance nom littéral de schéma → contrat exact, nécessaire aux
  relations circulaires et entre fichiers (cibles en chaîne) ;
- les options `access` et `hooks` de niveau schéma (callbacks qui voient le
  schéma complet) et les callbacks ACL `default`/`resolveInput` ;
- le `WhereInput` complet de chaque schéma (ADR-0281, jalon 63) ;
- des types nommés importables (`TodoNestedCreateInput`, `TodoWhereInput`…),
  utilisés directement par le code d'application
  (`examples/todo-backend/src/todos.ts`, `admin.ts`) ;
- des messages d'erreur lisibles : mesuré sur `gen/notes`, avec le fichier
  l'erreur cite `TaskWhereInput` ; sans fichier, la même erreur cite
  `SourceSchemaTypeInfo<"Task", Readonly<{ readonly title:
NonDefaultedStringField<true, false, false>; … }>` (tronqué à 220
  caractères par ligne).

Ce qui n'en dépend plus : options de plugins locales (`rest`, `graphql`,
`postgres`), méthodes de champs (`field.vector`), Access/Hooks de champ,
Validation. Sur un schéma unique sans relation (`gen/notes`), les 4 erreurs
de type attendues apparaissent **avec et sans** fichier généré.

Taille : 189 lignes pour 1 schéma (`gen/notes`), 1 031 lignes / 40 Ko pour 5
schémas (`examples/minimal`), 1 535 lignes / 60 Ko pour 3 schémas avec
Access/ACL/Hooks (`examples/todo-backend`). Les fichiers des exemples sont
versionnés ; ceux de `create-app` sont ignorés (`.gitignore`).

## 3. API pour le développeur (flux et douleurs)

- **Quand le fichier est-il à jour ?** Après un démarrage du serveur (plugin)
  ou un `npm run typecheck`/`build` (script). Entre deux, l'éditeur voit
  l'ancien graphe ; un schéma nouveau retombe sur le « contrat d'amorçage »
  (README). Décalage types/réalité = le problème que le plan veut supprimer.
- **Le chargement exécute le module d'application.** Mesuré :
  `generate-types.mjs` sans `DATABASE_URL` → `TypeError: DATABASE_URL is
required` (levée par `src/ultimabase.ts` à l'import). D'où `node
--env-file=.env` dans les scripts et les fausses valeurs de
  `examples/minimal`.
- **Le plugin tourne en production.** `create-app` place `typegenPlugin()`
  dans la chaîne de schémas, donc dans le serveur déployé. Mesuré
  (`probe/typegenro.ts`) : répertoire de sortie en lecture seule →
  `start()` échoue avec `EACCES: permission denied, open
'…/.schema.generated.d.ts.<uuid>.tmp'`. Un conteneur à système de fichiers
  en lecture seule ne démarre pas.
- **Augmentation par import vide** : `examples/minimal/src/schema.ts` l. 17
  `import type {} from '../.ultimabase/schema.generated.js'`, ou `include`
  du `tsconfig.json` (`create-app`).
- **Double génération** dans `create-app` (plugin + script) avec deux
  `applicationId` à garder synchronisés (`'main'` écrit deux fois).
- **Messages d'erreur à l'exécution du chargeur** : le rapport de privilèges
  s'imprime pendant la génération (objets `[Object]`).

## 4. Frictions mesurées

| Mesure                                              | Résultat                                          |
| --------------------------------------------------- | ------------------------------------------------- |
| Génération `gen/notes` (1 schéma)                   | 1,4 s (chargement + écriture)                     |
| `tsc` du projet généré                              | 1,6 s                                             |
| Génération sans `DATABASE_URL`                      | échec à l'import                                  |
| `start()` avec sortie en lecture seule              | échec `EACCES`                                    |
| Erreur de type sans fichier                         | exacte mais illisible (types internes développés) |
| Lignes de plomberie Typegen dans `examples/minimal` | 31 + 113 + 1 import vide                          |

Mesures de performance de référence (plan) : 10 schémas 3,57 s / 2,01 s ;
50 schémas 8,08 s / 6,74 s / 1,53 Gio. Non remesurées ici (hors périmètre
de cette fiche ; sondes `packages/typegen/tests/performance`).

## 5. Dépendances à Typegen

Voir section 2 : les deux problèmes du plan (références circulaires entre
schémas ; options qui exigent le schéma complet : `access`, `hooks`, `acl`)
sont exactement ce qui reste dans Typegen, plus `WhereInput` et la lisibilité
des erreurs.

## 6. Propositions

1. **Objectif du plan** : supprimer le besoin (phases 3-5). Tant que Typegen
   existe :
2. **Sortir le plugin du runtime** : génération uniquement par commande
   (`ultimabase types` / script) ou plugin actif seulement hors production
   (`NODE_ENV`), jamais dans le serveur déployé.
   - Avant : `UltimaBase.use(typegenPlugin())…` dans `schema.ts` + script.
   - Après : aucun code ; `npx ultimabase types --watch` en développement.
3. **Charger sans exécuter l'infrastructure** : imposer (ou documenter) que
   le module d'application lise l'environnement à `start()` (proposition
   postgres n° 2) ; le chargeur n'a alors besoin d'aucune variable.
4. **Un seul flux** dans le dépôt, les exemples et `create-app` ; supprimer
   les fausses URL et clés de `examples/minimal`.
5. **Noms de types stables sans fichier** : exporter des utilitaires
   `InferWhere<typeof Todo>`, `InferCreate<typeof Todo>` depuis Core, pour que
   le code d'application n'importe plus `../.ultimabase/schema.generated.js`.
6. **Hovers et erreurs lisibles sans génération** : interfaces nommées
   (`interface TaskWhere extends …`) produites par l'inférence, sujet du
   laboratoire de typage (phase 3).

## 7. Note sur la grille

| Critère                | Note actuelle                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Sans génération        | Non conforme par nature ; requis pour relations nommées, Access/Hooks schéma, ACL, `WhereInput`. |
| Colocalisation         | Les types utiles vivent dans un fichier généré séparé.                                           |
| Concision              | Faible : script, import vide, `include`, plugin, fausses variables.                              |
| Une forme par concept  | Faible : trois flux de génération dans le dépôt.                                                 |
| Révélation progressive | Moyenne : invisible dans un starter, mais impose `--env-file`.                                   |
| Erreurs                | Bonne lisibilité avec fichier ; fichier absent ou périmé = décalage silencieux.                  |
| Hovers                 | Meilleurs avec fichier (types nommés) ; non mesuré en caractères.                                |
| Performance TypeScript | Référence du plan (3,57 s / 8,08 s à 10 / 50 schémas).                                           |
| JavaScript             | Conforme : JS n'utilise pas Typegen.                                                             |
| Coût de migration      | Élevé : Core (augmentation), access, hooks, acl, exemples, create-app, site, tests de types.     |
