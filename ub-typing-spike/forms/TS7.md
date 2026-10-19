# Finalistes sous TypeScript 7.0.2 (portage natif) face à 6.0.3 (2026-10-09)

Formes : D (`d-hybrid`, avec et sans `Register`), E1, E2, K ; référence : E3, G. Outils et
sorties brutes : `ts7/` (`tools/`, `repros/`, `results/`, `work/`). Aucun dépôt Git touché ;
`./tsc` (6.0.3) inchangé.

## 1. Installation

- `npm view` : `typescript@7.0.2` (mainteneurs Microsoft), **aucun script d'installation**, ni dans le
  paquet principal ni dans le paquet de plateforme. Le binaire natif vient d'une dépendance
  optionnelle par plateforme ; la machine est un Intel (`i7-8700B`, Node `x64`) : `@typescript/typescript-darwin-x64@7.0.2`.
- `cd ts7 && npm init -y && npm install typescript@7.0.2 --save-exact --ignore-scripts` : 2 paquets
  ajoutés, 0 vulnérabilité. `--ignore-scripts` sans effet (rien à exécuter) : `bin/tsc` lance
  `lib/tsc.js`, qui résout le paquet de plateforme et `execve` le binaire Go (`lib/tsc`, 25 Mo).
- `ts7/package.json` passé en `"type": "module"` (le `commonjs` de `npm init` faisait de toute copie
  sous `ts7/` un module CommonJS : TS1295 partout). Enveloppe `ts7/tsc` → `Version 7.0.2`.

## 2. Méthode

- Compilation : `tsc -p … --extendedDiagnostics` sous `/usr/bin/time -l`, TS6 (`node …/tsc`) et TS7
  (binaire ; vérificateurs parallèles par défaut, et `--singleThreaded`).
- **TS7 n'expose plus le service de langage JS** : `require('typescript')` ne contient que
  `version`, `versionMajorMinor`. Infobulles, complétions et diagnostics d'édition passent par le
  serveur LSP natif (`tsc --lsp --stdio`) avec un client minimal (`ts7/tools/lsp.mjs`, `textDocument/hover`,
  `completion`, `diagnostic` en mode pull, `didChange`). `ts7/tools/probe-both.mjs` rejoue le même
  `probe.json` sur TS6 (service de langage, comme `forms/d-hybrid/tools/probe.mjs`) ou TS7 (LSP) ;
  `compare.mjs` compare. Le LSP prend le `tsconfig.json` le plus proche : les configurations
  alternatives (K + registre, G sans registre) ont été copiées dans `ts7/work/` (sinon mesure fausse).
- Banc : `ts7/tools/campaign.mjs` (même générateurs et drapeaux que BENCH.md, régénérés en place
  comme le fait `tools/forms-bench/run.mjs`), séquentiel, un processus par mesure ; 1 exécution à
  10/50, **3 à 200 (médiane)**. TS6 : `tools/bench.mjs` + `bench-rule.mjs` inchangés ; TS7 :
  `ts7/tools/lsp-bench.mjs` (mêmes éditions : requête `'valid'`→`42`, schéma `f5`, règle `f2`→`f9`).
  Charge 1 min : 1,6–2,0 avant, 3,0–3,6 pendant les points à 200 (campagne seule, rien > 3 % CPU).
  TS6 retrouve BENCH.md à ±2 % (D 1,59 contre 1,58 ; G 1,90 contre 1,90).

## 3. Tableau par forme (TS6 → TS7)

| Forme | Fixture / 10 / 50 / 200 | 8 fautes : sur la ligne | Messages des 8 fautes | Hover `where` / croisé / `item` / schéma / entrée | Check 200 (s) 6 → 7 (1 fil) | Éd.→diag 200 (s) | Règle 200 (s) | RSS tsc 200 (Mio) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D + `Register` | 0 erreur partout, les deux | 7/8 → 7/8, mêmes lignes et nombres | 5/8 identiques (4 : 392→291, 5 : 1 158→1 612, 8 : +3) | 39 / 42 / 390* / 857* / 892→898 | 1,59 → 0,32 (0,47) | 0,73 → 0,22 | 0,46 → 0,09 | 370 → 161 |
| D sans `Register` | idem | idem | idem | 878* / 910* / 390* / 857* / 1 301→1 304 | 1,44 → 0,27 (0,42) | 0,62 → 0,19 | 0,10 → 0,01 | 330 → 144 |
| E1 | idem | 7/8 → 7/8 | **8/8 identiques** | 44 / 47 / 22 / 10 / 45 (identiques) | 1,71 → 0,33 (0,50) | 0,74 → 0,22 | 0,11 → 0,01 | 352 → 182 |
| E2 | idem | 7/8 → 7/8 | **8/8 identiques** | 44 / 47 / 22 / 10 / 407 (identiques) | 1,79 → **0,45** (0,51) | 0,75 → 0,23 | 0,14 → 0,02 | 345 → 204 |
| K (sans registre) | idem | 7/8 → 7/8 | 3/8 identiques (2, 4, 6, 8 : ±3 à +11 ; 5 : même longueur) | 824* / 787* / 414* / 803→890 / 1 219→1 222 ; `todoRules` 36 | 1,54 → 0,29 (0,51) | 0,61 → 0,18 | 0,10 → 0,01 | 383 → 179 |
| K + registre | idem | 7/8 → 7/8 | 5/8 identiques | 39 / 42 / 414* / 890* / 446→449 | — | — | — | — |
| E3 (réf.) | idem | 7/8 → 7/8 | 8/8 identiques | 44 / 47 / 22 / 10 (identiques) | 1,69 → 0,33 (0,50) | 0,75 → 0,22 | 0,13 → 0,02 | 342 → 184 |
| G (réf., registre) | idem | identique à TS6 | identiques | 38 / 42 / 22 / 10 ; `App.Schema(` 1 606→978 | 1,90 → 0,36 (0,56) | 0,81 → 0,24 | 0,10 → 0,01 | 358 → 190 |

`*` même longueur, texte réordonné (voir §4). Aucun TS7022/TS2615/TS2589 nouveau ; sur les 122 cas
de faute de toutes les sondes (8 + cas propres à chaque forme), **l'ensemble des diagnostics
(fichier, ligne, colonne, code) est identique** sur les deux versions, cascades comprises
(D `.with` puis méthode de forme : 25/25 ; K oubli `rules`, doublon : identiques). Complétions
identiques une fois les options de VS Code appliquées à TS6 (`includeCompletionsWithInsertText` fait
aussi apparaître `~fields`, `~statics`, `Symbol` en TS6) ; seule différence de présentation : le LSP
étiquette les propriétés optionnelles `access?`. Hover de `q0` : 190 partout ; 1 diagnostic après
l'édition, partout.

Temps à 200 : TS7 vérifie **×4,0 à ×5,3** plus vite (×3,0 à ×3,5 en un seul fil), édition **×3,2–3,4**,
règle ×5 à ×11, mémoire ÷2. Classement : D-noreg 0,27 < K 0,29 < D 0,32 < E1 = E3 0,33 < G 0,36 < E2 0,45 ;
**E2 parallélise le moins bien** (0,45 contre 0,33 pour E1, constant sur 3 exécutions ; 855 k
instanciations cumulées sur les vérificateurs parallèles contre 475 k en un fil : chaque vérificateur
recalcule le graphe des `this.with`). D avec `Register` paie le même doublement (834 k). Croissance
10 → 200 TS7 : check ×6–10 (base 0,03–0,05 s), édition ×11 (TS6 : ×9–10). Tableau complet :
`ts7/results/summary.md` ; brut : `campaign.jsonl`.

## 4. Ce qui change vraiment : l'ordre des types imprimés

TS7 impose un ordre de types stable : unions de littéraux triées (`"high" | "low" | "normal"` au lieu
de l'ordre `defineEnum('TodoPriority', ['low', 'normal', 'high'])`) et propriétés des types mappés
triées (`item`, résultats `findMany` : `acl, allowedPriorities, archived, assignee, …` au lieu de
`id, title, …` ; `id` n'est plus en tête). Les déclarations écrites (champs du schéma, classes) gardent
leur ordre. Effets : textes d'infobulles et de messages réordonnés, troncatures (`... 4 more ...`)
déplacées, d'où les longueurs 392→291 (D, faute 4) ; un niveau d'élaboration de plus pour les
erreurs d'enregistrement de D (1 158→1 612) ; profondeur d'impression des types récursifs différente
(repro D/K : hover croisé 191→319). **TS6 avec `stableTypeOrdering: true` reproduit TS7** : sur D, E1
et K, toutes les infobulles et tous les messages deviennent identiques à TS7, sauf les élaborations
d'enregistrement de D et K (`probe-*-stable.md`). Les formes E (classes, infobulles nominales
`WhereBuilder<typeof Todo>`, `item: Todo`) ne sont pas touchées ; D et K sans registre le sont.

## 5. Comportements dont dépendent les formes (`ts7/repros/`, mini-modèle commun)

| Repro | Comportement | TS6 | TS7 | Témoin négatif (TS6 = TS7) |
| --- | --- | --- | --- | --- |
| `d-last-call` | constante typée par le dernier appel non générique `.with(rules)` sans lire ses arguments (cycle Todo ↔ User dans les filtres) | 0 erreur | 0 erreur, infobulles identiques | `with<const TRules>` générique : 11 diag. (TS7022/7023/7024) identiques |
| `e2-this-with` | `with<TSelf>(this: TSelf, …)` dans `static options = this.with({…})`, `TSelf` inféré du récepteur | 0 erreur, `WhereBuilder<typeof Todo>` (44) | identique | `this` polymorphe non générique : compile, infobulles 157/148/162 (types de base) ; expressions de filtre typées par le schéma au lieu de son nom : **TS7022 ×2 + TS7023 ×2** |
| `e1-annotation` | `static readonly options: Rules<typeof Todo> = {…}` | 0 erreur | identique | annotation retirée : 3 × TS7006 |
| `k-constants` | constante de schéma sans règles, `todoRules = Todo.rules({…})` séparée | 0 erreur | identique | `rules<const TRules>` générique : 0 erreur (K ne dépend pas du chemin rapide) |

Les deux comportements peu documentés (D, E2) **tiennent sur TS7**, au diagnostic près. Le témoin
E2 révèle une troisième condition : les callbacks de `this.with` ne doivent pas faire dépendre leur
type de retour du type complet de la classe (le modèle des formes E l'évite en indexant les
expressions par nom, `WhereExpression<"Todo">`) ; E1 et K n'ont pas cette condition.

## 6. Impact sur l'outillage du dépôt

- 61 fichiers du dépôt importent l'API JS (`createLanguageService`, `getQuickInfoAtPosition`,
  `getCompletionsAtPosition`, `createProgram`) : `tooling/vitest/typescript-language-service.ts`,
  les tests d'éditeur (`*-intellisense`, `*-language-service`), `tooling/dx-audit/*`,
  `typescript-eslint` 8.65. Aucun code de production ne l'importe (Typegen compris).
- `typescript@7` remplace l'export principal par `version` seul : installé à la place de 6, il casse
  tout cet outillage. Voie praticable : garder `typescript@6` pour l'API et ajouter TS7 à côté
  (alias de paquet) pour `tsc` et pour des tests d'éditeur via LSP.
- Remplacements : **infobulles → LSP** (`textDocument/hover`, Markdown : bloc de code identique à
  `displayPartsToString`, plus la JSDoc) ; complétions → LSP ou `checker.getCompletionsAtPosition` ;
  diagnostics → `typescript/unstable/sync` (`API`, `updateSnapshot({ openProjects })`,
  `program.getSemanticDiagnostics()`, `checker.getTypeAtPosition` + `typeToString` : vérifié,
  `WhereBuilder<typeof Todo>`) ; **pas de `getQuickInfoAtPosition` dans l'API**, et elle est
  « unstable ». Coût estimé : un client LSP partagé (~120 lignes ici) derrière l'interface de
  `tooling/vitest/typescript-language-service.ts`, positions UTF-16, projets réels sur disque.
- Attentes de texte : avant toute bascule, activer `stableTypeOrdering` dans les tests et le DX audit
  pour séparer le changement d'ordre (attendu) des vraies régressions.

## 7. Méthodes personnalisées (E1 et E2, `ts7/work/e{1,2}-methods/`, TS6 = TS7)

Ajouts dans `Todo` : `dueAt: field.date()`, `static findOverdue() { return this.findMany({ where: { archived: { eq: false } } }) }`,
`isLate(): boolean` (lit `this.dueAt`), `get late()`. Le contrôle d'enregistrement des formes E
rejette ces membres (`custom static member 'findOverdue' is not allowed…`, `custom instance member
'isLate'…`, TS2322 de 768 sur `new App`) ; mesures faites contrôle désactivé dans la copie.

- Statique : aucun cycle ; `Todo.findOverdue(): Promise<{ … }[]>` typé exactement comme
  `findMany()` (égalité vérifiée), infobulle 555, `findOverdue` proposé sur `Todo.` (TS6 et TS7).
- Instance : `findMany({ select: { title: true } })` donne `{ readonly id: string; readonly title: string }[]`
  **sans `isLate`** ; mais `findMany()` complet et `findOverdue()` non plus : la méthode n'existe sur
  aucun résultat de requête. En revanche la classe `Todo` comme type (`item: Todo` des hooks,
  annotations) l'a : `item.isLate()` compile, `const one: Todo | null = await Todo.findOne(…)` (fixture
  E, `usage.ts:39`) **casse** (`missing … isLate, late`).
- Solidité : exclure la méthode des résultats est correct pour une sélection partielle (`isLate` lirait
  un `dueAt` absent) ; la promettre sur `item` ne l'est que si l'exécution construit des instances
  de la classe, contraire aux modèles immuables sans comportement (pas d'Active Record).
- Options : (a) garder l'interdiction actuelle (cohérent, message clair à l'enregistrement) et écrire
  des fonctions libres `isLate(todo: Pick<Model<typeof Todo>, 'dueAt'>)` ; (b) méthodes seulement sur
  modèles complets (résultat sans `select` = instance ; deux types de résultat, coût de typage et
  d'exécution) ; (c) dépendances déclarées (`isLate` requiert `dueAt`, ajoutée au `select`) : machinerie
  nouvelle ; (d) champs virtuels déclarés comme champs (`late: field.virtual({ uses: ['dueAt'], get })`) :
  typés dans `select`/résultats, sans méthode sur la classe. Les helpers statiques posent seulement la
  question de l'API de schéma ad hoc (interdite aujourd'hui), pas de typage.

## 8. Verdict par finaliste

- **E1** : rien ne change (diagnostics, messages, infobulles identiques) ; repose sur l'annotation
  seule. Le plus robuste au portage.
- **E2** : comportements confirmés sur TS7, messages et infobulles identiques ; mais le gain de TS7 y
  est le plus faible (0,45 s contre 0,27–0,36) et le témoin ajoute une condition de modélisation. Viable.
- **D** : `.with` final non générique confirmé ; seules différences, l'ordre stable dans les
  infobulles longues (sans `Register`, `item`, constante) et des erreurs d'enregistrement plus longues.
- **K** : indépendant du chemin rapide ; le plus rapide sous TS7 avec D sans registre ; sans registre
  ses infobulles structurelles sont réordonnées comme D.
- TS7 ne départage donc pas D, E1, E2, K par la correction ; il favorise faiblement les formes à
  infobulles nominales (E1, E2) pour la stabilité du texte, et E1 pour l'absence d'hypothèse sur le
  vérificateur. Non mesuré : `isolatedDeclarations`, `checkJs` et le mode `--build` sous TS7.
