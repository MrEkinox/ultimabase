# e-class-configure

Baseline diagnostics: 0

## Hovers

### src/todo.ts `class Todo extends` (10 chars)

```
class Todo
```

### src/todo.ts `where }) => where.eq('archived'` (639 chars)

```
(parameter) where: WhereBuilder<SchemaBaseClass<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof User, false>;
    readonly parent: PointerField<() => typeof Todo, false>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & ... 4 more ... & {
    ...;
}>, readonly [...]>>
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

### src/todo.ts `(user) => user.eq` (43 chars)

```
(parameter) user: WhereBuilder<typeof User>
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

### src/todo.ts `.configure({` (1090 chars)

```
(method) SchemaBaseClass<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<...>; ... 5 more ...; readonly tags: RelationField<...>; } & ... 4 more ... & { ...; }>, readonly [...]>.configure(options: AccessSchemaOption<SchemaBaseClass<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof User, false>;
    readonly parent: PointerField<() => typeof Todo, false>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & ... 4 more ... & {
    ...;
}>, readonly [...]>> & HooksSchemaOption<...> & AclSchemaOption<...> & Readonly<...> & PostgresSchemaOption): AccessSchemaOption<...> & ... 3 more ... & PostgresSchemaOption
```

## Error cases

### typo in relation target (src/todo.ts: `target: () => User,` -> `target: () => Usr,`): 2 diagnostic(s)

- src/todo.ts:14:42 TS2552: Cannot find name 'Usr'. Did you mean 'User'?
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.

### typo in own where field (builder) (src/todo.ts: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:21:43 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaBaseClass<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & ... 4 more ... & { ...; }>, readonly [...]>>'.

### typo in cross-schema where field (builder) (src/user.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 1 diagnostic(s)

- src/user.ts:14:80 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<typeof Todo>'.

### typo in cross-schema where field (object) (src/todo.ts: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/todo.ts:24:48 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<typeof User>'. Did you mean to write 'email'?

### typo in hook record field (plugin field) (src/todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:29:14 TS2551: Property 'isDeletd' does not exist on type '{ readonly acl: ACL; readonly assignee: PointerRef | null; readonly parent: PointerRef | null; readonly id: string; readonly createdAt: Date; ... 6 more ...; readonly dueAt: Date | null; }'. Did you mean 'isDeleted'?

### typo in mappedBy (src/user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'typeof User' is not assignable to type 'typeof User & SchemaRegistrationError<"User.assignedTodos: mappedBy 'asignee' is not a field of Todo">'. /   Property ''~error'' is missing in type 'typeof User' but required in type 'SchemaRegistrationError<"User.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

### typo in plugin option key (src/todo.ts: `access: {` -> `acess: {`): 5 diagnostic(s)

- src/todo.ts:20:3 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'AccessSchemaOption<SchemaBaseClass<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & ... 4 more ... & { ...; }>, readonly [...'. Did you mean to write 'access'?
- src/todo.ts:21:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:22:24 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:22:31 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:22:66 TS7006: Parameter 'user' implicitly has an 'any' type.

### wrong where return type (src/tag.ts: `access: { read: true }` -> `access: { read: { where: () => 42 } }`): 1 diagnostic(s)

- src/tag.ts:8:75 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<SchemaBaseClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => typeof Todo, "tags">; } & SystemFields & Readonly<...> & object & { ...; } & { ...; }>, readonly [...]>>'.
