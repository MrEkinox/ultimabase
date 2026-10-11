# Migration de Core, étape 5b : signatures de requête indexées par nom (ADR-0315)

Branche `migration/named-queries` (worktree `../ub-step5b`), basée sur `main`
local 0df2ebac (étape 5). Référence de mesure : worktree détaché
`../ub-step5b-baseline` (0df2ebac, construit), à supprimer en fin d'étape.

## État : arrêt sur la règle de mesure, avant implémentation

La consigne était de mesurer d'abord et de s'arrêter si les signatures
indexées par nom n'apportent pas de gain mesurable ou coûtent plus qu'elles
n'économisent. Mesure faite : **elles coûtent plus** (+5 % d'instanciations à
50 schémas, +44 % à 200 par rapport à la même base sans elles), parce que
chaque nom doit être retrouvé dans le registre, et que cette recherche coûte
O(N) par nom (O(N²) au total). Trois variantes de recherche ont échoué (règle
d'arrêt). Rien de l'ADR-0315 n'est implémenté ; les décisions sont à prendre
par l'utilisateur (voir « Options »).

Seul changement de code sur la branche : la vérification allégée du contrat
dans `SchemaTypeInfoFor` (voir « Découverte 2 »), hors périmètre de
l'ADR-0315, gardée dans un commit séparé pour pouvoir être reprise ou retirée.

## Méthode

- `usage-check.mjs` (bloc-notes de l'étape 5) : programme neuf, diagnostics
  sémantiques d'un seul fichier (coût de l'édition sans le service de
  langage) ; instanciations (déterministes) et temps.
- Fichiers de sonde dans `gen/form-d-50/src` (retirés avant le banc) :
  `u-none` (imports seuls), `u-noarg` (`findMany()` × 50), `u-where`,
  `u-select`, `u-include`, `usage` (le fichier du banc : `where` croisé,
  `select`, `include`), `p-reg*` (recherche `RegisteredSchema<'Si'>`).
- Prototypes : modification de `packages/core/dist/foundation-*.d.ts`
  (`skipLibCheck`), mesure, restauration.
- Profil : TypeScript 6.0.3 instrumenté (bloc-notes `ts-prof`), plus une
  capture de piles d'appel par déclaration instanciée.
- Banc : `runbench.mjs` (alterné, 3 exécutions, médianes, charge notée).

## Découverte 1 : le coût de `findMany` n'est pas dans la forme des arguments

À 50 schémas (`usage-check`, base 0df2ebac) :

| Fichier                                                    | Instanciations      | Vérif. (s) |
| ---------------------------------------------------------- | ------------------- | ---------- |
| `u-none` (graphe seul)                                     | 698 989             | 1,68       |
| `u-noarg`                                                  | 1 232 537           | 2,28       |
| `u-select`                                                 | 1 116 105           | 2,14       |
| `u-include`                                                | 1 267 176           | 2,33       |
| `usage`                                                    | 1 300 115           | 2,45       |
| ablation A : `findMany(input?: unknown): Promise<unknown>` | 698 170             | 1,68       |
| ablation B : seulement résultat `Model<K>`                 | 1 217 945           | 2,27       |
| ablation C : arguments nommés, résultat `unknown`          | 1 320 773 (`usage`) | 2,40       |
| suppression de la surcharge `QueryBuilder` seule           | 1 299 698 (`usage`) | 2,48       |

Le coût par appel (≈ 10 k instanciations) est la dérivation du contrat du
schéma visé (champs stockés, sélection, sortie), pas la résolution de la
signature (ablation A = aucun appel) ni la surcharge supprimée.

## Découverte 2 : la vérification `infer TContract extends SchemaTypeInfo`

`SchemaTypeInfoFor`, `SchemaTypeInfoForDeferred` et `SourceContract` lisent le
contrat porté par un schéma avec `infer TContract extends SchemaTypeInfo` :
TypeScript compare alors le contrat entier à `SchemaTypeInfo`, ce qui calcule
ses entrées d'écriture. Ablation par membre (contrainte d'`infer` réduite à
`key` plus un membre, `usage`, prototype nommé) :

| Membre vérifié                      | Instanciations |
| ----------------------------------- | -------------- |
| `key` seul                          | 1 094 873      |
| + `inputs.nestedCreate`             | 1 215 190      |
| + `inputs.create`                   | 1 121 372      |
| + `inputs.update`                   | 1 105 134      |
| + `fields`/`numericFields`/…        | 1 151 455      |
| + `relationships` / `item`+`output` | ≈ +8 k chacun  |

`nestedCreate` parcourt le graphe des relations (création imbriquée des
cibles). Changement gardé : `ReadSchemaTypeInfo` (type interne de
`type-info.ts`), identique à `SchemaTypeInfo` sauf `create`, `nestedCreate`
et `update` en `unknown`, sert de contrainte à ces `infer` et au premier test
de `SchemaTypeInfoFor`. Les contrats restent déclarés contre `SchemaTypeInfo`
complet (`SchemaTypeInfoCarrier<TContract extends SchemaTypeInfo>`), donc
aucun contrat réel ne change de branche. Core compile sans autre
modification.

Effet (base → branche, signatures structurelles inchangées) :

| Mesure                                | 50 schémas            | 200 schémas           |
| ------------------------------------- | --------------------- | --------------------- |
| `usage-check` `usage`, instanciations | 1 300 115 → 1 139 121 | 4 556 375 → 3 921 291 |
| `usage-check` `usage`, vérif. (s)     | 2,45 → 2,30           | 7,32 → 6,70           |
| `u-noarg`, instanciations             | 1 232 537 → 1 070 497 | —                     |
| Banc TS6, éd.→diag (s)                | 2,18 → 2,03           | 7,31 → 6,85           |

## Découverte 3 : les signatures nommées coûtent plus qu'elles n'économisent

Prototype complet de `findMany` nommé dans le `.d.ts` construit (contrainte
`object | undefined` pour `TSelection`/`TInclude`, contrôle d'exactitude dans
le paramètre, arguments `FindManyArgs<K, S, I>` / `Select<K>` / `Include<K>` /
`OrderBy<K>` / `Where<K>`, résultat `FindResult<K, S, I>` calculé depuis
`Model<K>`, `Model<K>` lu sur la sortie du contrat), par-dessus la découverte
2 :

| `usage-check`, instanciations | base 0df2ebac | allégé, structurel | allégé + nommé |
| ----------------------------- | ------------- | ------------------ | -------------- |
| 50 `u-noarg`                  | 1 232 537     | 1 070 497          | 1 056 616      |
| 50 `u-select`                 | 1 116 105     | 954 065            | 1 078 144      |
| 50 `u-include`                | 1 267 176     | 1 106 182          | 1 152 484      |
| 50 `usage`                    | 1 300 115     | 1 139 121          | 1 194 866      |
| 200 `usage`                   | 4 556 375     | 3 921 291          | 5 642 306      |
| 200 `usage`, vérif. (s)       | 7,32          | 6,70               | 8,99           |

Banc TS6 à 50 (3 exécutions, charge 3,2–3,9) : éd.→diag base 2,17, nommé
2,15 (allégé seul 2,03) ; hover `q0` 199 → 191. À 200 (charge 2,7–3,7) : base 7,24, nommé 9,41 (+30 %), allégé seul 6,85 ;
froid 16,24 → 15,42, tas 2 512 → 2 435 Mio.

Cause : un argument nommé (`Select<"S0">`) ne connaît que le nom ; il doit
retrouver le schéma dans le registre (`RegisteredSchema<K>`, un `Extract` sur
l'union des N schémas enregistrés), alors que la signature structurelle lit
le contrat directement sur le receveur. Coût mesuré par nom recherché
(`p-reg10` → `p-reg50`) : 2,6 k instanciations et 3 ms à 50 schémas, 10,1 k et
9 ms à 200, soit O(N) par nom et O(N²) pour une application. Le profil
(piles d'appel) montre aussi que les contraintes nommées (`Select<K> |
undefined`) déclenchent, pendant l'inférence, le calcul de contrainte de base
de l'union du registre (`inferTypeArguments → hasNonCircularBaseConstraint`),
d'où la contrainte relâchée `object | undefined` du prototype.

## Tentatives sur la recherche par nom (règle d'arrêt)

| #   | Variante                                                                             | `p-reg` par nom, 50 / 200 | `usage` 50                   | Décision |
| --- | ------------------------------------------------------------------------------------ | ------------------------- | ---------------------------- | -------- |
| 0   | actuelle : `Extract<RegisteredSchemaUnion<K>, SchemaDefinition<K>>`                  | 2,6 k / 10,1 k            | 1 189 494                    | —        |
| 1   | table par intersection (`UnionToIntersection` de `{ [N]: S }`, clé `'~any'`)         | 3,5 k / 13,7 k            | 1 244 858                    | rejetée  |
| 2   | filtre par `className` d'abord, `SchemaDefinition<K>` ensuite                        | 2,6 k / 10,1 k            | 1 190 985                    | rejetée  |
| 3   | table calculée sur l'application (`[symbole]?: { [I in keyof TSchemas as Nom]: … }`) | —                         | 1 838 382 (200 : 15 172 872) | rejetée  |

## Autres constats pour l'ADR

- Sans arguments nommés, la surcharge `QueryBuilder` ne coûte rien
  (−417 instanciations) ; sa suppression est indépendante.
- Le comportement actuel (structurel, à préserver) a été relevé sur
  `examples/schema-form-d` : rejetés `select` dynamique (`Select<'Todo'>`),
  valeur `boolean`, objet non frais avec clé en trop, clause inconnue dans un
  littéral, `select` avec clé en trop, faute dans `include.tags.select`, faute
  dans `where` ; accepté un objet d'arguments non frais avec clé en trop. Une
  signature à un seul générique `TArgs` (prototype `named-args`) ne peut pas
  reproduire à la fois le rejet de la clause inconnue dans un littéral et
  l'acceptation de l'objet non frais : il faut garder l'inférence par
  propriété (`TSelection`, `TInclude`), et une contrainte relâchée pour que la
  faute `select` donne le message court sans le repli sur la contrainte.
- `Model<typeof Todo>`, `Select<typeof Todo>`, `Where<typeof Todo>` et
  `Item<typeof Todo>` s'impriment aujourd'hui avec l'argument déplié (≈ 588
  caractères) ; seul `CreateInput<typeof Todo>` a reçu l'alias conditionnel à
  l'étape 5.

## Options (décision de l'utilisateur)

1. **Garder la vérification allégée seule** (commit de la branche) : −12 %
   d'instanciations à 50, −14 % à 200, éd.→diag 2,18 → 2,03 s à 50 et
   7,31 → 6,85 s à 200, sans changement de contrat. Vérifications ciblées
   faites (voir « Preuves ») ; porte complète et audit DX non lancés.
2. **Message court sans nom** : supprimer la surcharge `QueryBuilder` et
   relâcher la contrainte de `TSelection`/`TInclude` dans la signature
   structurelle (exactitude dans le paramètre) ; la faute `select` nommerait
   alors la sélection structurelle, pas `Select<"Todo">`. Non mesuré.
3. **Signatures nommées** : demandent une recherche par nom en O(1). Aucune
   forme dérivée du type de l'application n'y arrive (tentatives 1–3) ; il
   faudrait une table nom → schéma écrite une fois (par exemple dans
   `Register`, ce qui change le contrat de l'ADR-0297) ou un autre mécanisme.
   À rouvrir seulement avec une hypothèse nouvelle.
4. **Abandonner l'ADR-0315** ou le réviser à partir de ces mesures.

## Preuves

- Mesures brutes : bloc-notes `s5b/` (`bench-lite.jsonl`, `bench-named5.jsonl`,
  `bench200-*.jsonl`, profils `p-*.txt`, `q-*.txt`, prototypes `F.*.d.ts`).
- `npx tsc -p packages/core/tsconfig.json --noEmit` : code 0 avec la
  vérification allégée.
- Sur le commit de la vérification allégée (paquets construits) :
  `yarn typecheck` code 0 ; `yarn vitest run --project types` code 0
  (« Test Files 116 passed (116) / Tests 232 passed (232) / Type Errors no
  errors ») ; `yarn vitest run --project e2e tests/e2e/schema-form-d-types.e2e.test.ts`
  code 0 (« Test Files 1 passed (1) / Tests 3 passed (3) »).
- Banc TS6 brut à 200 (3 exécutions alternées, médianes) : base/allégé
  éd.→diag 7,31/6,85, froid 16,35/16,33, schéma 7,35/6,74, tas 2 529/2 333 Mio ;
  base/nommé 7,24/9,41, froid 16,24/15,42, schéma 7,31/9,30, hover 199/191.
  TypeScript 7 non mesuré (arrêt avant implémentation).
- `examples/schema-form-d` : `tsc -p tsconfig.json` code 0 sur les paquets
  construits ; `tsconfig.source.json` : 20 erreurs, identiques sur la base
  (mélange `src`/`dist` de l'environnement, préexistant).

## Prochaine action vérifiable

Décision de l'utilisateur entre les options ; pour l'option 1, lancer la
porte complète (`validate:full`, `test:e2e:built`, audit DX contre
`../ub-step5b-baseline`, gardé construit pour cela) sur le commit de la
vérification allégée, puis supprimer le worktree de référence.
