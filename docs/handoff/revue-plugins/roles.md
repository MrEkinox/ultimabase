# Revue du plugin Roles (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/roles-plugin.md), README du paquet.
Les décisions qui changent un contrat public donneront un ADR à la migration.

## Concept

Conservé : rôles stockés dans un schéma défini par le développeur (champs
propres possibles), champs réservés `name` (unique, normalisé), `members`,
rôles inclus (héritage : les membres d'un rôle inclus sont membres du rôle
qui l'inclut ; cycles refusés, profondeur et volume bornés), suppression
contrôlée, références par nom ou identifiant utilisées par Access et ACL,
plusieurs domaines de rôles (plusieurs schémas de rôles, décision déjà prise
avec l'agent précédent et utile, absente de Parse). `rolesPlugin()` sans
option.

## Décisions

1. **Fabrique `App.RoleSchema.define`** en forme D, **plusieurs schémas de
   rôles autorisés** (corrige « exactement un » de la décision 9 des formes
   pour Roles) ; `deletion: 'fail' | 'preserve' | 'cascade'` à plat.

   ```ts
   export const TodoRole = App.RoleSchema.define({
   	className: 'TodoRole',
   	members: () => TodoUser,
   	deletion: 'fail',
   	fields: (field) => ({ description: field.string() }),
   }).with({ access: { read: true } })
   ```

2. **Membre courant résolu automatiquement** par la capacité neutre
   « principal courant » quand le principal appartient au schéma des membres ;
   `resolveCurrent` reste pour les cas spéciaux ; l'erreur au démarrage
   (décision 13 des formes) ne vise plus que l'absence de tout moyen de
   résolution. Supprime les rôles silencieusement inopérants.
3. **Membres et héritage par des liens à la Prisma**, plus par des méthodes
   de modèle : `members: { connect: [...] }`,
   `includedRoles: { connect: [...] }` ; vérifications du plugin (cycles,
   profondeur) appliquées à ces changements de relation. **`roles` renommé
   `includedRoles`** (le nom actuel est ambigu).
4. **Plus de lien de paquet Roles → Access** : Core définit un type neutre de
   prédicat de politique (contexte → booléen), déjà utilisé par
   `allowWithoutRule` et les règles ; `hasRole` le renvoie ; Access, ACL et les
   futurs plugins l'acceptent.
5. **Résultats en données simples** (`Model<"TodoRole">`), sans méthodes.
6. **Gardé** : références par nom et par identifiant, héritage borné, trois
   modes de suppression, aucune option de plugin, événements de rôle
   consommables depuis l'application (« au mieux », comme Hooks).
7. **Rôles accessibles hors des règles** :
   `ultimabase.plugin(rolesPlugin)` expose `has(Admin)` (requête en cours),
   `has(Admin, { principal })` (utilisateur donné) et `current(TodoRole)`
   (rôles de la requête en cours, héritage compris), avec le même calcul et
   le même cache que les règles.
8. **`ensure: ['admin', 'editor']`** sur `App.RoleSchema.define` : le plugin
   crée au démarrage les rôles manquants, sans toucher aux existants
   (idempotent). Les données initiales en général relèveront du futur plugin
   de migrations.
9. **Contrainte notée pour le futur plugin multi-tenant** : unicité du nom
   par organisation et références de rôle liées à une organisation
   (aujourd'hui `name` est unique dans toute la table).
10. **Piste pour plus tard** : permissions attachées aux rôles
    (`hasPermission('todo.update')`, à la Better Auth ou CASL), réalisable
    aujourd'hui par un champ personnalisé et un prédicat.

Revue validée par l'utilisateur le 2026-10-09.
