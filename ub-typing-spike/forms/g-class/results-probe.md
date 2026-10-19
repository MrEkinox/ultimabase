# fixture

Baseline diagnostics: 0

## Hovers

### todo.ts `(todo) => todo.eq('archived'` (38 chars)

```
(parameter) todo: WhereBuilder<"Todo">
```

### todo.ts `(user) => user.eq('id'` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### tag.ts `(user) => user.eq('displayName'` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### todo.ts `({ item }) =>` (22 chars)

```
(parameter) item: Todo
```

### todo-user.ts `(value) => value.trim()` (25 chars)

```
(parameter) value: string
```

### todo.ts `class Todo extends` (10 chars)

```
class Todo
```

### todo.ts `static access = this.rules.access(` (49 chars)

```
(property) Todo.access: RuleDeclaration<"access">
```

### todo.ts `static access = this.rules.access(` (955 chars)

```
(property) SchemaStatics<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>, RuleMethods<...>>.rules: RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    ... 4 more ...;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>
```

### todo.ts `static access = this.rules.access(` (80 chars)

```
(property) access: (options: AccessOptions<"Todo">) => RuleDeclaration<"access">
```

### todo.ts `App.Schema(` (1606 chars)

```
(property) ConfiguredFactory<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], readonly [PostgresShape, ... 5 more ..., NoShape], Readonly<...> & { ...; }, readonly [...]>.Schema: SchemaFunction
<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, {
    ...;
}>(className: "Todo", fields: {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, shape?: ({
    ...;
} & ExactShape<...>) | undefined) => SchemaStatics<...>
```

### usage.ts `pending = await` (364 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly displayName: string;
    } | null;
    readonly dueAt: Date | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### usage.ts `one: Todo | null = await Todo.findOne(` (305 chars)

```
(method) SchemaQueries.findOne<typeof Todo, {
    readonly where: {
        readonly title: {
            readonly eq: "x";
        };
    };
}>(this: typeof Todo, args?: {
    readonly where: {
        readonly title: {
            readonly eq: "x";
        };
    };
} | undefined): Promise<Todo | null>
```

### usage.ts `signedUp = await` (24 chars)

```
const signedUp: TodoUser
```

### completions todo.ts `static acl = this.rules.` (3)

access, acl, hooks

### completions todo.ts `static acl = this.` (17)

access, acl, hooks, apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, rules, toString

### completions todo.ts `extends App.` (14)

apply, arguments, bind, call, caller, field, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions todo.ts `{ softDelete: true, ` (1)

softDelete

## Error cases

### 1 relation target typo (todo.ts: `field.pointer(() => TodoUser,` -> `field.pointer(() => TodoUsr,`): 3 diagnostic(s), on edited line todo.ts:16: yes

- todo.ts:16:33 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- usage.ts:20:2 TS2344: Type 'false' does not satisfy the constraint 'true'.
- usage.ts:59:1 TS2578: Unused '@ts-expect-error' directive.

First message (52 chars): `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?`

### 2 local where field typo (builder) (todo.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 1 diagnostic(s), on edited line todo.ts:24: yes

- todo.ts:24:36 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

First message (89 chars): `Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.`

### 3 cross-schema field typo (object, Todo -> TodoUser) (todo.ts: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s), on edited line todo.ts:27: yes

- todo.ts:27:47 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

First message (136 chars): `Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?`

### 4 plugin-added field typo in a hook (todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s), on edited line todo.ts:37: yes

- todo.ts:37:13 TS2551: Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?

First message (76 chars): `Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?`

### 5 mappedBy typo (todo-user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s), on edited line todo-user.ts:7: no

- ultimabase.ts:7:47 TS2322: Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'. /   Property ''~error'' is missing in type 'typeof TodoUser' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

First message (338 chars): `Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'. /   Property ''~error'' is missing in type 'typeof TodoUser' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.`

### 6a rule method typo (todo.ts: `static access = this.rules.access(` -> `static access = this.rules.acess(`): 6 diagnostic(s), on edited line todo.ts:23: yes

- todo.ts:23:29 TS2551: Property 'acess' does not exist on type 'RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<...>; ... 8 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>>>'. Did you mean 'access'?
- todo.ts:24:19 TS7006: Parameter 'todo' implicitly has an 'any' type.
- todo.ts:26:21 TS7006: Parameter 'todo' implicitly has an 'any' type.
- todo.ts:26:29 TS7031: Binding element 'userId' implicitly has an 'any' type.
- todo.ts:26:63 TS7006: Parameter 'user' implicitly has an 'any' type.
- ultimabase.ts:7:67 TS2322: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<any>'.

First message (334 chars): `Property 'acess' does not exist on type 'RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<...>; ... 8 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>>>'. Did you mean 'access'?`

### 6b rule static member typo (todo.ts: `static access = this.rules.access(` -> `static acess = this.rules.access(`): 1 diagnostic(s), on edited line todo.ts:23: no

- ultimabase.ts:7:67 TS2322: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo.acess: static member is not a rule of an installed plugin">'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo.acess: static member is not a rule of an installed plugin">'.

First message (320 chars): `Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo.acess: static member is not a rule of an installed plugin">'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo.acess: static member is not a rule of an installed plugin">'.`

### 6c shape option typo (todo.ts: `{ softDelete: true,` -> `{ sofDelete: true,`): 4 diagnostic(s), on edited line todo.ts:21: yes

- todo.ts:21:4 TS2322: Type 'true' is not assignable to type 'true & UnknownSchemaOption<"sofDelete">'. /   Type 'boolean' is not assignable to type 'UnknownSchemaOption<"sofDelete">'.
- todo.ts:37:13 TS2339: Property 'isDeleted' does not exist on type 'Todo'.
- usage.ts:37:36 TS2339: Property 'isDeleted' does not exist on type 'Todo'.
- usage.ts:46:70 TS2353: Object literal may only specify known properties, and 'isDeleted' does not exist in type 'CreateInput<typeof Todo>'.

First message (159 chars): `Type 'true' is not assignable to type 'true & UnknownSchemaOption<"sofDelete">'. /   Type 'boolean' is not assignable to type 'UnknownSchemaOption<"sofDelete">'.`

### 7 wrong filter return (tag.ts: `delete: { where: () => false }` -> `delete: { where: () => 42 }`): 1 diagnostic(s), on edited line tag.ts:11: yes

- tag.ts:11:26 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

First message (68 chars): `Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.`

### 8 query select typo (usage.ts: `select: { title: true, dueAt: true, priority: true }` -> `select: { titel: true }`): 2 diagnostic(s), on edited line usage.ts:13: yes

- usage.ts:13:12 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?
- usage.ts:20:2 TS2344: Type 'false' does not satisfy the constraint 'true'.

First message (138 chars): `Object literal may only specify known properties, but 'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?`

### x1 cross-schema builder field typo (two hops) (tag.ts: `user.eq('displayName'` -> `user.eq('displayNme'`): 1 diagnostic(s), on edited line tag.ts:10: yes

- tag.ts:10:93 TS2345: Argument of type '"displayNme"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

First message (96 chars): `Argument of type '"displayNme"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.`

### x2 custom static method in the body (todo.ts: `	static acl = this.rules.acl({` -> `	static complete(): number {
		return 1
	}
	static acl = this.rules.acl({`): 1 diagnostic(s), on edited line todo.ts:31: no

- ultimabase.ts:7:67 TS2322: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo.complete: static member is not a rule of an installed plugin">'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo.complete: static member is not a rule of an installed plugin">'.

First message (326 chars): `Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo.complete: static member is not a rule of an installed plugin">'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo.complete: static member is not a rule of an installed plugin">'.`

### x3 instance method in the body (todo.ts: `	static acl = this.rules.acl({` -> `	label(): string {
		return 'x'
	}
	static acl = this.rules.acl({`): 1 diagnostic(s), on edited line todo.ts:31: no

- ultimabase.ts:7:67 TS2322: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: instance member 'label' is not allowed (models are immutable data)">'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: instance member 'label' is not allowed (models are immutable data)">'.

First message (340 chars): `Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: instance member 'label' is not allowed (models are immutable data)">'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: instance member 'label' is not allowed (models are immutable data)">'.`

### x4 rule stored under another rule's name (tag.ts: `static access = this.rules.access({` -> `static hooks = this.rules.access({`): 1 diagnostic(s), on edited line tag.ts:8: no

- ultimabase.ts:7:73 TS2322: Type 'typeof Tag' is not assignable to type 'typeof Tag & SchemaRegistrationError<"Tag.hooks: assign this.rules.hooks(...) to this static member">'. /   Property ''~error'' is missing in type 'typeof Tag' but required in type 'SchemaRegistrationError<"Tag.hooks: assign this.rules.hooks(...) to this static member">'.

First message (315 chars): `Type 'typeof Tag' is not assignable to type 'typeof Tag & SchemaRegistrationError<"Tag.hooks: assign this.rules.hooks(...) to this static member">'. /   Property ''~error'' is missing in type 'typeof Tag' but required in type 'SchemaRegistrationError<"Tag.hooks: assign this.rules.hooks(...) to this static member">'.`

### x5 second role schema registered (ultimabase.ts: `export const ultimabase = new App({ schemas: [TodoUser, TodoRole, Todo, Tag] })` -> `import { SecondRole } from './extra.ts'
export const ultimabase = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, SecondRole] })`): 2 diagnostic(s), on edited line ultimabase.ts:7: no

- ultimabase.ts:8:57 TS2322: Type 'typeof TodoRole' is not assignable to type 'typeof TodoRole & SchemaRegistrationError<"TodoRole: App.RoleSchema may create exactly one registered schema">'. /   Property ''~error'' is missing in type 'typeof TodoRole' but required in type 'SchemaRegistrationError<"TodoRole: App.RoleSchema may create exactly one registered schema">'.
- ultimabase.ts:8:78 TS2322: Type 'typeof SecondRole' is not assignable to type 'typeof SecondRole & SchemaRegistrationError<"SecondRole: App.RoleSchema may create exactly one registered schema">'. /   Property ''~error'' is missing in type 'typeof SecondRole' but required in type 'SchemaRegistrationError<"SecondRole: App.RoleSchema may create exactly one registered schema">'.

First message (338 chars): `Type 'typeof TodoRole' is not assignable to type 'typeof TodoRole & SchemaRegistrationError<"TodoRole: App.RoleSchema may create exactly one registered schema">'. /   Property ''~error'' is missing in type 'typeof TodoRole' but required in type 'SchemaRegistrationError<"TodoRole: App.RoleSchema may create exactly one registered schema">'.`

### x6 role schema missing (ultimabase.ts: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, Todo, Tag]`): 1 diagnostic(s), on edited line ultimabase.ts:7: yes

- ultimabase.ts:7:35 TS2345: Argument of type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [typeof TodoUser, typeof Todo, typeof Tag], readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], readonly [...]>'. /   Property ''~missingSchema'' is missing in type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' but required in type '{ readonly '~missingSchema': "register exactly one schema created with App.RoleSchema"; }'.

First message (509 chars): `Argument of type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [typeof TodoUser, typeof Todo, typeof Tag], readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], readonly [...]>'. /   Property ''~missingSchema'' is missing in type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' but required in type '{ readonly '~missingSchema': "register exactly one schema created with App.RoleSchema"; }'.`

### x7 index field typo (todo.ts: `fields: ['archived', 'dueAt']` -> `fields: ['archivd', 'dueAt']`): 4 diagnostic(s), on edited line todo.ts:21: yes

- todo.ts:21:71 TS2820: Type '"archivd"' is not assignable to type '"assignee" | "parent" | "dueAt" | "title" | "archived" | "priority" | "allowedPriorities" | "status" | "subtasks" | "tags"'. Did you mean '"archived"'?
- todo.ts:37:13 TS2339: Property 'isDeleted' does not exist on type 'Todo'.
- usage.ts:37:36 TS2339: Property 'isDeleted' does not exist on type 'Todo'.
- usage.ts:46:70 TS2353: Object literal may only specify known properties, and 'isDeleted' does not exist in type 'CreateInput<typeof Todo>'.

First message (195 chars): `Type '"archivd"' is not assignable to type '"assignee" | "parent" | "dueAt" | "title" | "archived" | "priority" | "allowedPriorities" | "status" | "subtasks" | "tags"'. Did you mean '"archived"'?`

### x8 unknown members on role factory (todo-role.ts: `{ members: () => TodoUser }` -> `{ members: () => TodoUsr }`): 1 diagnostic(s), on edited line todo-role.ts:4: yes

- todo-role.ts:4:108 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

First message (52 chars): `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?`

### x9 select typo next to valid keys (usage.ts: `select: { title: true, dueAt` -> `select: { titel: true, dueAt`): 1 diagnostic(s), on edited line usage.ts:13: no

- usage.ts:20:2 TS2344: Type 'false' does not satisfy the constraint 'true'.

First message (52 chars): `Type 'false' does not satisfy the constraint 'true'.`
