# Fiche plugin : `@ultimabase/acl-permissions-plugin`

Phase 1 du défi API ([plan](../api-challenge-plan.md)). Mesures sur
l'application sonde `node_modules/.cache/inventory-policy/src/app/post.ts`
(ACL par défaut dérivée des données et du principal) et `probes/p2.ts` (sans
Typegen), typées avec `node_modules/.bin/tsc` strict/NodeNext.

## 1. Rôle et installation

ACL par objet façon Parse : droits `read`, `update`, `delete` accordés au
public, aux authentifiés, à un principal exact ou à un rôle. Stockée dans un
champ JSONB indexé de la ligne et compilée en filtre SQL (pas de filtrage en
mémoire). Indépendante d'Access : les deux se combinent par ET.

```ts
UltimaBase.use(aclPlugin())
aclPlugin({ limits: { maxPrincipals: 100, maxRoles: 50 } }) // défauts
```

- Seule option : `limits` (défauts 100 principaux, 50 rôles,
  `packages/acl-permissions-plugin/src/acl-limits.ts`), surchargeable par
  schéma. Défaut sûr, option utile.
- Privilège `authority:elevate` déclaré pour la maintenance des références.
- Découvre le principal et les rôles par des capacités Core neutres ; aucun
  import d'un plugin d'auth ou de rôles. Cohérent avec les règles de domaine.

## 2. Ce qu'il ajoute aux schémas

- Option de schéma `acl: { default?, resolveInput?, limits? }`
  (`src/acl-option.ts`).
- Champ réservé **`acl: ACL`** ajouté automatiquement à tout schéma qui déclare
  l'option : requis en lecture, optionnel en création (rempli par `default`).
- Valeur immuable `ACL` : `grantPublic/revokePublic/setPublicPermissions`,
  idem `Authenticated`, `Principal(pointer, …)`, `Role(roleRef, …)`,
  `permissionsFor*`, `has*Permission`, `toJSON`, `ACL.fromJSON`.
- Codecs REST et GraphQL du champ ; aucune route ni opération.
- Événement post-commit `aclChangedEvent`, consommé par un plugin via
  `provideACLChangeObserver('id', onACLChange(handler))`.

Exemples réels : `examples/todo-backend/src/schema.ts`
(`acl: { default: new ACL().grantPublic('read').grantRole(TodoEditorRole, 'read', 'update') }`),
`examples/todo-backend/src/admin.ts` (`todo.acl.grantPrincipal(...)` puis
`updateOne`), `examples/minimal/src/schema.ts` (`resolveInput`).

## 3. API pour le développeur

- `default` : une `ACL` statique ou `({ data, principal, context }) => ACL`
  (synchrone ou async), évaluée pour chaque objet créé.
- `resolveInput` : `({ operation, data, currentData, update, inputAcl,
currentAcl, principal, context }) => ACL | undefined`. Sans lui, **aucune**
  ACL explicite n'est acceptée, même en Master.
- Remplacement d'ACL : seulement `updateOne` ou `updateMany` itemisé ; refusé
  pour `upsert` et les mises à jour ensemblistes, même en Master.
- Un non-Master ne peut jamais lire, filtrer, trier ni écrire le champ `acl`.
- Sans `default`, l'ACL vaut `new ACL()` : **personne** sauf Master ne voit
  l'objet. Sûr mais surprenant (Parse : lecture/écriture publiques par
  défaut si aucune ACL n'est fournie).
- Rôles : `grantRole(AppRole.role('editor'), …)` ; la correspondance exige le
  plugin Roles **et** un `resolveCurrent` sur le RoleSchema (voir fiche Roles).
  Dans `examples/todo-backend`, aucun `resolveCurrent` : la règle
  `grantRole(TodoEditorRole, …)` ne peut jamais s'appliquer à une requête non
  Master (lecture de `roles-plugin/src/role-access.ts`, `resolveMembership`
  retourne `undefined`).

Comparaison :

- Parse : `new Parse.ACL(user)`, `setPublicReadAccess`, `setRoleWriteAccess` ;
  l'ACL est un champ ordinaire que le client peut envoyer si autorisé. Ici,
  l'API est plus sûre (immuable, bornée, compilée en SQL) mais plus fermée.
- Pas de droit `create` (géré par Access) ni de `write` groupé : `'update',
'delete'` à répéter.
- Recouvrement conceptuel avec Access `where` : « propriétaire seulement » peut
  s'écrire des deux façons, avec des sémantiques différentes (ligne stockée
  contre règle calculée).

## 4. Frictions mesurées

Sonde `post.ts` (10 lignes pour `acl`) :

```ts
acl: {
	default: ({ principal, data }) => {
		const base = data.published ? new ACL().grantPublic('read') : new ACL().grantRole(Editor, 'read', 'update')
		return principal === undefined ? base : base.grantPrincipal(principal, 'read', 'update', 'delete')
	},
},
```

| Cas                                  | Résultat                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Sans fichier généré (`probes/p2.ts`) | l'option existe, mais `data.visibility` est `unknown` : `Type 'unknown' is not assignable to type 'string \| null'` |
| Avec fichier généré                  | `data` exact : `Readonly<Pick<PostItem, "isDeleted" \| "author" \| …>>` (117 car.)                                  |
| Champ ajouté par un autre plugin     | `data.isDeleted` (Soft Delete) apparaît dans `data` : correct mais non documenté                                    |
| `select: { acl: true }` hors Master  | compile ; le Runtime le refuse pour tout non-Master (incohérence type/réalité)                                      |
| Hover de l'option `acl`              | 713 car. ; `principal` 47 car. (`PointerValue \| undefined`)                                                        |

`principal` est un `PointerValue` non typé par schéma : on ne sait pas
statiquement si c'est un `User`.

## 5. Dépendances à Typegen

- Option `acl` : forme locale depuis la source (`SourceACLSchemaOption`), mais
  `data`/`currentData` exacts uniquement via le descripteur généré
  `ACLSchemaOption<this>` (`src/acl-option.ts`, `aclSchemaOption.typegen`,
  ADR-0283). Sans génération, les valeurs voisines sont `unknown`.
- Champ `acl` : famille de champ `aclFieldFamily` avec `typegen: { module,
valueType: 'ACL', structuralContainsType }` pour les sorties et filtres
  générés ; le type source `ACLField` suffit pour `select`.
- `grantRole` accepte une `RequestRoleReference` neutre : pas de dépendance.

## 6. Propositions

1. **`data` exact sans génération** : même problème 2 que `access`/`hooks`
   (options qui exigent le schéma complet). Le laboratoire doit couvrir `acl`
   ; ici la forme est la plus simple (pas de relations ni d'AST), bonne
   candidate pour une première preuve.
2. **Raccourcis de valeur** sans nouveau concept :

   ```ts
   // avant
   principal === undefined
   	? new ACL()
   	: new ACL().grantPrincipal(principal, 'read', 'update', 'delete')
   // après
   ACL.owner(principal) // même résultat, principal undefined → ACL vide
   new ACL().grantPublic('read').grantRole(Editor, 'write') // 'write' = update + delete
   ```

3. **Défaut explicite** : exiger `default` quand l'option est déclarée, ou
   journaliser au démarrage les schémas dont l'ACL par défaut est vide.
4. **Type de sélection** : retirer `acl` des sélections typées des requêtes
   non Master (surcharge `{ useMasterKey: true }`), ou documenter que le type
   ne reflète pas l'autorité.
5. **Rôles automatiques** : voir fiche Roles (résolution du membre courant par
   défaut), sinon `grantRole` reste inerte sans avertissement.
6. **Positionnement** : documenter quand choisir ACL (droits par objet stockés,
   partage) et quand choisir Access `where` (règle calculée), pour éviter deux
   écritures de la même intention.

## 7. Note sur la grille

Échelle 1 (mauvais) à 5 (excellent) ; pour le coût de migration, 5 = faible.

| Critère                | Note | Justification                                             |
| ---------------------- | ---- | --------------------------------------------------------- |
| Sans génération        | 3    | option et champ disponibles ; `data` voisin `unknown`     |
| Colocalisation         | 5    | `acl` dans le schéma, champ injecté                       |
| Concision              | 3    | ACL fluide ; `default` dérivé ~10 lignes                  |
| Une forme par concept  | 3    | valeur claire ; recouvrement avec Access `where`          |
| Révélation progressive | 3    | `acl: {}` fonctionne mais rend l'objet invisible          |
| Erreurs                | 3    | erreurs locales ; `unknown` sans génération peu explicite |
| Hovers                 | 3    | 713 car. pour l'option, 117 pour `data`                   |
| Performance TypeScript | 4    | non mesurée à l'échelle ; descripteur généré par schéma   |
| JavaScript             | 5    | aucune génération nécessaire                              |
| Coût de migration      | 4    | changement limité au type de l'option et aux raccourcis   |
