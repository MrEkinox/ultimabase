# fixture

Baseline diagnostics: 0

## Hovers

### src/todo.ts `where }) => where.eq('archived'` (39 chars)

```
(parameter) where: WhereBuilder<"Todo">
```

### src/todo.ts `(user) => user.eq` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### src/todo.ts `item }) =>` (414 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "todo" | "doing" | "done";
    dueAt: Date | null;
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

### src/todo.ts `rules({` (446 chars)

```
(method) DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>.rules(rules: PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & HooksRuleTypes<"Todo"> & AclRuleTypes<"Todo">): SchemaRules<"Todo">
```

### src/todo.ts `todoRules = Todo` (36 chars)

```
const todoRules: SchemaRules<"Todo">
```

### src/ultimabase.ts `rules: [` (638 chars)

```
(property) ApplicationOptions<readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ... 1 more ... & { ...; }, DefinedSchema<...>, DefinedSchema<...>], readonly [...]>.rules: readonly [SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">, SchemaRules<"Tag">]
```

### src/ultimabase.ts `ultimabase = new` (889 chars)

```
const ultimabase: Application<readonly [DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
        ... 4 more ...;
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
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly dueAt: Date | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### src/tag.ts `(todo) => todo.is` (38 chars)

```
(parameter) todo: WhereBuilder<"Todo">
```

### completions src/extra.ts `StaffRole.rules({` (4)

access, acl, hooks, postgres

### completions src/extra.ts `StaffRole.` (5)

addMember, className, createOne, findMany, rules

### completions src/todo.ts `Todo = App.` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions src/tag.ts `Tag = App.Schema.define({` (1)

softDelete

### completions src/usage.ts `await TodoRole.` (5)

addMember, className, createOne, findMany, rules

## Error cases

### 1. relation target typo (src/todo.ts:19: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 2 diagnostic(s)

- src/todo.ts:19:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.

### 2. local where field typo (src/todo.ts:28: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:28:42 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

### 3. cross-schema field typo (Todo -> TodoUser) (src/todo.ts:32: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/todo.ts:32:47 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

### 4. plugin-added field typo in a hook (src/todo.ts:37: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:37:13 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; isDeleted: boolean; createdAt: Date; updatedAt: Date; title: string; ... 4 more ...; dueAt: Date | null; }>'. Did you mean 'isDeleted'?

### 5. mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/ultimabase.ts:8:12 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: R

### 6. rules key typo (src/todo.ts:27: `access: {` -> `acess: {`): 5 diagnostic(s)

- src/todo.ts:27:2 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & HooksRuleTypes<"Todo"> & AclRuleTypes<"Todo">'. Did you mean to write 'access'?
- src/todo.ts:28:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:30:14 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:30:21 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:30:56 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7. wrong filter return (src/tag.ts:15: `where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `42`): 1 diagnostic(s)

- src/tag.ts:15:41 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

### 8. query select typo (src/usage.ts:38: `select: { title: true } })` -> `select: { titel: true } })`): 2 diagnostic(s)

- src/usage.ts:38:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'?
- src/usage.ts:39:26 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 8b. query select typo next to valid keys (Core query typing, all forms) (src/usage.ts:11: `select: { title: true, dueAt: true, priority: true }` -> `select: { titel: true, dueAt: true, priority: true }`): 2 diagnostic(s)

- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; readonly assignee: { readonly id: string; readonly displayName: string; } | null; readonly priority: "low" | "normal" | "high" | null; readonly dueAt: Date | null; readonly subtasks: { ...; }[]; readonly titel: never; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

### K1. rules forgotten in rules: [...] (src/ultimabase.ts:9: `todoRules, tagRules]` -> `todoRules]`): 1 diagnostic(s)

- src/ultimabase.ts:9:2 TS2322: Type '[SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">]' is not assignable to type 'readonly [SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">] & { readonly '~missingRules': SchemaRegistrationError<"no rules entry for Tag; register X.rules({}) to declare none">; }'. /   Property ''~missingRules'' is missing in type '[SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">]' but required in type '{ readonly '~missingRules': SchemaRegistrationError<"no rules entry for Tag; register X.rules({}) to declare none">; }'.

### K2. rules listed twice (src/ultimabase.ts:9: `todoRules, tagRules]` -> `todoRules, tagRules, todoRules]`): 2 diagnostic(s)

- src/ultimabase.ts:9:40 TS2322: Type 'SchemaRules<"Todo">' is not assignable to type 'SchemaRules<"Todo"> & SchemaRegistrationError<"rules: Todo is listed twice">'. /   Property ''~error'' is missing in type 'SchemaRules<"Todo">' but required in type 'SchemaRegistrationError<"rules: Todo is listed twice">'.
- src/ultimabase.ts:9:61 TS2322: Type 'SchemaRules<"Todo">' is not assignable to type 'SchemaRules<"Todo"> & SchemaRegistrationError<"rules: Todo is listed twice">'. /   Property ''~error'' is missing in type 'SchemaRules<"Todo">' but required in type 'SchemaRegistrationError<"rules: Todo is listed twice">'.

### K3. rules registered without their schema (src/ultimabase.ts:8: `schemas: [TodoUser, TodoRole, Todo, Tag]` -> `schemas: [TodoUser, TodoRole, Todo]`): 1 diagnostic(s)

- src/ultimabase.ts:9:51 TS2322: Type 'SchemaRules<"Tag">' is not assignable to type 'SchemaRules<"Tag"> & SchemaRegistrationError<"rules: Tag is not in schemas">'. /   Property ''~error'' is missing in type 'SchemaRules<"Tag">' but required in type 'SchemaRegistrationError<"rules: Tag is not in schemas">'.

### K4. second schema from the RoleSchema factory (src/ultimabase.ts:8: `schemas: [TodoUser, TodoRole, Todo, Tag]` -> `schemas: [TodoUser, TodoRole, Todo, Tag, StaffRole]`): 3 diagnostic(s)

- src/ultimabase.ts:9:22 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() =
- src/ultimabase.ts:9:43 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"StaffRole", Readonly<Record<never, never>> & import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/plugins", { with: { "resolution-mode": "import" } }).RoleOwnedFie...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"StaffRole", Readonly<Record<never, never>> & import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/plugins", { with: { "resolution-mode": "import" } }).RoleOwnedFie...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"StaffRole", Readonly<Record<never, never>> & RoleOwnedFields<() => DefinedSchema<"TodoUser", { re
- src/ultimabase.ts:10:2 TS2322: Type '[SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">, SchemaRules<"Tag">]' is not assignable to type 'readonly [SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">, SchemaRules<"Tag">] & { readonly '~missingRules': SchemaRegistrationError<...>; }'. /   Property ''~missingRules'' is missing in type '[SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">, SchemaRules<"Tag">]' but required in type '{ readonly '~missingRules': SchemaRegistrationError<"no rules entry for StaffRole; register X.rules({}) to declare none">; }'.

### K5. shape option typo in define (src/todo.ts:11: `softDelete: true,` -> `sofDelete: true,`): 29 diagnostic(s)

- src/tag.ts:15:79 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:15:106 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:11:2 TS2561: Object literal may only specify known properties, but 'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; }> & { ...; }'. Did you mean to write 'softDelete'?
- src/todo.ts:28:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:30:43 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:30:70 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:32:26 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<"Todo">'.
- src/todo.ts:37:13 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/todo.ts:40:51 TS2322: Type '"status"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/todo.ts:40:61 TS2322: Type '"dueAt"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/ultimabase.ts:8:12 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: R
- src/ultimabase.ts:8:38 TS2322: Type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>> & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<
- src/usage.ts:10:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:11:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:21:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:58 TS2339: Property 'status' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:27:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:38:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:39:26 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.

### K6. cross callback returns the wrong schema expression (src/todo.ts:30: `(user) => user.eq('id', userId)` -> `(user) => where.eq('archived', false)`): 1 diagnostic(s)

- src/todo.ts:30:65 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

### K7. softDelete removed: hook reads isDeleted (src/todo.ts:11: `softDelete: true,` -> ``): 10 diagnostic(s)

- src/todo.ts:37:13 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; createdAt: Date; updatedAt: Date; title: string; archived: boolean; priority: "low" | ... 2 more ... | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "todo" | ... 1 more ... | "done"; dueAt...'.
- src/usage.ts:12:104 TS2353: Object literal may only specify known properties, and 'isDeleted' does not exist in type 'Where<"Todo">'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:21:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:29:88 TS2353: Object literal may only specify known properties, and 'isDeleted' does not exist in type 'CreateInput<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; }, AppTypes<...>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly assignee: PointerRef | null; readonly parent: PointerRef | null; readonly createdAt: Date; ... 6 more ...; readonly dueAt: Date | null; }'.

### K8. rules declared for a schema of another file passed as a different schema's rules (wrong value) (src/ultimabase.ts:9: `todoRules, tagRules]` -> `todoRules, tagRules, Tag]`): 5 diagnostic(s)

- src/ultimabase.ts:9:10 TS2322: Type 'SchemaRules<"TodoUser">' is not assignable to type 'SchemaRules<string> & SchemaRegistrationError<`rules: ${string} is not in schemas`>'. /   Property ''~error'' is missing in type 'SchemaRules<"TodoUser">' but required in type 'SchemaRegistrationError<`rules: ${string} is not in schemas`>'.
- src/ultimabase.ts:9:25 TS2322: Type 'SchemaRules<"TodoRole">' is not assignable to type 'SchemaRules<string> & SchemaRegistrationError<`rules: ${string} is not in schemas`>'. /   Property ''~error'' is missing in type 'SchemaRules<"TodoRole">' but required in type 'SchemaRegistrationError<`rules: ${string} is not in schemas`>'.
- src/ultimabase.ts:9:40 TS2322: Type 'SchemaRules<"Todo">' is not assignable to type 'SchemaRules<string> & SchemaRegistrationError<`rules: ${string} is not in schemas`>'. /   Property ''~error'' is missing in type 'SchemaRules<"Todo">' but required in type 'SchemaRegistrationError<`rules: ${string} is not in schemas`>'.
- src/ultimabase.ts:9:51 TS2322: Type 'SchemaRules<"Tag">' is not assignable to type 'SchemaRules<string> & SchemaRegistrationError<`rules: ${string} is not in schemas`>'. /   Property ''~error'' is missing in type 'SchemaRules<"Tag">' but required in type 'SchemaRegistrationError<`rules: ${string} is not in schemas`>'.
- src/ultimabase.ts:9:61 TS2322: Type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 7 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "ta...' is not assignable to type 'SchemaRules<string> & SchemaRegistrationError<`rules: ${string} is not in schemas`>'. /   Property ''~rulesOf'' is missing in type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 7 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "ta...' but required in type 'SchemaRules<string>'.

## Summary

| Case | Detected | On the edited line | Diagnostics | First message (first line) | Length (first line / full) |
| --- | --- | --- | --- | --- | --- |
| 1. relation target typo | oui | oui | 2 | TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'? | 52 / 52 |
| 2. local where field typo | oui | oui | 1 | TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'. | 89 / 89 |
| 3. cross-schema field typo (Todo -> TodoUser) | oui | oui | 1 | TS2561 Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'? | 136 / 136 |
| 4. plugin-added field typo in a hook | oui | oui | 1 | TS2551 Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef \| null; parent: PointerRef \| null; isDeleted: boolean; createdAt: Date; updatedAt: Date; title: string; ... 4 more ...; dueAt: Date \| null; }>'. Did you mean 'isDeleted'? | 268 / 268 |
| 5. mappedBy typo | oui | non (src/ultimabase.ts:8) | 1 | TS2719 Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...'. Two different types with this name exist, but they are unrelated. | 743 / 1224 |
| 6. rules key typo | oui | oui | 5 | TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & HooksRuleTypes<"Todo"> & AclRuleTypes<"Todo">'. Did you mean to write 'access'? | 219 / 219 |
| 7. wrong filter return | oui | oui | 1 | TS2322 Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'. | 68 / 68 |
| 8. query select typo | oui | oui | 2 | TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'? | 429 / 429 |
| 8b. query select typo next to valid keys (Core query typing, all forms) | oui | non (src/usage.ts:16) | 2 | TS2339 Property 'title' does not exist on type '{ readonly id: string; readonly assignee: { readonly id: string; readonly displayName: string; } \| null; readonly priority: "low" \| "normal" \| "high" \| null; readonly dueAt: Date \| null; readonly subtasks: { ...; }[]; readonly titel: never; }'. | 285 / 285 |
| K1. rules forgotten in rules: [...] | oui | oui | 1 | TS2322 Type '[SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">]' is not assignable to type 'readonly [SchemaRules<"TodoUser">, SchemaRules<"TodoRole">, SchemaRules<"Todo">] & { readonly '~missingRules': SchemaRegistrationError<"no rules entry for Tag; register X.rules({}) to declare none">; }'. | 309 / 574 |
| K2. rules listed twice | oui | oui | 2 | TS2322 Type 'SchemaRules<"Todo">' is not assignable to type 'SchemaRules<"Todo"> & SchemaRegistrationError<"rules: Todo is listed twice">'. | 132 / 274 |
| K3. rules registered without their schema | oui | non (src/ultimabase.ts:9) | 1 | TS2322 Type 'SchemaRules<"Tag">' is not assignable to type 'SchemaRules<"Tag"> & SchemaRegistrationError<"rules: Tag is not in schemas">'. | 131 / 273 |
| K4. second schema from the RoleSchema factory | oui | non (src/ultimabase.ts:9) | 3 | TS2719 Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...'. Two different types with this name exist, but they are unrelated. | 743 / 1231 |
| K5. shape option typo in define | oui | oui | 29 | TS2345 Argument of type '"assignee"' is not assignable to parameter of type 'never'. | 77 / 77 |
| K6. cross callback returns the wrong schema expression | oui | oui | 1 | TS2322 Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. | 87 / 143 |
| K7. softDelete removed: hook reads isDeleted | oui | non (src/todo.ts:37) | 10 | TS2339 Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef \| null; parent: PointerRef \| null; createdAt: Date; updatedAt: Date; title: string; archived: boolean; priority: "low" \| ... 2 more ... \| null; allowedPriorities: readonly ("low" \| ... 1 more ... \| "high")[] \| null; status: "todo" \| ... 1 more ... \| "done"; dueAt...'. | 367 / 367 |
| K8. rules declared for a schema of another file passed as a different schema's rules (wrong value) | oui | oui | 5 | TS2322 Type 'SchemaRules<"TodoUser">' is not assignable to type 'SchemaRules<string> & SchemaRegistrationError<`rules: ${string} is not in schemas`>'. | 143 / 296 |
