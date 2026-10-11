# Migration de Core, étape 5 : poids du typage (ADR-0297, amendements 2 et 4 ; régression d'infobulles de l'étape 0)

Branche `migration/type-weight` (worktree `../ub-step5`), basée sur `main`
local 5fe975d6 (étape 4). Référence de mesure : worktree détaché
`../ub-step5-baseline` (5fe975d6, construit), à supprimer en fin d'étape.

## Cibles

- Banc forme D (`examples/schema-form-d/tools/gen.mjs`, `ub-typing-spike/tools/bench.mjs`),
  TypeScript 6 : édition → diagnostics ≤ 1 s à 50 schémas (≤ 0,5 s sous
  TypeScript 7), ≤ 3 s à 200 schémas.
- Infobulles qui impriment `ResolveSourceSchemaObject<…>` (69 à l'étape 0) :
  à recompter et corriger.
- `CreateInput<typeof Todo>` et le message de la faute `select` restent longs
  (amendement 4).

Point de départ mesuré (base 5fe975d6, 3 exécutions, médianes, charge 1 min
2,7–2,9) : 50 schémas, édition 2,30 s, froid 5,08 s, édition de schéma 2,50 s,
tas 892 Mio, hover 199.

## Méthode

- Banc : `node tools/runbench.mjs <n> 3 <jsonl> base=<baseline> branch=<step5>`
  (outil de bloc-notes : alterne les arbres, note `os.loadavg()`, médianes),
  qui lance `ub-typing-spike/tools/bench.mjs` dans un processus neuf.
- Mesure rapide d'une piste : `usage-check.mjs` (programme neuf puis
  diagnostics sémantiques de `usage.ts` seul : c'est le coût de l'édition, sans
  le service de langage), nombre d'instanciations (déterministe) et temps.
- Ablations : modification temporaire de `packages/core/dist/*.d.ts` de
  l'arbre de travail, mesure, restauration ; seules les pistes mesurées
  utiles sont ensuite écrites dans les sources.
- Profil : copie locale de TypeScript 6.0.3 instrumentée (compteurs
  d'instanciations par déclaration, temps propre par conditionnel, relation,
  résolution de membres, variance, appel), plus `tsc --generateTrace`.

## Profil (50 schémas, `usage.ts` vérifié seul, base)

- 2,63 s de vérification, 1,39 M instanciations. Coût fixe (1 schéma) :
  0,81 s dont 0,25 s pour le type de l'application ; ensuite ≈ 37 ms par
  schéma.
- Typage du graphe (type de `S0`, qui type tous les schémas par les filtres
  croisés) : 1,75 s, 783 k instanciations (≈ 12,6 k par schéma). Appels
  `findMany` : ≈ 15 ms et 12 k instanciations par schéma, même sans argument.
- Ablations (borne haute, `usage.ts`, 2,63 s) :

| Ablation                                                          | Vérif. | Instanciations |
| ----------------------------------------------------------------- | ------ | -------------- |
| aucune                                                            | 2,63   | 1 389 502      |
| projections de plugins (`ResolvePluginSchemaProjection` vide)     | 1,95   | 763 104        |
| — seulement champs de forme (`ConfiguredSourceFields`)            | 2,34   | 1 148 422      |
| — seulement options de `define` (`ConfiguredSourceSchemaOptions`) | 2,45   | 1 171 662      |
| — seulement surface de classe (`ConfiguredSchemaClassSurface`)    | 2,51   | 1 294 316      |
| — options de `.with`, mutations de schéma                         | 2,62   | inchangé       |
| validation des options de `define` simplifiée                     | 2,43   | 1 129 307      |
| entrée de `findMany` `unknown`, sans génériques ni résultat       | 1,78   | 782 978        |
| résultat de `findMany` `unknown`                                  | 2,49   | 1 305 828      |
| sans `.softDelete().acl()` dans le code généré                    | 2,24   | 1 040 997      |

## Tentatives

Mesure : `usage-check.mjs` à 50 schémas (vérification de `usage.ts` seul),
instanciations (déterministes) et temps (A/B alterné, 3 exécutions, charge
1 min 2,8–4,7 sauf mention).

| #   | Piste                                                                                                                                                                                 | Instanciations        | Temps (s)                              | Décision                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------- | ------------------------------------------ |
| 1   | Validation de `define` : projection des options résolue avec le sous-ensemble « sélecteurs » des options (vide → `Readonly<Record<never, never>>` partagé) au lieu des options brutes | 1 389 502 → 1 268 534 | 2,63 → 2,51                            | gardée                                     |
| 2   | Même normalisation pour les options de l'étape `define` de la chaîne (partage des champs complets avec la surface de validation)                                                      | 1 268 534 → 1 229 508 | 2,51 → 2,47                            | gardée                                     |
| 3   | Infobulles : `ResolveSourceSchemaObject` enveloppé dans `TTemplate extends infer TObject ? {…} : never` (objet résolu imprimé, sans alias)                                            | 1 229 508 → 1 300 115 | 2,47 → 2,55 (+0,08 ; 1 schéma : +0,10) | gardée (objectif de l'étape, coût signalé) |
| 3b  | Variante : expansion seulement des options (`TExpand` dans le résolveur partagé)                                                                                                      | 1 313 680             | +0,10                                  | rejetée (même coût, plus de code)          |
| 3c  | Variante : résolveur d'options séparé (`ResolveSourceOptionTemplate`)                                                                                                                 | 1 305 633             | +0,08 à +0,10                          | rejetée (même coût, code dupliqué)         |
| 3d  | Variante : `Expand` au point d'appel (mapped supplémentaire)                                                                                                                          | 1 430 984             | —                                      | rejetée                                    |
| 4   | Registre : une seule union `RegisteredSchemaUnion<"~any">` au lieu d'une par nom                                                                                                      | −12 k                 | −0,04 (bruit)                          | rejetée                                    |
| 5   | Registre : table par nom (`as ClassNameOf`) au lieu de `Extract<Union, SchemaDefinition<N>>`                                                                                          | −12 k                 | 0                                      | rejetée                                    |
| 6   | `SchemaTypeInfoFor` : voie rapide `SourceSchemaTypeInfo<string, infer>` / `RegisteredSchemaTypeInfo<string>` avant `extends SchemaTypeInfo`                                           | +67 k                 | +0,19                                  | rejetée                                    |
| 7   | Surface de classe sans `SchemaReferenceTypeInfo` (contrat configuré direct)                                                                                                           | −13 k                 | 0                                      | rejetée                                    |
| 8   | Projection sans aplatissement final (`TResolved` direct)                                                                                                                              | −46 k                 | +0,7 (charge 10)                       | rejetée (et change l'impression)           |
| 9   | `fields` du contrat source calculé par `keyof TFields \| keyof SystemFields`                                                                                                          | −14 k                 | non mesurable                          | rejetée (gain < bruit)                     |
| 10  | `ResolveSourceSchemaTemplate` : court-circuit des primitives                                                                                                                          | +3 k                  | 0                                      | rejetée                                    |
| 11  | `CreateInput` exporté = alias conditionnel qui applique l'alias imprimé au nom de classe d'un schéma enregistré                                                                       | hors banc             | hors banc                              | gardée (infobulle 604 → 38)                |

Bornes hautes non transformables sans changer de contrat ou d'architecture
(ablations) : sélecteurs de projection seuls −0,5 % ; résolution des gabarits
de projection −20 % d'instanciations (−0,3 s) ; `findMany` sans validation
exacte de `include` −2 %, sans `select` exact −0,4 % ; coût fixe (1 schéma,
1 requête) 0,8 s indépendant du nombre de champs.

## Décisions

- Arrêt sur la règle d'arrêt : après les pistes 1–2, deux variantes
  comparables sans gain sur chaque point chaud (registre, `SchemaTypeInfoFor`,
  projection) et plus de 30 minutes sans gain mesurable ; les pistes restantes
  touchent des contrats publics ou l'architecture des types de Core (voir
  « Écart restant »).
- Correction des infobulles gardée malgré +0,08 s à 50 schémas : c'était un
  engagement de l'étape 0 ; à confirmer par l'utilisateur (retour arrière
  trivial, piste 3).
- Faute `select` (amendement 4) non traitée : le message (1 539 caractères,
  « No overload matches this call » avec les deux surcharges) demande des
  arguments typés par nom (`FindManyArgs<SchemaRef<…>>`, prototype `d-named`)
  et une seule surcharge : changement des signatures publiques de `SchemaAPI`.

## Approches rejetées

Voir le tableau (3b–3d, 4–10), chacune avec sa mesure.

## Banc final (TypeScript 6.0.3, 3 exécutions alternées base/branche, médianes)

Base = 5fe975d6 (`../ub-step5-baseline`), branche = ab91b56c + `CreateInput`.
Charge 1 min : 3,6–4,1 à 50, 3,0–3,9 à 200. Brut : bloc-notes `bench-final.jsonl`.

| N   | Arbre   | Éd.→diag | Froid | Schéma+hover | Éd.→tout | Tas max (Mio) | Hover `q0` | Diag. froid/éd./schéma |
| --- | ------- | -------- | ----- | ------------ | -------- | ------------- | ---------- | ---------------------- |
| 50  | base    | 2,30     | 5,12  | 2,48         | 4,21     | 906           | 199        | 0/1/0                  |
| 50  | branche | 2,25     | 4,88  | 2,29         | 4,19     | 873           | 199        | 0/1/0                  |
| 200 | base    | 7,95     | 19,34 | 8,27         | 19,48    | 2 712         | 199        | 0/1/0                  |
| 200 | branche | 7,59     | 17,09 | 7,72         | 17,14    | 2 532         | 199        | 0/1/0                  |

Cibles : 1 s à 50 et 3 s à 200 (TS6) non atteintes.

TypeScript 7.0.2 (LSP, `tools/lsp-bench.mjs`, 3 exécutions à 50, 2 à 200) :
éd.→diag 50 : 0,79 → 0,73 (cible 0,5) ; 200 : 2,79 → 2,53 ; schéma+hover 50 :
1,36 → 1,25 ; 200 : 4,43 → 3,96.

## Écart restant et options (contrats touchés)

1. Supprimer la validation des options de l'ancienne forme dans `define`
   (étape 6, ancienne forme retirée) : borne mesurée −0,2 s à 50 (−8 %).
   Contrat : options acceptées par `define` (déjà prévu par l'ADR-0297).
2. Arguments et résultats de requête typés par nom (`SchemaRef<"Todo">` /
   contrat enregistré) avec une seule surcharge de `findMany` : borne de la
   signature −0,85 s à 50 (−32 %), et message de la faute `select` court
   (prototype `d-named` : 133 caractères). Contrat : signatures publiques de
   `SchemaAPI` (ADR).
3. Remplacer les gabarits de projection (`schemaFields` / `schemaClass` /
   `schemaOptions` résolus par `ResolveSourceSchemaTemplate`) par des
   emplacements HKT comme `schemaRules` : borne −0,7 s à 50 (−26 %).
   Contrat : API d'auteur de plugin (plugin-kit, ADR).
4. Une seule résolution de schéma par déclaration (les méthodes de forme
   renverraient une déclaration légère jusqu'à `.with`) : −0,4 s à 50 dans le
   banc (deux étapes de chaîne). Contrat : `define(...)` sans `.with` utilisable
   comme schéma (décision d'ADR-0297).
5. Retirer les couches de compatibilité Typegen (contrat `SchemaTypeInfo` à neuf
   entrées par schéma, recherches `UltimaBaseGenerated*`) quand Typegen sera
   retiré : non mesuré isolément.

Les bornes ne s'additionnent pas (travail partagé) ; le prototype sans ces
couches vérifie 50 schémas en 0,22 s d'édition.

## Prochaine action vérifiable

Porte finale sur le dernier commit de code : `yarn validate:full`,
`yarn test:e2e:built`, diff des tests, audit DX contre `../ub-step5-baseline`.
