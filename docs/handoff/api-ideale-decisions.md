# API idéale : décisions de la séance du 2026-10-09

Phase 2 de [api-challenge-plan.md](api-challenge-plan.md), à partir de la
fiche [api-avant-todo-backend.md](api-avant-todo-backend.md) et du
[prototype de typage](prototype-typage-sans-typegen.md). Chaque décision cite
les frictions (F) et questions (Q) de la fiche « avant ». Une décision qui
change un contrat public donnera lieu à un ADR (ADR-0288) au moment de son
implémentation.

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
4. **Forme du schéma : direction « méthodes de plugin »** (Q4 ; F15) —
   préférée par l'utilisateur à `define(...).with(...)`, sous réserve de
   preuve :

   ```ts
   App.Schema.define({ className: 'Todo', fields: (field) => ({ … }) })
     .softDelete() // change la forme : ajoute isDeleted
     .access({ … })
     .acl({ … })
     .hooks({ … })
   ```

   Chaque plugin apporte sa méthode (Core générique, comme les méthodes de
   champ), la complétion liste les plugins installés, le type coule dans
   l'ordre de la chaîne (l'utilisateur accepte que l'ordre compte). Évaluation
   en cours dans le prototype (variante F, section 10 du rapport). Repli :
   D (`define(...).with(...)`), avec infobulles raccourcies (section 9).

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
11. **Pointeurs** (Q7 ; F21) : lier = `TodoUser.pointer(id)` partout (création,
    mise à jour, brouillons, ACL) ; créer et lier = `{ create: { … } }` ;
    `{ connect }` reste réservé aux relations multiples.
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

## Ouvert

- Résultat des variantes D (infobulles) et F (méthodes et fabriques de
  plugin) du prototype, puis tranche verticale sur le vrai Core, en
  commençant par les champs ajoutés par un plugin (`softDelete`).
- Q10 : alignement de la documentation sur les exemples (F25).
