# Revue du plugin ACL (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/acl-permissions-plugin.md), README du
paquet. Les décisions qui changent un contrat public donneront un ADR à la
migration.

## Concept

Conservé : droits stockés par ligne (lire, modifier, supprimer) pour le
public, les personnes connectées, un utilisateur ou un rôle ; champ `acl`
indexé ajouté au schéma et compilé en filtre SQL ; cumul avec Access ; valeur
`ACL` immuable et bornée (`aclPlugin({ limits })`) ; un client ne lit, ne
filtre, ne trie ni n'écrit jamais le champ `acl` ; capacités neutres de Core
pour l'utilisateur et les rôles. `resolveInput` recalcule l'ACL à chaque
écriture à partir des données (nom conservé, cohérent avec Hooks).

## Décisions

1. **Forme D** : `.acl()` (méthode de forme, ajoute le champ) puis
   `.with({ acl: { default, resolveInput, … } })` (validé par la tranche).
2. **`default` obligatoire** au typage quand l'ACL est activée (aujourd'hui une
   ACL vide rend la ligne invisible à tous sauf Master).
3. **Raccourcis** : `new ACL(principal)` (lecture et écriture au propriétaire,
   comme `new Parse.ACL(user)`, ACL vide si `undefined`) ; groupe `'write'` =
   `update` + `delete`, comme dans Access.
4. **Master fournit une ACL explicite sans `resolveInput`** ; `resolveInput`
   sert seulement à la recalculer depuis les données.
5. **Partage atomique à la Prisma** :
   `data: { acl: { grant: { principal, permissions } } }`,
   `data: { acl: { revoke: { principal } } }` ; plus de lecture-modification-
   écriture (deux partages simultanés ne s'écrasent plus).
6. **`principal` typé** (`Pointer<"TodoUser">` via `Register` et la capacité
   neutre « principal courant »).
7. **`select: { acl: true }`** sélectionnable seulement avec
   `useMasterKey: true` littéral si le typage le permet à coût raisonnable,
   sinon message d'erreur clair.
8. **Documentation Access contre ACL** : règle calculée pour toutes les lignes
   contre droits stockés par ligne (partage au cas par cas).
9. **Gardé** : `limits`, compilation SQL, nom `resolveInput`, événement de
   changement d'ACL (consommable depuis l'application, « au mieux » comme
   décidé pour Hooks), refus de remplacer une ACL par `upsert` ou mise à jour
   ensembliste.
10. **Partage depuis le client, sur autorisation explicite** :
    `acl: { clientChanges: ({ principal, currentAcl }) => … }` autorise les
    opérations `grant`/`revoke` venant d'un client ; fermé sans elle ; garde-fou
    permanent : un client ne peut jamais accorder plus de droits qu'il n'en a
    lui-même (pas d'escalade).
11. **`can()` dans Core** (corrige la décision 11 de la revue Access) :
    `ultimabase.can({ principal, operation, schema, item })` interroge toutes
    les politiques installées (Access, ACL, futures) comme à l'exécution ;
    Core ne nomme aucun plugin.
12. **À vérifier** : ACL des lignes existantes quand on active l'ACL sur un
    schéma qui a des données (remplissage par un `default` statique, sinon
    refus de démarrer avec un message clair) ; lecture pratique des entrées
    d'une ACL pour une fenêtre de partage (`entries()` si les méthodes
    actuelles ne suffisent pas).
13. **Plus tard** : partage temporaire (droit avec date de fin), seulement sur
    besoin réel. Un droit « partager » distinct est inutile (`clientChanges`
    le permet par une règle).
