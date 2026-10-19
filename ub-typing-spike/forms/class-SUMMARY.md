# Famille « classes actuelles » : synthèse (E1, E2, E3 + micro-test M)

Détails : `e1-annotated/RESULTS.md`, `e2-this-with/RESULTS.md`,
`e3-static-block/RESULTS.md`, `m-string-dsl/RESULTS.md`. Même Core (sauf l'entrée des
règles), mêmes plugins, même fixture (TodoUser par `PasswordUserSchema`, TodoRole par
`RoleSchema`, Todo avec `.softDelete()`, Tag ; cycles dans les deux sens, deux sauts).

## Tableau comparatif

| Critère | E1 options annotées | E2 `this.with` | E3 bloc statique |
| --- | --- | --- | --- |
| Compilation | 0 erreur | 0 erreur (avec `with<TSelf>(this: TSelf, …)`) | 0 erreur |
| Fautes sur la ligne | 7/8 (`mappedBy` à l'enregistrement) | 7/8 | 7/8 |
| Faute `acess` | 147 car. + 6 `any` | 274 car. + 6 `any` | **84** car. + 6 `any` |
| Hover `where` / croisé / `item` | 44 / 47 / 22 | 44 / 47 / 22 | 44 / 47 / 22 |
| Hover entrée des règles | `options` 45 | `options` 49, `.with(` 407 | `this.access(` **96** |
| Complétion des règles | clés `access, acl, hooks, postgres` dans l'objet | idem dans `this.with({` | méthodes après `this.` (+ `Function`, requêtes) |
| Nom écrit | 3 fois | 2 fois | 2 fois |
| Boilerplate par application | alias `Options` | aucun | aucun |
| JavaScript | JSDoc `@type` obligatoire | même code, typé par `checkJs` | même code, typé par `checkJs` |
| `isolatedDeclarations` (fixture) | TS9021 ×12 | TS9021 ×12 + TS9012 par schéma | TS9021 ×12 |
| Vérif. des règles à l'enregistrement | oui (type de `options`) | oui (`SchemaRules<typeof X>`, même classe) | non (effets de bord) |
| Scellement | gel après enregistrement | gel après enregistrement | méthodes qui lèvent après enregistrement (exécution seulement) |
| Check indicatif N = 10 | 0,29 s / 37 786 inst. | 0,32 s / 39 153 | 0,34 s / 37 484 |

## Résultats communs à la famille

- **Type d'instance = modèle.** La signature de construction de la base renvoie le
  modèle calculé des champs : `const one: Todo | null = await Todo.findOne(...)` compile
  et `item` s'affiche `Todo` (22 caractères au lieu de 427 en E). Utilisable pour les
  trois formes.
- **`.softDelete()` sur l'expression de base** : méthode de forme apportée par le plugin
  (emplacement générique, Core ne la nomme pas), champ `isDeleted` visible des règles ;
  retirée, `item.isDeleted` → TS2339 sur la ligne. Infobulle de la méthode longue (699).
- **Fabriques comme bases** : `App.RoleSchema(...)`, `App.PasswordUserSchema(...)` ;
  `signUp` typé par le schéma ; « exactement un » schéma par fabrique vérifié à
  l'enregistrement (deuxième et absent).
- **Anti-Active Record** : méthode ou propriété ajoutée dans le corps (statique ou
  d'instance) refusée à `new App` avec un message qui nomme chaque membre (TypeScript
  et exécution). Les unions de messages s'affichaient par leur alias ; il a fallu les
  concaténer (`JoinMessages`).
- **Piège `this` polymorphe** : un membre statique hérité lie `this` à la base, pas à la
  classe ; d'où `e-class-configure` à 639. E2 et E3 utilisent `this: TSelf` générique.

## Lecture

- **E3** donne les messages et infobulles les plus courts et la meilleure
  découvrabilité, mais ses règles sortent du système de types (aucun contrôle global,
  scellement seulement à l'exécution).
- **E2** garde les infobulles courtes d'E sans alias ni annotation, marche tel quel en
  JavaScript et reste vérifiable à l'enregistrement ; il dépend de deux comportements
  peu documentés de TypeScript et le message `acess` est long.
- **E1** est la plus robuste (aucune inférence) mais demande l'alias, l'annotation
  (oubliable), le nom trois fois et JSDoc en JS.
- **M (chaînes)** : faisable pour les requêtes croisées, mais cibles vérifiées seulement
  à l'enregistrement avec un message illisible, registre obligatoire dont l'oubli
  désactive la vérification sans erreur. À écarter.

## Ce qui n'a pas été fait

Aucun banc de mesure. Par erreur, `tools/bench.mjs` a été lancé une fois sur
`e1-annotated/gen/e1-annotated-10` (sortie jetée, aucun chiffre utilisé). Les chiffres
« check » ci-dessus viennent d'une seule exécution `--extendedDiagnostics` à N = 10,
autorisée et purement indicative.
