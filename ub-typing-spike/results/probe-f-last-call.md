# f-last-call

Baseline diagnostics: 0

## Hovers

### src/todo.ts `Todo = App` (861 chars)

```
const Todo: Schema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"User", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    }, AppTypes<...>, NextState<...>, unknown>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>, NextState<...>, unknown>
```

### src/todo.ts `where }) => where.eq('archived'` (864 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"User", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    }, AppTypes<...>, NextState<...>, unknown>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>>
```

### src/todo.ts `item, originalItem }) =>` (329 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    assignee: PointerRef | null;
    isDeleted: boolean;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    parent: PointerRef | null;
    title: string;
    completed: boolean;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    dueAt: Date | null;
}>
```

### src/todo.ts `(user) => user.eq` (914 chars)

```
(parameter) user: WhereBuilder<Schema<"User", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly email: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly completed: ScalarField<"boolean", boolean, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly dueAt: ScalarField<"date", Date, false>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>, NextState<...>, unknown>, "assignee">;
    readonly roles: RelationField<...>;
}, AppTypes<...>, NextState<...>, unknown>>
```

### src/usage.ts `pending = await` (307 chars)

```
const pending: {
    readonly assignee: {
        readonly id: string;
        readonly displayName: string;
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

### src/todo.ts `.access({` (891 chars)

```
(property) access: (options: AccessOptions<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly completed: ScalarField<"boolean", boolean, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => Schema<"User", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly email: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
        readonly roles: RelationField<...>;
    }, AppTypes<...>, NextState<...>, unknown>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>>) => Schema<...>
```

### completions src/todo.ts `
})
	.` (9)

access, acl, className, createOne, findMany, hooks, indexes, postgres, softDelete

### completions src/todo.ts `'read')) })
	.` (5)

access, className, createOne, findMany, hooks

### completions src/minimal.ts `(field) => ({ body: field.string() }) })
	.` (4)

access, className, createOne, findMany

## Error cases

### typo in relation target (src/todo.ts: `target: () => User,` -> `target: () => Usr,`): 2 diagnostic(s)

- src/todo.ts:16:43 TS2552: Cannot find name 'Usr'. Did you mean 'User'?
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.

### typo in own where field (builder) (src/todo.ts: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:34:42 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'.

### typo in cross-schema where field (builder) (src/user.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 1 diagnostic(s)

- src/user.ts:22:79 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, NextState<...>, unknown>>'.

### typo in cross-schema where field (object) (src/todo.ts: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/todo.ts:37:47 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<Schema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<...>, "assignee">; readonly roles: RelationField<...>; }, AppTypes<...>, NextState<...>, unknown>>'. Did you mean to write 'email'?

### typo in hook record field (plugin field) (src/todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:29:13 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; assignee: PointerRef | null; isDeleted: boolean; id: string; createdAt: Date; updatedAt: Date; parent: PointerRef | null; title: string; completed: boolean; archived: boolean; priority: "low" | ... 2 more ... | null; dueAt: Date | null; }>'. Did you mean 'isDeleted'?

### typo in mappedBy (src/user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'Schema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<...>, "asignee">; readonly roles: RelationField<...>; }, AppTypes<...>, NextState<...>, unknown>' is not assignable to type 'DefinedSchema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<...>, "asignee">; readonly roles: RelationField<...>; }, AppTypes<...>> & SchemaChain<...> & SchemaReg

### typo in plugin method name (src/todo.ts: `.access({` -> `.acess({`): 11 diagnostic(s)

- src/todo.ts:33:3 TS2551: Property 'acess' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, NextState<...>, unknown>'. Did you mean 'access'?
- src/todo.ts:34:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:35:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:35:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:35:65 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:28:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:32:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:34:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:36:1 TS2578: Unused '@ts-expect-error' directive.

### wrong where return type (src/tag.ts: `.access({ read: true })` -> `.access({ read: { where: () => 42 } })`): 1 diagnostic(s)

- src/tag.ts:10:34 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<DefinedSchema<"Tag", { readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>...'.

### extra: same method twice (src/tag.ts: `.access({ read: true })` -> `.access({ read: true }).access({ read: false })`): 1 diagnostic(s)

- src/tag.ts:10:27 TS2339: Property 'access' does not exist on type 'Schema<"Tag", { readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, NextState<...>, unknown>...'.

### extra: shape method after a behaviour method (src/tag.ts: `.access({ read: true })` -> `.access({ read: true }).softDelete()`): 1 diagnostic(s)

- src/tag.ts:10:27 TS2339: Property 'softDelete' does not exist on type 'Schema<"Tag", { readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, NextState<...>, unknown>...'.

### extra: method of a plugin that is not installed (src/minimal.ts: `.access({ read: true })` -> `.access({ read: true }).hooks({})`): 1 diagnostic(s)

- src/minimal.ts:8:26 TS2339: Property 'hooks' does not exist on type 'Schema<"Note", { readonly body: ScalarField<"string", string, false>; }, AppTypes<readonly [AccessMethods], Readonly<Record<never, never>> & object>, NextState<...>, unknown>'.

### extra: hook before softDelete reads isDeleted (order rule) (src/todo.ts: `	.softDelete()
` -> `	.hooks({ beforeSave: ({ item }) => { if (item.isDeleted) throw new TypeError('x') } })
	.softDelete()
`): 16 diagnostic(s)

- src/todo.ts:22:48 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; assignee: PointerRef | null; id: string; createdAt: Date; updatedAt: Date; parent: PointerRef | null; title: string; completed: boolean; archived: boolean; priority: "low" | ... 2 more ... | null; dueAt: Date | null; }>'.
- src/todo.ts:23:3 TS2339: Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; }, AppTypes<...>, NextState<...>, unknown>'.
- src/todo.ts:26:19 TS7006: Parameter 'data' implicitly has an 'any' type.
- src/todo.ts:28:18 TS7031: Binding element 'item' implicitly has an 'any' type.
- src/todo.ts:28:24 TS7031: Binding element 'originalItem' implicitly has an 'any' type.
- src/todo.ts:32:18 TS7006: Parameter 'data' implicitly has an 'any' type.
- src/todo.ts:35:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:36:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:36:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:36:65 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:28:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:32:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:34:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:36:1 TS2578: Unused '@ts-expect-error' directive.

### extra: one-direction cross-schema callback in a non-last call (Tag -> Todo) (src/tag.ts: `.access({ read: true })` -> `.access({ read: { where: ({ where }) => where.some('todos', (todo) => todo.eq('archived', false)) } }).postgres({ table: 'tags' })`): 0 diagnostic(s)


### extra: User cross filter moved to a non-last call (Todo keeps its cross filter last) (src/user.ts: `where.eq('id', userId ?? '') },
	})` -> `where.eq('id', userId ?? '') },
	})
	.acl({})`): 0 diagnostic(s)


### extra: application registry declared (short hovers) (src/application.ts: `export const app = new App({ schemas: [User, Role, Todo, Tag] })` -> `export const app = new App({ schemas: [User, Role, Todo, Tag] })
declare module '../../../lib-f/types.ts' { interface Register { readonly app: typeof app } }`): 11 diagnostic(s)

- src/application.ts:7:14 TS7022: 'app' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/application.ts:8:74 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:23:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:32:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:5:14 TS7022: 'User' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- ../../lib-f/types.ts:53:6 TS2456: Type alias 'RegisteredList' circularly references itself.
- ../../lib-f/types.ts:65:6 TS2456: Type alias 'RegisteredNames' circularly references itself.
- ../../lib-f/types.ts:68:13 TS2456: Type alias 'SchemaNamed' circularly references itself.
- ../../lib-f/types.ts:78:52 TS2315: Type 'SchemaNamed' is not generic.
