# Migration de Core, étape 3a : filtres, mises à jour, lectures requises et liens (ADR-0307, ADR-0308)

Branche `migration/query-write-api` (worktree `../ub-step3`), basée sur
`main` local 6402dd95 (étape 2). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md`
(ADR-0067, 0134, 0152 et 0243 annotés ; ADR-0182 passé en « superseded » et
déplacé dans les remplacés) :

- ADR-0307 : raccourci d'égalité dans tout `where` (GraphQL garde `{ eq }`),
  `{ increment }` / `{ decrement }` en objets et retrait des fabriques,
  `findOneOrThrow` à la place de `get`, cible des mutations singulières par
  `where` seulement.
- ADR-0308 : vocabulaire de liens unique (`connect` / `create` / `update` /
  `null` pour les pointeurs ; `connect` / `disconnect` / `create` /
  `update` / `set` pour les relations ; `{ set: [] }` remplace
  `{ clear: true }`), `Pointer` brut ou identifiant refusé dans `data`,
  visibilité de chaque cible `connect` / `set` / `disconnect`, Roles, REST
  et GraphQL par les mêmes commandes.

Hors périmètre : ADR-0309 et ADR-0310 (étape 3b : pagination, données
simples, retrait des modèles et des poignées de relation) ; refontes de
plugins non écrites dans ces ADR (étape 6). Les poignées de relation et les
modèles restent, adaptés au strict nécessaire (`findOneOrThrow` sur les
poignées, brouillons en liens `connect`).

## État

- [x] ADR copiés et inscrits
- [x] ADR-0307 mises à jour atomiques en objets (Core, REST, GraphQL)
- [x] ADR-0307 `findOneOrThrow`, cible `where` seule (Core, REST, GraphQL)
- [x] ADR-0307 raccourci d'égalité (Core, règles Access, REST)
- [x] ADR-0308 liens (Core singulier, imbriqué, collections, brouillons,
      REST, GraphQL, Roles)
- [x] Tests (unitaires, types, PostgreSQL e2e, REST, GraphQL, Roles)
- [x] Documentation (site, README, docs Core, exemples)
- [x] Porte finale (validate:full, e2e construits, audit DX, banc)

## Décisions (à confirmer par l'utilisateur)

1. **Raccourci REST d'un pointeur** : la valeur est l'UUID de la cible ; le
   pointeur JSON étiqueté (`{ type: 'pointer', … }`) est un objet, donc lu
   comme opérateurs. Pas de raccourci binaire en REST (objet étiqueté aussi).
2. **`eq` explicite d'un pointeur** : reste « identifiant seulement »
   (ADR-0160) en types et à l'exécution ; seul le raccourci accepte un
   `Pointer`. `Pointer` d'un autre schéma dans un `where` :
   `FrameworkError` `VALIDATION_ERROR` levée à la construction de la requête
   (les autres erreurs de forme du `where` restent des `TypeError`).
3. **`{ increment }` sur un champ non numérique** : valeur de remplacement
   ordinaire, refusée par la validation du champ (`VALIDATION_ERROR`) ; un
   champ `json` ou `object` peut donc stocker `{ increment: 1 }`. Deux clés
   sur un champ numérique : `TypeError` synchrone à la normalisation, comme
   les autres formes de mise à jour invalides ; le type interdit aussi deux
   clés (`decrement?: never`).
4. **Type exporté `NumericUpdateOperation<T>`** (remplace
   `IncrementUpdateValue` / `DecrementUpdateValue`) ; les données de mise à
   jour imbriquées de la forme D acceptent aussi les opérations (ADR-0307
   « nested »).
5. **`findOneOrThrow`** = lecture `find-one` puis `NOT_FOUND` (message public
   inchangé) ; aucun nœud AST `get` n'est produit par les schémas. Le genre
   AST `get` reste pour `GET /classes/X/:id` (REST), le champ GraphQL `getX`
   et `fetch()` des modèles. Export public `GetInput` retiré.
   `findOneOrThrow` remplace aussi `get` sur les poignées de relation.
6. **Alias `id`** : REST convertit l'`id` de l'URL en
   `where: { id: { eq } }` ; GraphQL `XUpdateOneInput` / `XDeleteOneInput`
   perdent `id` et exigent `where: XWhere!` (changement de SDL). Les
   mutations de plugin (`softDelete({ id })`) gardent `id` (hors décision 4).
7. **Commandes de collection** (`createMany`, `updateMany`, `upsertOne`,
   `upsertMany`, `upsert()` des brouillons) : un pointeur accepte
   `{ connect: cible }` ou `null`, jamais `create` / `update` ni relation ;
   chaque cible est vérifiée dans la transaction avant l'écriture (marqueur
   d'opération lu par le pipeline) ; les deux branches d'un upsert sont
   vérifiées. Les échecs de lien sont des rejets (`VALIDATION_ERROR`,
   `NOT_FOUND`), pas des exceptions synchrones. REST et GraphQL gardent des
   entrées de collection sans pointeur (inchangé).
8. **`NOT_FOUND` de lien** : `publicMessage` « The <Schéma> linked by
   <champ> was not found. » et `publicDetails: { field, schema }`, identiques
   pour cible cachée ou absente (`connect`, `set`, `disconnect`, singulier,
   imbriqué, collection, Master sur cible absente).
9. **Message des `VALIDATION_ERROR` d'entrée imbriquée** : « Nested-write
   input is invalid: <chemin et raison> » (au lieu d'un message générique),
   pour montrer `{ connect: id }` et nommer le champ ; le message public
   reste « The operation input is invalid. ».
10. **Brouillons de modèles** : l'entrée du constructeur suit `create`, donc
    un pointeur s'écrit `{ connect: cible }` ; le brouillon garde ce lien et
    le passe à `create()` / `upsert()` (vérifié). `Pointer` brut refusé.
11. **Types AST** : nouveaux types exportés `SchemaStoredData`,
    `SchemaStoredCreateData`, `SchemaStoredUpdateData` ; l'entrée d'un
    `create-one` / `create-many` / `upsert` et la valeur d'un `set` typent le
    `Pointer` stocké, pas le lien public.
12. **`PointerSchema` résout une cible différée** : le `Pointer` d'un
    résultat (`Pointer<DeferredSchemaTarget<…>>`) expose le schéma cible
    (`.schema`, `toJSON()`), ce qui permet `{ connect: todo.assignee }` en
    forme D. Le type d'opérande de lien est
    `string | PointerTarget<"Nom">` (structurel sur le nom de classe).
13. **Roles** : l'étape `transformResult` lit aussi les nœuds de relation
    d'une écriture imbriquée (`members`, `roles`) sur `create-one` et
    `update-one` : contrôle de cycle et événements d'appartenance /
    hiérarchie comme pour les poignées (sinon `roles: { connect }` créait un
    cycle sans erreur).
14. **GraphQL** : champs `disconnect: Boolean` (pointeur) et
    `clear: Boolean` (relation) retirés ; `null` délie.
15. **REST** : opération atomique au format `{ "increment": n }` /
    `{ "decrement": n }` (remplace `{ "type": "increment", "value": n }`).
16. **Budget d'opérations** : `{ set: [] }` n'alloue aucune action (l'ancien
    `clear` en allouait une).
17. **Exemples** : `todo-backend` lie membres et rôles inclus par
    `updateOne … connect` ; `schema-form-d` montre le raccourci ; `minimal`
    et `todo-backend` (Typegen) gardent `{ eq }`. `create-app` : rien à
    changer (aucun `get`, alias, fabrique ni lien brut dans les modèles).

## Conflits Typegen (non migré, ADR-0297)

- Les alias plats générés (`XCreateInput`, `XUpdateInput`, brouillons,
  collections, upserts) typent un pointeur en `Pointer` ; Core n'accepte plus
  que `{ connect }` ou `null` : code Typegen typé mais refusé à l'exécution.
  Noté dans le README Typegen.
- Les `where` générés n'ont pas le raccourci (Core l'accepte à
  l'exécution) ; les `connect` imbriqués générés sont typés en identifiants ;
  les mises à jour imbriquées générées n'ont pas `{ increment }` (la racine
  l'a, par `NumericUpdateInput`).
- Texte généré inchangé (`NestedPointerUpdateInput<…, nullable>` garde son
  arité) : aucune régénération nécessaire.

## Tentatives écartées

- Option « types publics distincts » (nouvelles clés `linkedCreate` dans
  l'ABI Typegen) : écartée au profit de liens dans `inputs.create` /
  `inputs.update` de la forme D, avec des types AST « stockés » dérivés.
- `PointerTarget<"Nom">` seul pour `connect` : refusait le `Pointer` d'un
  résultat (cible différée, `className: string`) ; corrigé par la résolution
  de `PointerSchema` (décision 12) plutôt qu'en ajoutant `Pointer<cible
différée>` à l'opérande (infobulle illisible).
- Erreurs de lien synchrones dans les commandes de collection : remplacées
  par des rejets (décision 7) pour se comporter comme les écritures
  imbriquées.

## Preuves

Dernier commit de code c8015d64 (dist et `*.tsbuildinfo` supprimés avant la
porte) :

- `yarn validate:full` : exit 0 en 14 min 10 ; performance 3 fichiers /
  4 tests ; couverture 674 fichiers / 3249 tests ; website 17 fichiers /
  66 tests ; lint 0 erreur (53 + 20 + 1 avertissements).
- `yarn test:e2e:built` : exit 0, 115 fichiers, 479 tests.
- Trois portes précédentes ont échoué puis ont été corrigées : formatage de
  4 fichiers, 3 `no-unsafe-assignment` dans `checked-links`, fixture Typegen
  empaquetée (`coverage-e2e`, jamais lancé en ciblé) ; deux fois le budget
  `hybrid-authoring` (voir ci-dessous).
- **Budget `hybrid-authoring` (suite sensible à la charge)** : sur la branche
  il échoue 6 fois sur 11 (`languageServiceInitializationMs` du formulaire
  hybride > 1,1 × Typegen, par 1 à 3 %), la base 0 sur 10, charge 3 à 7. Une
  mesure directe de 12 échantillons alternés donne pourtant des médianes
  égales (hybride 308,5 ms branche / 311,5 ms base ; Typegen 293,5 / 292) et
  la taille des déclarations ne change que de 1,3 Ko. Cause non établie
  (probablement le ramasse-miettes après la vérification froide du même
  processus) ; à revalider sur une machine calme.
- Audit DX contre `main` construit (6402dd95), `--only` tous les paquets,
  `tests`, `examples/minimal`, `examples/todo-backend` : 1193 différences,
  toutes rattachées :
  - fichiers de test nouveaux : `links.test-d.ts` (190),
    `where-shorthand.test-d.ts` (164) ;
  - tests et fixtures modifiés (syntaxe ADR-0307 / 0308) : Typegen
    `generator-language-service` (133), `typegen-generated-types-fixture`
    (51), `nested-writes-language-service` (38), `source-type-info.test-d`
    (102), `singular-terminals.test-d` (78), `register-runtime-bulk-tests`
    (65), `runtime-postgres-fixture` (11), `application-request-execution`
    (4), `apply.test-d` (3) ;
  - exemples modifiés : `todo-backend/src/admin.ts` (65),
    `schema-form-d/src/usage.ts` (30), `minimal/src/soft-delete.ts` (10) ;
  - ADR-0307 décision 1 : unions de raccourci dans les infobulles de `where`
    (`definition.test-d`, `field-builder.test-d`, `open-kernel-proof`,
    `plugin-surfaces`), `QueryFilterOperandSource` + `"shorthand"`, nouveaux
    alias internes `SourceEqualityShorthand`, `SourcePointerShorthand`,
    `WhereEqualityShorthand` ;
  - décision 2 : `increment` / `decrement` / `unset`,
    `IncrementUpdateValue`, `DecrementUpdateValue` et la classe privée
    retirés ; `NumericUpdateOperation` ajouté ; listes de complétion
    d'exports (`runtime-capabilities` prototype, `packages`, `public-api`) ;
  - décision 3 : `get` → `findOneOrThrow` dans les membres de `SchemaAPI`,
    `SchemaClass`, `SchemaReference`, `SchemaRef`, `DeclaredSchema`,
    `ConfiguredSchemaResult`, `Relation`, Password Auth et Roles, et dans les
    complétions de membres (exemples, Roles, Soft Delete, Typegen) ;
    `GetInput` et `ExactGeneratedGetInput` retirés ;
  - décision 4 : `id` retiré de `SchemaUpdateOneInput` / `SchemaDeleteOneInput`
    (`SchemaSingularTarget`), exemples JSDoc `{ id: postId }` ;
  - ADR-0308 : `NestedPointer*` / `NestedRelation*` (opérande de lien,
    `null`, plus de `clear` ni `disconnect: true`), `PointerLinkInput`,
    `NestedWriteRelationshipCommand` sans `clear`, `PointerSchema` résolvant
    les cibles différées, types « stockés » (`SchemaStoredData`,
    `SchemaStoredCreateData`, `SchemaStoredUpdateData`) dans les AST et
    `UpsertInput`, données de brouillon en liens.
- Banc forme D TS6 (bench.mjs de `ub-typing-spike`), même session,
  alternance base / branche, 3 exécutions, médianes, charge 3,1 à 4,5 :
  50 schémas, édition→diagnostic 2828 ms (base) / 2830 ms (+0,1 %), froid
  6103 / 6164 ms (+1,0 %) ; 200 schémas, édition 8951 / 9111 ms (+1,8 %),
  froid 22276 / 22727 ms (+2,0 %) ; infobulle identique (1267 caractères),
  mêmes diagnostics. `gen/` supprimé ensuite.

## Prochaine action vérifiable

Relecture du diff par le coordinateur ; décisions 1 à 17 et conflits Typegen
à confirmer par l'utilisateur ; budget `hybrid-authoring` à revalider sur une
machine calme ; fusion `--no-ff` dans `main`.
