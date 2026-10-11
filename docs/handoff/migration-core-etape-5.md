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

| Ablation                                                                    | Vérif. | Instanciations |
| --------------------------------------------------------------------------- | ------ | -------------- |
| aucune                                                                      | 2,63   | 1 389 502      |
| projections de plugins (`ResolvePluginSchemaProjection` vide)               | 1,95   | 763 104        |
| — seulement champs de forme (`ConfiguredSourceFields`)                      | 2,34   | 1 148 422      |
| — seulement options de `define` (`ConfiguredSourceSchemaOptions`)          | 2,45   | 1 171 662      |
| — seulement surface de classe (`ConfiguredSchemaClassSurface`)              | 2,51   | 1 294 316      |
| — options de `.with`, mutations de schéma                                   | 2,62   | inchangé       |
| validation des options de `define` simplifiée                               | 2,43   | 1 129 307      |
| entrée de `findMany` `unknown`, sans génériques ni résultat                 | 1,78   | 782 978        |
| résultat de `findMany` `unknown`                                            | 2,49   | 1 305 828      |
| sans `.softDelete().acl()` dans le code généré                              | 2,24   | 1 040 997      |

## Tentatives

(voir plus bas, une ligne par tentative, gardée ou rejetée)

## Décisions

## Approches rejetées

## Prochaine action vérifiable
