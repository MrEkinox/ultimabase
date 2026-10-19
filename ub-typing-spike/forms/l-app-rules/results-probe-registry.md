# registry-alt

Baseline diagnostics: 0

## Hovers

### src/ultimabase.ts `where }) => where.eq('archived'` (39 chars)

```
(parameter) where: WhereBuilder<"Todo">
```

### src/ultimabase.ts `'assignee', (user)` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### src/ultimabase.ts `item }) =>` (414 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    isDeleted: boolean;
    status: "todo" | "doing" | "done";
    dueAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
}>
```

### src/todo.ts `Todo = App` (890 chars)

```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DefinedSchema<"TodoUser", {
        readonly displayName: ScalarField<...>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
        ...;
    }, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>
```

### src/ultimabase.ts `rules: {` (1263 chars)

```
(property) ApplicationOptions<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ... 1 more ... & { ...; }, DefinedSchema<...>, DefinedSchema<...>]>.rules?: ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        ... 5 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}, DefinedSchema<...> & ... 1 more ... & {
    ...;
}, DefinedSchema<...>, DefinedSchema<...>]>
```

### src/ultimabase.ts `Todo: {` (117 chars)

```
(property) Todo?: PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & HooksRuleTypes<"Todo"> & AclRuleTypes<"Todo">
```

### src/ultimabase.ts `ultimabase = new` (810 chars)

```
const ultimabase: Application<readonly [DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        ... 5 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}, DefinedSchema<...> & ... 1 more ... & {
    ...;
}, DefinedSchema<...>, DefinedSchema<...>]>
```

### src/usage.ts `pending = await` (364 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly displayName: string;
    } | null;
    readonly dueAt: Date | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### src/ultimabase.ts `(todo) => todo.is` (38 chars)

```
(parameter) todo: WhereBuilder<"Todo">
```

## Error cases

### 1. relation target typo (src/todo.ts:17: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 2 diagnostic(s)

- src/todo.ts:17:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.

### 2. local where field typo (src/ultimabase.ts:38: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/ultimabase.ts:38:44 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

### 3. cross-schema field typo (Todo -> TodoUser) (src/ultimabase.ts:42: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/ultimabase.ts:42:49 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

### 4. plugin-added field typo in a hook (src/ultimabase.ts:47: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/ultimabase.ts:47:15 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; isDeleted: boolean; status: "todo" | "doing" | "done"; dueAt: Date | null; ... 5 more ...; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; }>'. Did you mean 'isDeleted'?

### 5. mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/ultimabase.ts:20:2 TS2719: Type 'readonly [import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"str...' is not assignable to type 'readonly [import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"str...'. Two different types with this name exist, but they are unrelated. /   Type 'readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Defin

### 6. rules key typo (src/ultimabase.ts:37: `Todo: {
			access: {` -> `Todo: {
			acess: {`): 5 diagnostic(s)

- src/ultimabase.ts:37:4 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & HooksRuleTypes<"Todo"> & AclRuleTypes<"Todo">'. Did you mean to write 'access'?
- src/ultimabase.ts:38:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/ultimabase.ts:40:16 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/ultimabase.ts:40:23 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/ultimabase.ts:40:58 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7. wrong filter return (src/ultimabase.ts:55: `where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `42`): 1 diagnostic(s)

- src/ultimabase.ts:55:43 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

### 8. query select typo (src/usage.ts:38: `select: { title: true } })` -> `select: { titel: true } })`): 2 diagnostic(s)

- src/usage.ts:38:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'?
- src/usage.ts:39:26 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 8b. query select typo next to valid keys (Core query typing, all forms) (src/usage.ts:11: `select: { title: true, dueAt: true, priority: true }` -> `select: { titel: true, dueAt: true, priority: true }`): 2 diagnostic(s)

- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; readonly assignee: { readonly id: string; readonly displayName: string; } | null; readonly dueAt: Date | null; readonly priority: "low" | "normal" | "high" | null; readonly subtasks: { ...; }[]; readonly titel: never; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

## Summary

| Case | Detected | On the edited line | Diagnostics | First message (first line) | Length (first line / full) |
| --- | --- | --- | --- | --- | --- |
| 1. relation target typo | oui | oui | 2 | TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'? | 52 / 52 |
| 2. local where field typo | oui | oui | 1 | TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'. | 89 / 89 |
| 3. cross-schema field typo (Todo -> TodoUser) | oui | oui | 1 | TS2561 Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'? | 136 / 136 |
| 4. plugin-added field typo in a hook | oui | oui | 1 | TS2551 Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef \| null; parent: PointerRef \| null; isDeleted: boolean; status: "todo" \| "doing" \| "done"; dueAt: Date \| null; ... 5 more ...; allowedPriorities: readonly ("low" \| ... 1 more ... \| "high")[] \| null; }>'. Did you mean 'isDeleted'? | 326 / 326 |
| 5. mappedBy typo | oui | non (src/ultimabase.ts:20) | 1 | TS2719 Type 'readonly [import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"str...' is not assignable to type 'readonly [import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"str...'. Two different types with this name exist, but they are unrelated. | 743 / 1970 |
| 6. rules key typo | oui | oui | 5 | TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & HooksRuleTypes<"Todo"> & AclRuleTypes<"Todo">'. Did you mean to write 'access'? | 219 / 219 |
| 7. wrong filter return | oui | oui | 1 | TS2322 Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'. | 68 / 68 |
| 8. query select typo | oui | oui | 2 | TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'? | 429 / 429 |
| 8b. query select typo next to valid keys (Core query typing, all forms) | oui | non (src/usage.ts:16) | 2 | TS2339 Property 'title' does not exist on type '{ readonly id: string; readonly assignee: { readonly id: string; readonly displayName: string; } \| null; readonly dueAt: Date \| null; readonly priority: "low" \| "normal" \| "high" \| null; readonly subtasks: { ...; }[]; readonly titel: never; }'. | 285 / 285 |
