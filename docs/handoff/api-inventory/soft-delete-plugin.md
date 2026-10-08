# Fiche plugin : `@ultimabase/soft-delete-plugin`

Phase 1 du défi API ([plan](../api-challenge-plan.md)). Mesures sur
`node_modules/.cache/inventory-policy/probes/p3.ts` (sans Typegen) et sur
l'application sonde `src/app/post.ts` + `usage.ts` (avec Access et Hooks),
typées avec `node_modules/.bin/tsc` strict/NodeNext.

## 1. Rôle et installation

Suppression logique : un champ protégé `isDeleted`, un filtre monotone qui
cache les lignes supprimées à toutes les lectures et cibles (Master compris),
et deux modes par schéma.

```ts
UltimaBase.use(softDeletePlugin()) // défaut 'disabled'
UltimaBase.use(softDeletePlugin({ defaultMode: 'explicit' }))
```

Options (`packages/soft-delete-plugin/src/contracts.ts`) :

- `defaultMode: 'disabled' | 'replace-delete' | 'explicit'`, défaut
  `'disabled'` : installer le plugin ne change rien tant qu'aucun schéma ne
  l'active. Sûr. `examples/minimal` écrit quand même
  `softDeletePlugin({ defaultMode: 'disabled' })`, redondant.
- `instanceId` : **inutile pour une application**. Deux instances dans la même
  application échouent (`Ambiguous schema option owner for "softDelete"`,
  `src/plugin.test.ts`) ; une seule instance n'a pas besoin d'identifiant.
  Seul plugin de cette série à exposer cette option.
- Pas de dépendance vers Access, Hooks, REST ou GraphQL : ils découvrent la
  mutation générique.

## 2. Ce qu'il ajoute aux schémas

- Option de schéma `softDelete: false | 'replace-delete' | 'explicit'`
  (omission = `defaultMode`).
- Champ `isDeleted: boolean` (défaut `false`), sélectionnable, jamais
  inscriptible par l'appelant.
- Mode `replace-delete` : `deleteOne`/`deleteMany` écrivent la tombe ; même
  opération logique (Access `delete`, Hooks `delete`).
- Mode `explicit` : suppression physique conservée + commande
  `softDelete({ id, select })` sur la classe, le handle d'application et le
  modèle persisté ; REST `POST /api/v1/classes/{Schema}/{id}/soft-delete` ;
  GraphQL `softDelete{Schema}(input: { id })` ; Access `access.softDelete` ;
  Hooks `beforeOperation.softDelete` / `afterOperation.softDelete`.
- Les deux modes : `restore` et `purge`, Master seulement, sur la classe et le
  handle, sans route ni règle Access, avec hooks `restore`/`purge`.

Exemples réels : `examples/minimal/src/schema.ts` (`softDelete: 'explicit'` et
`'replace-delete'`, hooks d'audit), `examples/minimal/src/soft-delete.ts`
(`ExampleArticle.softDelete`, `article.softDelete`, `restore`, `purge`).

## 3. API pour le développeur

```ts
await Post.softDelete({ id, select: { id: true, isDeleted: true } })
await post.softDelete() // modèle persisté
await Post.restore({ id, select: { id: true } }, { useMasterKey: true })
await Post.purge({ id, select: { id: true } }, { useMasterKey: true })
```

- La commande `softDelete` n'exécute ni les règles ni les hooks `update` ou
  `delete` : elle a sa propre identité (`ultimabase.soft-delete.soft-delete`).
  Il faut donc la déclarer à part dans `access` (sinon elle tombe sur
  `default.schemaMutations`, refusé par défaut).
- Un second `softDelete` sur la même ligne répond « introuvable ».
- **Impossible de lister la corbeille**, même en Master : le prédicat
  `isDeleted = false` s'applique à toutes les lectures (README, « Private
  administration »). `restore` exige donc un identifiant connu par ailleurs.
- `where: { isDeleted: { eq: true } }` compile mais ne peut rien retourner.
- Exclusions V1 assumées (README) : pas de `deletedAt`, d'auteur, de raison,
  de cascade, de réutilisation d'unicité (un `slug` unique supprimé bloque sa
  réutilisation), de purge automatique, de suppression logique en masse ou
  imbriquée.

Comparaison :

- Payload 3 : `trash: true` sur une collection, `deletedAt`, requêtes
  `trash: true` pour lister la corbeille, restauration depuis l'admin.
- Prisma (extension client) : filtre `deleted: false` et `deletedAt` ; liste
  possible en retirant le filtre.
- Parse : rien d'intégré.
- Ici : sécurité plus forte (filtre protégé, monotone, compilé en SQL), mais
  pas d'administration de la corbeille.

## 4. Frictions mesurées

| Cas                                                                                | Résultat                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `softDelete`, `restore`, `purge`, `isDeleted` sans fichier généré (`probes/p3.ts`) | compile, types exacts ; `Off.softDelete` absent quand `softDelete: false` (vérifié par `@ts-expect-error`)                                 |
| `softDelete: 'explict'`                                                            | `Type '"explict"' is not assignable to type 'SoftDeleteSchemaOption'. Did you mean '"explicit"'?` (171 car., bonne ligne)                  |
| `access.softDelete` / `hooks.beforeOperation.softDelete`                           | n'existent qu'avec le fichier généré (options `access`/`hooks`)                                                                            |
| `isDeleted` dans `acl.default({ data })`                                           | présent dans `data` (champ de plugin visible par un autre plugin)                                                                          |
| Hover de `Doc.softDelete`                                                          | 1 235 car., expose `PluginSchemaMutationSchemaInput<SchemaClass<ConfiguredSchemaContract<{ readonly fieldBuilders: …`                      |
| Hover du résultat                                                                  | 922 car. (modèle avec `get`/`toJSON`)                                                                                                      |
| Hover de `access.softDelete` (avec génération)                                     | 526 car. (`PluginSchemaMutationDefinition<"ultimabase.soft-delete.soft-delete", "1.0.0", undefined, readonly [], "request", "update", …>`) |

Concision : 1 ligne de schéma ; 3 à 5 lignes pour l'Access de la commande
explicite dans la sonde.

## 5. Dépendances à Typegen

- Option `softDelete`, champ `isDeleted`, commandes : **source seule**
  (`typegen: false` dans `src/options.ts` ; commandes projetées par
  `PluginSourceSchemaMutations`), conformément à ADR-0280.
- Intégrations : `access.softDelete` et les hooks `softDelete`/`restore`/`purge`
  dépendent des options générées d'Access et Hooks (ADR-0280) ;
  `UltimaBaseGeneratedSchemaSurfaces[…]['schemaMutations']` porte leurs clés.
- `softDeleteNoInput` référence `PluginSchemaMutationNoInput` de Core pour
  Typegen (`src/contracts.ts`).

## 6. Propositions

1. **Lecture de la corbeille pour Master**, sans élargir les requêtes
   ordinaires : une commande de schéma Master seulement, comme `restore`.

   ```ts
   // avant : impossible
   // après
   await Post.findDeleted(
   	{ where: { title: { startsWith: 'Draft' } }, select: { id: true } },
   	{ useMasterKey: true },
   )
   ```

   Le filtre protégé reste monotone pour toutes les autres lectures.

2. **Horodatage** : `deletedAt: string | null` à la place ou en plus de
   `isDeleted` (tri, purge par âge, affichage). Option de schéma :
   `softDelete: { mode: 'explicit', timestamp: true }`.
3. **Retirer `instanceId`** (inutile, une instance par application) et
   **renommer les modes** pour le cas courant :

   ```ts
   // avant
   softDelete: 'replace-delete' | 'explicit'
   // après
   softDelete: true /* delete devient logique */ |
   	'command' /* ajoute softDelete() */
   ```

4. **Types** : exclure `isDeleted` des `where` publics (toujours `false`), ou
   documenter que le filtre est inutile.
5. **Unicité** : documenter le blocage des index uniques par les tombes ; plus
   tard, index partiels `WHERE NOT isDeleted` côté PostgreSQL (plugin
   PostgreSQL, pas Core).
6. **Hover** : nommer la signature (`SoftDeleteCommand<Post>`) au lieu
   d'exposer l'état du configurateur.

## 7. Note sur la grille

Échelle 1 (mauvais) à 5 (excellent) ; pour le coût de migration, 5 = faible.

| Critère                | Note | Justification                                                                       |
| ---------------------- | ---- | ----------------------------------------------------------------------------------- |
| Sans génération        | 4    | plugin entièrement source ; seules les intégrations Access/Hooks exigent le fichier |
| Colocalisation         | 5    | une option dans le schéma                                                           |
| Concision              | 5    | une ligne                                                                           |
| Une forme par concept  | 3    | deux modes aux noms obscurs ; `restore`/`purge` hors Access                         |
| Révélation progressive | 4    | désactivé par défaut ; `instanceId` superflu                                        |
| Erreurs                | 4    | erreurs locales avec suggestion                                                     |
| Hovers                 | 2    | 1 235 car. pour la commande                                                         |
| Performance TypeScript | 4    | non mesurée à l'échelle                                                             |
| JavaScript             | 5    | aucun type requis                                                                   |
| Coût de migration      | 4    | plugin seul, plus REST/GraphQL si nouvelle commande                                 |
