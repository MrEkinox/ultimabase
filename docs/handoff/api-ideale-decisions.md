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

## Ouvert

- Résultat des variantes D (infobulles) et F (méthodes de plugin) du
  prototype, puis tranche verticale sur le vrai Core, en commençant par les
  champs ajoutés par un plugin (`softDelete`).
- Q7 restant : `RoleSchema.define`, enum répété et `typeName` (F11, F12),
  `TodoUser.pointer(id)` contre `{ connect }` (F21).
- Q8 : valeurs par défaut (Access selon ADR-0293, `resolveCurrent` des rôles,
  hooks de champ nullables) (F13, F14, F17).
- Q10 : alignement de la documentation sur les exemples (F25).
