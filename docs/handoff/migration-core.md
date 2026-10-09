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
- Étape 1 : lancée le 2026-10-09.

## Prochaine action vérifiable

Rapport de l'étape 1 (contrats d'adaptateur avec PostgreSQL, ADR-0299 à 0303) : diff relu, `validate:full` vert, audit DX expliqué.
