# API idéale : décisions de la séance du 2026-10-09

Phase 2 de [api-challenge-plan.md](api-challenge-plan.md), à partir de la
fiche [api-avant-todo-backend.md](api-avant-todo-backend.md) et du
[prototype de typage](prototype-typage-sans-typegen.md). Chaque décision cite
les frictions (F) et questions (Q) de la fiche « avant ». Une décision qui
change un contrat public donnera lieu à un ADR (ADR-0288) au moment de son
implémentation.

## Principe

Les requêtes et écritures suivent le vocabulaire de Prisma (`where`,
`select`, `include`, écritures imbriquées `connect`/`disconnect`/`set`/
`create`), proche de la façon de penser GraphQL que l'utilisateur pratique ;
toute divergence est justifiée et documentée.

## Décidé

1. **Plugins déclarés une seule fois** (Q1 ; F1, F2, F16, F22) :
   `UltimaBase.use(postgresPlugin(), accessPlugin(), …)`. `postgresPlugin()`
   lit `DATABASE_URL` au démarrage ; `postgresPlugin({ url })` explicite
   l'emporte toujours (même principe que `PORT` pour Hono).
2. **Nom et cibles** (Q2 ; F8, F9) : `className` reste une chaîne (nom en base
   et en REST) ; cibles par fonction `target: () => TodoUser`, plus aucune
   cible en chaîne.
3. **Relations** (Q3 ; F10) : le côté inverse reste facultatif ; `mappedBy`
   reste une chaîne vérifiée à l'enregistrement (`new App(...)`), pas sur la
   ligne (prix de l'absence de cycle).
4. **Forme du schéma : D, décidée le 2026-10-09** (Q4 ; F15) après comparaison
   de toutes les formes ([formes/comparatif.md](formes/comparatif.md),
   [formes/d-named.md](formes/d-named.md), [formes/d-class.md](formes/d-class.md)) :

   ```ts
   export const Todo = App.Schema.define({
     className: 'Todo',
     fields: (field) => ({ … }),
   })
     .softDelete() // méthodes de forme sans callback, avant .with
     .with({ access: { … }, acl: { … }, hooks: { … }, postgres: { … } })

   // ultimabase.ts, une ligne par application (fournie par create-app) :
   declare module '@ultimabase/core' {
     interface Register {
       readonly app: typeof ultimabase
     }
   }
   ```

   - Les cycles sont évités par la capture du type des cibles `() => X` et par
     `.with` dernier appel non générique ; `Register` ne sert qu'aux types
     nommés.
   - Types nommés via `Register` : `WhereBuilder<"Todo">`, `Model<"Todo">`
     (hooks, résultats complets), `CreateInput<"Todo">`, `Select<"Todo">`
     (arguments de requête nommés, variante la plus rapide). Texte identique
     sous TypeScript 6 et 7.
   - Limites acceptées : infobulle de la constante `Todo` longue (≈ 860
     caractères, impossible à raccourcir pour une `const`) ; `mappedBy` vérifié
     à l'enregistrement ; `.with` doit rester le dernier appel ; sans
     `Register`, tout compile mais les infobulles redeviennent structurelles.
   - Méthodes personnalisées : fonctions exportées dans le même fichier (pas
     de méthodes d'instance).
   - Alternative prouvée et réversible par codemod : la forme classe
     `class Todo extends App.Schema.define({…}).softDelete() { static rules = this.with({…}) }`
     (infobulle `class Todo`, méthodes statiques, sans `Register`), écartée
     pour ses deux contournements fragiles du vérificateur et +22 % de temps.
   - Écartées avec preuves : chaîne de méthodes de plugin (cycle), tout dans
     un seul `define` (cycle, casse vers 25 schémas), classe vide autour de D
     (TS2506), `.build()` (cycle ou nom perdu), règles séparées, règles
     d'application, chaînes typées, getters.
   - Gel définitif après la tranche verticale sur le vrai Core.

5. **`where` : raccourci d'égalité à la Prisma** (Q7 ; F19) :
   `where: { id }`, `where: { completed: false }`. Les champs `json` et
   `object` gardent la forme explicite `{ eq: … }` (ambiguïté).
6. **Types nommés exportés par Core** (Q5 ; F7, F20) :
   `CreateInput<typeof Todo>`, `UpdateInput<…>`, `Model<typeof TodoRole>` ;
   plus d'import depuis `.ultimabase/`, plus de
   `Awaited<ReturnType<…>>`. Pas de propriétés `$infer` sur les schémas.
7. **Démarrage** (Q9 ; F22, F23) : `ultimabase.ts` =
   `new App({ schemas: [...] })` ; `main.ts` avec
   `await using app = await ultimabase.start()` (`start()` renvoie
   l'application). Fichier de config et CLI toujours en attente.
8. **Master** (Q6 ; F18) : on garde `{ useMasterKey }` en dernier argument
   (familier, conditionnel facile). Changement : accepter `boolean` au lieu
   du seul littéral `true` (ADR-0114), pour écrire
   `{ useMasterKey: isAdmin }`. `false` = option absente (hérite de la
   requête en cours, jamais une rétrogradation). La doc et la JSDoc
   interdisent de dériver la condition de l'entrée de la requête. Rejeté :
   `Todo.master.createOne()` (moins pratique en conditionnel) et une portée
   ambiante `asMaster(() => …)` (élévation invisible du code appelé).

9. **Schémas d'identité : fabrique apportée par le plugin** (Q7 ; F12) :
   `App.RoleSchema.define({ className, members: () => TodoUser, fields })` et
   `App.PasswordUserSchema.define({ className, fields })`, puis les méthodes
   de plugin habituelles (`.access(...)`). Le nom dit ce qu'est le schéma ;
   une méthode de chaîne (`.roles()`) se lisait comme « appliquer des rôles »
   et aurait permis plusieurs schémas. Le plugin vérifie à l'enregistrement
   qu'il y a exactement un schéma de son type. Supprime aussi la double liste
   de plugins du README Password Auth (`Base` puis `Base.use(authPlugin)`).
   Plusieurs tables d'utilisateurs (instances multiples) : hors périmètre.
10. **Enums** (Q7 ; F11) : une seule signature, `values` accepte un tableau
    (enum local, nom dérivé, le cas courant) ou un enum partagé
    `defineEnum('TodoPriority', [...])`, utilisé seulement pour mutualiser.
11. **Liaison des pointeurs et relations : vocabulaire unique à la Prisma**
    (révisée le 2026-10-09 ; F21) : pointeur `assignee: { connect: id }`,
    `{ create: { … } }`, `null` pour délier ; relation
    `tags: { connect: [a, b] }`, `{ disconnect: [a] }`, `{ set: [a] }`
    (liens visibles), `{ create: [ … ] }`. `connect` accepte un identifiant ou
    un pointeur de la cible déjà en main (`{ connect: todo.assignee }`) ; un
    pointeur d'un autre schéma est une erreur de type. Tout lien vérifie la
    visibilité de la cible (`NOT_FOUND` si cachée), ce qui ferme la faille 2
    de la revue Access. `TodoUser.pointer(id)` reste une valeur (ACL,
    comparaisons), plus une façon de lier dans `data`.
12. **Access sans configuration** (Q8 ; F14) : inchangé, déjà fixé par
    ADR-0293 et ADR-0294 (refus par défaut, `where` peut renvoyer `false`,
    écritures publiques explicites).
13. **Rôles inopérants** (Q8 ; F13) : erreur au démarrage quand une règle
    Access ou ACL cite un rôle et que le schéma de rôles n'a pas de
    `resolveCurrent`, avec la marche à suivre. Plus tard (architecture, à
    part) : une capacité neutre de Core « utilisateur courant » fournie par
    l'authentification et consommée par les rôles, sans lien entre plugins.
14. **Hooks de champ et `null`** (Q8 ; F17) : `resolveInput` n'est appelé que
    pour une valeur non nulle fournie ; `null` passe tel quel. À vérifier
    dans le plugin Hooks qu'aucun usage n'en dépend avant l'ADR.

15. **Documentation vérifiée** (Q10 ; F25) : tutoriels pas à pas en extraits
    Twoslash compilés au build du site (contexte caché par `// ---cut---`,
    types au survol) ; pages de référence et recettes par régions incluses
    depuis les exemples exécutables ; README des paquets recopiés depuis ces
    régions par un script vérifié en CI. Un extrait non vérifié doit être
    marqué explicitement ; la CI refuse les autres. À mettre en place pendant
    la migration (vérifier l'intégration Twoslash de Fumadocs et l'inclusion
    de régions).

## Ouvert

- Tranche verticale de la forme D sur le vrai Core (puis gel de la décision
  4 et ADR de remplacement de Typegen).
