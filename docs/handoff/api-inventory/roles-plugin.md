# Fiche plugin : `@ultimabase/roles-plugin`

Phase 1 du défi API ([plan](../api-challenge-plan.md)). Mesures sur l'application
sonde `node_modules/.cache/inventory-policy/src/app/role.ts` (rôle éditeur
relié aux utilisateurs Password Auth) et `probes/p2.ts` (sans Typegen).

## 1. Rôle et installation

Rôles stockés dans un schéma ordinaire défini par le développeur : membres
(relation vers un schéma membre), rôles enfants (héritage), suppression
contrôlée, événements post-commit. Le plugin fournit la capacité neutre de
résolution des rôles, consommée par Access (`hasRole`) et ACL (`grantRole`).

```ts
const Base = UltimaBase.use(accessPlugin(), rolesPlugin())
const AppRole = RoleSchema.define(Base.Schema, { className: 'Role', members: { schema: User }, … })
```

- `rolesPlugin()` n'a **aucune option** ; il est requis dès qu'un `RoleSchema`
  existe (option interne opaque vérifiée à la compilation).
- Privilège `authority:elevate` pour la maintenance (hiérarchie, suppression).
- Dépendance de package vers `@ultimabase/access-plugin` (types `AccessContext`,
  `SchemaAccess`, `AccessDecisionInput` dans `src/role-access.ts` et
  `src/role-schema.ts`) : un lien plugin → plugin, autorisé par le graphe
  (« official Access providers »), mais imposé même sans Access installé.

## 2. Ce qu'il ajoute aux schémas

`RoleSchema.define(Base.Schema, options)` (`src/role-schema.ts`) :

- injecte `name` (unique, normalisé NFKC, minuscule), `members`
  (relation vers `members.schema`) et `roles` (auto-relation) ; ces noms sont
  réservés ;
- options propres : `members: { schema, resolveCurrent? }`,
  `deletion: { references?: 'fail' | 'preserve' | 'cascade' }` (défaut `fail`) ;
- options ordinaires : `fields`, `indexes`, `access`, `acl`, `postgres`, etc. ;
- statiques : `AppRole.role('editor')` (référence par nom),
  `AppRole.role({ id })` (par UUID), sans I/O ;
- méthodes de modèle persisté : `addMember`, `removeMember`, `addRole`,
  `removeRole` ;
- fonctions : `hasRole(ref)` (décision Access), `resolveRoleReference`,
  `resolveRoleReferenceId`, `onRoleEvent` / `provideRoleEventObserver`.

Exemples réels : `examples/todo-backend/src/schema.ts` (`TodoRole`),
`examples/todo-backend/src/admin.ts` (`role.addMember(TodoUser.pointer(id), masterOptions)`),
`examples/minimal/src/schema.ts` (`resolveCurrent` + `hasRole`).

## 3. API pour le développeur

- **Définir** : un appel spécial `RoleSchema.define(Base.Schema, …)` au lieu de
  `Base.Schema.define(…)` ; même forme pour `PasswordUserSchema`.
- **Membre courant** : `members.resolveCurrent: ({ context }) => Pointer | undefined`.
  Sans lui, `hasRole` retourne toujours `false` et `grantRole` dans une ACL ne
  s'applique jamais (`createDefaultDependencies().resolveMembership`,
  `src/role-access.ts`). Aucun avertissement. Le cas
  `examples/todo-backend` est dans cette situation (pas de `resolveCurrent`).
  ACL, elle, trouve le principal tout seul via la capacité Core neutre : deux
  mécanismes pour la même information.
- **Vérifier** : `access: { update: hasRole(Editor) }`, combinable par
  `anyOf/allOf/not`. Mise en cache par requête ; Master n'implique aucune
  appartenance.
- **Administrer** : création par le modèle
  (`new AppRole({ name }).create({}, { useMasterKey: true })`), appartenance par
  méthodes de modèle. Les méthodes sur le modèle persisté
  (`role.addMember(...)`) ressemblent à de l'Active Record, mais elles délèguent
  au cycle de vie de relation ordinaire.
- **Hiérarchie** : `Administrator.addRole(Editor)` = les membres d'Editor sont
  membres d'Administrator ; cycles refusés, profondeur max 64, 10 000 rôles
  visités.

Comparaison :

- Parse : `_Role` intégré, `role.getUsers().add(user)`, `role.getRoles()`,
  rôles dans les ACL par nom ; l'utilisateur courant est implicite.
- Better Auth (plugin `admin`/`organization`) : rôles par chaîne sur
  l'utilisateur ou le membre, `hasPermission({ permissions })` ; pas de schéma
  de rôles à déclarer.
- Ici : plus puissant (plusieurs domaines de rôles, schéma personnalisable,
  suppression transactionnelle), mais le câblage membre courant est manuel et
  la forme de définition est spéciale.

## 4. Frictions mesurées

Sonde `role.ts` (17 lignes) :

```ts
export const AppRole = RoleSchema.define(Base.Schema, {
	className: 'Role',
	members: {
		schema: AppUser,
		resolveCurrent: ({ context }) => context.getValue(passwordPrincipal)?.user,
	},
	fields: (field) => ({ label: field.string() }),
	access: { read: true },
})
export const Editor = AppRole.role('editor')
```

| Cas                                                    | Résultat                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Sans fichier généré, sans `access` (`probes/p2.ts`)    | compile ; `resolveCurrent` typé `Pointer<PasswordUserReference>`                                               |
| Sans fichier généré, **avec** `access: { read: true }` | `TS2345 … not assignable to parameter of type 'never'` sur tout l'objet (`role.ts:7`)                          |
| Avec fichier généré                                    | compile ; `AppRole.findMany({ where: { name: { eq: 'editor' } } }, master)` exact                              |
| Hover `AppRole`                                        | 645 car., commence par `ConfiguredRoleSchemaClass<{ readonly fieldBuilders: …` (état interne du configurateur) |
| Hover `resolveCurrent`                                 | 248 car. + 206 de JSDoc ; intersection de deux signatures                                                      |
| Hover `hasRole`                                        | 78 car. + 277 de JSDoc                                                                                         |
| Résultat `findMany`                                    | 1 056 car. (modèle avec `get`, `toJSON`, symboles)                                                             |

## 5. Dépendances à Typegen

- `RoleSchema.define(Base.Schema, …)` : champs et options locales depuis la
  source (`ConfiguredSchemaNamespace`), comme ADR-0284 pour Password User.
- `access` du rôle : `Omit<UltimaBaseGeneratedSchemaOptions, 'access' | …>`
  plus `SchemaAccess<RoleSchemaBaseClass>` (`src/role-schema.ts`) : même
  dépendance qu'Access (ADR-0280).
- `members.schema` reçoit une valeur (classe), pas une chaîne : la relation
  `members` est exacte sans génération. L'auto-relation `roles` aussi.
- La forme autonome `RoleSchema.define(options)` dépend des constructeurs
  générés.

## 6. Propositions

1. **Membre courant par défaut.** Si `resolveCurrent` est omis, utiliser la
   capacité Core neutre de principal (celle d'ACL) quand elle renvoie un
   Pointer de `members.schema` :

   ```ts
   // avant
   members: { schema: AppUser, resolveCurrent: ({ context }) => context.getValue(passwordPrincipal)?.user }
   // après
   members: { schema: AppUser }
   ```

   Aucun lien Roles → Password Auth ; `resolveCurrent` reste pour les cas
   spéciaux. Supprime l'inertie silencieuse de `todo-backend`.

2. **Une forme par concept.** Remplacer `RoleSchema.define(Base.Schema, {…})`
   par une option de schéma contribuée par le plugin, comme `softDelete` ou
   `acl` qui ajoutent des champs et des commandes par mécanismes génériques :

   ```ts
   // après
   const AppRole = Base.Schema.define({
   	className: 'Role',
   	role: { members: AppUser, deletion: 'fail' },
   	fields: (field) => ({ label: field.string() }),
   })
   ```

   À valider en phase 3 : statiques `role()` et méthodes de modèle via les
   surfaces de modèle de plugin (déjà utilisées par Soft Delete).

3. **Découpler d'Access au niveau package** : déplacer `hasRole` dans un
   sous-chemin ou typer son entrée par l'interface minimale `{ context }`
   pour ne pas imposer `@ultimabase/access-plugin` aux applications ACL seules.
4. **Diagnostic** : avertir au démarrage si un RoleSchema est référencé par
   `hasRole` ou `grantRole` sans moyen de résoudre le membre courant.
5. **Hover** : nommer le résultat (`RoleSchemaClass<'Role', …>`) plutôt que
   l'état du configurateur.

## 7. Note sur la grille

Échelle 1 (mauvais) à 5 (excellent) ; pour le coût de migration, 5 = faible.

| Critère                | Note | Justification                                                                |
| ---------------------- | ---- | ---------------------------------------------------------------------------- |
| Sans génération        | 3    | définition et membres exacts ; `access` du rôle exige le fichier             |
| Colocalisation         | 4    | tout dans la définition du rôle ; références `role('x')` exportées à part    |
| Concision              | 3    | 17 lignes ; `resolveCurrent` obligatoire en pratique                         |
| Une forme par concept  | 2    | `RoleSchema.define(Base.Schema, …)` spécial ; membre courant ≠ principal ACL |
| Révélation progressive | 2    | sans `resolveCurrent`, rien ne marche et rien ne prévient                    |
| Erreurs                | 2    | `never` sans génération ; aucune erreur pour l'oubli de `resolveCurrent`     |
| Hovers                 | 2    | 645 car. d'état interne ; résultats ~1 000 car.                              |
| Performance TypeScript | 4    | non mesurée à l'échelle                                                      |
| JavaScript             | 5    | même compilateur Runtime                                                     |
| Coût de migration      | 3    | roles, access (`hasRole`), ACL (rôles), exemples, site                       |
