# Famille « règles séparées » : K, K′, L

Détails : `k-rules-list/RESULTS.md`, `k-statements/RESULTS.md`, `l-app-rules/RESULTS.md`.
Même modèle de Core pour les trois (copie de `lib-f/types.ts` + `core.ts` réécrit), mêmes
plugins (une entrée de règles, une option de forme `softDelete` dans `define`, deux fabriques),
même fixture (TodoUser/TodoRole/Todo/Tag, cycles dans les deux sens, deux sauts), même runtime
exécutable (Node exécute la fixture TypeScript telle quelle).

## Tableau comparatif

| Critère                                         | K (constante + liste)                                                           | K′ (instructions, scellé)                                                               | L (règles dans `new App`)                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Compilation fixture / générés 10-50-200         | 0 / 0                                                                           | 0 / 0                                                                                   | 0 / 0                                                                   |
| Cycles (TS7022…)                                | aucun par construction                                                          | aucun par construction                                                                  | aucun ; **cycle** si `Register { app }`                                 |
| 8 fautes : détectées / sur la ligne             | 8 / 7                                                                           | 8 / 7                                                                                   | 8 / 7                                                                   |
| `mappedBy`                                      | à l'enregistrement, TS2719 illisible                                            | idem                                                                                    | idem                                                                    |
| Hover `where` sans / avec registre              | 824 / **39**                                                                    | 903 / **39**                                                                            | 824 / **39** (registre par tuple `as const`)                            |
| Hover point d'entrée des règles (avec registre) | `.rules(` 446 ; `todoRules` 36                                                  | `Todo.access(` **57**                                                                   | `Todo: {` 117 ; `rules: {` 1 263                                        |
| Complétion des règles des plugins installés     | `X.rules({` → `access, acl, hooks, postgres`                                    | **`Todo.` liste les méthodes des plugins** + JSDoc                                      | `rules: {` → className ; `Todo: {` → règles                             |
| Oubli des règles                                | type (couverture exigée) + démarrage (fichier:ligne)                            | impossible dans le module du schéma ; perte silencieuse si module à part jamais importé | non détecté (entrées facultatives)                                      |
| Doublon                                         | type + démarrage                                                                | exécution seulement                                                                     | impossible (clé d'objet)                                                |
| Règles sans schéma                              | type + démarrage                                                                | sans objet                                                                              | type (clé en trop) + démarrage                                          |
| Règle après enregistrement                      | sans objet (données inertes)                                                    | **exception** (scellé)                                                                  | sans objet                                                              |
| Colocalisation                                  | même fichier, 1 ligne d'écart                                                   | même fichier                                                                            | **autre fichier** ; fichier d'application de 3 010 lignes à 200 schémas |
| Lignes développeur (fixture)                    | 106                                                                             | **95**                                                                                  | 108                                                                     |
| Concepts en plus de `define`                    | `X.rules`, liste `rules` (parallèle à `schemas`), `X.rules({})` si aucune règle | méthode par plugin, scellement                                                          | clés className                                                          |
| `isolatedDeclarations` (fixture)                | 19 TS9010 + 8 TS9007 ; règles annotables (`SchemaRules<'Tag'>`)                 | 14 + 8 ; rien à annoter pour les règles                                                 | 14 + 8                                                                  |
| Immutabilité                                    | oui (règles = valeur)                                                           | **non** jusqu'à `new App`                                                               | oui                                                                     |
| Instanciations à 10 (indicatif)                 | 30 410                                                                          | 31 386                                                                                  | 33 179                                                                  |

## Constats communs

- Séparer les règles de l'appel générique qui infère les champs supprime le risque de cycle
  sans dépendre du chemin rapide « appel final non générique » de D : la constante de schéma
  ne contient aucun callback de règle.
- Options de forme dans `define` : `softDelete: true` → `isDeleted` typé via un emplacement
  générique `SchemaShapeHKT`. Une faute (`sofDelete`) est signalée sur la ligne mais fait
  perdre les champs inférés : ~29 diagnostics en cascade (tout argument invalide de `define`).
- Hovers courts (39/42/38) seulement avec un registre ; K et K′ acceptent le registre
  d'application de D, L ne l'accepte pas (cycle) et exige un tuple `as const` déclaré.
- Typage des requêtes du modèle (`lib-f`) : `select: { titel: true, dueAt: true }` (faute à
  côté de clés valides) n'est pas signalé sur la ligne ; à corriger dans Core quelle que soit la forme.
- `mappedBy` et fabrique en double : erreur à `new App` sous forme de TS2719 (« Two different
  types with this name exist ») ; le texte utile est dans l'élaboration.

## Lecture

- **K′** est la plus découvrable (méthodes des plugins sur le schéma, JSDoc du plugin, hover 57) et la plus courte, mais tout son contrôle (doublon, ordre, règle tardive) est à
  l'exécution et elle rend le schéma mutable jusqu'à l'enregistrement.
- **K** garde l'immutabilité et le contrôle au typage (oubli, doublon, orphelin), au prix
  d'une liste parallèle à `schemas` et de trois écritures de chaque `xRules`.
- **L** est la moins adaptée : colocalisation perdue, fichier unique qui croît sans limite,
  registre d'application impossible, typage fragile (piège du type mappé `as`).
