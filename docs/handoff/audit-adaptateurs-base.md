# Audit : préparer d'autres adaptateurs de base (MongoDB d'abord)

Audit en lecture seule (2026-10-09) de `ub-small`, `main` 116cf14e : rien
modifié, construit ni testé. Chemins relatifs à `ub-small`. Lus : AGENTS.md,
`docs/current-architecture.md`, ADR-0007, 0063, 0103, 0124, 0136, 0137, 0200,
0212, 0266, 0278, 0289, README de Core, PostgreSQL, testing, pg-vector, les
revues `docs/handoff/revue-plugins/*.md` et `api-ideale-decisions.md`.
Sévérités : **B** bloquant pour MongoDB ; **S** significatif (faisable avec un
contrat ou des tests à fixer) ; **m** mineur.

## Verdict

Le code est **propre** : aucune mention de PostgreSQL, Drizzle ou SQL dans
`packages/core/src` ni `plugin-kit` hors deux commentaires
(`query/filters/primitive.ts:25`, `access/subject/contracts.ts:314`) ; les
plugins officiels ne parlent qu'aux contrats neutres de Core. Mais le
**contrat sémantique** reste celui de PostgreSQL : intégrité référentielle
confiée aux clés étrangères, opérateurs publics propres à PostgreSQL, erreurs,
`NULL` et verrous spécifiés seulement dans l'adaptateur, aucune suite de
conformité d'adaptateur. MongoDB est faisable **sans toucher aux plugins**,
pas sans fixer d'abord quelques contrats de Core.

## 1. Intégrité référentielle

- **B.** `onDelete` (`restrict` par défaut, `cascade`, `setNull`) est déclaré
  par Core (`core/src/schema/fields/builtins/pointer.ts:34,219-226`) mais
  appliqué **seulement par les clés étrangères** PostgreSQL
  (`postgres-plugin/src/schema/schema-compiler.ts:73-80`,
  `synchronization/sql-renderer.ts:65-67` ; `core/README.md:889-895` le dit).
  Idem pour les références privées (`core/src/private-storage/adapter.ts:14-19`
  → `postgres-plugin/src/private-storage/compiler.ts:30-31,85`) : la
  suppression d'un utilisateur efface sessions et identifiants par `CASCADE`
  (`password-auth-plugin/src/sessions.ts:104`, `credentials.ts:90`).
- Déjà vrai aujourd'hui : une cascade est **physique** (ni Hooks, ni Access,
  ni ACL, ni Soft Delete sur les enfants) et un pointeur brut vers une ligne
  absente n'est arrêté que par la clé étrangère (faille 2 de la revue Access).
- MongoDB : l'adaptateur peut émuler (il reçoit `schemas.schemaTargets`) :
  comptage pour `restrict`, `deleteMany`/`updateMany` pour `cascade`/`setNull`
  dans la transaction. Mais en isolation snapshot, insérer un enfant pendant
  la suppression du parent ne crée aucun conflit : il faut écrire sur le
  parent, sinon pointeurs orphelins.
- **Reco.** Écrire le contrat dans Core (cascade physique, code d'erreur de
  `restrict`, garantie en concurrence), le laisser à l'adaptateur, le tester.
  Appliquer la vérification de `connect` (formes, décision 11) à toute liaison.
- Appartenance : delta logique `connect/disconnect/set/clear`
  (`core/src/runtime/nested-writes/relation-membership.ts`), table de jointure
  dans PostgreSQL (`postgres-plugin/README.md:569-576`). **m** : en MongoDB,
  collection de jointure à index unique `(source, target)`, pas un tableau
  dans le document (16 Mo, appartenances non bornées).

## 2. Inclusions, prédicats de relation, écritures imbriquées

- **S.** Écritures imbriquées **orchestrées par Core** (`runtime/nested-writes/`),
  neutres. Inclusions, `some/none/every`, `relation-count` : Core prépare un
  plan par cible avec ses politiques (`runtime/database/contracts.ts:176-189`)
  mais l'**exécution est déléguée** (jointures Drizzle RQB v2, ADR-0137), sans
  repli (`pipeline/mutation-inclusion-source.ts:29-45`). MongoDB : `$lookup`
  ou `$in` groupés ; tester la cible visible (cachée → `null`/`[]`).

## 3. Transactions, verrous, après commit

- Transactions **obligatoires** (`beginTransaction`, `contracts.ts:402-420`),
  sans savepoint, imbrication refusée (`transactions/run-transaction.ts:35`).
  MongoDB exige un replica set : **garder**, refuser de démarrer sur un
  serveur autonome avec la marche à suivre.
- « Original verrouillé » : `prepare()` stabilise la cible par
  `SELECT … FOR UPDATE` (`postgres-plugin/src/drizzle/operation-executor.ts:205-238`),
  l'upsert par `ON CONFLICT DO NOTHING` puis reverrouillage (`:288-326`).
  MongoDB n'a pas de verrou en lecture : stabilité optimiste par conflit
  d'écriture, donc **abandons fréquents sous contention**.
- **B.** Core ne **réessaie jamais** : `retryable` n'est qu'un indicateur
  (`core/src/errors/framework-error.ts:19-24`), une seule validation
  (`run-transaction.ts:81-127`). Chaque `TransientTransactionError` MongoDB
  deviendrait une erreur client. **Reco** : ADR de nouvelle tentative bornée
  des transactions automatiques sur erreur `retryable` (effets différés déjà
  après commit), règle d'idempotence des hooks ; utile aussi à PostgreSQL
  (40001/40P01). Livraison après commit : file de Core, neutre.
- **m.** Opérations concurrentes dans une transaction
  (`runtime/virtual-fields/execution.ts:57`) : `pg` sérialise, une session
  MongoDB non ; l'adaptateur sérialise. Isolation minimale à documenter.

## 4. Filtres et opérateurs

- Les opérateurs intégrés sont fixés par Core par famille de champ, **sans
  capacité d'adaptateur** (`query/filters/primitive.ts:36-48`). Relations,
  inclusions et `contains` de plugin sont vérifiés **à l'exécution**
  (`INTERNAL_ERROR`, `pipeline/database-capability-validation.ts:90-112`) ;
  seuls pointeurs et plans le sont au démarrage
  (`application/create-framework-engine.ts:157-188`).
- **B.** `jsonPathExists`/`jsonPathMatches` (`primitive.ts:30-33`,
  `where-builder.ts:389-407`) sont le SQL/JSON path de PostgreSQL
  (`postgres-plugin/src/query/filter-compiler.ts:353-362`), exposés par REST,
  GraphQL et Typegen ; ADR-0136 les définit sur « la représentation JSONB
  encodée ». `containedBy` (`<@`) n'a pas d'équivalent MongoDB indexable.
  **Reco** : retirer JSONPath (ADR-0288 ; REST/GraphQL ne font que relayer)
  ou le gater par une capacité vérifiée au démarrage ; trancher `containedBy`.
- **S.** `regex` sans dialecte défini : ARE en PostgreSQL
  (`filter-compiler.ts:365-383`), PCRE en MongoDB. Sous-ensemble portable ou
  dialecte documenté comme propre à l'adaptateur.
- **S.** `NULLS LAST` dans les deux sens (`query/clause-compiler.ts:58-62`)
  choisi par l'adaptateur, absent du contrat (MongoDB met `null` en tête en
  ordre croissant) ; collation des chaînes non spécifiée.
- **S.** Égalité sur liste ou JSON tableau : MongoDB fait une correspondance
  implicite d'élément (`{ tags: 'x' }` vaut `['x','y']`). Test.
- `contains` structurel (ACL) : traduisible (`$elemMatch`/`$all`), à
  spécifier sans renvoi à JSONB. Aucun opérateur contribué par plugin
  n'existe (ADR-0212 ; ADR-0289 a retiré les compilateurs de contraintes).

## 5. Préparation du schéma et stockage privé

- **m.** Hook générique `prepareSchema` (`core/src/plugins/plugin-contributions.ts:310`) ;
  `schemaPolicy` est une option PostgreSQL (`postgres-plugin/src/plugin/postgres-plugin.ts:37-44`).
  Transposable : collections, index, validateurs `$jsonSchema` facultatifs.
- **S.** Champ requis ajouté à une collection non vide : PostgreSQL fait
  `ADD COLUMN … DEFAULT` ou refuse (revues ACL 12, PostgreSQL 1) ; MongoDB
  garderait des documents sans le champ, indécodables. La valeur doit voyager
  par une métadonnée **neutre** du champ (défaut statique, futur
  `existingRows`), jamais par une lecture de l'option ACL dans l'adaptateur ;
  MongoDB la pose par `updateMany({ f: { $exists: false } })`.
- Stockage privé (`private-storage/adapter.ts:33-65`, ADR-0278) : cinq
  opérations sur index unique, neutres sauf références (point 1).

## 6. Identifiants et valeurs

- UUIDv7, horodatages et `autoNow` générés **par Core**
  (`runtime/validation/runtime-field-validation.ts:182-207`) : portables.
- **S.** `autoIncrement` (`schema/fields/builtins/int.ts:29-33`) attend une
  séquence ; MongoDB → compteur `$inc`, point chaud. Refus ou documentation.
- **S.** `decimal` sans borne (`decimal.ts:22-35`) → `numeric` ; `Decimal128`
  = 34 chiffres. MongoDB refuse au démarrage précision absente ou > 34
  (mécanisme existant, `postgres-plugin/src/schema/field-compiler.ts:362-366`).
- **m.** bigint, binary, dateTime, listes, objets natifs ; `time` avec fuseau
  sans équivalent ; clés JSON avec `.` ou `$` non interrogeables par chemin.

## 7. Unicité et index

- Index déclarés par Core, neutres (`schema/schema/indexes.ts:41-66`) ; GIN
  pour JSON (ADR-0124) → index joker `acl.$**` en MongoDB (**m**).
- **S.** Plusieurs `NULL` acceptés par un unique PostgreSQL, un seul par
  MongoDB, et Core écrit un `null` canonique : pointeur `indexed: 'unique'`
  facultatif, e-mail facultatif → index partiel `$type` obligatoire. Test.
- **S.** Violation d'unicité : PostgreSQL mappe la classe 23 en
  `VALIDATION_ERROR` (`postgres-plugin/src/drizzle/operation-error.ts:34-48`)
  et Password Auth **en dépend** pour l'inscription en double
  (`password-auth-plugin/src/operation-handlers.ts:136-137`) ; la revue
  Validation confie l'unicité aux index. Contrat implicite à écrire dans Core.
- Insensible à la casse : normalisation JavaScript avant stockage (rôles
  `role-reference.ts:61-66`, identifiants `normalization.ts:12-36`) :
  **portable**, à garder pour l'e-mail ; jamais `citext` ni collation.

## 8. Plugins à comportement de stockage

| Plugin              | Mécanisme                                                                   | Verdict                                    |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| ACL                 | codec JSON, `structuralContains`, `indexed` (`acl-option.ts:89-113`)        | neutre ; README parle de JSONB (l. 26)     |
| Soft Delete         | réécriture delete → update (ADR-0200), filtre protégé                       | neutre                                     |
| Password Auth       | collections privées, compare-and-swap, `CASCADE`                            | neutre sauf points 1 et 7                  |
| Roles               | parcours en largeur JS sur `findMany` + `some` (`role-membership.ts:26-55`) | neutre (N requêtes)                        |
| Access, Hooks, etc. | contrats Core uniquement                                                    | neutres ; REST/GraphQL exposent JSONPath   |
| pg-vector           | champ et codec GraphQL, **aucune persistance** (`README.md:62-66`)          | à scinder : plugin neutre + par adaptateur |

pg-vector : `vector-plugin` neutre (champ, similarité logique) et une
implémentation par adaptateur (pgvector ; `$vectorSearch` MongoDB, première
étape obligatoire du pipeline, pré-filtre limité aux champs indexés, donc
conflit avec les filtres protégés). Exige un ADR de point d'extension
d'adaptateur rouvrant ADR-0289 avec ce consommateur réel. Peut attendre.

## 9. Tests : aucune conformité d'adaptateur

- **B** pour certifier MongoDB. `@ultimabase/testing` ne couvre que la
  conformité de plugin et l'isolation PostgreSQL (`packages/testing/README.md:41-198`) ;
  le comportement est prouvé par 11 `tests/e2e/*.postgres.e2e.test.ts` et
  `packages/postgres-plugin/tests/` ; `tests/fixtures/official-conformance-database.ts`
  n'est qu'un faux adaptateur logique. À créer : une suite paramétrée par une fabrique d'adaptateur, extraite des
  e2e PostgreSQL (PostgreSQL + MongoDB = deux usages, règle d'AGENTS.md) :
  aller-retour de chaque famille de champ ; opérateur × famille ; tri et
  `null` ; pagination ; relations, prédicats, inclusions avec cibles cachées ;
  écritures imbriquées et annulation ; `onDelete` en concurrence ; unicité
  (`NULL`, code d'erreur) ; upsert concurrent ; `prepare` et `item` sous
  contention ; annulation et après commit ; stockage privé ; réécriture Soft
  Delete ; codec et `contains` ACL ; préparation `override/fail/ignore`.

## 10. Décisions du 2026-10-09

| Décision                                              | Où                         | Verdict                                                        |
| ----------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `snake_case` (postgres 6)                             | nommage PostgreSQL         | reste dans l'adaptateur ; README l. 505 à corriger             |
| Index partiels `where` (postgres 5, soft-delete 7)    | prévus **dans PostgreSQL** | **fuite inverse** : besoin portable dans l'API d'un adaptateur |
| `ADD COLUMN … DEFAULT`, `existingRows` (acl 12)       | synchronisation PostgreSQL | reste, si la valeur passe par une métadonnée neutre            |
| « Sémantique RETURNING » (access, faille 1)           | Core                       | neutre si `exists` + filtre `read` dans la transaction         |
| `connect` vérifie toute cible (formes 11)             | Core                       | aide MongoDB                                                   |
| `ping()` pour `/health` (postgres 10)                 | export PostgreSQL          | **risque** : capacité neutre de santé pour les transports      |
| `renamedFrom`, `table` sous `postgres:` (postgres 7)  | options PostgreSQL         | dupliqués par adaptateur ; acceptable avant les migrations     |
| `schemaPolicy`, `DATABASE_URL`, `connection`, `debug` | options PostgreSQL         | restent ; mêmes noms dans MongoDB                              |

Index partiels : dans `indexes` de Core (aujourd'hui deux champs minimum,
`indexes.ts:41-50`), `where` restreint au sous-ensemble portable (égalité,
comparaisons, `null`, `and` ; `partialFilterExpression` refuse `not`/`ne`),
capacité `partialIndexes` vérifiée au démarrage.

## Changements de contrat AVANT la migration de Core

1. **Intégrité référentielle** : sémantique de `onDelete` et des références
   privées (physique, codes, concurrence) confiée à l'adaptateur ; `connect`
   pour toute liaison (ADR).
2. **Nouvelle tentative des transactions automatiques** sur `retryable` et
   idempotence des hooks (ADR).
3. **Opérateurs** : retirer ou rendre optionnels JSONPath et `containedBy` ;
   capacité vérifiée au démarrage, erreur publique (ADR-0288).
4. **Taxonomie d'erreurs d'adaptateur** (unicité, référence, valeur, conflit).
5. **Index partiels dans Core**, avant que Soft Delete documente l'option
   PostgreSQL.
6. **Remplissage des champs ajoutés** par métadonnée neutre.
7. **Sémantiques écrites** : `NULL` unique, tri des `null`, `regex`, égalité
   de tableaux, isolation minimale, précision `decimal`.

**Peut attendre** : suite de conformité d'adaptateur (début du chantier
MongoDB ; d'ici là, tester ces contrats côté PostgreSQL), repli Core des
inclusions, kit d'auteur d'adaptateur, scission de pg-vector, capacité de
santé (avec `/health`), `renamedFrom` neutre, options de connexion communes.
