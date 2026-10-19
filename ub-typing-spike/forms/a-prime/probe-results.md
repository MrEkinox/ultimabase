# a-prime/fixture

Baseline diagnostics: 0

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 39 | `(parameter) where: WhereBuilder<"Todo">` |
| cross-schema builder | 42 | `(parameter) user: WhereBuilder<"TodoUser">` |
| hook item | 390 | `(parameter) item: Readonly<{` |
| schema constant | 857 | `const Todo: DefinedSchema<"Todo", {` |
| rules entry `.with(` | 892 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |
| findMany result | 373 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema constant (TodoUser) | 894 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| role where (two factories) | 43 | `(parameter) where: WhereBuilder<"TodoRole">` |

### where (builder) — src/todo.ts `where }) => where.eq('archived'` (39 chars)

```
(parameter) where: WhereBuilder<"Todo">
```

### cross-schema builder — src/todo.ts `(user) => user.eq` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### hook item — src/todo.ts `item }) => {` (390 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
}>
```

### schema constant — src/todo.ts `Todo = App` (857 chars)

```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>
```

### rules entry `.with(` — src/todo.ts `.with({` (892 chars)

```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<"Todo">): DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | ... 1 more ... | "high")[], false>;
    ... 4 more ...;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>
```

### findMany result — src/usage.ts `pending = await` (373 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly email: string;
    } | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly status: "open" | "doing" | "done";
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### field hook value — src/todo-user.ts `value }) => value.trim()` (25 chars)

```
(parameter) value: string
```

### factory schema constant (TodoUser) — src/todo-user.ts `TodoUser = App` (894 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (43 chars)

```
(parameter) where: WhereBuilder<"TodoRole">
```

## Hovers — WITHOUT the Register line (0 diagnostic(s))

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 878 | `(parameter) where: WhereBuilder<DefinedSchema<"Todo", {` |
| cross-schema builder | 910 | `(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {` |
| hook item | 390 | `(parameter) item: Readonly<{` |
| schema constant | 857 | `const Todo: DefinedSchema<"Todo", {` |
| rules entry `.with(` | 1301 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |
| findMany result | 373 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema constant (TodoUser) | 894 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| role where (two factories) | 854 | `(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {` |

### where (builder) — src/todo.ts `where }) => where.eq('archived'` (878 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>>
```

### cross-schema builder — src/todo.ts `(user) => user.eq` (910 chars)

```
(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>
```

### hook item — src/todo.ts `item }) => {` (390 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    createdAt: Date;
    updatedAt: Date;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
}>
```

### schema constant — src/todo.ts `Todo = App` (857 chars)

```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>
```

### rules entry `.with(` — src/todo.ts `.with({` (1301 chars)

```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>> & AccessSchemaOption<...> & HooksSchemaOption<...> & Readonly<...> & AclSchemaOption<...>): DefinedSchema<...>
```

### findMany result — src/usage.ts `pending = await` (373 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly email: string;
    } | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly status: "open" | "doing" | "done";
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### field hook value — src/todo-user.ts `value }) => value.trim()` (25 chars)

```
(parameter) value: string
```

### factory schema constant (TodoUser) — src/todo-user.ts `TodoUser = App` (894 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (854 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>, AppTypes<...>>>
```

### completions rules entry (empty .with({})) src/discover.ts `".with({ "` (4)

access, acl, hooks, postgres

### completions define declaration keys src/discover.ts `"className: 'Note', "` (2)

fields, softDelete

### completions after define(...). (discover) src/discover.ts `"field.string() }) })."` (4)

className, createOne, findMany, with

### completions App. src/todo.ts `"= App."` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions after define(...). src/tag.ts `"\n})."` (4)

className, createOne, findMany, with

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 relation target typo | yes | yes | 3 | TS2552 (52) |
| 2 | 2 local where typo | yes | yes | 1 | TS2345 (89) |
| 3 | 3 cross-schema field typo (object filter) | yes | yes | 1 | TS2561 (136) |
| 4 | 4 plugin field typo in hook | yes | yes | 1 | TS2551 (392) |
| 5 | 5 mappedBy typo | yes | no (src/ultimabase.ts:9) | 1 | TS2322 (1158) |
| 6 | 6 rules key typo | yes | yes | 5 | TS2561 (261) |
| 7 | 7 wrong filter return | yes | yes | 1 | TS2322 (68) |
| 8 | 8 query select typo | yes | yes | 1 | TS2561 (421) |
| 9 | extra cross-schema builder typo | yes | yes | 1 | TS2345 (91) |
| 10 | extra cross callback returns the wrong schema | yes | yes | 1 | TS2322 (143) |
| 11 | extra field hook returns a number | yes | yes | 1 | TS2322 (184) |
| 12 | extra field hook key typo | yes | yes | 2 | TS2561 (152) |
| 13 | extra index on unknown field | yes | yes | 1 | TS2820 (91) |
| 14 | extra hook item is readonly | yes | yes | 1 | TS2540 (60) |
| 15 | extra second role schema registered | yes | yes | 2 | TS2322 (1165) |
| 16 | extra role schema missing | yes | yes | 1 | TS2345 (1198) |
| 17 | extra Register removed (plain D) | NO | — | 0 | — |
| 18 | extra shape option key typo (sofDelete) | yes | yes | 28 | TS2561 (443) |
| 19 | extra shape option wrong value | yes | yes | 28 | TS2322 (50) |
| 20 | extra shape option removed, hook reads isDeleted | yes | yes | 10 | TS2339 (361) |
| 21 | extra unknown declaration key next to a shape option | yes | yes | 28 | TS2322 (46) |
| 22 | extra field option wrong value (required: 'yes') | yes | yes | 3 | TS2322 (62) |
| 23 | extra className not a string | yes | yes | 28 | TS2322 (49) |

### 1. 1 relation target typo (src/todo.ts:16: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 3 diagnostic(s)

Primary: TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

- src/todo.ts:16:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:19:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.

### 2. 2 local where typo (src/todo.ts:23: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

- src/todo.ts:23:42 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

### 3. 3 cross-schema field typo (object filter) (src/todo.ts:27: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

- src/todo.ts:27:47 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

### 4. 4 plugin field typo in hook (src/todo.ts:32: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

Primary: TS2551 Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; createdAt: Date; updatedAt: Date; title: string; archived: boolean; priority: "low" | ... 2 more ... | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "open" | ... 1 more ... | "done"; isDel...'. Did you mean 'isDeleted'?

- src/todo.ts:32:13 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; createdAt: Date; updatedAt: Date; title: string; archived: boolean; priority: "low" | ... 2 more ... | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "open" | ... 1 more ... | "done"; isDel...'. Did you mean 'isDeleted'?

### 5. 5 mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

Primary: TS2322 Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...'. /   Property ''~error'

### 6. 6 rules key typo (src/todo.ts:22: `access: {` -> `acess: {`): 5 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?

- src/todo.ts:22:2 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?
- src/todo.ts:23:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:25:14 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:25:21 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:25:56 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7. 7 wrong filter return (src/tag.ts:13: `({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `() => 42`): 1 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

- src/tag.ts:13:24 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

### 8. 8 query select typo (src/usage.ts:57: `select: { title: true } })` -> `select: { titel: true } })`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'. Did you mean to write 'title'?

- src/usage.ts:57:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'. Did you mean to write 'title'?

### 9. extra cross-schema builder typo (src/todo.ts:25: `user.eq('id', userId)` -> `user.eq('emial', userId)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

- src/todo.ts:25:73 TS2345: Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

### 10. extra cross callback returns the wrong schema (src/todo.ts:25: `(user) => user.eq('id', userId)` -> `(user) => where.eq('archived', false)`): 1 diagnostic(s)

Primary: TS2322 Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

- src/todo.ts:25:65 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

### 11. extra field hook returns a number (src/todo-user.ts:17: `value.trim()` -> `value.length`): 1 diagnostic(s)

Primary: TS2322 Type '({ value }: { readonly value: string; }) => number' is not assignable to type '(args: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

- src/todo-user.ts:17:28 TS2322: Type '({ value }: { readonly value: string; }) => number' is not assignable to type '(args: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

### 12. extra field hook key typo (src/todo-user.ts:17: `fields: { displayName:` -> `fields: { displayNme:`): 2 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'displayNme' does not exist in type 'FieldHooks<"TodoUser">'. Did you mean to write 'displayName'?

- src/todo-user.ts:17:13 TS2561: Object literal may only specify known properties, but 'displayNme' does not exist in type 'FieldHooks<"TodoUser">'. Did you mean to write 'displayName'?
- src/todo-user.ts:17:44 TS7031: Binding element 'value' implicitly has an 'any' type.

### 13. extra index on unknown field (src/todo.ts:35: `fields: ['archived', 'priority']` -> `fields: ['archived', 'priorty']`): 1 diagnostic(s)

Primary: TS2820 Type '"priorty"' is not assignable to type 'ScalarKeys<"Todo">'. Did you mean '"priority"'?

- src/todo.ts:35:63 TS2820: Type '"priorty"' is not assignable to type 'ScalarKeys<"Todo">'. Did you mean '"priority"'?

### 14. extra hook item is readonly (src/todo.ts:32: `if (item.isDeleted) throw new TypeError('Deleted todos are read-only')` -> `item.title = ''`): 1 diagnostic(s)

Primary: TS2540 Cannot assign to 'title' because it is a read-only property.

- src/todo.ts:32:9 TS2540: Cannot assign to 'title' because it is a read-only property.

### 15. extra second role schema registered (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, TodoRole, Todo, Tag, AdminRole]`): 2 diagnostic(s)

Primary: TS2322 Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.

- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......'. /   Property ''~error'
- src/ultimabase.ts:9:78 TS2322: Type 'Schema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>, RoleModel & { ......' is not assignable to type 'DefinedSchema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>> & RulesMet...'. /   Property ''~error'

### 16. extra role schema missing (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, Todo, Tag]`): 1 diagnostic(s)

Primary: TS2345 Argument of type '{ schemas: [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "assignee">; ...' is not assignable to parameter of type 'ApplicationOptions<readonly [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<......'. /   Property ''~missing'' is missing in type '{ schemas: [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "assignee">; ...' but required in type '{ readonly '~missing': SchemaRegistrationError<"no registered schema created by factory 'RoleSchema'">; }'.

- src/ultimabase.ts:9:35 TS2345: Argument of type '{ schemas: [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "assignee">; ...' is not assignable to parameter of type 'ApplicationOptions<readonly [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<......

### 17. extra Register removed (plain D) (src/ultimabase.ts:14: `readonly app: typeof ultimabase` -> `readonly unrelated: true`): 0 diagnostic(s)

Primary: (none)



### 18. extra shape option key typo (sofDelete) (src/todo.ts:9: `softDelete: true,` -> `sofDelete: true,`): 28 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; }> & ShapeDeclaration<...> & NoExtraKeys<...>'. Did you mean to write 'softDelete'?

- src/tag.ts:13:79 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:13:106 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:13:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:9:2 TS2561: Object literal may only specify known properties, but 'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; }> & ShapeDeclaration<...> & NoExtraKeys<...>'. Did you mean to write 'softDelete'?
- src/todo.ts:23:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:25:43 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:70 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:27:26 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<"Todo">'.
- src/todo.ts:32:13 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/todo.ts:35:51 TS2322: Type '"archived"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/todo.ts:35:63 TS2322: Type '"priority"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; } & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSc
- src/ultimabase.ts:9:73 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...'. Two different types wi
- src/usage.ts:11:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:58 TS2339: Property 'tags' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:26:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<"Todo">'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.

### 19. extra shape option wrong value (src/todo.ts:9: `softDelete: true,` -> `softDelete: 'yes',`): 28 diagnostic(s)

Primary: TS2322 Type 'string' is not assignable to type 'boolean'.

- src/tag.ts:13:79 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:13:106 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:13:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:9:2 TS2322: Type 'string' is not assignable to type 'boolean'.
- src/todo.ts:23:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:25:43 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:70 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:27:26 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<"Todo">'.
- src/todo.ts:32:13 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/todo.ts:35:51 TS2322: Type '"archived"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/todo.ts:35:63 TS2322: Type '"priority"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; } & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSc
- src/ultimabase.ts:9:73 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...'. Two different types wi
- src/usage.ts:11:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:58 TS2339: Property 'tags' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:26:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<"Todo">'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.

### 20. extra shape option removed, hook reads isDeleted (src/todo.ts:32: `	softDelete: true,
` -> `
`): 10 diagnostic(s)

Primary: TS2339 Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; createdAt: Date; updatedAt: Date; title: string; archived: boolean; priority: "low" | ... 2 more ... | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "open" | ... 1 more ... | "done"; }>'.

- src/todo.ts:32:13 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; createdAt: Date; updatedAt: Date; title: string; archived: boolean; priority: "low" | ... 2 more ... | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "open" | ... 1 more ... | "done"; }>'.
- src/usage.ts:13:98 TS2353: Object literal may only specify known properties, and 'isDeleted' does not exist in type 'Where<"Todo">'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:29:103 TS2353: Object literal may only specify known properties, and 'isDeleted' does not exist in type 'CreateInput<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & Readonly<...>, AppTypes<...>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly assignee: PointerRef | null; readonly parent: PointerRef | null; readonly createdAt: Date; ... 5 more ...; readonly status: "open" | ... 1 more ... | "done"; }'.

### 21. extra unknown declaration key next to a shape option (src/todo.ts:9: `softDelete: true,` -> `softDelete: true, versiond: true,`): 28 diagnostic(s)

Primary: TS2322 Type 'true' is not assignable to type 'never'.

- src/tag.ts:13:79 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:13:106 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:13:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:9:20 TS2322: Type 'true' is not assignable to type 'never'.
- src/todo.ts:23:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.
- src/todo.ts:25:43 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:70 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:27:26 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<"Todo">'.
- src/todo.ts:32:13 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/todo.ts:35:51 TS2322: Type '"archived"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/todo.ts:35:63 TS2322: Type '"priority"' is not assignable to type 'ScalarKeys<"Todo">'.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; } & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSc
- src/ultimabase.ts:9:73 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...'. Two different types wi
- src/usage.ts:11:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:58 TS2339: Property 'tags' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:26:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<"Todo">'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.

### 22. extra field option wrong value (required: 'yes') (src/todo.ts:11: `title: field.string({ required: true,` -> `title: field.string({ required: 'yes',`): 3 diagnostic(s)

Primary: TS2322 Type 'string' is not assignable to type 'boolean | undefined'.

- src/todo.ts:11:25 TS2322: Type 'string' is not assignable to type 'boolean | undefined'.
- src/usage.ts:16:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 23. extra className not a string (src/todo.ts:8: `className: 'Todo',` -> `className: 42,`): 28 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'string'.

- src/tag.ts:13:79 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:13:106 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:13:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<string>'.
- src/todo.ts:8:2 TS2322: Type 'number' is not assignable to type 'string'.
- src/todo.ts:23:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<string>'.
- src/todo.ts:25:43 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:70 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:27:26 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<string>'.
- src/todo.ts:32:13 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/todo.ts:35:51 TS2322: Type '"archived"' is not assignable to type 'ScalarKeys<string>'.
- src/todo.ts:35:63 TS2322: Type '"priority"' is not assignable to type 'ScalarKeys<string>'.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<string, Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<string, Readonly<Record<never, never>>, AppTypes<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; } & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSc
- src/ultimabase.ts:9:73 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"Tag", { readonly name: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/a-prime/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", string, true>; readonly ...'. Two different types wi
- src/usage.ts:11:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<DefinedSchema<string, Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<string, Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:58 TS2339: Property 'tags' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:26:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<DefinedSchema<string, Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<string>'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<string, Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>>'.
