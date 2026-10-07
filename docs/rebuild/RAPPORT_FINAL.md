# Rapport final de la reconstruction d'UltimaBase

Date : 2026-10-08. Référence fonctionnelle : `ultimadatabase` au commit
`0ae7767f7b75dd6c640ca547f9ff85b60f46e69d` (importé tel quel comme premier commit
`edf3032` de ce dépôt). Reconstruction : branche `main` de
`claude-ultimabase`, état validé `f6b0f5a`. Rien n'a été poussé ni publié.

## 1. Résumé

- Les 23 packages publiés, Core compris, ont été réécrits en interne, un
  périmètre à la fois, avec les tests de la référence comme oracle.
- Le code de production passe de **114 742 à 104 141 lignes non vides (−9,2 %)**
  et de 731 à 622 fichiers. Les tests restent identiques (127 477 lignes), de
  même que les 16 dépendances runtime publiées.
- Sur machine calme, **`yarn validate:full`, `yarn test:e2e` et `yarn test:pack`
  passent sur la référence et sur la reconstruction**, avec exactement les
  mêmes nombres de tests (couverture comprise).
- La DX TypeScript est identique : l'audit éditeur compare 35 775
  enregistrements (hovers, complétions, diagnostics, déclarations). Il trouve
  2 différences, toutes deux invisibles.
- **11 écarts de comportement** sont consignés. Tous touchent des entrées
  forgées (clés `__proto__`, accesseurs piégés, JavaScript non typé) et ferment
  un défaut de la référence. Aucun n'est atteignable par une entrée testée.

## 2. Installation et validation

```sh
cd /Users/mrekinox/Desktop/claude-test/claude-ultimabase
corepack enable
yarn install --immutable
yarn validate:full   # format, typecheck, tests, lint, build, couverture, check:issues, constraints, site
yarn test:e2e        # build, puis e2e et postgres-e2e (Docker requis)
yarn test:pack       # build, puis audits des archives publiées
node tooling/rebuild/dx-audit.mjs <racine-référence-construite> .   # parité éditeur
node tooling/measure-rebuild.mjs .                                  # mesure reproductible
```

La correspondance commande par commande entre la référence et la
reconstruction est dans [VALIDATIONS.md](VALIDATIONS.md). Les commandes, la
configuration Vitest, `tooling/{vitest,ci,issues,documentation,tsconfig}` et
tous les `package.json` sont inchangés depuis `edf3032`.

## 3. Résultats exacts (machine calme, 2026-10-08)

Exécutions séquentielles sur la même machine de 12 cœurs : la référence
(clone `ub-ref`, 00 h 03–00 h 27), puis la reconstruction (00 h 27–00 h 49).
La charge moyenne était de 2,6 au départ. Les deux arbres étaient propres
avant et après.

| Commande                                            | Référence                             | Reconstruction                        |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| `yarn validate:full`                                | code 0                                | code 0                                |
| `yarn test` (unit, types, performance)              | 561 fichiers, 2 713 tests OK          | 561 fichiers, 2 713 tests OK          |
| `yarn lint` (core / packages / workspace)           | 0 erreur ; 53 / 29 / 1 avertissements | 0 erreur ; 54 / 18 / 1 avertissements |
| `yarn test:coverage`                                | 640 fichiers, 2 977 tests OK          | 640 fichiers, 2 977 tests OK          |
| Couverture (instr. / branches / fonctions / lignes) | 91,26 / 84,75 / 96,58 / 91,82 %       | 92,31 / 86,11 / 97,33 / 92,90 %       |
| `yarn check:issues`                                 | 22/22                                 | 22/22                                 |
| `yarn constraints`                                  | OK                                    | OK                                    |
| `yarn website:validate`                             | 66/66                                 | 66/66                                 |
| `yarn test:e2e`                                     | 102 fichiers, 410 tests OK            | 102 fichiers, 410 tests OK            |
| `yarn test:pack`                                    | 32 fichiers, 173 tests OK             | 32 fichiers, 173 tests OK             |
| postgres-e2e, 3 exécutions de plus                  | 191/191 ; **1 échec** ; 191/191       | 191/191 ; 191/191 ; 191/191           |
| Audit DX                                            | n/a                                   | 2 différences invisibles sur 35 775   |

Les avertissements de lint sont tous des `max-lines` (seuil d'avertissement à
400 lignes). Aucun fichier de production ne dépasse le budget de 600 lignes.

### Échecs connus et leur qualification

- **Course du module runner de Vitest** (`Schema ExampleArticle has not been
compiled by an application`) : elle est **préexistante dans la référence**.
  Elle est apparue sur la référence pendant cette validation au calme, et
  dans 1 exécution complète sur 8 sur chaque arbre pendant l'investigation.
  La cause est prouvée par injection de délai, à 3/3 sur les deux arbres : les
  `vi.importActual` parallèles évaluent deux fois `examples/minimal/src/schema.ts`.
  Les tests n'ont pas été modifiés.
- **Timeouts sous charge** (`create-app-packed` à 120 s,
  `core-archive-declarations` à 10 s, budget de performance `hybrid-authoring`
  de Typegen, cascades à 5 s en postgres-e2e) : ils sont observés sur les deux
  arbres quand plusieurs agents partageaient la machine. **Tous passent au
  calme**, sur les deux arbres.

### Validations non exécutées

- Les tests navigateur du site (`website:test`) ne font pas partie de
  `validate:full` et n'ont été lancés sur aucun des deux arbres.
- L'audit DX ne compare ni l'aide à la signature, ni le détail des entrées de
  complétion, ni les diagnostics syntaxiques, ni le `cli.d.ts` de create-app,
  qui n'est pas exporté ([DX-AUDIT.md](DX-AUDIT.md)).

## 4. Matrice des capacités

La matrice complète, avec 34 lignes (21 concepts d'architecture et 13
capacités de packages), est dans [CAPABILITIES.md](CAPABILITIES.md). Pour
chaque capacité, elle donne les modules propriétaires, 4 ou 5 fichiers de
tests de la référence restés inchangés (avec leur projet Vitest), les preuves
propres à la reconstruction et les écarts applicables. Toutes les lignes sont
validées par l'exécution au calme ci-dessus.

Preuves transversales :

- **Oracle de tests inchangé.** Aucun fichier sous `tests/` ni
  `packages/*/tests/`, et aucun `*.test-d.ts`, n'a changé. 27 tests internes
  placés à côté du code ne diffèrent que par leurs chemins d'import, après
  fusion ou découpage de modules. La commande de contrôle figure dans
  CAPABILITIES.md et ne trouve aucune ligne de test modifiée hors imports.
  Une modification de corps de test faite par un agent (ACL) a été détectée
  puis annulée.
- **Comparaisons d'exécution côte à côte avec la référence**, documentées
  dans chaque `REBUILD.md`. Exemples :
  - core-query : 303 cas ;
  - roles : 8 622 entrées aléatoires ;
  - validation : 3 000 ;
  - create-app : 196 608 rendus de projets et 20 000 sélections ;
  - graphql : SDL identique sur 85 applications ;
  - password-auth : bundles comparés en profondeur.
- **Déclarations publiques** : l'audit DX couvre les 23 packages, 1 739
  exports, 6 270 membres, 21 294 hovers d'usage, 1 594 sites de complétion et
  256 fichiers de diagnostics.

## 5. Écarts

### Écarts de comportement ([DIFFERENCES.md](DIFFERENCES.md))

| Zone                                              | Écart                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| hooks-plugin                                      | Une branche de hook nommée `__proto__` (accessible seulement via `JSON.parse`) est rejetée au démarrage au lieu d'écrire sur `Object.prototype`. |
| core `enumField`                                  | Une clé propre `__proto__` est conservée au lieu d'être perdue.                                                                                  |
| core `decimalField(null)` (JS non typé)           | `TypeError: field options must be an object` au lieu d'une erreur du moteur JS.                                                                  |
| core `exposeOperations` / `exposeSchemaMutations` | N'exposent plus à l'exécution les accès internes qui contournaient les contrôles de transaction. Le type est inchangé.                           |
| postgres-plugin                                   | Un champ `__proto__` reste une clé ordinaire au lieu d'être silencieusement perdu.                                                               |
| access-plugin, `where` statique                   | Une clé `__proto__` vidait le filtre privé, ce qui ouvrait l'accès ; elle est désormais rejetée par Core.                                        |
| access-plugin, branches de mutation               | Une branche `__proto__` ignorée, qui ouvrait l'accès, est désormais rejetée à la compilation.                                                    |
| http-plugin                                       | Chaque valeur d'en-tête est lue une seule fois (faille TOCTOU fermée).                                                                           |
| graphql-http                                      | `path` est lu une seule fois (faille TOCTOU fermée).                                                                                             |
| testing, callback typegen `verify`                | `this` vaut `undefined` au lieu d'un enregistrement interne.                                                                                     |
| testing, application de conformance               | Une seule sous-classe au lieu d'une chaîne imbriquée (profondeur de prototype).                                                                  |

### Différences non comportementales

- **Déclarations** : `access-plugin` n'importe plus `FrameworkError`, qu'il
  n'utilisait pas, et `roles-plugin` importe `Relation` sans l'utiliser. Ces
  deux imports ne modifient ni les hovers, ni les complétions, ni les
  diagnostics.
- **Contrôles retirés** : chacun l'a été parce qu'il était prouvé
  inatteignable, c'est-à-dire que la même entrée est déjà rejetée plus tôt. La
  preuve figure dans le `REBUILD.md` concerné, et le coordinateur l'a vérifiée
  pour Core, ACL, access, graphql et le pipeline.

### Défauts de la référence documentés mais conservés pour la parité

- pg-vector accepte les tableaux creux (`[1, , 3]`) et lit `dimensions` trois
  fois.
- core-query : un segment de chemin `constructor` remonte au prototype ;
  `transformQueryFilterInput` perd une clé `__proto__` ; un nom de champ
  `Symbol` dans `count`/`isEmpty` donne un filtre toujours vrai (JS non typé).
- Core : `resolveCapturedFieldMap` perd un champ déclaré sous la clé calculée
  `['__proto__']`.
- create-app : `resolveSelection` ne valide pas `language`, `starter`,
  `database` ni `packageManager` pour les appelants JS non typés.
- roles : le code `ROLE_DELETE_BULK_UNSUPPORTED` est déclaré mais jamais levé.

## 6. Mesures avant / après (`node tooling/measure-rebuild.mjs`)

| Catégorie                    |                    Référence |                                  Reconstruction |
| ---------------------------- | ---------------------------: | ----------------------------------------------: |
| Production                   | 114 742 lignes, 731 fichiers |                    104 141 lignes, 622 fichiers |
| Tests                        | 127 477 lignes, 764 fichiers |                    127 477 lignes, 764 fichiers |
| Configuration et outillage   |                 6 192 lignes |    7 790 lignes (+ audit DX, mesure, worktrees) |
| Documentation                |                84 242 lignes | 89 115 lignes (+ `docs/rebuild`, `REBUILD*.md`) |
| Dépendances runtime publiées |                           16 |                                 16 (identiques) |

| Package                |  Avant |  Après |   Écart |
| ---------------------- | -----: | -----: | ------: |
| core                   | 63 660 | 59 126 |  −7,1 % |
| postgres-plugin        |  9 307 |  7 966 | −14,4 % |
| graphql-plugin         |  7 620 |  6 661 | −12,6 % |
| access-plugin          |  4 438 |  3 653 | −17,7 % |
| rest-plugin            |  4 320 |  3 728 | −13,7 % |
| hooks-plugin           |  4 145 |  3 447 | −16,8 % |
| password-auth-plugin   |  3 567 |  3 366 |  −5,6 % |
| acl-permissions-plugin |  3 188 |  2 694 | −15,5 % |
| typegen                |  3 018 |  2 733 |  −9,4 % |
| http-plugin            |  2 338 |  2 080 | −11,0 % |
| roles-plugin           |  2 192 |  2 043 |  −6,8 % |
| create-app             |  1 656 |  1 557 |  −6,0 % |
| testing                |  1 243 |  1 162 |  −6,5 % |
| plugin-kit             |    778 |    722 |  −7,2 % |
| graphql-yoga-plugin    |    731 |    726 |  −0,7 % |
| soft-delete-plugin     |    710 |    709 |  −0,1 % |
| validation-plugin      |    663 |    622 |  −6,2 % |
| server-hono-plugin     |    431 |    424 |  −1,6 % |
| pg-vector-plugin       |    202 |    201 |  −0,5 % |
| apollo-sandbox-plugin  |    197 |    192 |  −2,5 % |
| graphiql-plugin        |    188 |    183 |  −2,7 % |
| graphql-http           |     76 |     72 |  −5,3 % |
| shared                 |     74 |     74 |     0 % |

Performances : sur les deux arbres, les mêmes tests de performance passent
avec les mêmes budgets. Les durées des suites sont comparables, par exemple
`yarn test:e2e` en 99,3 s contre 98,2 s, et la génération Typegen prend
environ 11 ms dans les deux cas. Aucun gain de performance n'est revendiqué.

## 7. Simplifications réelles

La réduction vient de la suppression de mécanismes, pas d'un formatage plus
compact (Prettier est imposé). Les motifs récurrents, détaillés module par
module dans chaque `REBUILD*.md`, sont les suivants :

- **Une seule implémentation par contrôle.** Core regroupe en un module les
  vérifications d'objets aux clés exactes : 37 paires de contrôles et 9
  boucles écrites à la main y sont remplacées. Il partage aussi les grammaires
  d'identifiants, les copies d'identité des plugins et la construction des
  issues de validation.
- **Une seule boucle d'exécution au lieu de paramètres propagés de module en
  module** : le dispatcher de hooks-plugin (6 modules en 1), l'état ACL unique,
  la `AccessScope` d'access-plugin, le contexte de compilation partagé de
  graphql-plugin et les transports unifiés de rest-plugin.
- **Des tables au lieu de branches parallèles** : familles de capacités
  protégées, phases de hooks, conditions de create-app, opérateurs de filtres
  Typegen.
- **Moins de modules et d'indirections.** Les fichiers de réexportation et
  les fonctions de transfert disparaissent, ainsi que les types et helpers à
  usage unique et les cales des interfaces gelées entre périmètres de Core.
  Core passe de 372 à 326 fichiers source de production.
- **Des copies sûres** : `Object.fromEntries` ou `Map` remplacent les
  affectations `obj[clé] = v` sur des clés venant des utilisateurs. Ce choix
  est à l'origine de la plupart des écarts listés plus haut, qui corrigent
  tous un défaut de la référence.
- **Moins de casts** : environ 22 casts retirés dans postgres-plugin, 17 dans
  access-plugin, 13 dans graphql-plugin, 53 lignes dans core-query et 46 dans
  core-schema. Aucun `any` n'a été ajouté.

Ce qui n'a délibérément **pas** été simplifié :

- **Le contrat public.** Types, JSDoc, ordre des validations et messages
  restent inchangés. Ils représentent souvent plus de 40 % du code d'un
  package, d'où des gains faibles sur les petits packages.
- **Les déclarations de types qui déterminent le texte des hovers.** Une
  première série de réécritures avait renommé ou intégré des alias privés,
  pour 299 hovers visibles différents que les tests ne détectaient pas. Elles
  ont été restaurées depuis la référence (environ +525 lignes, dont +432 dans
  Core). La DX passe avant la réduction de code.
- **L'historique documentaire** (`issues/`, `docs/plans/`, `CURRENT_PLAN.md`,
  `HISTORIQUE_SUPPRESSIONS.md`). Sur votre décision, il est archivé en place et
  marqué comme tel, et ses tests de processus restent intacts.

## 8. Documents de référence

- [HANDOFF.md](HANDOFF.md) : méthode, déroulement et décisions.
- [PROTOCOL.md](PROTOCOL.md) : règles de réécriture.
- [VALIDATIONS.md](VALIDATIONS.md) : correspondance et résultats des validations.
- [CAPABILITIES.md](CAPABILITIES.md) : matrice des capacités et oracle de tests.
- [DIFFERENCES.md](DIFFERENCES.md) : écarts de comportement.
- [DX-AUDIT.md](DX-AUDIT.md) : audit éditeur.
- `ARCHITECTURE.md` et `docs/current-architecture.md` : architecture reconstruite.
- `packages/*/REBUILD*.md` : conception, preuves et validations par périmètre.
