# Migration de Core vers l'API décidée (démarrée le 2026-10-09)

Plan validé par l'utilisateur le 2026-10-09. Décisions : ADR-0297 et
ADR-0299 à ADR-0313 (acceptés), revues dans [revue-plugins/](revue-plugins/README.md).

## Principes

- **Coexistence** : l'ancienne forme de déclaration et la forme D vivent côte
  à côte pendant la migration des plugins ; l'ancienne forme et Typegen sont
  retirés à la fin. `main` reste vert à chaque étape.
- **Étapes courtes fusionnées dans `main`** une par une : tests, `validate:full`
  et audit DX (`tooling/dx-audit`) contre `main` avant chaque fusion ; chaque
  différence d'éditeur est annoncée par un ADR.
- **Un seul agent à la fois sur Core** (architecture centrale) ; le coordinateur
  relit chaque diff avant la fusion `--no-ff` ; l'utilisateur valide chaque
  jalon ; aucun push sans sa confirmation explicite.
- **Mesure à chaque étape** contre les objectifs d'ADR-0297 (édition à 50
  schémas ≤ 1 s sous TS 6, ≤ 0,5 s sous TS 7 ; ≤ 3 s à 200 schémas sous TS 6).

## Étapes

0. **Tranche verticale dans `main`** (branche `spike/schema-form-d`, worktree
   `../ub-slice`) : mise à jour avec `main`, mise à jour des tests qui
   vérifiaient l'ancien contrat (cibles `() => X` refusées, listes d'exports,
   infobulles), `validate:full`, audit DX expliqué, fusion.
1. Contrats d'adaptateur avec le plugin PostgreSQL (ADR-0299 à 0303).
2. Principal neutre, prédicats, `PublicError`, `can()`, sémantique
   `RETURNING` (ADR-0304 à 0306).
3. API de requête et d'écriture (ADR-0307 à 0310).
4. Cycle de vie, autorité, défauts d'environnement, diagnostics (ADR-0311 à
   0313).
5. Allègement des types de Core jusqu'aux objectifs chiffrés.
6. Puis migration plugin par plugin selon les revues, create-app, exemples,
   suppression de l'ancienne forme et de Typegen, documentation.

## État

- Étape 0 : fusionnée dans `main` local le 2026-10-09 (f631f8fe) : `validate:full` vert (3 058 tests), e2e sur paquets construits verts (418), audit DX expliqué ; deux différences acceptées et inscrites dans ADR-0297 (69 infobulles `ResolveSourceSchemaObject<…>` à corriger à l'étape 5, ordre de propriétés de l'ancienne forme). Reportés : `Register` obligatoire (étape 4), protection TS 7 des tests de typage, fabriques de plugins (amendement 3), outils de campagne autonomes, audit DX acceptant un exemple présent d'un seul côté.
- Étape 1 : fusionnée dans `main` local le 2026-10-10 (c1098e7e) : `validate:full` vert (3 151 tests), e2e sur paquets construits verts (438), audit DX relancé par le coordinateur (385 différences, toutes rattachées à ADR-0299 à 0303), banc sans régression (50 schémas : 2,81 → 2,83 s ; 200 : 8,61 → 8,63 s). Écarts acceptés et inscrits dans ADR-0301 : décision 5 reportée pour GraphQL à l'étape 6, absence de `filterOperators` = aucun opérateur, `relations` et `relationPredicates` exigés. REST 409 pour les trois nouveaux codes. À surveiller : `framework-engine.test.ts` à 698 lignes (limite 700).
- Étape 2 : fusionnée dans `main` local le 2026-10-10 (6402dd95) avec ADR-0314 (pointeurs créés par leur schéma seulement), décidé pendant la revue : `validate:full` vert (3 221 tests), e2e construits verts (464), audit DX expliqué (958 différences). Décisions de revue : `getCurrentPrincipal` retiré (aucun consommateur) ; option A pour Soft Delete (lisibilité vérifiée sur l'état d'avant, résultat = état d'après, amendement d'ADR-0306), donc le hook `after` d'une suppression réécrite voit l'état d'après ; option générique `checkReadable` des mutations de plugin. Banc relancé par le coordinateur (machine calme, médianes de 3) : édition 50 schémas 2,69 → 2,88 s (+7 %), 200 : 8,81 → 9,03 s (+2,5 %), froid inchangé ; régression acceptée par l'utilisateur, à traiter à l'étape 5. Reportés à l'étape 6 : `allowWithoutRule`, prédicats ACL, commandes renommées de Soft Delete, `deletedAt`.
- Étape 3 coupée en deux pour la relecture : 3a (ADR-0307, 0308), puis 3b (ADR-0309, 0310).
- Étape 3a : fusionnée dans `main` local le 2026-10-10 (4cd8a553) : `validate:full` vert (3 249 tests), e2e construits verts (479), audit DX expliqué (1 193 différences), banc sans régression notable (200 schémas : édition +1,8 %, froid +2 %). Le budget `hybrid-authoring` a échoué deux fois pendant la porte de l'agent ; relancé par le coordinateur 8 fois en alternance : `main` 2 échecs, branche 1 échec, donc sensibilité à la charge, pas de régression. Décisions acceptées : `{ increment }` sur `json`/`object` stocké comme valeur (comme Prisma) ; cycle de rôles vérifié aussi par `connect` ; REST `{ "increment": n }` et raccourci de pointeur par identifiant ; GraphQL `where` exigé, `disconnect`/`clear` booléens retirés ; même `NOT_FOUND` pour cible cachée ou absente. Écart temporaire jusqu'à l'étape 6 : types Typegen non migrés (pointeur brut accepté par les types mais refusé à l'exécution, pas de raccourci), noté dans le README de Typegen. Fichiers proches de 600 lignes : `runtime-pipeline.ts` 574, `normalization.ts` 553, `where-normalize.ts` 532.
- Étape 3b : fusionnée dans `main` local le 2026-10-11 (53c6ae38) : `validate:full` vert (3 272 tests), e2e construits verts (497), audit DX expliqué (3 984 différences, surtout le retrait des modèles), banc nettement meilleur (50 schémas : édition 3,00 → 2,24 s, froid 6,21 → 4,98 s ; 200 : 9,05 → 7,60 s, froid 22,63 → 18,78 s ; infobulle de résultat 1 267 → 199 caractères). Corrections décidées en revue : `UpdateInput`/`CreateInput` exactement les `data` d'`updateOne`/`createOne` ; le filtre déclaré d'une relation ne bloque plus `disconnect`/`set` (amendement d'ADR-0308) ; `after` dans les `include` et pagination imbriquée GraphQL rétablie (amendement d'ADR-0309) ; option commune `pagination: { defaultTake: 100, maxTake: 1000 }` en REST et GraphQL (anciennes options supprimées) ; `findMany` côté serveur sans limite par défaut (documenté, refus d'une limite Core décidé par l'utilisateur) ; bogue antérieur corrigé (`include` complet d'une cible dont un champ virtuel est caché par une règle). Reportés à l'étape 6 : `after` dans les types Typegen, noms internes « model » (`model:extend`, `defineSpecialized`).
- Étape 4 : fusionnée dans `main` local le 2026-10-11 (5fe975d6) : `validate:full` vert (3 341 tests), e2e construits verts (514), audit DX expliqué (661 différences), banc inchangé (50 schémas : édition 2,30 s, froid 5,14 s ; 200 : 7,92 s, froid 19,45 s) ; l'oubli de `Register` donne une erreur de type claire sans coût mesurable. Conflit accepté (option a, inscrit dans ADR-0297) : les schémas de l'ancienne forme qui lisent le registre (`RoleSchema.define`, règles Access dans `define`) enregistrent une application sans schéma jusqu'à l'étape 6. Nouvelles capacités publiques `httpServerCapability` et `graphqlIntrospectionCapability`. Reportés à l'étape 6 : `allowWithoutRule` (valeur `'development'`, refus en production, avertissement), fusion des explorateurs, `testApplication`.
- CI de `main` 5fe975d6 en échec (job Website) : contraste insuffisant d'un commentaire ajouté à l'étape 4 dans l'exemple de la page d'accueil (bloc sombre recevant la couleur de commentaire du thème clair). `validate:full` ne lance pas les tests navigateur du site : lancer `yarn website:test` dès qu'une étape touche `apps/website/components`. Corrigé dans `main` local (ca9d0479, 720104c3) : `yarn website:test` 59/59 vert (5 échecs reproduits avant).
- Étape 5 : fusionnée dans `main` local le 2026-10-11 (0df2ebac). Objectifs non atteints (arrêt sur la règle d'arrêt) : TS 6 édition 50 schémas 2,30 → 2,25 s (objectif 1 s), 200 : 7,95 → 7,59 s (objectif 3 s) ; TS 7 50 : 0,79 → 0,73 s (objectif 0,5 s), 200 : 2,79 → 2,53 s. Gardé : deux simplifications de projection, infobulles `ResolveSourceSchemaObject` corrigées (69 → 0, +0,08 s accepté par l'utilisateur), `CreateInput<"Todo">` (604 → 38 caractères). Tests publics inchangés ; `validate:full` vert (3 341), e2e construits verts (514), audit DX expliqué (101). Leviers mesurés et décision de l'utilisateur : (1) retrait de la validation des options de l'ancienne forme et (5) des couches Typegen à l'étape 6 ; (2) arguments et résultats de requête typés par nom avec une seule signature : étape 5b, ADR-0315 ; (3) emplacements HKT pour les projections de plugins : début de l'étape 6 avec la façade `definePlugin` ; (4) non retenu (revient sur ADR-0297). Remesurer après l'étape 6.
- Étape 5b : fusionnée dans `main` local le 2026-10-11 (73109860). ADR-0315 amendé après mesure : signatures par nom retirées (200 schémas : 7,24 → 9,41 s) ; gardés : signature unique de `findMany` (surcharge `QueryBuilder` retirée), contrôle de contrat en lecture seule, contraintes lâches avec exactitude dans le paramètre. Fautes : `select` 1 539 → 316 caractères, `include` 1 676 → 407, `where` 1 724 → 439 ; règles d'acceptation inchangées (16 refus, 8 acceptations, `examples/schema-form-d/src/exactness.ts`). Banc : TS 6 50 schémas 2,20 → 2,05 s, 200 : 7,22 → 6,87 s ; TS 7 50 : 0,72 → 0,68 s, 200 : 2,40 → 2,24 s. `validate:full` vert (3 343), e2e construits (516), site (59), audit DX expliqué (407).

## Prochaine action vérifiable

Plan de découpage de l'étape 6 (façade `definePlugin` et emplacements HKT des projections de plugins en premier, puis plugins selon les revues, create-app, exemples, retrait de l'ancienne forme et de Typegen, documentation) à soumettre à l'utilisateur. Remesurer les objectifs d'ADR-0297 après l'étape 6.
