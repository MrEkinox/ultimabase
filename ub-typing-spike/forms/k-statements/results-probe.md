# fixture

Baseline diagnostics: 0

## Hovers

### src/todo.ts `where }) => where.eq('archived'` (903 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        readonly displayName: ScalarField<...>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>>
```

### src/todo.ts `(user) => user.eq` (781 chars)

```
(parameter) user: WhereBuilder<Schema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>
```

### src/todo.ts `item }) =>` (414 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    createdAt: Date;
    updatedAt: Date;
    parent: PointerRef | null;
    isDeleted: boolean;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "todo" | "doing" | "done";
    dueAt: Date | null;
}>
```

### src/todo.ts `Todo = App` (884 chars)

```
const Todo: Schema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        readonly displayName: ScalarField<...>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>, unknown>
```

### src/todo.ts `access({` (834 chars)

```
(property) access: (rules: AccessOptions<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        ...;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>>) => void
```

### src/todo.ts `hooks({` (832 chars)

```
(property) hooks: (rules: HooksOptions<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        ...;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>>) => void
```

### src/ultimabase.ts `ultimabase = new` (830 chars)

```
const ultimabase: Application<readonly [Schema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>, Schema<...>, Schema<...>, Schema<...>]>
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

### src/tag.ts `(todo) => todo.is` (904 chars)

```
(parameter) todo: WhereBuilder<Schema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        readonly displayName: ScalarField<...>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>, unknown>>
```

### completions src/extra.ts `StaffRole.access({` (4)

create, delete, read, update

### completions src/extra.ts `StaffRole.` (8)

access, acl, addMember, className, createOne, findMany, hooks, postgres

### completions src/todo.ts `Todo = App.` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions src/tag.ts `Tag = App.Schema.define({` (1)

softDelete

## Error cases

### 1. relation target typo (src/todo.ts:19: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 2 diagnostic(s)

- src/todo.ts:19:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.

### 2. local where field typo (src/todo.ts:27: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:27:41 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'.

### 3. cross-schema field typo (Todo -> TodoUser) (src/todo.ts:31: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/todo.ts:31:46 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">; } & Pa...'. Did you mean to write 'email'?

### 4. plugin-added field typo in a hook (src/todo.ts:38: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:38:12 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; createdAt: Date; updatedAt: Date; parent: PointerRef | null; isDeleted: boolean; title: string; ... 4 more ...; dueAt: Date | null; }>'. Did you mean 'isDeleted'?

### 5. mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/ultimabase.ts:7:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "asignee">; } & Pa...'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"s

### 6. rules key typo (statement method) (src/todo.ts:26: `Todo.access({` -> `Todo.acess({`): 5 diagnostic(s)

- src/todo.ts:26:6 TS2551: Property 'acess' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>'. Did you mean 'access'?
- src/todo.ts:27:20 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:29:13 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:29:20 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:29:55 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7. wrong filter return (src/tag.ts:14: `where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `42`): 1 diagnostic(s)

- src/tag.ts:14:40 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 7 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppType...'.

### 8. query select typo (src/usage.ts:38: `select: { title: true } })` -> `select: { titel: true } })`): 2 diagnostic(s)

- src/usage.ts:38:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>>'. Did you mean to write 'title'?
- src/usage.ts:39:26 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 8b. query select typo next to valid keys (Core query typing, all forms) (src/usage.ts:11: `select: { title: true, dueAt: true, priority: true }` -> `select: { titel: true, dueAt: true, priority: true }`): 2 diagnostic(s)

- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; readonly assignee: { readonly id: string; readonly displayName: string; } | null; readonly priority: "low" | "normal" | "high" | null; readonly dueAt: Date | null; readonly subtasks: { ...; }[]; readonly titel: never; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

### K'1. rule statement declared twice (src/todo.ts:42: `Todo.postgres({ table: 'todos'` -> `Todo.hooks({})
Todo.postgres({ table: 'todos'`): 0 diagnostic(s)


### K'2. option key typo inside a statement (src/todo.ts:27: `read: { where: ({ where }) => where.eq('archived', false) },` -> `red: { where: ({ where }) => where.eq('archived', false) },`): 2 diagnostic(s)

- src/todo.ts:27:2 TS2561: Object literal may only specify known properties, but 'red' does not exist in type 'AccessOptions<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'read'?
- src/todo.ts:27:19 TS7031: Binding element 'where' implicitly has an 'any' type.

### K'3. second schema from the RoleSchema factory (src/ultimabase.ts:7: `schemas: [TodoUser, TodoRole, Todo, Tag]` -> `schemas: [TodoUser, TodoRole, Todo, Tag, StaffRole]`): 2 diagnostic(s)

- src/ultimabase.ts:8:57 TS2322: Type 'Schema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<....' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, App...'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string",
- src/ultimabase.ts:8:78 TS2322: Type 'Schema<"StaffRole", Readonly<Record<never, never>> & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>, RoleModel & { ...; }>' is not assignable to type 'DefinedSchema<"StaffRole", Readonly<Record<never, never>> & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>> & RuleStatements<......'. /   Property ''~error'' is missing in type 'DefinedSchema<"StaffRole", Readonly<Record<never, never>> & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: R

### K'4. shape option typo in define (src/todo.ts:11: `softDelete: true,` -> `sofDelete: true,`): 29 diagnostic(s)

- src/tag.ts:14:78 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:14:105 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:14:78 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>, unknown>>'.
- src/todo.ts:11:2 TS2561: Object literal may only specify known properties, but 'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; }> & { ...; }'. Did you mean to write 'softDelete'?
- src/todo.ts:27:41 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/todo.ts:29:42 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:29:69 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:31:25 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/todo.ts:38:12 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/todo.ts:42:54 TS2322: Type '"status"' is not assignable to type 'ScalarKeys<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/todo.ts:42:64 TS2322: Type '"dueAt"' is not assignable to type 'ScalarKeys<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/ultimabase.ts:7:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>, unknown>, "assignee">; } & PasswordUserOwnedFields, App...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>, unknown>, "assignee">; } & PasswordUserOwnedFiel...'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", unknown, AppTypes<readonly [Post
- src/ultimabase.ts:7:73 TS2322: Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>, unknown>, "tags">; }, AppTypes<...>, unknown>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>, unknown>, "tags">; }, AppTypes<...>> & RuleStatements<...> & SchemaR...'. /   Property ''~error'' is missing in type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readon
- src/usage.ts:10:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>, unknown>>'.
- src/usage.ts:11:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>, unknown>>'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>, unknown>>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:21:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:58 TS2339: Property 'status' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:27:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>, unknown>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:38:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>, unknown>>'.
- src/usage.ts:39:26 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.

### K'5. cross callback returns the wrong schema expression (src/todo.ts:29: `(user) => user.eq('id', userId)` -> `(user) => where.eq('archived', false)`): 1 diagnostic(s)

- src/todo.ts:29:64 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

### K'6. statement moved into a function called later (after registration) (src/todo.ts:34: `Todo.acl({` -> `export const late = () => Todo.acl({`): 0 diagnostic(s)


## Summary

| Case | Detected | On the edited line | Diagnostics | First message (first line) | Length (first line / full) |
| --- | --- | --- | --- | --- | --- |
| 1. relation target typo | oui | oui | 2 | TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'? | 52 / 52 |
| 2. local where field typo | oui | oui | 1 | TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. | 385 / 385 |
| 3. cross-schema field typo (Todo -> TodoUser) | oui | oui | 1 | TS2561 Object literal may only specify known properties, but 'emial' does not exist in type 'Where<Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">; } & Pa...'. Did you mean to write 'email'? | 439 / 439 |
| 4. plugin-added field typo in a hook | oui | oui | 1 | TS2551 Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef \| null; createdAt: Date; updatedAt: Date; parent: PointerRef \| null; isDeleted: boolean; title: string; ... 4 more ...; dueAt: Date \| null; }>'. Did you mean 'isDeleted'? | 268 / 268 |
| 5. mappedBy typo | oui | non (src/ultimabase.ts:7) | 1 | TS2322 Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "asignee">; } & Pa...'. | 677 / 1158 |
| 6. rules key typo (statement method) | oui | oui | 5 | TS2551 Property 'acess' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>'. Did you mean 'access'? | 370 / 370 |
| 7. wrong filter return | oui | oui | 1 | TS2322 Type 'number' is not assignable to type 'AccessFilterResult<DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 7 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppType...'. | 363 / 363 |
| 8. query select typo | oui | oui | 2 | TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>>'. Did you mean to write 'title'? | 431 / 431 |
| 8b. query select typo next to valid keys (Core query typing, all forms) | oui | non (src/usage.ts:16) | 2 | TS2339 Property 'title' does not exist on type '{ readonly id: string; readonly assignee: { readonly id: string; readonly displayName: string; } \| null; readonly priority: "low" \| "normal" \| "high" \| null; readonly dueAt: Date \| null; readonly subtasks: { ...; }[]; readonly titel: never; }'. | 285 / 285 |
| K'1. rule statement declared twice | NON | - | 0 | - | 0 |
| K'2. option key typo inside a statement | oui | oui | 2 | TS2561 Object literal may only specify known properties, but 'red' does not exist in type 'AccessOptions<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'read'? | 433 / 433 |
| K'3. second schema from the RoleSchema factory | oui | non (src/ultimabase.ts:8) | 2 | TS2322 Type 'Schema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<....' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, App...'. | 677 / 1165 |
| K'4. shape option typo in define | oui | oui | 29 | TS2345 Argument of type '"assignee"' is not assignable to parameter of type 'never'. | 77 / 77 |
| K'5. cross callback returns the wrong schema expression | oui | oui | 1 | TS2322 Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. | 87 / 143 |
| K'6. statement moved into a function called later (after registration) | NON | - | 0 | - | 0 |
