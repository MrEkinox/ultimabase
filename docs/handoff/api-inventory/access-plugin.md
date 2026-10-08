# Fiche plugin : `@ultimabase/access-plugin`

Phase 1 du défi API ([plan](../api-challenge-plan.md)). Mesures sur l'application
sonde hors dépôt `node_modules/.cache/inventory-policy/src/app/*.ts`
(`post.ts` : règles « propriétaire », rôle éditeur, champs protégés), typée
avec `node_modules/.bin/tsc` strict/NodeNext/`exactOptionalPropertyTypes`, avec
et sans fichier Typegen.

## 1. Rôle et installation

Moteur officiel de politiques : décisions par opération, filtres de lignes
`where`, contrôles d'élément, restrictions de champs ; tout est monotone
(ET logique), Master contourne tout.

```ts
UltimaBase.use(accessPlugin()) // tout refusé par défaut
UltimaBase.use(accessPlugin({ default: true })) // tout autorisé par défaut
accessPlugin({
	default: {
		read: { one: true, many: true, count: false, exists: true },
		create: true,
		update: true,
		upsert: true,
		delete: true,
		schemaMutations: true,
	},
})
```

Une seule option, `default` (`packages/access-plugin/src/plugin.ts`) :

- Valeur par défaut : **tout refuser** (`denyByDefault`). Sûr, mais les deux
  exemples passent `{ default: true }` ; dans `examples/todo-backend` le fichier
  de schémas installe `accessPlugin()` et l'application `accessPlugin({ default: true })` :
  deux configurations du même plugin, la seconde seule compte au Runtime
  (`Application.Schema` n'est qu'un support de types,
  `packages/core/src/runtime/application/ultima-base.ts:136`).
- `default: true` est **dangereux** combiné à une règle détaillée sans `allow`
  (voir §3).
- Granularité incohérente avec les autres plugins : `schemaMutations` mélange
  les commandes de tous les plugins ; pas d'`instanceId` (Soft Delete en a un).

## 2. Ce qu'il ajoute aux schémas

- Option de schéma `access` : clés `read`, `create`, `update`, `upsert`,
  `delete` et une clé par mutation « request » des plugins (`softDelete`,
  `examples/minimal/src/schema.ts`).
- Option de champ `access` (champs stockés, objets imbriqués, champ virtuel
  entier) : `{ read?: boolean | { output, where, orderBy }, write?: boolean |
{ fill, replace, clear } }` ; pour une relation `{ read?, write?: ({ change }) => … }`.
- Aides : `allowAll`, `denyAll`, `anyOf`, `allOf`, `not`, `allOperations`,
  `allMutations` (`src/authoring/utilities.ts`).
- Aucun champ, route ni opération.

## 3. API pour le développeur

Chaque famille accepte un booléen, une fonction `({ context }) => boolean`, ou
un objet détaillé :

| Famille             | `allow`                                             | `where` | `item`                                            |
| ------------------- | --------------------------------------------------- | ------- | ------------------------------------------------- |
| `read`              | booléen, callback ou `{ one, many, count, exists }` | oui     | —                                                 |
| `create`            | oui                                                 | —       | `({ item })`                                      |
| `update` / `delete` | oui                                                 | oui     | `({ item, originalItem })` / `({ originalItem })` |
| `upsert`            | oui                                                 | oui     | `({ mode, item, originalItem })`                  |

- `where` : objet `WhereInput` ou callback `({ context, where }) =>`
  `WhereBuilder | WhereInput | undefined`. **`undefined` = aucune
  restriction**, et `where` ne peut pas refuser (le README renvoie le refus à
  `allow`).
- `context` (`AccessContext`) : `access`, `requestId`, `signal`, `source`,
  `getValue`, `hasCapability`. Pas d'utilisateur courant : importer
  `passwordPrincipal` du plugin d'authentification.
- Règles de champs : `read` détaillé exige les **trois** clés `output`,
  `where`, `orderBy` ; `write` détaillé exige `fill`, `replace`, `clear`
  (`src/authoring/contracts.ts`, propriétés non optionnelles).

Cas « propriétaire seulement » (sonde, 10 lignes pour `update`) :

```ts
update: {
	where: ({ context, where }) => {
		const user = context.getValue(passwordPrincipal)?.user
		return user === undefined ? undefined : where.eq('author', user.id)
	},
	allow: anyOf(({ context }) => context.getValue(passwordPrincipal) !== undefined, hasRole(Editor)),
},
```

**Piège de sécurité (lecture du code, non exécuté)** : sans `allow`, la
décision d'opération retombe sur le défaut du plugin
(`assertOperationRules` → `defaultDecision`,
`src/runtime/rule-evaluation.ts`). Avec `accessPlugin({ default: true })`
(configuration des deux exemples), `update: { where }` qui renvoie `undefined`
pour un anonyme laisse **tout anonyme modifier toutes les lignes**. La règle ne
fait que restreindre, mais le développeur croit avoir écrit « propriétaire
seulement ».

Comparaison :

- Parse : CLP par classe (`find`, `get`, `create`, `update`, `delete`,
  `addField`), `requiresAuthentication`, `pointerFields` (« propriétaire » en
  une ligne : `readUserFields: ['author']`) ; ACL par objet.
- Payload : `access.update: ({ req: { user } }) => ({ author: { equals: user.id } })`
  — une fonction qui retourne `false` **ou** un filtre ; même forme partout.
- Prisma/ZenStack : `@@allow('update', auth() == author)`.
- Ici : deux concepts (`allow` et `where`) pour un même besoin, et deux systèmes
  de sécurité de ligne qui se recouvrent (Access `where` et ACL).

## 4. Frictions mesurées

| Cas                                                                     | Résultat                                                                                                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access: { read: true }` **sans** fichier généré (sonde `probes/p1.ts`) | `TS2345 … not assignable to parameter of type 'never'` sur tout l'objet ; même un booléen statique exige Typegen                                                       |
| Access de champ seul, sans génération                                   | compile, types exacts                                                                                                                                                  |
| Avec génération : `where.eq('publishd', true)`                          | `Argument of type '"publishd"' is not assignable to parameter of type 'WhereBuilderTarget<SchemaReference<"Post">, "eq">'` (198 car., ligne exacte, pas de suggestion) |
| Avec génération : clé inconnue `softDelet`                              | `TS2561 … Did you mean …` mais 518 car. (décrit tout le type de mutation)                                                                                              |
| `where.or([...])` (tableau)                                             | rejeté ; il faut `where.eq(...).or(where.eq(...))`                                                                                                                     |
| Génération périmée, nouveau schéma                                      | compile avec des types lâches (voir fiche Hooks)                                                                                                                       |

Hovers : `context` 34 car., `where` 56 car. (`WhereBuilder<SchemaReference<"Post">>`),
`hasRole` 78 car. + 277 de JSDoc ; `access` de champ 623 car. ; `access.softDelete`
526 car. (signature complète de `PluginSchemaMutationDefinition`).

## 5. Dépendances à Typegen

- Option de schéma `access` : descripteur `typegen: { generic: 'self', type:
'SchemaAccessOption' }` (`src/options.ts`, ADR-0280). Sans génération,
  l'option n'existe pas, y compris pour `true`/`false`.
- `WhereBuilder<TSchema>` et les `where` exacts : graphe généré (ADR-0281).
- Clés de mutations : `SchemaMutationAccessMap` lit
  `UltimaBaseGeneratedSchemaSurfaces` (`src/authoring/schema-mutations.ts`).
- Option de champ : source seule (`typegen: false`, `SourceFieldAccessOption`).
- Les schémas spécialisés (RoleSchema, PasswordUser) héritent de la même
  dépendance pour leur `access`.

## 6. Propositions

1. **`where` peut refuser.** Autoriser `false` en retour de `where` (refus) et
   interdire `undefined` dans le type, ou documenter et typer l'absence de
   restriction par `true`. Supprime le piège ci-dessus et un concept :

   ```ts
   // avant : where + allow
   update: { where: …undefined…, allow: ({ context }) => … }
   // après : une seule fonction, style Payload
   update: ({ context, where }) => context.principal === undefined ? false : where.eq('author', context.principal.id)
   ```

   Compatible « ne fait que restreindre » : `false` est un ET avec faux.

2. **Sujet neutre** `context.principal` (même proposition que Hooks), fourni
   par la capacité Core neutre déjà utilisée par ACL ; aucun lien vers un
   plugin d'authentification.
3. **Forme statique sans Typegen.** Les formes booléennes et `{ allow: bool }`
   ne dépendent pas du schéma : les typer depuis la source (comme `softDelete`)
   et réserver le graphe aux callbacks, au lieu de `never` sur tout l'objet.
4. **Règles de champ partielles.** Rendre `output/where/orderBy` et
   `fill/replace/clear` optionnels (omission = pas de restriction, cohérent avec
   « les champs restent disponibles jusqu'à une déclaration »).
   Avant : `read: { output: f, where: true, orderBy: true }` ; après :
   `read: { output: f }`.
5. **Raccourci propriétaire** optionnel : `owner: 'author'` au niveau de la
   famille (filtre `author = principal`, refus si anonyme), équivalent des
   `pointerFields` de Parse, exprimé avec les mécanismes génériques.
6. **Défaut** : garder le refus par défaut mais émettre un diagnostic au
   démarrage listant les schémas sans règle (le refus silencieux pousse à
   `default: true`).

## 7. Note sur la grille

Échelle 1 (mauvais) à 5 (excellent) ; pour le coût de migration, 5 = faible.

| Critère                | Note | Justification                                                                |
| ---------------------- | ---- | ---------------------------------------------------------------------------- |
| Sans génération        | 1    | même `access: { read: true }` exige le fichier généré                        |
| Colocalisation         | 5    | règles dans le schéma et le champ                                            |
| Concision              | 2    | propriétaire = 10 lignes, `allow` + `where`, jeton d'auth importé            |
| Une forme par concept  | 2    | `allow`/`where`/`item`, `read.allow` sous-objet, Access et ACL se recouvrent |
| Révélation progressive | 3    | booléens simples ; mais défaut « tout refuser » silencieux                   |
| Erreurs                | 2    | `never` sans génération ; clés inconnues > 500 car.                          |
| Hovers                 | 4    | `context`/`where` courts ; mutations de plugin verbeuses                     |
| Performance TypeScript | 4    | non mesurée à l'échelle ; `where` exact coûteux (ADR-0281)                   |
| JavaScript             | 5    | compilateur Runtime valide les déclarations                                  |
| Coût de migration      | 3    | Access, Roles (`hasRole`), RoleSchema, exemples, site                        |
