# fixture

Baseline diagnostics: 0

## Hovers

### src/todo.ts `class Todo extends` (10 chars)

```
class Todo
```

### src/todo.ts `where }) => where.eq('archived'` (44 chars)

```
(parameter) where: WhereBuilder<typeof Todo>
```

### src/todo.ts `(user) => user.eq('id'` (47 chars)

```
(parameter) user: WhereBuilder<typeof TodoUser>
```

### src/todo.ts `item }) =>` (22 chars)

```
(parameter) item: Todo
```

### src/todo.ts `static options` (49 chars)

```
(property) Todo.options: SchemaRules<typeof Todo>
```

### src/todo.ts `softDelete() {` (699 chars)

```
(property) softDelete: () => SchemaBase<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", true>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<() => typeof Todo, false>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, InstallOne<...>, unknown, "softDelete">
```

### src/usage.ts `pending = await` (325 chars)

```
const pending: {
    readonly id: string;
    readonly title: string;
    readonly assignee: {
        readonly id: string;
        readonly email: string;
    } | null;
    readonly priority: "low" | "normal" | "high" | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### src/usage.ts `one: Todo` (22 chars)

```
const one: Todo | null
```

### src/todo-user.ts `value }) => value.trim()` (25 chars)

```
(parameter) value: string
```

### src/todo-role.ts `(user) => user.eq` (47 chars)

```
(parameter) user: WhereBuilder<typeof TodoUser>
```

### src/todo.ts `this.with` (407 chars)

```
(method) SchemaRulesEntry<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions, NoSchemaOptions]>.with<typeof Todo>(this: typeof Todo, options: PostgresSchemaOption<typeof Todo> & AccessSchemaOption<typeof Todo> & HooksSchemaOption<typeof Todo> & AclSchemaOption<typeof Todo> & Readonly<Record<never, never>>): SchemaRules<typeof Todo>
```

### completions src/tag.ts `this.with({
		access` (4)

access, acl, hooks, postgres

### completions src/todo.ts `extends App.` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions src/todo.ts `})).` (15)

apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, softDelete, toString, with

### completions src/todo.ts `access: {
			read` (2)

create, read

### completions src/todo.ts `this.with` (15)

options, apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, toString, with

## Error cases

### 1 relation target typo (src/todo.ts: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 3 diagnostic(s)

- src/todo.ts:15:42 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:23:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:49:1 TS2578: Unused '@ts-expect-error' directive.

### 2 local where field typo (src/todo.ts: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/todo.ts:22:43 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<typeof Todo>'.

### 3 cross-schema field typo (src/todo.ts: `user.eq('email',` -> `user.eq('emial',`): 1 diagnostic(s)

- src/todo.ts:26:75 TS2345: Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<typeof TodoUser>'.

### 4 plugin field typo in hook (src/todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/todo.ts:31:14 TS2551: Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?

### 5 mappedBy typo (src/todo-user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/ultimabase.ts:7:47 TS2322: Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'. /   Property ''~error'' is missing in type 'typeof TodoUser' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

### 6 rules key typo (src/todo.ts: `access: {` -> `acess: {`): 7 diagnostic(s)

- src/todo.ts:21:3 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<typeof Todo> & AccessSchemaOption<typeof Todo> & HooksSchemaOption<typeof Todo> & AclSchemaOption<typeof Todo> & Readonly<...>'. Did you mean to write 'access'?
- src/todo.ts:22:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:24:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:24:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:24:57 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/todo.ts:26:24 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:26:58 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7 wrong filter return (src/tag.ts: `where: () => false` -> `where: () => 42`): 1 diagnostic(s)

- src/tag.ts:12:27 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<typeof Tag>'.

### 8 query select typo (src/usage.ts: `select: { title: true } })` -> `select: { titel: true } })`): 1 diagnostic(s)

- src/usage.ts:63:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?

### R1 second RoleSchema (src/negative.ts: `// @ts-expect-error second RoleSchema schema` -> `//`): 2 diagnostic(s)

- src/negative.ts:29:55 TS2322: Type 'typeof TodoRole' is not assignable to type 'typeof TodoRole & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'. /   Property ''~error'' is missing in type 'typeof TodoRole' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
- src/negative.ts:29:76 TS2322: Type 'typeof ExtraRole' is not assignable to type 'typeof ExtraRole & SchemaRegistrationError<"ExtraRole: factory 'RoleSchema' already created another registered schema">'. /   Property ''~error'' is missing in type 'typeof ExtraRole' but required in type 'SchemaRegistrationError<"ExtraRole: factory 'RoleSchema' already created another registered schema">'.

### R2 custom static/instance members (src/negative.ts: `// @ts-expect-error custom static and instance members` -> `//`): 1 diagnostic(s)

- src/negative.ts:31:74 TS2322: Type 'typeof ActiveTodo' is not assignable to type 'typeof ActiveTodo & SchemaRegistrationError<"ActiveTodo: custom instance member 'save' is not allowed; models are immutable data without behaviour; ActiveTodo: custom static member 'archiveAll' is not allowed; a schema class declares fields and rules only">'. /   Property ''~error'' is missing in type 'typeof ActiveTodo' but required in type 'SchemaRegistrationError<"ActiveTodo: custom instance member 'save' is not allowed; models are immutable data without behaviour; ActiveTodo: custom static member 'archiveAll' is not allowed; a schema clas

### R3 plain object options (src/negative.ts: `// @ts-expect-error plain object options` -> `//`): 1 diagnostic(s)

- src/negative.ts:33:79 TS2322: Type 'typeof Unannotated' is not assignable to type 'typeof Unannotated & SchemaRegistrationError<"Unannotated: static options must be created with this.with({ ... }) in the class body">'. /   Property ''~error'' is missing in type 'typeof Unannotated' but required in type 'SchemaRegistrationError<"Unannotated: static options must be created with this.with({ ... }) in the class body">'.

### R5 options of another class (src/negative.ts: `// @ts-expect-error options of another class` -> `//`): 1 diagnostic(s)

- src/negative.ts:35:76 TS2322: Type 'typeof Borrowed' is not assignable to type 'typeof Borrowed & SchemaRegistrationError<"Borrowed: static options must be created with this.with({ ... }) in the class body">'. /   Property ''~error'' is missing in type 'typeof Borrowed' but required in type 'SchemaRegistrationError<"Borrowed: static options must be created with this.with({ ... }) in the class body">'.

### R4 no RoleSchema registered (src/negative.ts: `// @ts-expect-error no RoleSchema schema registered` -> `//`): 1 diagnostic(s)

- src/negative.ts:37:31 TS2345: Argument of type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [typeof TodoUser, typeof Todo, typeof Tag]> & { readonly '~missingSchemas': "register one schema created by App.RoleSchema"; }'. /   Property ''~missingSchemas'' is missing in type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' but required in type '{ readonly '~missingSchemas': "register one schema created by App.RoleSchema"; }'.

### S1 hook reading isDeleted without softDelete (src/todo.ts: `})).softDelete() {` -> `})) {`): 3 diagnostic(s)

- src/todo.ts:31:14 TS2339: Property 'isDeleted' does not exist on type 'Todo'.
- src/usage.ts:33:71 TS2353: Object literal may only specify known properties, and 'isDeleted' does not exist in type 'CreateInput<typeof Todo>'.
- src/usage.ts:36:48 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly title: string; readonly assignee: PointerRef | null; ... 4 more ...; readonly status: "open" | ... 1 more ... | "done"; }'.

### E2b rules key typo inside with (src/tag.ts: `delete: { where: () => false }` -> `delet: { where: () => false }`): 1 diagnostic(s)

- src/tag.ts:12:4 TS2561: Object literal may only specify known properties, but 'delet' does not exist in type 'AccessOptions<typeof Tag>'. Did you mean to write 'delete'?
