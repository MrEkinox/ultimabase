# Revue du plugin Soft Delete (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/soft-delete-plugin.md), README du
paquet, et les idées du projet de corbeille de septembre (stash supprimé le
2026-10-08 à la demande de l'utilisateur ; ADR-0258 jamais intégré, que
l'utilisateur avait validé puis suspendu). Les décisions qui changent un
contrat public donneront un ADR à la migration.

## Concept

Conservé : suppression logique par un champ protégé `isDeleted`, filtre
protégé et compilé en SQL qui cache les lignes supprimées, `isDeleted`
jamais modifiable par un client, indépendance vis-à-vis d'Access, Hooks, REST
et GraphQL (découverte générique des commandes), `purge` réservé à Master.

## Décisions

1. **Forme D et modes renommés** : `.softDelete()` (cas courant, `delete`
   devient logique, ancien `'replace-delete'`) et
   `.softDelete({ mode: 'command' })` (vraie suppression conservée et
   commande dédiée, ancien `'explicit'`). **Option globale `defaultMode`
   supprimée** : la suppression logique se lit dans chaque schéma.
2. **`instanceId` supprimé** (deux instances échouent de toute façon).
3. **Commandes au vocabulaire Prisma** (règle aussi le conflit de noms entre
   la méthode de chaîne `.softDelete()` et la commande, vu dans la tranche) :
   `softDeleteOne`, `softDeleteMany` (nouveau), `restoreOne`, `purgeOne`
   (et leurs `Many`).
4. **`deletedAt`** posé par le serveur en même temps que `isDeleted`, remis à
   vide par la restauration ; `isDeleted` reste le champ du filtre.
5. **Corbeille par permission (choix E2)** : règle `readDeleted` apportée par
   le plugin dans l'emplacement générique des règles d'Access (aucun lien de
   paquet) ; avec elle, les requêtes normales voient les lignes supprimées
   (`where: { isDeleted: true }`, tri par `deletedAt`, REST et GraphQL
   compris) ; sans elle, le filtre protégé s'applique ; Master voit tout.
6. **Restauration par l'utilisateur** : règle `restore` dans Access, fermée
   par défaut ; `purge` reste réservé à Master.
7. **Index uniques partiels** : par le mécanisme générique d'index partiel
   du plugin PostgreSQL (revue PostgreSQL, décision 5) :
   `indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }]` ;
   jamais automatique ; la doc de Soft Delete montre cet exemple.
8. **Plus tard** : suppression en cascade, purge automatique après N jours
   (planificateur de tâches).
9. **Restauration en conflit** : message clair quand une valeur unique a été
   reprise entre-temps (`Cannot restore Todo 123: slug 'my-task' is now used
by another row`) au lieu d'une violation de contrainte brute.
10. **Documenter les pointeurs vers une ligne supprimée** : le pointeur reste,
    l'`include` renvoie `null`, et `onDelete` ne se déclenche pas pour une
    suppression logique (traitement avec la cascade, plus tard).
11. **Plus tard** : `deletedBy` (principal ayant supprimé), sur besoin d'audit
    (faisable aujourd'hui par un hook).

Revue validée par l'utilisateur le 2026-10-09.
