# idea-b/fixture

Baseline diagnostics: 15
  src/named.ts:25:25 TS2344 Type 'false' does not satisfy the constraint 'true'.
  src/named.ts:26:25 TS2344 Type 'false' does not satisfy the constraint 'true'.
  src/ultimabase.ts:9:14 TS7022 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
  src/ultimabase.ts:9:47 TS2322 Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> 
  src/ultimabase.ts:9:57 TS2322 Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>,
  src/ultimabase.ts:9:67 TS2322 Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'.
  src/ultimabase.ts:9:73 TS2322 Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'.
  src/ultimabase.ts:14:12 TS2502 'app' is referenced directly or indirectly in its own type annotation.
  src/usage.ts:39:1 TS2578 Unused '@ts-expect-error' directive.
  src/usage.ts:41:1 TS2578 Unused '@ts-expect-error' directive.
  src/usage.ts:43:1 TS2578 Unused '@ts-expect-error' directive.
  src/usage.ts:45:1 TS2578 Unused '@ts-expect-error' directive.
  src/usage.ts:47:1 TS2578 Unused '@ts-expect-error' directive.
  src/usage.ts:51:1 TS2578 Unused '@ts-expect-error' directive.
  src/usage.ts:53:1 TS2578 Unused '@ts-expect-error' directive.

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 36 | `(parameter) where: WhereBuilder<any>` |
| cross-schema builder | 35 | `(parameter) user: WhereBuilder<any>` |
| hook item | 21 | `(parameter) item: any` |
| schema constant | 31 | `const Todo: NamedSchema<"Todo">` |
| rules entry `.with(` | 477 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |
| findMany result | 177 | `const pending: {` |
| field hook value | 22 | `(parameter) value: any` |
| factory schema constant (TodoUser) | 506 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| role where (two factories) | 36 | `(parameter) where: WhereBuilder<any>` |
| hook originalItem | 29 | `(parameter) originalItem: any` |
| findMany() no args | 21 | `const allTodos: any[]` |
| findMany({ where }) no select | 22 | `const openTodos: any[]` |
| findOne({ where }) | 18 | `const oneTodo: any` |
| createOne({ data }) | 19 | `const madeTodo: any` |
| findOne + select (partial) | 73 | `const oneTitle: {` |
| findMany + include (partial) | 56 | `const withAssignee: {` |
| Model<typeof Todo> | 16 | `const model: any` |
| CreateInput<typeof Todo> | 22 | `const createInput: any` |
| UpdateInput<typeof Todo> | 22 | `const updateInput: any` |

### where (builder) — src/todo.ts `where }) => where.eq('archived'` (36 chars)

```
(parameter) where: WhereBuilder<any>
```

### cross-schema builder — src/todo.ts `(user) => user.eq` (35 chars)

```
(parameter) user: WhereBuilder<any>
```

### hook item — src/todo.ts `item }) => {` (21 chars)

```
(parameter) item: any
```

### schema constant — src/todo.ts `Todo = App` (31 chars)

```
const Todo: NamedSchema<"Todo">
```

### rules entry `.with(` — src/todo.ts `.with({` (477 chars)

```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<any> & AccessSchemaOption<any> & HooksSchemaOption<any> & Readonly<Record<never, never>> & AclSchemaOption<any>): NamedSchema<"Todo">
```

### findMany result — src/usage.ts `pending = await` (177 chars)

```
const pending: {
    readonly id: any;
    readonly assignee: any;
    readonly title: any;
    readonly status: any;
    readonly priority: any;
    readonly subtasks: any;
}[]
```

### field hook value — src/todo-user.ts `value }) => value.trim()` (22 chars)

```
(parameter) value: any
```

### factory schema constant (TodoUser) — src/todo-user.ts `TodoUser = App` (506 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">;
} & PasswordUserOwnedFields, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & {
    ...;
}, Readonly<...> & ... 1 more ... & SoftDeleteShapes>, PasswordUserModel & {
    ...;
}>
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (36 chars)

```
(parameter) where: WhereBuilder<any>
```

### hook originalItem — src/todo.ts `originalItem }) =>` (29 chars)

```
(parameter) originalItem: any
```

### findMany() no args — src/named.ts `allTodos = await` (21 chars)

```
const allTodos: any[]
```

### findMany({ where }) no select — src/named.ts `openTodos = await` (22 chars)

```
const openTodos: any[]
```

### findOne({ where }) — src/named.ts `oneTodo = await` (18 chars)

```
const oneTodo: any
```

### createOne({ data }) — src/named.ts `madeTodo = await` (19 chars)

```
const madeTodo: any
```

### findOne + select (partial) — src/named.ts `oneTitle = await` (73 chars)

```
const oneTitle: {
    readonly id: any;
    readonly title: any;
} | null
```

### findMany + include (partial) — src/named.ts `withAssignee = await` (56 chars)

```
const withAssignee: {
    readonly [x: string]: any;
}[]
```

### Model<typeof Todo> — src/named.ts `model: Model` (16 chars)

```
const model: any
```

### CreateInput<typeof Todo> — src/named.ts `createInput: CreateInput` (22 chars)

```
const createInput: any
```

### UpdateInput<typeof Todo> — src/named.ts `updateInput: UpdateInput` (22 chars)

```
const updateInput: any
```

## Hovers — WITHOUT the Register line (29 diagnostic(s))

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 878 | `(parameter) where: WhereBuilder<DefinedSchema<"Todo", {` |
| cross-schema builder | 522 | `(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {` |
| hook item | 390 | `(parameter) item: Readonly<{` |
| schema constant | 31 | `const Todo: NamedSchema<"Todo">` |
| rules entry `.with(` | 1299 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |
| findMany result | 129 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema constant (TodoUser) | 506 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| role where (two factories) | 658 | `(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {` |
| hook originalItem | 405 | `(parameter) originalItem: Readonly<{` |
| findMany() no args | 30 | `const allTodos: Readonly<{}>[]` |
| findMany({ where }) no select | 31 | `const openTodos: Readonly<{}>[]` |
| findOne({ where }) | 34 | `const oneTodo: Readonly<{}> \| null` |
| createOne({ data }) | 28 | `const madeTodo: Readonly<{}>` |
| findOne + select (partial) | 77 | `const oneTitle: {` |
| findMany + include (partial) | 24 | `const withAssignee: {}[]` |
| Model<typeof Todo> | 25 | `const model: Readonly<{}>` |
| CreateInput<typeof Todo> | 51 | `const createInput: CreateInput<NamedSchema<"Todo">>` |
| UpdateInput<typeof Todo> | 51 | `const updateInput: UpdateInput<NamedSchema<"Todo">>` |

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

### cross-schema builder — src/todo.ts `(user) => user.eq` (522 chars)

```
(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">;
} & PasswordUserOwnedFields, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & {
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
    archived: boolean;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
}>
```

### schema constant — src/todo.ts `Todo = App` (31 chars)

```
const Todo: NamedSchema<"Todo">
```

### rules entry `.with(` — src/todo.ts `.with({` (1299 chars)

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
}, AppTypes<...>>> & AccessSchemaOption<...> & HooksSchemaOption<...> & Readonly<...> & AclSchemaOption<...>): NamedSchema<...>
```

### findMany result — src/usage.ts `pending = await` (129 chars)

```
const pending: {
    readonly id: never;
    readonly title: never;
    readonly status: never;
    readonly priority: never;
}[]
```

### field hook value — src/todo-user.ts `value }) => value.trim()` (25 chars)

```
(parameter) value: string
```

### factory schema constant (TodoUser) — src/todo-user.ts `TodoUser = App` (506 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">;
} & PasswordUserOwnedFields, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & {
    ...;
}, Readonly<...> & ... 1 more ... & SoftDeleteShapes>, PasswordUserModel & {
    ...;
}>
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (658 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">;
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
    archived: boolean;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
}> | null
```

### findMany() no args — src/named.ts `allTodos = await` (30 chars)

```
const allTodos: Readonly<{}>[]
```

### findMany({ where }) no select — src/named.ts `openTodos = await` (31 chars)

```
const openTodos: Readonly<{}>[]
```

### findOne({ where }) — src/named.ts `oneTodo = await` (34 chars)

```
const oneTodo: Readonly<{}> | null
```

### createOne({ data }) — src/named.ts `madeTodo = await` (28 chars)

```
const madeTodo: Readonly<{}>
```

### findOne + select (partial) — src/named.ts `oneTitle = await` (77 chars)

```
const oneTitle: {
    readonly id: never;
    readonly title: never;
} | null
```

### findMany + include (partial) — src/named.ts `withAssignee = await` (24 chars)

```
const withAssignee: {}[]
```

### Model<typeof Todo> — src/named.ts `model: Model` (25 chars)

```
const model: Readonly<{}>
```

### CreateInput<typeof Todo> — src/named.ts `createInput: CreateInput` (51 chars)

```
const createInput: CreateInput<NamedSchema<"Todo">>
```

### UpdateInput<typeof Todo> — src/named.ts `updateInput: UpdateInput` (51 chars)

```
const updateInput: UpdateInput<NamedSchema<"Todo">>
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

### completions item. (hook) src/todo.ts `"item.isDeleted"` (0)



## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 relation target typo | yes | yes | 16 | TS2552 (52) |
| 2 | 2 local where typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 3 | 3 cross-schema field typo (object filter) | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 4 | 4 plugin field typo in hook | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 5 | 5 mappedBy typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 6 | 6 rules key typo | yes | yes | 20 | TS2561 (252) |
| 7 | 7 wrong filter return | yes | yes | 16 | TS2322 (66) |
| 8 | 8 query select typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 9 | extra cross-schema builder typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 10 | extra cross callback returns the wrong schema | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 11 | extra field hook returns a number | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 12 | extra field hook key typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 13 | extra index on unknown field | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 14 | extra hook item is readonly | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 15 | extra softDelete called twice | yes | no (src/named.ts:26) | 22 | TS2344 (52) |
| 16 | extra shape method after .with | yes | yes | 34 | TS2339 (66) |
| 17 | extra second role schema registered | yes | yes | 16 | TS7022 (146) |
| 18 | extra role schema missing | yes | yes | 14 | TS7022 (146) |
| 19 | extra Register removed (plain D) | yes | no (src/named.ts:24) | 29 | TS2339 (59) |
| 20 | extra field option wrong value (required: 'yes') | yes | yes | 16 | TS2322 (62) |
| 21 | extra className not a string | yes | yes | 16 | TS2322 (49) |
| 22 | extra findMany() element typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 23 | extra Model<typeof Todo> typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |
| 24 | extra originalItem typo | yes | no (src/named.ts:25) | 15 | TS2344 (52) |

### 1. 1 relation target typo (src/todo.ts:15: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 16 diagnostic(s)

Primary: TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:15:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 2. 2 local where typo (src/todo.ts:24: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 3. 3 cross-schema field typo (object filter) (src/todo.ts:28: `email: { endsWith` -> `emial: { endsWith`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 4. 4 plugin field typo in hook (src/todo.ts:33: `item.isDeleted` -> `item.isDeletd`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 5. 5 mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "asignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 6. 6 rules key typo (src/todo.ts:23: `access: {` -> `acess: {`): 20 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<any> & AccessSchemaOption<any> & HooksSchemaOption<any> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:23:3 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<any> & AccessSchemaOption<any> & HooksSchemaOption<any> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?
- src/todo.ts:24:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:26:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:26:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:26:57 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 7. 7 wrong filter return (src/tag.ts:13: `({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `() => 42`): 16 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'AccessFilterResult<any>'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/tag.ts:13:24 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<any>'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 8. 8 query select typo (src/usage.ts:57: `select: { title: true } })` -> `select: { titel: true } })`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 9. extra cross-schema builder typo (src/todo.ts:26: `user.eq('id', userId)` -> `user.eq('emial', userId)`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 10. extra cross callback returns the wrong schema (src/todo.ts:26: `(user) => user.eq('id', userId)` -> `(user) => where.eq('archived', false)`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 11. extra field hook returns a number (src/todo-user.ts:17: `value.trim()` -> `value.length`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 12. extra field hook key typo (src/todo-user.ts:17: `fields: { displayName:` -> `fields: { displayNme:`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 13. extra index on unknown field (src/todo.ts:37: `fields: ['archived', 'priority']` -> `fields: ['archived', 'priorty']`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 14. extra hook item is readonly (src/todo.ts:33: `if (item.isDeleted) throw new TypeError('Deleted todos are read-only')` -> `item.title = ''`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 15. extra softDelete called twice (src/todo.ts:21: `	.softDelete()
` -> `	.softDelete()
	.softDelete()
`): 22 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:22:3 TS2339: Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
- src/todo.ts:25:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:27:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:27:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:27:57 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/todo.ts:33:21 TS7031: Binding element 'item' implicitly has an 'any' type.
- src/todo.ts:36:18 TS7031: Binding element 'originalItem' implicitly has an 'any' type.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => any, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
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
}).softDelete()`): 34 diagnostic(s)

Primary: TS2339 Property 'softDelete' does not exist on type 'NamedSchema<"Tag">'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/tag.ts:4:14 TS7022: 'Tag' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/tag.ts:13:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/tag.ts:13:28 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/tag.ts:13:62 TS7006: Parameter 'todo' implicitly has an 'any' type.
- src/tag.ts:13:92 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/tag.ts:15:4 TS2339: Property 'softDelete' does not exist on type 'NamedSchema<"Tag">'.
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
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 17. extra second role schema registered (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, TodoRole, Todo, Tag, AdminRole]`): 16 diagnostic(s)

Primary: TS7022 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:78 TS2322: Type 'Schema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>, never, RoleModel ...' is not assignable to type 'DefinedSchema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>> & ... 4 mo...'. /   Property ''~error'
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 18. extra role schema missing (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, Todo, Tag]`): 14 diagnostic(s)

Primary: TS7022 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:63 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 19. extra Register removed (plain D) (src/ultimabase.ts:14: `readonly app: typeof ultimabase` -> `readonly unrelated: true`): 29 diagnostic(s)

Primary: TS2339 Property 'isDeleted' does not exist on type 'Readonly<{}>'.

- src/named.ts:24:58 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{}>'.
- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:27:50 TS2339: Property 'priority' does not exist on type 'Readonly<{}>'.
- src/named.ts:30:40 TS2339: Property 'title' does not exist on type 'Readonly<{}>'.
- src/named.ts:31:33 TS2339: Property 'title' does not exist on type 'Readonly<{}>'.
- src/tag.ts:13:79 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:13:106 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-role.ts:10:81 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo-user.ts:13:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'never'.
- src/todo.ts:26:74 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/usage.ts:16:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:17:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: never; readonly title: never; readonly status: never; readonly priority: never; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: never; readonly title: never; readonly status: never; readonly priority: never; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:33 TS2339: Property 'assignedTodos' does not exist on type '{}'.
- src/usage.ts:26:33 TS2339: Property 'assignedTodos' does not exist on type '{}'.
- src/usage.ts:27:33 TS2339: Property 'username' does not exist on type '{}'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{}>'.
- src/usage.ts:33:49 TS2353: Object literal may only specify known properties, and 'displayName' does not exist in type '{} & {} & { readonly password: string; }'.
- src/usage.ts:36:55 TS2339: Property 'members' does not exist on type '{ readonly id: never; readonly name: never; }'.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 20. extra field option wrong value (required: 'yes') (src/todo.ts:10: `title: field.string({ required: true,` -> `title: field.string({ required: 'yes',`): 16 diagnostic(s)

Primary: TS2322 Type 'string' is not assignable to type 'boolean | undefined'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:10:25 TS2322: Type 'string' is not assignable to type 'boolean | undefined'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 21. extra className not a string (src/todo.ts:8: `className: 'Todo',` -> `className: 42,`): 16 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'string'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:8:2 TS2322: Type 'number' is not assignable to type 'string'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<string>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<string>' is not assignable to type 'NamedSchema<string> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<string>' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 22. extra findMany() element typo (src/named.ts:30: `allTodos[0]?.title` -> `allTodos[0]?.titel`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 23. extra Model<typeof Todo> typo (src/named.ts:31: `model.title` -> `model.titel`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.

### 24. extra originalItem typo (src/todo.ts:35: `void originalItem,` -> `void originalItem?.isDeletd,`): 15 diagnostic(s)

Primary: TS2344 Type 'false' does not satisfy the constraint 'true'.

- src/named.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:47 TS2322: Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => NamedSchema<"Todo">, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>' is not assignable to type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoUser"> & PasswordUserModel & { readonly '~factory': "PasswordUserSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:57 TS2322: Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; } & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"TodoRole"> & RoleModel & { readonly '~factory': "RoleSchema"; }' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:67 TS2322: Type 'NamedSchema<"Todo">' is not assignable to type 'NamedSchema<"Todo"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Todo">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:9:73 TS2322: Type 'NamedSchema<"Tag">' is not assignable to type 'NamedSchema<"Tag"> & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'NamedSchema<"Tag">' but required in type 'SchemaRegistrationError<any>'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:39:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.
