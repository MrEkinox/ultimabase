# a-single-object

Baseline diagnostics: 23
  src/application.ts:7:58 TS2322 Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readon
  src/role.ts:12:110 TS2345 Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { reado
  src/todo.ts:22:42 TS2345 Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readon
  src/todo.ts:23:52 TS2345 Argument of type '"assignee"' is not assignable to parameter of type 'never'.
  src/todo.ts:23:82 TS2345 Argument of type '"id"' is not assignable to parameter of type 'never'.
  src/todo.ts:25:29 TS2322 Type '{ is: { email: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
  src/todo.ts:29:22 TS2339 Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
  src/todo.ts:29:50 TS2339 Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
  src/todo.ts:32:51 TS2339 Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", 
  src/todo.ts:34:34 TS2339 Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", 
  src/usage.ts:8:37 TS2322 Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
  src/usage.ts:9:12 TS2353 Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & objec
  src/usage.ts:11:13 TS2353 Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & obje
  src/usage.ts:14:39 TS2339 Property 'title' does not exist on type '{ readonly id: string; }'.
  src/usage.ts:15:39 TS2339 Property 'dueAt' does not exist on type '{ readonly id: string; }'.
  src/usage.ts:16:51 TS2339 Property 'assignee' does not exist on type '{ readonly id: string; }'.
  src/usage.ts:17:39 TS2339 Property 'subtasks' does not exist on type '{ readonly id: string; }'.
  src/usage.ts:18:25 TS2344 Type 'false' does not satisfy the constraint 'true'.
  src/usage.ts:22:25 TS2344 Type 'false' does not satisfy the constraint 'true'.
  src/usage.ts:25:140 TS2322 Type '{ connect: string; }' is not assignable to type 'never'.
  src/usage.ts:26:48 TS2339 Property 'priority' does not exist on type '{ readonly id: string; }'.
  src/usage.ts:30:1 TS2578 Unused '@ts-expect-error' directive.
  src/user.ts:15:79 TS2345 Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readon

## Hovers

### src/todo.ts `Todo = App` (251 chars)

```
const Todo: SchemaClass<"Todo", Readonly<{
    assignee: unknown;
} & SystemFields & Readonly<Record<never, never>> & object & {
    readonly acl: ScalarField<"json", ACL, true>;
} & {
    readonly isDeleted: ScalarField<"boolean", boolean, true>;
}>>
```

### src/todo.ts `where }) => where.eq('archived'` (272 chars)

```
(parameter) where: WhereBuilder<SchemaClass<"Todo", Readonly<{
    assignee: unknown;
} & SystemFields & Readonly<Record<never, never>> & object & {
    readonly acl: ScalarField<"json", ACL, true>;
} & {
    readonly isDeleted: ScalarField<"boolean", boolean, true>;
}>>>
```

### src/todo.ts `item, originalItem }) =>` (192 chars)

```
(parameter) item: {
    readonly acl: ACL;
    readonly assignee: never;
    readonly id: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly isDeleted: boolean;
}
```

### src/todo.ts `(user) => user.eq` (37 chars)

```
(parameter) user: WhereBuilder<never>
```

### src/usage.ts `pending = await` (45 chars)

```
const pending: {
    readonly id: string;
}[]
```

### src/todo.ts `access: {` (468 chars)

```
(property) AccessSchemaOption<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>.access?: AccessOptions<SchemaClass<"Todo", Readonly<{
    assignee: unknown;
} & SystemFields & Readonly<Record<never, never>> & object & {
    readonly acl: ScalarField<"json", ACL, true>;
} & {
    readonly isDeleted: ScalarField<"boolean", boolean, true>;
}>>>
```

## Error cases

### typo in relation target (src/todo.ts: `target: () => User,` -> `target: () => Usr,`): 24 diagnostic(s)

- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:16:43 TS2552: Cannot find name 'Usr'. Did you mean 'User'?
- src/todo.ts:22:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:23:52 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:23:82 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:29 TS2322: Type '{ is: { email: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/todo.ts:29:22 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:29:50 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:32:51 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:34:34 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:8:37 TS2322: Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:140 TS2322: Type '{ connect: string; }' is not assignable to type 'never'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.

### typo in own where field (builder) (src/todo.ts: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 23 diagnostic(s)

- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:22:42 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:23:52 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:23:82 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:29 TS2322: Type '{ is: { email: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/todo.ts:29:22 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:29:50 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:32:51 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:34:34 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:8:37 TS2322: Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:140 TS2322: Type '{ connect: string; }' is not assignable to type 'never'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.

### typo in cross-schema where field (builder) (src/user.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 23 diagnostic(s)

- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:22:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:23:52 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:23:82 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:29 TS2322: Type '{ is: { email: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/todo.ts:29:22 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:29:50 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:32:51 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:34:34 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:8:37 TS2322: Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:140 TS2322: Type '{ connect: string; }' is not assignable to type 'never'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.

### typo in cross-schema where field (object) (src/todo.ts: `email: { endsWith` -> `emial: { endsWith`): 23 diagnostic(s)

- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:22:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:23:52 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:23:82 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:29 TS2322: Type '{ is: { emial: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/todo.ts:29:22 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:29:50 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:32:51 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:34:34 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:8:37 TS2322: Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:140 TS2322: Type '{ connect: string; }' is not assignable to type 'never'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.

### typo in hook record field (plugin field) (src/todo.ts: `item.isDeleted` -> `item.isDeletd`): 24 diagnostic(s)

- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:22:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:23:52 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:23:82 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:29 TS2322: Type '{ is: { email: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/todo.ts:29:22 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:29:50 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:30:13 TS2551: Property 'isDeletd' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'. Did you mean 'isDeleted'?
- src/todo.ts:32:51 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:34:34 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:8:37 TS2322: Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:140 TS2322: Type '{ connect: string; }' is not assignable to type 'never'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.

### typo in mappedBy (src/user.ts: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 24 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => SchemaClass<...>, "asignee">; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>> & SchemaRegistrationError<
- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:22:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:23:52 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:23:82 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:29 TS2322: Type '{ is: { email: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/todo.ts:29:22 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; readonly assignee: never; }'.
- src/todo.ts:29:50 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; readonly assignee: never; }'.
- src/todo.ts:32:51 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:34:34 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:8:37 TS2322: Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:140 TS2322: Type '{ connect: string; }' is not assignable to type 'never'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.

### typo in plugin option key (src/todo.ts: `access: {` -> `acess: {`): 20 diagnostic(s)

- src/application.ts:7:40 TS2322: Type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => SchemaClass<...>, "assignee">; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"User", Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; readonly roles: RelationField<...>; } & ... 4 more ... & { ...; }>> & SchemaRegistrationError
- src/application.ts:7:58 TS2322: Type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>>' is not assignable to type 'SchemaClass<"Tag", Readonly<{ readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; } & ... 4 more ... & { ...; }>> & SchemaRegistrationError<..
- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:21:2 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...>; }> & ... 4 more ... & PostgresSchemaOption'. Did you mean to write 'access'?
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

### wrong where return type (src/tag.ts: `access: { read: true }` -> `access: { read: { where: () => 42 } }`): 24 diagnostic(s)

- src/role.ts:12:110 TS2345: Argument of type '"completed"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/tag.ts:6:21 TS2739: Type '{ label: ScalarField<"string", string, true>; todos: RelationField<() => SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>, "tags">; }' is missing the following properties from type '{ toString: unknown; toFixed: unknown; toExponential: unknown; toPrecision: unknown; valueOf: unknown; toLocaleString: unknown; }': toFixed, toExponential, toPrecision
- src/tag.ts:10:33 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<SchemaClass<"Tag", Readonly<{ toString: unknown; toFixed: unknown; toExponential: unknown; toPrecision: unknown; valueOf: unknown; toLocaleString: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { ...; } & { ...; }>>>'.
- src/todo.ts:22:42 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:23:52 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:23:82 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:29 TS2322: Type '{ is: { email: { endsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/todo.ts:29:22 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:29:50 TS2339: Property 'completed' does not exist on type '{ readonly acl: ACL; readonly assignee: never; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/todo.ts:32:51 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/todo.ts:34:34 TS2339: Property 'title' does not exist on type 'CreateInput<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:8:37 TS2322: Type '{ is: { displayName: { startsWith: string; }; }; }' is not assignable to type 'undefined'.
- src/usage.ts:9:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:11:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
- src/usage.ts:14:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:15:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:16:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:22:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:140 TS2322: Type '{ connect: string; }' is not assignable to type 'never'.
- src/usage.ts:26:48 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:30:1 TS2578: Unused '@ts-expect-error' directive.
- src/user.ts:15:79 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<SchemaClass<"Todo", Readonly<{ assignee: unknown; } & SystemFields & Readonly<Record<never, never>> & object & { readonly acl: ScalarField<"json", ACL, true>; } & { ...; }>>>'.
