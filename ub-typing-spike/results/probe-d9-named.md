# d9-named

Baseline diagnostics: 0

## Hovers

### src/todo.ts `Todo = App` (812 chars)

```
const Todo: DeclaredSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DeclaredSchema<"User", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    }, AppTypes<...>>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, AppTypes<...>>
```

### src/todo.ts `where }) => where.eq('archived'` (833 chars)

```
(parameter) where: WhereBuilder<DeclaredSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DeclaredSchema<"User", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    }, AppTypes<...>>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, AppTypes<...>>>
```

### src/todo.ts `item, originalItem }) =>` (427 chars)

```
(parameter) item: {
    readonly acl: ACL;
    readonly assignee: PointerRef | null;
    readonly parent: PointerRef | null;
    readonly id: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly isDeleted: boolean;
    readonly title: string;
    readonly completed: boolean;
    readonly archived: boolean;
    readonly priority: "low" | "normal" | "high" | null;
    readonly dueAt: Date | null;
}
```

### src/todo.ts `(user) => user.eq` (857 chars)

```
(parameter) user: WhereBuilder<DeclaredSchema<"User", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly email: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DeclaredSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly completed: ScalarField<"boolean", boolean, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly dueAt: ScalarField<"date", Date, false>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    }, AppTypes<...>>, "assignee">;
    readonly roles: RelationField<...>;
}, AppTypes<...>>>
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

### src/todo.ts `.with({` (1216 chars)

```
(method) DeclaredSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; }, AppTypes<...>>.with(options: AccessSchemaOption<DeclaredSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DeclaredSchema<"User", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    }, AppTypes<...>>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, AppTypes<...>>> & HooksSchemaOption<...> & AclSchemaOption<...> & Readonly<...> & PostgresSchemaOption): DeclaredSchema<...>
```

## Error cases

### typo in relation target (src/todo.ts: `target: () => User,` -> `target: () => Usr,`): 2 diagnostic(s)

- src/todo.ts:16:43 TS2552: Cannot find name 'Usr'. Did you mean 'User'?
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.

### typo in own where field (builder) (src/todo.ts: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:23:42 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DeclaredSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; }, AppTypes<...>>>'.

### typo in cross-schema where field (builder) (src/user.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 1 diagnostic(s)

- src/user.ts:16:79 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DeclaredSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; }, AppTypes<...>>>'.

### typo in cross-schema where field (object) (src/todo.ts: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/todo.ts:26:47 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<DeclaredSchema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DeclaredSchema<...>, "assignee">; readonly roles: RelationField<...>; }, AppTypes<...>>>'. Did you mean to write 'email'?

### typo in hook record field (plugin field) (src/todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:31:13 TS2551: Property 'isDeletd' does not exist on type '{ readonly acl: ACL; readonly assignee: PointerRef | null; readonly parent: PointerRef | null; readonly id: string; readonly createdAt: Date; ... 6 more ...; readonly dueAt: Date | null; }'. Did you mean 'isDeleted'?

### typo in mappedBy (src/user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'DeclaredSchema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DeclaredSchema<...>, "asignee">; readonly roles: RelationField<...>; }, AppTypes<...>>' is not assignable to type 'DeclaredSchema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DeclaredSchema<...>, "asignee">; readonly roles: RelationField<...>; }, AppTypes<...>> & SchemaRegistrationError<...>

### typo in plugin option key (src/todo.ts: `access: {` -> `acess: {`): 5 diagnostic(s)

- src/todo.ts:22:2 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'AccessSchemaOption<DeclaredSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; }, AppTypes<...>>> & HooksSchemaOption<...> & AclSch...'. Did you mean to write 'access'?
- src/todo.ts:23:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:24:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:24:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:24:65 TS7006: Parameter 'user' implicitly has an 'any' type.

### wrong where return type (src/tag.ts: `access: { read: true }` -> `access: { read: { where: () => 42 } }`): 1 diagnostic(s)

- src/tag.ts:10:42 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<DeclaredSchema<"Tag", { readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => DeclaredSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; }, AppTypes<...>>,...'.
