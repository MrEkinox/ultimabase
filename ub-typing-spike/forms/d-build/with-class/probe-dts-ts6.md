# isolated/dts-fixture

Baseline diagnostics: 0

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| schema constant (declaration) | 869 | `const Todo: ConfiguredSchema<"Todo", {` |
| schema constant (usage `Todo.findMany`) | 889 | `(alias) const Todo: ConfiguredSchema<"Todo", {` |
| `Todo.findMany` method (usage) | 996 | `(property) findMany: <ConfiguredSchema<"Todo", {` |
| factory constant (TodoUser) | 906 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| rules entry `.with(` | 904 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |

### schema constant (declaration) — src/todo.ts `Todo = App` (869 chars)

```
const Todo: ConfiguredSchema<"Todo", {
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
}, AppTypes<...>, unknown>
```

### schema constant (usage `Todo.findMany`) — src/usage.ts `await Todo.findMany` (889 chars)

```
(alias) const Todo: ConfiguredSchema<"Todo", {
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
}, AppTypes<...>, unknown>
import Todo
```

### `Todo.findMany` method (usage) — src/usage.ts `await Todo.findMany` (996 chars)

```
(property) findMany: <ConfiguredSchema<"Todo", {
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
}, AppTypes<...>, unknown>, {
    ...;
}>(this: ConfiguredSchema<...>, args?: {
    ...;
} | undefined, options?: QueryOptions) => Promise<...>
```

### factory constant (TodoUser) — src/todo-user.ts `TodoUser = App` (906 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => ConfiguredSchema<"Todo", {
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
    }, AppTypes<...>, unknown>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```

### rules entry `.with(` — src/todo.ts `.with({` (904 chars)

```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<"Todo">): ConfiguredSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | ... 1 more ... | "high")[], false>;
    ... 4 more ...;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>, unknown>
```

## Hovers — WITHOUT the Register line (0 diagnostic(s))

| Point | Length | Text (first line) |
| --- | --- | --- |
| schema constant (declaration) | 869 | `const Todo: ConfiguredSchema<"Todo", {` |
| schema constant (usage `Todo.findMany`) | 889 | `(alias) const Todo: ConfiguredSchema<"Todo", {` |
| `Todo.findMany` method (usage) | 996 | `(property) findMany: <ConfiguredSchema<"Todo", {` |
| factory constant (TodoUser) | 906 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| rules entry `.with(` | 1304 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |

### schema constant (declaration) — src/todo.ts `Todo = App` (869 chars)

```
const Todo: ConfiguredSchema<"Todo", {
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
}, AppTypes<...>, unknown>
```

### schema constant (usage `Todo.findMany`) — src/usage.ts `await Todo.findMany` (889 chars)

```
(alias) const Todo: ConfiguredSchema<"Todo", {
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
}, AppTypes<...>, unknown>
import Todo
```

### `Todo.findMany` method (usage) — src/usage.ts `await Todo.findMany` (996 chars)

```
(property) findMany: <ConfiguredSchema<"Todo", {
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
}, AppTypes<...>, unknown>, {
    ...;
}>(this: ConfiguredSchema<...>, args?: {
    ...;
} | undefined, options?: QueryOptions) => Promise<...>
```

### factory constant (TodoUser) — src/todo-user.ts `TodoUser = App` (906 chars)

```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => ConfiguredSchema<"Todo", {
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
    }, AppTypes<...>, unknown>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```

### rules entry `.with(` — src/todo.ts `.with({` (1304 chars)

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
}, AppTypes<...>>> & AccessSchemaOption<...> & HooksSchemaOption<...> & Readonly<...> & AclSchemaOption<...>): ConfiguredSchema<...>
```

### completions Todo. (usage) src/usage.ts `"await Todo.findMany"` (13)

apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, toString

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |


