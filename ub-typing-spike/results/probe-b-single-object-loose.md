# b-single-object-loose

Baseline diagnostics: 0

## Hovers

### src/todo.ts `Todo = App` (868 chars)

```
const Todo: SchemaClass<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => SchemaClass<"User", Readonly<{
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    } & ... 4 more ... & {
        ...;
    }>>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & ... 4 more ... & {
    ...;
}>>
```

### src/todo.ts `where }) => where.eq('archived'` (889 chars)

```
(parameter) where: WhereBuilder<SchemaClass<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => SchemaClass<"User", Readonly<{
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    } & ... 4 more ... & {
        ...;
    }>>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & ... 4 more ... & {
    ...;
}>>>
```

### src/todo.ts `item, originalItem }) =>` (427 chars)

```
(parameter) item: {
    readonly acl: ACL;
    readonly id: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly isDeleted: boolean;
    readonly assignee: PointerRef | null;
    readonly parent: PointerRef | null;
    readonly title: string;
    readonly completed: boolean;
    readonly archived: boolean;
    readonly priority: "low" | "normal" | "high" | null;
    readonly dueAt: Date | null;
}
```

### src/todo.ts `(user) => user.eq` (913 chars)

```
(parameter) user: WhereBuilder<SchemaClass<"User", Readonly<{
    readonly displayName: ScalarField<"string", string, true>;
    readonly email: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => SchemaClass<"Todo", Readonly<{
        readonly title: ScalarField<"string", string, true>;
        readonly completed: ScalarField<"boolean", boolean, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly dueAt: ScalarField<"date", Date, false>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & ... 4 more ... & {
        ...;
    }>>, "assignee">;
    readonly roles: RelationField<...>;
} & ... 4 more ... & {
    ...;
}>>>
```

### src/usage.ts `pending = await` (307 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly displayName: string;
    } | null;
    readonly title: string;
    readonly dueAt: Date | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### src/todo.ts `access: {` (3397 chars)

```
(property) access?: {
    readonly read?: boolean | {
        readonly where: (context: AccessFilterContext<SchemaClass<"Todo", Readonly<{
            readonly title: ScalarField<"string", string, true>;
            readonly completed: ScalarField<"boolean", boolean, true>;
            readonly archived: ScalarField<"boolean", boolean, true>;
            readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
            readonly dueAt: ScalarField<"date", Date, false>;
            readonly assignee: PointerField<() => SchemaClass<"User", Readonly<{
                readonly displayName: ScalarField<"string", string, true>;
                readonly email: ScalarField<"string", string, true>;
                readonly assignedTodos: RelationField<...>;
                readonly roles: RelationField<...>;
            } & ... 4 more ... & {
                ...;
            }>>, false>;
            readonly parent: PointerField<...>;
            readonly subtasks: RelationField<...>;
            readonly tags: RelationField<...>;
        } & ... 4 more ... & {
            ...;
        }>>>) => void;
    };
    readonly create?: boolean;
    readonly update?: boolean | {
        readonly where: (context: AccessFilterContext<SchemaClass<"Todo", Readonly<{
            readonly title: ScalarField<"string", string, true>;
            readonly completed: ScalarField<"boolean", boolean, true>;
            readonly archived: ScalarField<"boolean", boolean, true>;
            readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
            readonly dueAt: ScalarField<"date", Date, false>;
            readonly assignee: PointerField<() => SchemaClass<"User", Readonly<{
                readonly displayName: ScalarField<"string", string, true>;
                readonly email: ScalarField<"string", string, true>;
                readonly assignedTodos: RelationField<...>;
                readonly roles: RelationField<...>;
            } & ... 4 more ... & {
                ...;
            }>>, false>;
            readonly parent: PointerField<...>;
            readonly subtasks: RelationField<...>;
            readonly tags: RelationField<...>;
        } & ... 4 more ... & {
            ...;
        }>>>) => void;
    };
    readonly delete?: boolean | {
        readonly where: (context: AccessFilterContext<SchemaClass<"Todo", Readonly<{
            readonly title: ScalarField<"string", string, true>;
            readonly completed: ScalarField<"boolean", boolean, true>;
            readonly archived: ScalarField<"boolean", boolean, true>;
            readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
            readonly dueAt: ScalarField<"date", Date, false>;
            readonly assignee: PointerField<() => SchemaClass<"User", Readonly<{
                readonly displayName: ScalarField<"string", string, true>;
                readonly email: ScalarField<"string", string, true>;
                readonly assignedTodos: RelationField<...>;
                readonly roles: RelationField<...>;
            } & ... 4 more ... & {
                ...;
            }>>, false>;
            readonly parent: PointerField<...>;
            readonly subtasks: RelationField<...>;
            readonly tags: RelationField<...>;
        } & ... 4 more ... & {
            ...;
        }>>>) => void;
    };
}
```

## Error cases

### typo in relation target (src/todo.ts: `target: () => User,` -> `target: () => Usr,`): 2 diagnostic(s)

- src/todo.ts:16:43 TS2552: Cannot find name 'Usr'. Did you mean 'User'?
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.

### typo in own where field (builder) (src/todo.ts: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:22:42 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & ... 4 more ... & { ...; }>>>'.

### typo in cross-schema where field (builder) (src/user.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 1 diagnostic(s)

- src/user.ts:15:79 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & ... 4 more ... & { ...; }>>>'.

### typo in cross-schema where field (object) (src/todo.ts: `email: { endsWith` -> `emial: { endsWith`): 0 diagnostic(s)


### typo in hook record field (plugin field) (src/todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:30:13 TS2551: Property 'isDeletd' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; readonly assignee: PointerRef | null; ... 5 more ...; readonly dueAt: Date | null; }'. Did you mean 'isDeleted'?

### typo in mappedBy (src/user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => SchemaClass<...>, "asignee">; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>> & SchemaRegistrationError<

### typo in plugin option key (src/todo.ts: `access: {` -> `acess: {`): 20 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => SchemaClass<...>, "assignee">; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>> & SchemaRegistrationError
- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>> & SchemaRegistrationError<..
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:21:2 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; }> & { ...; }'. Did you mean to write 'access'?
- src/todo.ts:22:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:23:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:23:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:23:65 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/usage.ts:8:11 TS2353: Object literal may only specify known properties, and 'completed' does not exist in type 'Where<SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:70 TS2339: Property 'assignee' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.

### wrong where return type (src/tag.ts: `access: { read: true }` -> `access: { read: { where: () => 42 } }`): 0 diagnostic(s)

