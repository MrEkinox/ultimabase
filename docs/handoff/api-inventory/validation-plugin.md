# Fiche plugin : `@ultimabase/validation-plugin`

Phase 1 du défi API ([plan](../api-challenge-plan.md)). Mesures sur
`node_modules/.cache/inventory-policy/probes/p5.ts` (sans Typegen, Zod 4) et
sur l'application sonde `src/app/*.ts`, typées avec `node_modules/.bin/tsc`
strict/NodeNext/`exactOptionalPropertyTypes`.

## 1. Rôle et installation

Validation applicative de champ par n'importe quel validateur
[Standard Schema V1](https://standardschema.dev) (Zod, Valibot, ArkType…),
exécutée une fois sur le candidat final de mutation, après les `resolveInput`
et la validation structurelle Core, avant persistance. Rejet seulement.

```ts
const App = UltimaBase.use(validationPlugin())
```

- **Aucune option** (`packages/validation-plugin/src/plugin.ts`) ; pas de
  validateur global, ni de validateur de schéma, ni de registre (choix
  documenté dans le README).
- Pas de lien vers un autre plugin ; s'appuie sur la garde finale de mutation
  de Core (`guardMutationInput`).
- Master ne contourne pas la validation (conforme aux invariants).

## 2. Ce qu'il ajoute aux schémas

- Option de champ `validation` sur les champs stockés et les propriétés
  d'objets imbriqués (pas sur les virtuels ni les relations).
- Rien au niveau schéma ; aucun champ, route ou opération.

Exemples réels : `examples/todo-backend/src/schema.ts`
(`validation: z.string().max(200)`, `z.array(z.string().min(1)).max(20)`,
`z.custom<Uint8Array>(…).refine(…)` pour un binaire),
`examples/minimal/src/schema.ts` (`z.string().min(2).max(200)`).

## 3. API pour le développeur

- `validation` reçoit la valeur **présente et non nulle** du champ ; `required`
  et la nullabilité restent des options Core.
- Le contrôle de type exige que l'entrée et la sortie du validateur soient
  compatibles avec la valeur canonique du champ (liste, objet, Pointer…).
- Runtime (`src/field-validation.ts`) :
  - synchrone seulement : une promesse (par exemple `refine(async …)`) est
    rejetée avec `INTERNAL_ERROR` (« async validation is not supported ») ;
  - **aucune transformation** : la sortie doit être égale à l'entrée.
    `z.string().trim()`, `z.coerce.*`, `.default()` ou `.transform()` passent
    le typage mais échouent à l'exécution avec `INTERNAL_ERROR`
    (« Field validator contract failed », `contractFailure`, testé dans
    `src/field-validation.test.ts`) au lieu d'une erreur de validation ;
  - échec ordinaire : `FrameworkError('VALIDATION_ERROR')` avec des issues
    `{ code: 'field.validation', message, path }` préfixées par le chemin du
    champ.
- Les incréments numériques sont validés sur la valeur projetée.
- Pas de validation entre champs (« fin après début ») : il faut un
  `beforeOperation` du plugin Hooks, qui dépend du fichier généré.
- Pas de validation asynchrone (unicité métier, appel externe) : idem Hooks.

Comparaison :

- Parse : pas de validation déclarative ; tout en `beforeSave`.
- Payload : `validate: (value, { data, siblingData }) => true | 'message'` par
  champ, avec accès aux voisins et asynchrone.
- Prisma + Zod (`zod-prisma-types`) ou Drizzle (`drizzle-zod`) : le schéma
  Zod est **dérivé** du modèle ; ici le développeur répète le type
  (`field.string({ required: true, validation: z.string()… })`).
- Standard Schema est un bon choix : aucune dépendance de fournisseur.

## 4. Frictions mesurées

| Cas (sans fichier généré)                                                                          | Résultat                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `z.string().min(1).max(200)`, `z.email()`, `z.array(…).max(5)`, `z.number().int()`, objet imbriqué | compile, types exacts                                                                                                                                                          |
| `z.string().trim()`                                                                                | compile ; échec Runtime `INTERNAL_ERROR` (transformation)                                                                                                                      |
| `z.string().refine(async …)`                                                                       | compile ; échec Runtime `INTERNAL_ERROR` (promesse)                                                                                                                            |
| `z.string().nullable()` sur un champ nullable                                                      | `TS2769 No overload matches this call … not assignable to parameter of type 'never'`                                                                                           |
| `field.string({ validation: z.number() })` (avec génération)                                       | même message : `Overload 1 of 2, '(options: never)' … not assignable to parameter of type 'never'` (107 car. + 4 lignes) ; aucune mention de « validation » ni du type attendu |
| Hover de `validation`                                                                              | 1 065 car. (structure interne `~standard`), sans JSDoc                                                                                                                         |
| Hover de `validationPlugin`                                                                        | 78 car. + 73 de JSDoc                                                                                                                                                          |

La faute est signalée sur l'appel `field.string(…)` (bonne ligne) mais le
message n'explique pas la cause.

Coût : 1 ligne par champ validé ; les exemples combinent souvent
`required: true` + `z.string()` + `hooks.resolveInput` pour la normalisation
(3 options pour « chaîne requise, rognée, ≤ 200 »).

## 5. Dépendances à Typegen

Aucune. L'option est déclarée `typegen: false` et typée depuis la source par
`SourceFieldValidationOption` / `FieldValidationCompatibility`
(`src/options.ts`, ADR-0280 la classe parmi les surfaces locales). Elle reste
exacte sans fichier généré. Seule la validation entre champs, qui passe par
Hooks, dépend de Typegen.

## 6. Propositions

1. **Erreur claire pour un validateur incompatible.** Remplacer la contrainte
   `never` par un type de diagnostic nommé :

   ```ts
   // avant
   Argument of type '{ validation: ZodNumber }' is not assignable to parameter of type 'never'.
   // après (type d'erreur porté par la contrainte)
   … not assignable to '{ validation: "validation must accept string, got number" }'
   ```

2. **Transformations : refuser au typage ou accepter explicitement.** Soit
   distinguer au type les validateurs dont la sortie diffère (impossible de
   façon générique avec Standard Schema), soit ajouter un mode explicite
   `normalize: z.string().trim()` exécuté pendant la résolution d'entrée (avant
   la validation structurelle, ordre Runtime conservé) et garder `validation`
   en rejet seul. Au minimum : `VALIDATION_ERROR` lisible au lieu
   d'`INTERNAL_ERROR`.
3. **Nullabilité** : accepter un validateur dont l'entrée inclut `null` (il ne
   reçoit jamais `null`, l'élargissement est sans risque) pour que
   `z.string().nullable()` réutilisé depuis un formulaire compile.
4. **Validation de schéma optionnelle**, typée par les champs déclarés
   (problème 2 du plan) :

   ```ts
   validation: z.object({ start: z.date(), end: z.date() }).refine(
   	(v) => v.end > v.start,
   )
   ```

   Elle couvrirait le cas courant aujourd'hui délégué à un hook. À arbitrer
   (le README l'exclut volontairement).

5. Ne pas dériver les types de champ du validateur : Standard Schema n'expose
   pas de structure ; un `field.zod()` lierait Core ou le plugin à une
   bibliothèque.

## 7. Note sur la grille

Échelle 1 (mauvais) à 5 (excellent) ; pour le coût de migration, 5 = faible.

| Critère                | Note | Justification                                                             |
| ---------------------- | ---- | ------------------------------------------------------------------------- |
| Sans génération        | 5    | entièrement source                                                        |
| Colocalisation         | 5    | validateur sur le champ                                                   |
| Concision              | 4    | 1 ligne par champ ; répétition avec `required`                            |
| Une forme par concept  | 4    | une option ; normalisation ailleurs (`hooks`)                             |
| Révélation progressive | 5    | aucune option de plugin                                                   |
| Erreurs                | 2    | `never` pour un validateur incompatible ; transformation = erreur interne |
| Hovers                 | 2    | 1 065 car. de structure `~standard`                                       |
| Performance TypeScript | 4    | vérification par champ ; non mesurée à l'échelle                          |
| JavaScript             | 5    | aucun besoin de types                                                     |
| Coût de migration      | 5    | changements locaux au plugin                                              |
