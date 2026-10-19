# idea-a/fixture

Baseline diagnostics: 0

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 39 | `(parameter) where: WhereBuilder<"Todo">` |
| cross-schema builder | 42 | `(parameter) user: WhereBuilder<"TodoUser">` |
| hook item | 31 | `(parameter) item: Model<"Todo">` |
| schema constant | 25 | `const Todo: typeof Schema` |
| rules entry `.with(` | 483 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |
| findMany result | 373 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema constant (TodoUser) | 509 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| role where (two factories) | 43 | `(parameter) where: WhereBuilder<"TodoRole">` |
| hook originalItem | 46 | `(parameter) originalItem: Model<"Todo"> \| null` |
| findMany() no args | 31 | `const allTodos: Model<"Todo">[]` |
| findMany({ where }) no select | 32 | `const openTodos: Model<"Todo">[]` |
| findOne({ where }) | 35 | `const oneTodo: Model<"Todo"> \| null` |
| createOne({ data }) | 29 | `const madeTodo: Model<"Todo">` |
| findOne + select (partial) | 79 | `const oneTitle: {` |
| findMany + include (partial) | 725 | `const withAssignee: {` |
| Model<typeof Todo> | 26 | `const model: Model<"Todo">` |
| CreateInput<typeof Todo> | 38 | `const createInput: CreateInput<"Todo">` |
| UpdateInput<typeof Todo> | 38 | `const updateInput: UpdateInput<"Todo">` |

### where (builder) — src/todo.ts `where }) => where.eq('archived'` (39 chars)

```
(parameter) where: WhereBuilder<"Todo">
```

### cross-schema builder — src/todo.ts `(user) => user.eq` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### hook item — src/todo.ts `item }) => {` (31 chars)

```
(parameter) item: Model<"Todo">
```

### schema constant — src/todo.ts `Todo = App` (25 chars)

```
const Todo: typeof Schema
```

### rules entry `.with(` — src/todo.ts `.with({` (483 chars)

```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<"Todo">): typeof Schema
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

### factory schema constant (TodoUser) — src/todo-user.ts `TodoUser = App` (509 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => typeof Schema, "assignee">;
} & PasswordUserOwnedFields, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<Record<never, never>> & object & {
    ...;
}, Readonly<...> & ... 1 more ... & SoftDeleteShapes>, PasswordUserModel & {
    ...;
}>
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (43 chars)

```
(parameter) where: WhereBuilder<"TodoRole">
```

### hook originalItem — src/todo.ts `originalItem }) =>` (46 chars)

```
(parameter) originalItem: Model<"Todo"> | null
```

### findMany() no args — src/named.ts `allTodos = await` (31 chars)

```
const allTodos: Model<"Todo">[]
```

### findMany({ where }) no select — src/named.ts `openTodos = await` (32 chars)

```
const openTodos: Model<"Todo">[]
```

### findOne({ where }) — src/named.ts `oneTodo = await` (35 chars)

```
const oneTodo: Model<"Todo"> | null
```

### createOne({ data }) — src/named.ts `madeTodo = await` (29 chars)

```
const madeTodo: Model<"Todo">
```

### findOne + select (partial) — src/named.ts `oneTitle = await` (79 chars)

```
const oneTitle: {
    readonly id: string;
    readonly title: string;
} | null
```

### findMany + include (partial) — src/named.ts `withAssignee = await` (725 chars)

```
const withAssignee: {
    readonly acl: ACL;
    readonly id: string;
    readonly assignee: {
        readonly acl: ACL;
        readonly id: string;
        readonly displayName: string;
        readonly username: string;
        readonly email: string;
        readonly createdAt: Date;
        readonly updatedAt: Date;
    } | null;
    readonly parent: PointerRef | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly title: string;
    readonly archived: boolean;
    readonly priority: "low" | "normal" | "high" | null;
    readonly allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    readonly status: "open" | ... 1 more ... | "done";
    readonly isDeleted: boolean;
}[]
```

### Model<typeof Todo> — src/named.ts `model: Model` (26 chars)

```
const model: Model<"Todo">
```

### CreateInput<typeof Todo> — src/named.ts `createInput: CreateInput` (38 chars)

```
const createInput: CreateInput<"Todo">
```

### UpdateInput<typeof Todo> — src/named.ts `updateInput: UpdateInput` (38 chars)

```
const updateInput: UpdateInput<"Todo">
```

## Hovers — WITHOUT the Register line (0 diagnostic(s))

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 878 | `(parameter) where: WhereBuilder<DefinedSchema<"Todo", {` |
| cross-schema builder | 525 | `(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {` |
| hook item | 390 | `(parameter) item: Readonly<{` |
| schema constant | 25 | `const Todo: typeof Schema` |
| rules entry `.with(` | 1296 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |
| findMany result | 373 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema constant (TodoUser) | 509 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| role where (two factories) | 652 | `(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {` |
| hook originalItem | 405 | `(parameter) originalItem: Readonly<{` |
| findMany() no args | 390 | `const allTodos: Readonly<{` |
| findMany({ where }) no select | 391 | `const openTodos: Readonly<{` |
| findOne({ where }) | 394 | `const oneTodo: Readonly<{` |
| createOne({ data }) | 388 | `const madeTodo: Readonly<{` |
| findOne + select (partial) | 79 | `const oneTitle: {` |
| findMany + include (partial) | 718 | `const withAssignee: {` |
| Model<typeof Todo> | 385 | `const model: Readonly<{` |
| CreateInput<typeof Todo> | 45 | `const createInput: CreateInput<typeof Schema>` |
| UpdateInput<typeof Todo> | 45 | `const updateInput: UpdateInput<typeof Schema>` |

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

### cross-schema builder — src/todo.ts `(user) => user.eq` (525 chars)

```
(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => typeof Schema, "assignee">;
} & PasswordUserOwnedFields, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<Record<never, never>> & object & {
    ...;
}, Readonly<...> & ... 1 more ... & SoftDeleteShapes>, PasswordUserModel & {
    ...;
}>>
```

### hook item — src/todo.ts `item }) => {` (390 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>
```

### schema constant — src/todo.ts `Todo = App` (25 chars)

```
const Todo: typeof Schema
```

### rules entry `.with(` — src/todo.ts `.with({` (1296 chars)

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
}, AppTypes<...>>> & AccessSchemaOption<...> & HooksSchemaOption<...> & Readonly<...> & AclSchemaOption<...>): typeof Schema
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

### factory schema constant (TodoUser) — src/todo-user.ts `TodoUser = App` (509 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => typeof Schema, "assignee">;
} & PasswordUserOwnedFields, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<Record<never, never>> & object & {
    ...;
}, Readonly<...> & ... 1 more ... & SoftDeleteShapes>, PasswordUserModel & {
    ...;
}>
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (652 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => typeof Schema, "assignee">;
} & PasswordUserOwnedFields, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & {
    ...;
}, Readonly<...> & ... 1 more ... & SoftDeleteShapes>, PasswordUserModel & {
    ...;
}>>, AppTypes<...>>>
```

### hook originalItem — src/todo.ts `originalItem }) =>` (405 chars)

```
(parameter) originalItem: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}> | null
```

### findMany() no args — src/named.ts `allTodos = await` (390 chars)

```
const allTodos: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>[]
```

### findMany({ where }) no select — src/named.ts `openTodos = await` (391 chars)

```
const openTodos: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>[]
```

### findOne({ where }) — src/named.ts `oneTodo = await` (394 chars)

```
const oneTodo: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}> | null
```

### createOne({ data }) — src/named.ts `madeTodo = await` (388 chars)

```
const madeTodo: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>
```

### findOne + select (partial) — src/named.ts `oneTitle = await` (79 chars)

```
const oneTitle: {
    readonly id: string;
    readonly title: string;
} | null
```

### findMany + include (partial) — src/named.ts `withAssignee = await` (718 chars)

```
const withAssignee: {
    readonly acl: ACL;
    readonly id: string;
    readonly assignee: {
        readonly acl: ACL;
        readonly id: string;
        readonly createdAt: Date;
        readonly updatedAt: Date;
        readonly displayName: string;
        readonly username: string;
        readonly email: string;
    } | null;
    readonly parent: PointerRef | null;
    readonly title: string;
    readonly archived: boolean;
    readonly priority: "low" | "normal" | "high" | null;
    readonly allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    readonly status: "open" | "doing" | "done";
    readonly isDeleted: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}[]
```

### Model<typeof Todo> — src/named.ts `model: Model` (385 chars)

```
const model: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>
```

### CreateInput<typeof Todo> — src/named.ts `createInput: CreateInput` (45 chars)

```
const createInput: CreateInput<typeof Schema>
```

### UpdateInput<typeof Todo> — src/named.ts `updateInput: UpdateInput` (45 chars)

```
const updateInput: UpdateInput<typeof Schema>
```

### completions rules entry (empty .with({})) src/discover.ts `".with({ "` (4)

access, acl, hooks, postgres

### completions define declaration keys src/discover.ts `"className: 'Note', "` (1)

fields

### completions after define(...). (discover) src/discover.ts `"field.string() }) })."` (6)

className, createOne, findMany, findOne, softDelete, with

### completions App. src/todo.ts `"= App."` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions after define(...). src/todo.ts `"\n\t.softDelete"` (6)

className, createOne, findMany, findOne, softDelete, with

### completions after .softDelete(). src/todo.ts `".softDelete()\n\t."` (5)

className, createOne, findMany, findOne, with

### completions item. (hook) src/todo.ts `"item.isDeleted"` (12)

acl, allowedPriorities, archived, assignee, createdAt, id, isDeleted, parent, priority, status, title, updatedAt

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 relation target typo | yes | yes | 3 | TS2552 (52) |
| 2 | 2 local where typo | yes | yes | 1 | TS2345 (89) |
| 3 | 3 cross-schema field typo (object filter) | yes | yes | 1 | TS2561 (136) |
| 4 | 4 plugin field typo in hook | yes | yes | 1 | TS2551 (85) |
| 5 | 5 mappedBy typo | yes | no (src/ultimabase.ts:9) | 1 | TS2322 (814) |
| 6 | 6 rules key typo | yes | yes | 5 | TS2561 (261) |
| 7 | 7 wrong filter return | yes | yes | 1 | TS2322 (68) |
| 8 | 8 query select typo | yes | yes | 1 | TS2561 (140) |
| 9 | extra cross-schema builder typo | yes | yes | 1 | TS2345 (91) |
| 10 | extra cross callback returns the wrong schema | yes | yes | 1 | TS2322 (143) |
| 11 | extra field hook returns a number | yes | yes | 1 | TS2322 (184) |
| 12 | extra field hook key typo | yes | yes | 2 | TS2561 (152) |
| 13 | extra index on unknown field | yes | yes | 1 | TS2820 (91) |
| 14 | extra hook item is readonly | yes | yes | 1 | TS2540 (60) |
| 15 | extra softDelete called twice | yes | no (src/named.ts:26) | 19 | TS2344 (52) |
| 16 | extra shape method after .with | yes | yes | 29 | TS2339 (61) |
| 17 | extra second role schema registered | yes | yes | 2 | TS2322 (984) |
| 18 | extra role schema missing | yes | yes | 1 | TS2345 (1110) |
| 19 | extra Register removed (plain D) | NO | — | 0 | — |
| 20 | extra field option wrong value (required: 'yes') | yes | yes | 4 | TS2322 (62) |
| 21 | extra className not a string | yes | yes | 33 | TS2322 (49) |
| 22 | extra findMany() element typo | yes | yes | 1 | TS2551 (78) |
| 23 | extra Model<typeof Todo> typo | yes | yes | 1 | TS2551 (78) |
| 24 | extra originalItem typo | yes | yes | 1 | TS2551 (85) |

### 1. 1 relation target typo (src/todo.ts:15: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 3 diagnostic(s)

Primary: TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

- src/todo.ts:15:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:19:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.

### 2. 2 local where typo (src/todo.ts:24: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

- src/todo.ts:24:43 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

### 3. 3 cross-schema field typo (object filter) (src/todo.ts:28: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

- src/todo.ts:28:48 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

### 4. 4 plugin field typo in hook (src/todo.ts:33: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

Primary: TS2551 Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?

- src/todo.ts:33:14 TS2551: Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?

### 5. 5 mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

Primary: TS2322 Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "asignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'typeof Schema & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'. /   Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "asignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "asignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'typeof Schema & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'. /   Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "asignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is no

### 6. 6 rules key typo (src/todo.ts:23: `access: {` -> `acess: {`): 5 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?

- src/todo.ts:23:3 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?
- src/todo.ts:24:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:26:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:26:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:26:57 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7. 7 wrong filter return (src/tag.ts:13: `({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `() => 42`): 1 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

- src/tag.ts:13:24 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

### 8. 8 query select typo (src/usage.ts:57: `select: { title: true } })` -> `select: { titel: true } })`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<typeof Schema>'. Did you mean to write 'title'?

- src/usage.ts:57:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<typeof Schema>'. Did you mean to write 'title'?

### 9. extra cross-schema builder typo (src/todo.ts:26: `user.eq('id', userId)` -> `user.eq('emial', userId)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

- src/todo.ts:26:74 TS2345: Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

### 10. extra cross callback returns the wrong schema (src/todo.ts:26: `(user) => user.eq('id', userId)` -> `(user) => where.eq('archived', false)`): 1 diagnostic(s)

Primary: TS2322 Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

- src/todo.ts:26:66 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

### 11. extra field hook returns a number (src/todo-user.ts:17: `value.trim()` -> `value.length`): 1 diagnostic(s)

Primary: TS2322 Type '({ value }: { readonly value: string; }) => number' is not assignable to type '(args: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

- src/todo-user.ts:17:28 TS2322: Type '({ value }: { readonly value: string; }) => number' is not assignable to type '(args: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

### 12. extra field hook key typo (src/todo-user.ts:17: `fields: { displayName:` -> `fields: { displayNme:`): 2 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'displayNme' does not exist in type 'FieldHooks<"TodoUser">'. Did you mean to write 'displayName'?

- src/todo-user.ts:17:13 TS2561: Object literal may only specify known properties, but 'displayNme' does not exist in type 'FieldHooks<"TodoUser">'. Did you mean to write 'displayName'?
- src/todo-user.ts:17:44 TS7031: Binding element 'value' implicitly has an 'any' type.

### 13. extra index on unknown field (src/todo.ts:37: `fields: ['archived', 'priority']` -> `fields: ['archived', 'priorty']`): 1 diagnostic(s)

Primary: TS2820 Type '"priorty"' is not assignable to type 'ScalarKeys<"Todo">'. Did you mean '"priority"'?

- src/todo.ts:37:64 TS2820: Type '"priorty"' is not assignable to type 'ScalarKeys<"Todo">'. Did you mean '"priority"'?

### 14. extra hook item is readonly (src/todo.ts:33: `if (item.isDeleted) throw new TypeError('Deleted todos are read-only')` -> `item.title = ''`): 1 diagnostic(s)

Primary: TS2540 Cannot assign to 'title' because it is a read-only property.

- src/todo.ts:33:10 TS2540: Cannot assign to 'title' because it is a read-only property.

### 15. extra softDelete called twice (src/todo.ts:21: `	.softDelete()
` -> `	.softDelete()
	.softDelete()
`): 19 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:22:3 TS2339: Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
- src/todo.ts:25:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:27:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:27:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:27:57 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/todo.ts:33:21 TS7031: Binding element 'item' implicitly has an 'any' type.
- src/todo.ts:36:18 TS7031: Binding element 'originalItem' implicitly has an 'any' type.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => any, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'typeof Schema & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<"TodoUser: factory 'PasswordUserSchema' already created another registered schema">'. /   Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => any, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not a
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'typeof Schema & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'. /   Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly display
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:49:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 16. extra shape method after .with (src/tag.ts:15: `user.eq('id', userId))) },
	},
})` -> `user.eq('id', userId))) },
	},
}).softDelete()`): 29 diagnostic(s)

Primary: TS2339 Property 'softDelete' does not exist on type 'typeof Schema'.

- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/tag.ts:4:14 TS7022: 'Tag' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/tag.ts:13:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/tag.ts:13:28 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/tag.ts:13:62 TS7006: Parameter 'todo' implicitly has an 'any' type.
- src/tag.ts:13:92 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/tag.ts:15:4 TS2339: Property 'softDelete' does not exist on type 'typeof Schema'.
- src/todo-role.ts:10:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo-role.ts:10:28 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo-role.ts:10:64 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/todo-user.ts:13:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo-user.ts:13:62 TS7006: Parameter 'todo' implicitly has an 'any' type.
- src/todo-user.ts:14:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo-user.ts:14:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo-user.ts:17:45 TS7031: Binding element 'value' implicitly has an 'any' type.
- src/todo.ts:24:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:26:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:26:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:26:57 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/todo.ts:32:21 TS7031: Binding element 'item' implicitly has an 'any' type.
- src/todo.ts:35:18 TS7031: Binding element 'originalItem' implicitly has an 'any' type.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'typeof Schema & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<"TodoUser: factory 'PasswordUserSchema' already created another registered schema">'. /   Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel &
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'typeof Schema & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'. /   Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly display
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.

### 17. extra second role schema registered (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, TodoRole, Todo, Tag, AdminRole]`): 2 diagnostic(s)

Primary: TS2322 Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'typeof Schema & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'. /   Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.

- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'typeof Schema & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'. /   Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly display
- src/ultimabase.ts:9:78 TS2322: Type 'Schema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>, never, RoleModel ...' is not assignable to type 'DefinedSchema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>> & ... 4 mo...'. /   Property ''~error'

### 18. extra role schema missing (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, Todo, Tag]`): 1 diagnostic(s)

Primary: TS2345 Argument of type '{ schemas: [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>, typeof Schema, typeof Schema]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>, typeof Schema, typeof Schema], "RoleSchema">'. /   Property ''~missing'' is missing in type '{ schemas: [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>, typeof Schema, typeof Schema]; }' but required in type '{ readonly '~missing': SchemaRegistrationError<"no registered schema created by factory 'RoleSchema'">; }'.

- src/ultimabase.ts:9:35 TS2345: Argument of type '{ schemas: [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>, typeof Schema, typeof Schema]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>, typeof Schema, typeof Schema], "RoleSchema">'. /   Property ''~missing'' is missing in type '

### 19. extra Register removed (plain D) (src/ultimabase.ts:14: `readonly app: typeof ultimabase` -> `readonly unrelated: true`): 0 diagnostic(s)

Primary: (none)



### 20. extra field option wrong value (required: 'yes') (src/todo.ts:10: `title: field.string({ required: true,` -> `title: field.string({ required: 'yes',`): 4 diagnostic(s)

Primary: TS2322 Type 'string' is not assignable to type 'boolean | undefined'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:10:25 TS2322: Type 'string' is not assignable to type 'boolean | undefined'.
- src/usage.ts:16:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 21. extra className not a string (src/todo.ts:8: `className: 'Todo',` -> `className: 42,`): 33 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'string'.

- src/named.ts:9:57 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<typeof Schema>'.
- src/named.ts:13:85 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<typeof Schema>'.
- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:27:50 TS2339: Property 'priority' does not exist on type 'Model<string>'.
- src/named.ts:30:40 TS2339: Property 'title' does not exist on type 'Model<string>'.
- src/named.ts:31:33 TS2339: Property 'title' does not exist on type 'Model<string>'.
- src/tag.ts:13:79 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:13:106 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:13:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<string>'.
- src/todo.ts:8:2 TS2322: Type 'number' is not assignable to type 'string'.
- src/todo.ts:24:43 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<string>'.
- src/todo.ts:26:44 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:26:71 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:28:27 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<string>'.
- src/todo.ts:37:52 TS2322: Type '"archived"' is not assignable to type 'ScalarKeys<string>'.
- src/todo.ts:37:64 TS2322: Type '"priority"' is not assignable to type 'ScalarKeys<string>'.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'typeof Schema & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<`TodoUser.assignedTodos: mappedBy 'assignee' is not a field of ${string}`>'. /   Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => typeof Schema, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }
- src/ultimabase.ts:9:73 TS2322: Type 'typeof Schema' is not assignable to type 'typeof Schema & SchemaRegistrationError<`Tag.todos: mappedBy 'tags' is not a field of ${string}`>'. /   Property ''~error'' is missing in type 'typeof Schema' but required in type 'SchemaRegistrationError<`Tag.todos: mappedBy 'tags' is not a field of ${string}`>'.
- src/usage.ts:11:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<typeof Schema>'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<typeof Schema>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type 'Model<string>'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type 'Model<string>'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type 'Model<string>'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type 'Model<string>'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type 'Model<string>'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:58 TS2339: Property 'tags' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/usage.ts:26:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<string>'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<string>'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<typeof Schema>'.

### 22. extra findMany() element typo (src/named.ts:30: `allTodos[0]?.title` -> `allTodos[0]?.titel`): 1 diagnostic(s)

Primary: TS2551 Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

- src/named.ts:30:40 TS2551: Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

### 23. extra Model<typeof Todo> typo (src/named.ts:31: `model.title` -> `model.titel`): 1 diagnostic(s)

Primary: TS2551 Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

- src/named.ts:31:33 TS2551: Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

### 24. extra originalItem typo (src/todo.ts:35: `void originalItem,` -> `void originalItem?.isDeletd,`): 1 diagnostic(s)

Primary: TS2551 Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?

- src/todo.ts:35:56 TS2551: Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?
