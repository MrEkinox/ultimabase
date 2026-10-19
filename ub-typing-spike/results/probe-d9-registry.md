# d9-registry

Baseline diagnostics: 0

## Hovers

### src/todo.ts `Todo = App` (924 chars)

```
const Todo: ConfigurableSchemaClass<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => ConfigurableSchemaClass<"User", Readonly<{
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    } & ... 4 more ... & {
        ...;
    }>, readonly [...]>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & ... 4 more ... & {
    ...;
}>, readonly [...]>
```

### src/todo.ts `where }) => where.eq('archived'` (39 chars)

```
(parameter) where: WhereBuilder<"Todo">
```

### src/todo.ts `item, originalItem }) =>` (329 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isDeleted: boolean;
    title: string;
    completed: boolean;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    dueAt: Date | null;
}>
```

### src/todo.ts `(user) => user.eq` (38 chars)

```
(parameter) user: WhereBuilder<"User">
```

### src/usage.ts `pending = await` (307 chars)

```
const pending: {
    readonly assignee: {
        readonly displayName: string;
        readonly id: string;
    } | null;
    readonly id: string;
    readonly title: string;
    readonly dueAt: Date | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### src/todo.ts `.with({` (887 chars)

```
(method) ConfigurableSchemaClass<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & ... 4 more ... & { ...; }>, readonly [...]>.with(options: AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & AclSchemaOption<"Todo"> & Readonly<Record<never, never>> & PostgresSchemaOption): ConfigurableSchemaClass<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    ... 4 more ...;
    readonly tags: RelationField<...>;
} & ... 4 more ... & {
    ...;
}>, readonly [...]>
```

## Error cases

### typo in relation target (src/todo.ts: `target: () => User,` -> `target: () => Usr,`): 2 diagnostic(s)

- src/todo.ts:16:43 TS2552: Cannot find name 'Usr'. Did you mean 'User'?
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.

### typo in own where field (builder) (src/todo.ts: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:23:42 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

### typo in cross-schema where field (builder) (src/user.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 1 diagnostic(s)

- src/user.ts:16:79 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

### typo in cross-schema where field (object) (src/todo.ts: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/todo.ts:26:47 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"User">'. Did you mean to write 'email'?

### typo in hook record field (plugin field) (src/todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:31:13 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; assignee: PointerRef | null; parent: PointerRef | null; id: string; createdAt: Date; updatedAt: Date; isDeleted: boolean; title: string; completed: boolean; archived: boolean; priority: "low" | ... 2 more ... | null; dueAt: Date | null; }>'. Did you mean 'isDeleted'?

### typo in mappedBy (src/user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'ConfigurableSchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => ConfigurableSchemaClass<...>, "asignee">; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>, readonly...' is not assignable to type 'ConfigurableSchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; readonly roles: RelationField<...>; } & ... 4 

### typo in plugin option key (src/todo.ts: `access: {` -> `acess: {`): 5 diagnostic(s)

- src/todo.ts:22:2 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & AclSchemaOption<"Todo"> & Readonly<Record<never, never>> & PostgresSchemaOption'. Did you mean to write 'access'?
- src/todo.ts:23:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:24:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:24:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:24:65 TS7006: Parameter 'user' implicitly has an 'any' type.

### wrong where return type (src/tag.ts: `access: { read: true }` -> `access: { read: { where: () => 42 } }`): 1 diagnostic(s)

- src/tag.ts:10:42 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

### extra: cross callback returns the wrong schema expression (src/todo.ts: `(user) => user.eq('id', userId ?? '')` -> `(user) => where.eq('archived', false)`): 1 diagnostic(s)

- src/todo.ts:24:74 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"User">'. /   Type '"Todo"' is not assignable to type '"User"'.

### extra: hook item stays readonly (src/todo.ts: `if (item.isDeleted) throw new TypeError('deleted')` -> `item.title = ''`): 1 diagnostic(s)

- src/todo.ts:31:9 TS2540: Cannot assign to 'title' because it is a read-only property.

### extra: schema left out of the application (registry fallback) (src/application.ts: `[User, Role, Todo, Tag]` -> `[User, Role, Todo]`): 0 diagnostic(s)


### extra: registry entry removed (plain D behaviour) (src/application.ts: `readonly app: typeof app` -> `readonly unrelated: true`): 0 diagnostic(s)

