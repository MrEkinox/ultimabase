# f-factories

Baseline diagnostics: 0

## Hovers

### src/todo-role.ts `where }) => where.some('members'` (931 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
    readonly priority: ScalarField<"int", number, false>;
} & RoleOwnedFields<() => Schema<"User", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly completed: ScalarField<"boolean", boolean, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>, NextState<...>, unknown>, "assignee">;
    readonly roles: RelationField<...>;
} & PasswordUserOwnedFields, AppTypes<...>, NextState<...>, PasswordUserModel & {
    ...;
}>>, AppTypes<...>>>
```

### src/todo-user.ts `(role) => role.eq` (965 chars)

```
(parameter) role: WhereBuilder<Schema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
    readonly priority: ScalarField<"int", number, false>;
} & RoleOwnedFields<() => Schema<"User", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly completed: ScalarField<"boolean", boolean, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>, NextState<...>, unknown>, "assignee">;
    readonly roles: RelationField<...>;
} & PasswordUserOwnedFields, AppTypes<...>, NextState<...>, PasswordUserModel & {
    ...;
}>>, AppTypes<...>, NextState<...>, RoleModel & {
    ...;
}>>
```

### src/todo-user.ts `item }) =>` (169 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    displayName: string;
    username: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
}>
```

### src/usage.ts `signedUp = await` (44 chars)

```
const signedUp: {
    readonly id: string;
}
```

### src/usage.ts `roles = await` (164 chars)

```
const roles: {
    readonly members: {
        readonly id: string;
        readonly email: string;
    }[];
    readonly id: string;
    readonly name: string;
}[]
```

### completions src/todo.ts `= App.` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions src/minimal.ts `= MiniApp.` (11)

apply, arguments, bind, call, caller, length, name, prototype, Schema, toString, use

### completions src/todo-role.ts `priority: field.int({ default: 0 }) }),
}).` (10)

access, acl, addMember, className, createOne, findMany, hooks, indexes, postgres, softDelete

### completions src/usage.ts `await TodoRole.` (8)

acl, addMember, className, createOne, findMany, hooks, indexes, postgres

## Error cases

### two schemas from the same factory registered (src/application.ts: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, TodoRole, Todo, Tag, Customer]`): 2 diagnostic(s)

- src/application.ts:8:40 TS2322: Type 'Schema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, NextState<...>, unknown>, "assignee">; readonly...' is not assignable to type 'DefinedSchema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...
- src/application.ts:8:71 TS2322: Type 'Schema<"Customer", { readonly note: ScalarField<"string", string, false>; } & PasswordUserOwnedFields, AppTypes<readonly [AccessMethods, ... 5 more ..., NoSchemaMethods], Readonly<...> & ... 1 more ... & { ...; }>, ChainState<...>, PasswordUserModel & { ...; }>' is not assignable to type 'DefinedSchema<"Customer", { readonly note: ScalarField<"string", string, false>; } & PasswordUserOwnedFields, AppTypes<readonly [AccessMethods, ... 5 more ..., NoSchemaMethods], Readonly<...> & ... 1 more ... & { ...; }>> & SchemaChain<...> & PasswordUserModel & { ...; } & SchemaRegistrationError<...>'.

### typo in the members thunk (src/todo-role.ts: `members: () => TodoUser,` -> `members: () => TodoUsr,`): 1 diagnostic(s)

- src/todo-role.ts:7:17 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

### typo in a role field (cross-schema builder) (src/todo-user.ts: `role.eq('name', 'admin')` -> `role.eq('nme', 'admin')`): 1 diagnostic(s)

- src/todo-user.ts:23:121 TS2345: Argument of type '"nme"' is not assignable to parameter of type 'ScalarKeys<Schema<"TodoRole", { readonly description: ScalarField<"string", string, false>; readonly priority: ScalarField<"int", number, false>; } & RoleOwnedFields<() => Schema<...>>, AppTypes<...>, NextState<...>, RoleModel & { ...; }>>'.

### typo in a factory-owned field read by a hook (src/todo-user.ts: `item.email === ''` -> `item.emial === ''`): 1 diagnostic(s)

- src/todo-user.ts:17:47 TS2551: Property 'emial' does not exist on type 'Readonly<{ acl: ACL; id: string; displayName: string; username: string; email: string; createdAt: Date; updatedAt: Date; }>'. Did you mean 'email'?

### factory of a plugin that is not installed (src/minimal.ts: `MiniApp.Schema.define(` -> `MiniApp.RoleSchema.define(`): 2 diagnostic(s)

- src/minimal.ts:7:29 TS2339: Property 'RoleSchema' does not exist on type 'Factory<readonly [AccessMethods], Readonly<Record<never, never>> & object, readonly [NoSchemaFactories]>'.
- src/minimal.ts:7:77 TS7006: Parameter 'field' implicitly has an 'any' type.

### model method with a wrong argument (src/usage.ts: `await TodoRole.addMember({ id: 'r1' }, signedUp)` -> `await TodoRole.addMember('r1', signedUp)`): 1 diagnostic(s)

- src/usage.ts:43:26 TS2345: Argument of type 'string' is not assignable to parameter of type '{ readonly id: string; }'.
