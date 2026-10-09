# Banc commun des formes de déclaration (2026-10-09)

Même méthode pour toutes les formes, même session, un processus à la fois. Brut : `results/forms/{bench,tsc,rule,load,real-baseline,density}.jsonl` ;
tableaux : `node tools/forms-bench/summarize.mjs` (copie : `results/forms/summary.md`).

## Méthode et charge

- Machine : 12 cœurs, 64 Gio, aucun autre processus actif (vérifié par `ps` : rien au-dessus de 8 % CPU).
  Charge 1 min avant la campagne : 2,0–2,4. Avant chaque point (forme × N), `os.loadavg()` ;
  attente de 30 s si > 4 (deux attentes : `g-class-getters-200`, `k-rules-list-nosd-200`).
  Charge relevée avant les points : 3,0–4,0 (médiane 3,5 ; la campagne la fait monter). Rapport §5 : 2,0–3,7.
- Exécutant : `node tools/forms-bench/run.mjs --sizes "10 50 200" --runs 3` (configurations dans
  `tools/forms-bench/configs.mjs`). Par point : génération (`forms/<id>/gen.mjs <N> [drapeaux]`), puis
  3 fois, chaque fois dans un processus neuf : `tools/bench.mjs` (inchangé), `./tsc -p … --extendedDiagnostics`
  sous `/usr/bin/time -l` (analyse de `tools/run-bench.sh`), `tools/forms-bench/bench-rule.mjs`. Médiane des 3.
- Colonnes (s, Mio) : **Froid** = `createProgram` + `getPreEmitDiagnostics` ; **Éd.→diag** = `'valid'` → `42`
  dans `usage.ts` puis diagnostics de `usage.ts` ; **Éd.→tout** = idem + tous les fichiers ; **Schéma+hover** =
  `f5: field.string()` → `int` dans `s0.ts`, diagnostics de `s0.ts` et `usage.ts` + hover ; **Tas max** = bench ;
  tsc check / mémoire / RSS max / instanciations / types / erreurs = `--extendedDiagnostics`.
- **Règle (fichier)**, scénario ajouté (`bench-rule.mjs`) : service de langage, diagnostics de `usage.ts`,
  puis faute dans le filtre local de S0 (`eq('f2', false)` → `eq('f9', false)`) dans le fichier qui porte
  la règle (`application.ts` pour L, marqué « app » ; `s0.ts` sinon) et diagnostics de ce fichier. Lancé pour
  toutes les formes, pour que la valeur de L soit comparable. Partout : 1 diagnostic, sur la ligne.
- Libellés : `-noreg` = sans `Register` (D) ; `-reg` = avec `Register` (G) ; `-nosd` = K/K′/L avec
  `--no-soft-delete`. Les autres configurations sont les drapeaux par défaut des générateurs (D, D-getters,
  A′ : avec `Register` ; N, E1–E3, G, G′, G-getters, K, K′, L : sans registre).

## Contrôle de densité (N = 10, `tools/forms-bench/density.mjs`)

Les 18 configurations ont exactement la densité de `tools/gen.mjs` : 10 fichiers de schéma, 60 scalaires,
10 `next`, 10 `prevs` avec `mappedBy: 'next'`, 2 `parent` (1 sur 5), 10 filtres locaux + 10 croisés,
10 `create: true`, 10 hooks, 10 ACL, 10 tables postgres, aucune clé de règle en plus, 11 `findMany`
(`usage.ts` identique à `gen/d-10` au nom près). Compilation : 0 erreur pour toutes à 10 (et à 50/200
sauf N, voir anomalies). Écarts :

| Point        | Constat                                                                                                                                                                                                           | Normalisation                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `softDelete` | Référence `tools/gen.mjs` : `softDeletePlugin` de `lib/` ajoute `isDeleted` à **tous** les schémas. D, D-getters, A′, N, E1–E3, G, G′, G-getters ajoutent `softDelete` à chaque schéma ; K/K′/L aussi par défaut. | Densité égale = **avec** soft-delete. Les lignes `-nosd` ont un champ de moins par schéma (densité inférieure). |
| `postgres`   | G, G′, G-getters : en option d'en-tête, pas en règle                                                                                                                                                              | intrinsèque à la forme                                                                                          |
| `Register`   | présent : d-hybrid, d-hybrid-getters, a-prime, g-class-reg                                                                                                                                                        | `d-hybrid-noreg`, `g-class` sans                                                                                |
| Core         | chaque forme compile contre sa propre copie de `lib` (`forms/<id>/lib`)                                                                                                                                           | non normalisable : la forme inclut son Core                                                                     |

## 10 / 50 schémas (cellule = valeur à 10 / valeur à 50)

| Forme             | Froid       | Éd.→diag    | Éd.→tout    | Schéma+hover | Règle (fichier)   | Tas max   | tsc check   | tsc mém. | RSS max   | Instanciations   | Types           | Erreurs                           |
| ----------------- | ----------- | ----------- | ----------- | ------------ | ----------------- | --------- | ----------- | -------- | --------- | ---------------- | --------------- | --------------------------------- |
| d-hybrid          | 0,47 / 0,82 | 0,08 / 0,22 | 0,13 / 0,41 | 0,09 / 0,21  | 0,10 / 0,18       | 135 / 168 | 0,30 / 0,63 | 61 / 100 | 151 / 211 | 31 295 / 123 951 | 7 032 / 17 728  | 0                                 |
| d-hybrid-noreg    | 0,45 / 0,77 | 0,06 / 0,18 | 0,13 / 0,39 | 0,08 / 0,18  | 0,07 / 0,08       | 120 / 162 | 0,29 / 0,58 | 61 / 84  | 147 / 210 | 30 427 / 119 907 | 6 891 / 17 107  | 0                                 |
| d-hybrid-getters  | 0,47 / 0,81 | 0,08 / 0,22 | 0,13 / 0,42 | 0,09 / 0,22  | 0,10 / 0,18       | 134 / 178 | 0,30 / 0,63 | 62 / 99  | 154 / 213 | 31 533 / 124 781 | 7 002 / 17 514  | 0                                 |
| a-prime           | 0,48 / 0,83 | 0,08 / 0,24 | 0,13 / 0,43 | 0,10 / 0,23  | 0,10 / 0,20       | 105 / 162 | 0,31 / 0,64 | 65 / 80  | 151 / 220 | 31 601 / 125 057 | 7 056 / 17 712  | 0                                 |
| n-this-methods    | 0,58 / 1,12 | 0,19 / 0,46 | 0,22 / 0,57 | 0,16 / 0,49  | 0,22 / 0,36       | 141 / 177 | 0,42 / 0,93 | 80 / 131 | 186 / 273 | 57 138 / 197 000 | 10 499 / 27 877 | 0 / **67 (TS2322×50, TS2589×17)** |
| e1-annotated      | 0,45 / 0,83 | 0,08 / 0,22 | 0,17 / 0,51 | 0,10 / 0,22  | 0,10 / 0,11       | 119 / 181 | 0,29 / 0,66 | 67 / 100 | 153 / 217 | 37 786 / 142 250 | 7 396 / 19 172  | 0                                 |
| e2-this-with      | 0,47 / 0,88 | 0,08 / 0,23 | 0,19 / 0,56 | 0,10 / 0,23  | 0,11 / 0,12       | 134 / 182 | 0,31 / 0,69 | 75 / 87  | 159 / 215 | 39 153 / 141 457 | 8 030 / 20 566  | 0                                 |
| e3-static-block   | 0,46 / 0,83 | 0,09 / 0,23 | 0,19 / 0,51 | 0,10 / 0,23  | 0,11 / 0,12       | 126 / 172 | 0,31 / 0,66 | 70 / 93  | 155 / 213 | 37 484 / 130 620 | 8 007 / 20 023  | 0                                 |
| g-class           | 0,52 / 0,95 | 0,08 / 0,24 | 0,18 / 0,55 | 0,09 / 0,23  | 0,09 / 0,09       | 133 / 193 | 0,36 / 0,76 | 54 / 116 | 164 / 255 | 40 549 / 159 013 | 8 316 / 21 700  | 0                                 |
| g-class-reg       | 0,51 / 0,94 | 0,12 / 0,32 | 0,17 / 0,51 | 0,13 / 0,30  | 0,13 / 0,32       | 130 / 185 | 0,35 / 0,77 | 51 / 136 | 160 / 245 | 39 430 / 153 062 | 8 206 / 21 070  | 0                                 |
| g-self            | 0,53 / 0,98 | 0,10 / 0,31 | 0,20 / 0,57 | 0,11 / 0,35  | 0,08 / 0,09       | 134 / 196 | 0,36 / 0,79 | 58 / 129 | 164 / 271 | 41 878 / 165 190 | 8 811 / 23 755  | 0                                 |
| g-class-getters   | 0,51 / 0,93 | 0,08 / 0,22 | 0,18 / 0,53 | 0,09 / 0,22  | 0,08 / 0,09       | 130 / 172 | 0,35 / 0,75 | 53 / 108 | 163 / 253 | 40 448 / 157 640 | 8 140 / 20 636  | 0                                 |
| k-rules-list      | 0,47 / 0,79 | 0,06 / 0,19 | 0,13 / 0,43 | 0,08 / 0,18  | 0,07 / 0,08       | 124 / 183 | 0,30 / 0,61 | 63 / 105 | 148 / 213 | 30 410 / 118 930 | 7 357 / 20 573  | 0                                 |
| k-rules-list-nosd | 0,46 / 0,78 | 0,07 / 0,19 | 0,13 / 0,42 | 0,07 / 0,18  | 0,07 / 0,07       | 120 / 162 | 0,30 / 0,59 | 63 / 98  | 150 / 212 | 29 325 / 113 525 | 7 301 / 20 277  | 0                                 |
| k-statements      | 0,47 / 0,79 | 0,07 / 0,19 | 0,13 / 0,42 | 0,08 / 0,20  | 0,08 / 0,08       | 123 / 158 | 0,30 / 0,61 | 61 / 97  | 149 / 210 | 31 386 / 121 226 | 7 115 / 17 811  | 0                                 |
| k-statements-nosd | 0,46 / 0,78 | 0,07 / 0,19 | 0,13 / 0,41 | 0,08 / 0,18  | 0,07 / 0,08       | 110 / 174 | 0,30 / 0,60 | 58 / 89  | 145 / 209 | 30 291 / 115 771 | 7 059 / 17 515  | 0                                 |
| l-app-rules       | 0,47 / 0,81 | 0,07 / 0,18 | 0,14 / 0,45 | 0,07 / 0,18  | 0,16 / 0,44 (app) | 130 / 164 | 0,30 / 0,63 | 52 / 89  | 147 / 217 | 33 179 / 133 339 | 7 510 / 20 766  | 0                                 |
| l-app-rules-nosd  | 0,46 / 0,80 | 0,07 / 0,18 | 0,13 / 0,43 | 0,06 / 0,17  | 0,16 / 0,43 (app) | 121 / 164 | 0,30 / 0,62 | 56 / 82  | 145 / 215 | 32 114 / 128 034 | 7 454 / 20 470  | 0                                 |

## 200 schémas

| Forme             | Froid | Éd.→diag | Éd.→tout | Schéma+hover | Règle (fichier) | Tas max | tsc check | tsc mém. | RSS max | Instanciations | Types  | Erreurs                         |
| ----------------- | ----- | -------- | -------- | ------------ | --------------- | ------- | --------- | -------- | ------- | -------------- | ------ | ------------------------------- |
| d-hybrid          | 1,89  | 0,75     | 1,47     | 0,73         | 0,45            | 393     | 1,58      | 172      | 369     | 471 411        | 57 838 | 0                               |
| d-hybrid-noreg    | 1,73  | 0,63     | 1,40     | 0,60         | 0,10            | 307     | 1,42      | 151      | 328     | 455 457        | 55 417 | 0                               |
| d-hybrid-getters  | 1,87  | 0,75     | 1,45     | 0,71         | 0,46            | 401     | 1,57      | 170      | 370     | 474 461        | 56 934 | 0                               |
| a-prime           | 1,93  | 0,79     | 1,50     | 0,74         | 0,50            | 396     | 1,62      | 202      | 359     | 475 517        | 57 672 | 0                               |
| n-this-methods    | 2,76  | 1,65     | 2,08     | 1,64         | 0,35            | 560     | 2,42      | 225      | 384     | 770 810        | 96 937 | **217** (TS2322×200, TS2589×17) |
| e1-annotated      | 2,09  | 0,73     | 1,76     | 0,78         | 0,11            | 386     | 1,71      | 202      | 353     | 533 990        | 63 332 | 0                               |
| e2-this-with      | 2,11  | 0,75     | 1,90     | 0,74         | 0,14            | 394     | 1,81      | 180      | 343     | 525 097        | 67 576 | 0                               |
| e3-static-block   | 1,98  | 0,75     | 1,73     | 0,74         | 0,13            | 389     | 1,66      | 183      | 342     | 479 880        | 65 083 | 0                               |
| g-class           | 2,25  | 0,80     | 1,90     | 0,79         | 0,10            | 446     | 1,90      | 200      | 357     | 603 253        | 71 890 | 0                               |
| g-class-reg       | 2,18  | 1,07     | 1,78     | 1,05         | 0,83            | 437     | 1,89      | 160      | 358     | 579 182        | 69 310 | 0                               |
| g-self            | 2,35  | 1,09     | 2,02     | 1,06         | 0,10            | 531     | 2,00      | 184      | 367     | 627 610        | 79 795 | 0                               |
| g-class-getters   | 2,17  | 0,76     | 1,86     | 0,75         | 0,11            | 427     | 1,88      | 169      | 355     | 597 110        | 67 496 | 0                               |
| k-rules-list      | 1,89  | 0,61     | 1,51     | 0,62         | 0,10            | 413     | 1,54      | 216      | 381     | 479 380        | 98 633 | 0                               |
| k-rules-list-nosd | 1,81  | 0,57     | 1,45     | 0,56         | 0,08            | 387     | 1,49      | 188      | 378     | 457 775        | 97 437 | 0                               |
| k-statements      | 1,80  | 0,65     | 1,47     | 0,63         | 0,09            | 334     | 1,49      | 157      | 342     | 458 126        | 57 921 | 0                               |
| k-statements-nosd | 1,76  | 0,65     | 1,47     | 0,61         | 0,10            | 358     | 1,46      | 183      | 334     | 436 321        | 56 725 | 0                               |
| l-app-rules       | 1,87  | 0,61     | 1,56     | 0,59         | 1,33 (app)      | 377     | 1,59      | 217      | 367     | 508 939        | 70 476 | 0                               |
| l-app-rules-nosd  | 1,85  | 0,59     | 1,53     | 0,56         | 1,30 (app)      | 344     | 1,56      | 191      | 374     | 487 734        | 69 280 | 0                               |

## Croissance 10 → 200 (×20 schémas)

| Forme                       | Froid              | Éd.→diag           | Éd.→tout            | Schéma+hover       | Règle              | Tas                | tsc check          | Instanciations        |
| --------------------------- | ------------------ | ------------------ | ------------------- | ------------------ | ------------------ | ------------------ | ------------------ | --------------------- |
| d-hybrid / -noreg           | ×4,1 / ×3,8        | ×9,4 / ×9,8        | ×11,4 / ×11,2       | ×7,6 / ×7,8        | **×4,7** / ×1,3    | ×2,9 / ×2,6        | ×5,3 / ×4,9        | ×15,1 / ×15,0         |
| d-hybrid-getters            | ×4,0               | ×9,2               | ×11,2               | ×7,6               | **×4,8**           | ×3,0               | ×5,2               | ×15,0                 |
| a-prime                     | ×4,1               | ×9,7               | ×11,6               | ×7,3               | **×5,0**           | ×3,8               | ×5,2               | ×15,0                 |
| n-this-methods (échec ≥ 50) | ×4,7               | ×8,5               | ×9,6                | ×10,1              | ×1,5               | ×4,0               | ×5,8               | ×13,5                 |
| e1 / e2 / e3                | ×4,6 / ×4,5 / ×4,3 | ×9,0 / ×8,8 / ×8,7 | ×10,1 / ×9,7 / ×8,9 | ×8,1 / ×7,1 / ×7,2 | ×1,1 / ×1,3 / ×1,1 | ×3,2 / ×2,9 / ×3,1 | ×5,9 / ×5,8 / ×5,4 | ×14,1 / ×13,4 / ×12,8 |
| g-class / -reg              | ×4,3 / ×4,3        | ×9,7 / ×9,2        | ×10,7 / ×10,4       | ×8,7 / ×8,4        | ×1,2 / **×6,2**    | ×3,3 / ×3,4        | ×5,3 / ×5,4        | ×14,9 / ×14,7         |
| g-self / g-class-getters    | ×4,5 / ×4,2        | ×10,9 / ×9,2       | ×10,4 / ×10,5       | ×10,0 / ×8,7       | ×1,2 / ×1,3        | ×4,0 / ×3,3        | ×5,6 / ×5,4        | ×15,0 / ×14,8         |
| k-rules-list / -nosd        | ×4,0 / ×3,9        | ×9,8 / ×8,6        | ×11,9 / ×11,1       | ×8,0 / ×7,8        | ×1,3 / ×1,2        | ×3,3 / ×3,2        | ×5,1 / ×5,0        | ×15,8 / ×15,6         |
| k-statements / -nosd        | ×3,9 / ×3,8        | ×9,7 / ×9,0        | ×11,5 / ×11,0       | ×8,1 / ×7,2        | ×1,2 / ×1,3        | ×2,7 / ×3,2        | ×5,0 / ×4,9        | ×14,6 / ×14,4         |
| l-app-rules / -nosd         | ×4,0 / ×4,0        | ×9,0 / ×8,7        | ×11,5 / ×11,5       | ×8,6 / ×8,7        | **×8,0** / ×8,0    | ×2,9 / ×2,8        | ×5,3 / ×5,2        | ×15,3 / ×15,2         |

## Classement à 200 (formes à 0 erreur, densité égale = avec soft-delete ; `-nosd` hors classement)

- **tsc check** : d-hybrid-noreg 1,42 < k-statements 1,49 < k-rules-list 1,54 < d-hybrid-getters 1,57 <
  d-hybrid 1,58 < l-app-rules 1,59 < a-prime 1,62 < e3 1,66 < e1 1,71 < e2 1,81 < g-class-getters 1,88 <
  g-class-reg 1,89 < g-class 1,90 < g-self 2,00. Écart total 1,42–2,00 (×1,4).
- **Édition requête → diag** : k-rules-list 0,61 = l-app-rules 0,61 < d-hybrid-noreg 0,63 < k-statements 0,65 <
  e1 0,73 < e2, e3, d-hybrid, d-hybrid-getters 0,75 < g-class-getters 0,76 < a-prime 0,79 < g-class 0,80 <
  g-class-reg 1,07 < g-self 1,09.
- **Édition de règle** : 0,09–0,14 pour toutes les formes sans registre (règle dans `s0.ts`) ; avec registre
  0,45–0,50 (D, D-getters, A′) et 0,83 (G + `Register`) ; **L 1,33** (règle dans `application.ts`).

## Lecture

- À densité égale, toutes les formes valides tiennent dans 1,4–2,0 s de check et 0,6–1,1 s d'édition à
  200 schémas ; croissance ×4 à froid, ×9–11 à l'édition, comme D/E au §5 du rapport.
- Familles : objet `define` (D, A′, K, K′, L) le plus léger (455–509 k instanciations) ; classes E 480–534 k ;
  classes G 579–628 k (+23 à 33 % vs D), G′ le plus lent valide (check 2,00 s, édition 1,09 s, tas 531 Mio).
- `Register` coûte à l'édition : D +0,12 s à l'édition de requête, +0,35 s à l'édition de règle à 200 ;
  G +0,27 s et +0,73 s. Sans registre, éditer une règle ne revérifie que son schéma.
- L : le scénario `bench.mjs` ne voit pas le coût des règles (Schéma+hover 0,59, parmi les meilleurs) ; le
  scénario de règle le montre : 1,33 s à 200, ×8 de 10 à 200 (0,16 → 0,44 → 1,33), qui croît avec `application.ts`.
- K (liste de règles) : 98 633 types à 200 contre ~57 k pour K′ et D (tuple des règles), sans effet visible
  sur le temps.

## Anomalies

- **N échoue dès 50** : 67 erreurs à 50 (TS2589×17 dans `s20`–`s23`, TS2322×50 à l'enregistrement), 217 à 200
  (TS2589×17, TS2322×200). Ses mesures à 50/200 ne sont pas comparables : l'édition invalide de `usage.ts`
  donne **0 diagnostic** (au lieu de 1) et le hover de `q0` tombe de 190 à 105 caractères (types dégradés).
  À 10 (0 erreur), N est déjà la forme la plus chère (57 k instanciations, ×1,8 D ; édition ×2,4).
- Valeur aberrante : `k-rules-list@200` froid 1,89 / 1,86 / **2,42** (écart 29 %) et check 1,52 / **1,76** / 1,54
  (16 %), même 3e exécution ; médiane non affectée (`-nosd` : 1,81 / 1,49).
- Écart > 15 % sur des valeurs < 0,1 s (bruit de mesure de 10 ms) : `k-rules-list@10` éd. 16 %, schéma 21 % ;
  `l-app-rules-nosd@10` éd. 17 % ; `k-rules-list@200` règle 16 % (0,10/0,11/0,10). Tout le reste ≤ 15 %.
- Partout ailleurs : 0 diagnostic à froid, 1 après l'édition de requête, 1 après l'édition de règle, 0 après
  l'édition de schéma ; hover de `q0` 190 caractères pour toutes les formes valides.

## Typegen réel (même session, `tools/real-baseline/probe.mjs`, 3 exécutions, charge 3,0–3,7)

| N   | Froid | Éd.→diag | Tas max | Déclaration (Ko) | diag base/éd. | Rapport §5 (nuit)     |
| --- | ----- | -------- | ------- | ---------------- | ------------- | --------------------- |
| 10  | 3,57  | 2,02     | 814     | 120              | 0/1           | 3,56 / 2,01 / 815     |
| 50  | 8,03  | 6,72     | 1 538   | 577              | 0/1           | 8,07 / 6,81 / 1 539   |
| 200 | 42,72 | 49,03    | 5 627   | 2 296            | 0/1           | 42,83 / 48,86 / 5 610 |

Reproduit le §5 à ±1,3 %. À 200, la forme valide la plus lente (G′) est ×18 plus rapide à froid et ×45 à
l'édition. Chiffres absolus non comparables (graphe et fichier unique différents, rapport §7).
