# fixture

Baseline diagnostics: 0

## Hovers

### src/todo.ts `Todo = App` (255 chars)

```
const Todo: DefinedSchema<"Todo", Parsed<{
    readonly title: "string";
    readonly archived: "boolean = false";
    readonly assignee: "TodoUser?";
    readonly parent: "Todo?";
    readonly subtasks: "Todo[] by parent";
    readonly tags: "Tag[]";
}>>
```

### src/usage.ts `pending = await` (585 chars)

```
const pending: {
    readonly title: string;
    readonly assignee: {
        readonly email: string;
        readonly assignedTodos: {
            readonly title: string;
            readonly id: string;
        }[];
        readonly id: string;
    } | null;
    readonly subtasks: {
        readonly title: string;
        readonly archived: boolean | null;
        readonly assignee: PointerRef | null;
        readonly parent: PointerRef | null;
        readonly id: string;
        readonly createdAt: Date;
        readonly updatedAt: Date;
    }[];
    readonly id: string;
}[]
```

## Error cases

### target typo (src/todo.ts: `assignee: 'TodoUser?'` -> `assignee: 'TodoUsr?'`): 3 diagnostic(s)

- src/ultimabase.ts:6:57 TS2322: Type 'DefinedSchema<"Todo", Parsed<{ readonly title: "string"; readonly archived: "boolean = false"; readonly assignee: "TodoUsr?"; readonly parent: "Todo?"; readonly subtasks: "Todo[] by parent"; readonly tags: "Tag[]"; }>>' is not assignable to type 'DefinedSchema<"Todo", Parsed<{ readonly title: "string"; readonly archived: "boolean = false"; readonly assignee: "TodoUsr?"; readonly parent: "Todo?"; readonly subtasks: "Todo[] by parent"; readonly tags: "Tag[]"; }>> & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSchema<"Todo", Parsed<{ readonly title: "str
- src/usage.ts:14:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:18:1 TS2578: Unused '@ts-expect-error' directive.

### scalar type typo (src/todo.ts: `title: 'string'` -> `title: 'strng'`): 6 diagnostic(s)

- src/todo.ts:6:3 TS2820: Type '"strng"' is not assignable to type 'FieldSyntax'. Did you mean '"string"'?
- src/usage.ts:13:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:14:58 TS2339: Property 'assignedTodos' does not exist on type 'NonNullable<string | number | boolean | Date | { readonly email: never; readonly assignedTodos: never; readonly id: never; } | { readonly email: never; readonly assignedTodos: never; readonly id: never; }[] | { ...; }[] | null>'.
- src/usage.ts:15:45 TS2537: Type 'string | number | boolean | Date | { readonly [x: string]: never; readonly [x: number]: never; readonly [x: symbol]: never; } | { readonly [x: string]: never; readonly [x: number]: never; readonly [x: symbol]: never; }[] | { readonly [x: string]: never; readonly [x: number]: never; readonly [x: symbol]: never; }[] |...' has no matching index signature for type 'number'.
- src/usage.ts:17:87 TS2537: Type 'string | number | boolean | Date | PointerRef | { readonly [x: string]: never; readonly [x: number]: never; readonly [x: symbol]: never; }[] | { readonly [x: string]: never; readonly [x: number]: never; readonly [x: symbol]: never; }[] | null' has no matching index signature for type 'number'.
- src/usage.ts:18:1 TS2578: Unused '@ts-expect-error' directive.

### mappedBy typo (src/todo-user.ts: `'Todo[] by assignee'` -> `'Todo[] by asignee'`): 1 diagnostic(s)

- src/ultimabase.ts:6:47 TS2322: Type 'DefinedSchema<"TodoUser", Parsed<{ readonly displayName: "string"; readonly email: "string"; readonly assignedTodos: "Todo[] by asignee"; }>>' is not assignable to type 'DefinedSchema<"TodoUser", Parsed<{ readonly displayName: "string"; readonly email: "string"; readonly assignedTodos: "Todo[] by asignee"; }>> & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", Parsed<{ readonly displayName: "string"; readonly email: "string"; readonly assignedTodos: "Todo[] by asignee"; }>>

### registry declaration missing (src/ultimabase.ts: `readonly app: typeof ultimabase` -> `readonly other: typeof ultimabase`): 4 diagnostic(s)

- src/usage.ts:14:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:15:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:17:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:18:1 TS2578: Unused '@ts-expect-error' directive.
