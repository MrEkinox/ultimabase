# with-class/fixture

Baseline diagnostics: 0

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| schema constant (declaration) | 25 | `const Todo: typeof Schema` |
| schema constant (usage `Todo.findMany`) | 45 | `(alias) const Todo: typeof Schema` |
| `Todo.findMany` method (usage) | 2377 | `(property) Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; r` |
| factory constant (TodoUser) | 509 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| rules entry `.with(` | 483 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |

### schema constant (declaration) — src/todo.ts `Todo = App` (25 chars)

```
const Todo: typeof Schema
```

### schema constant (usage `Todo.findMany`) — src/usage.ts `await Todo.findMany` (45 chars)

```
(alias) const Todo: typeof Schema
import Todo
```

### `Todo.findMany` method (usage) — src/usage.ts `await Todo.findMany` (2377 chars)

```
(property) Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<...>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>.findMany: <typeof Schema, {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
}>(this: typeof Schema, args?: {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
} | undefined, options?: QueryOptions) => Promise<...>
```

### factory constant (TodoUser) — src/todo-user.ts `TodoUser = App` (509 chars)

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

### rules entry `.with(` — src/todo.ts `.with({` (483 chars)

```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<"Todo">): typeof Schema
```

## Hovers — WITHOUT the Register line (0 diagnostic(s))

| Point | Length | Text (first line) |
| --- | --- | --- |
| schema constant (declaration) | 25 | `const Todo: typeof Schema` |
| schema constant (usage `Todo.findMany`) | 45 | `(alias) const Todo: typeof Schema` |
| `Todo.findMany` method (usage) | 2377 | `(property) Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; r` |
| factory constant (TodoUser) | 509 | `const TodoUser: ConfiguredSchema<"TodoUser", {` |
| rules entry `.with(` | 1296 | `(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>` |

### schema constant (declaration) — src/todo.ts `Todo = App` (25 chars)

```
const Todo: typeof Schema
```

### schema constant (usage `Todo.findMany`) — src/usage.ts `await Todo.findMany` (45 chars)

```
(alias) const Todo: typeof Schema
import Todo
```

### `Todo.findMany` method (usage) — src/usage.ts `await Todo.findMany` (2377 chars)

```
(property) Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<...>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>.findMany: <typeof Schema, {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
}>(this: typeof Schema, args?: {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
} | undefined, options?: QueryOptions) => Promise<...>
```

### factory constant (TodoUser) — src/todo-user.ts `TodoUser = App` (509 chars)

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

### completions Todo. (usage) src/usage.ts `"await Todo.findMany"` (13)

className, createOne, findMany, findOne, apply, arguments, bind, call, caller, length, name, prototype, toString

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |


