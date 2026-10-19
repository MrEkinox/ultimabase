# e1

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| class Todo extends | 10 | 10 | yes |
| where }) => where.eq('archived' | 44 | 44 | yes |
| (user) => user.eq('id' | 47 | 47 | yes |
| item }) => | 22 | 22 | yes |
| options: Options | 45 | 45 | yes |
| softDelete() { | 699 | 699 | NO |
| pending = await | 325 | 325 | NO |
| one: Todo | 22 | 22 | yes |
| value }) => value.trim() | 25 | 25 | yes |
| (user) => user.eq | 47 | 47 | yes |

### softDelete() {

TS6:
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
TS7:
```
(property) softDelete: () => SchemaBase<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "done" | "inProgress" | "open", true>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<() => typeof Todo, false>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, InstallOne<...>, unknown, "softDelete">
```

### pending = await

TS6:
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
TS7:
```
const pending: {
    readonly assignee: {
        readonly email: string;
        readonly id: string;
    } | null;
    readonly id: string;
    readonly priority: "high" | "low" | "normal" | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
    readonly title: string;
}[]
```

## Completions

- Options<typeof Tag> = {
		access: TS6 4, TS7 4, DIFF (only TS6: access, acl, hooks, postgres; only TS7: access?, acl?, hooks?, postgres?)
- extends App.: TS6 13, TS7 15, DIFF (only TS6: -; only TS7: Symbol, ~app)
- })).: TS6 14, TS7 17, DIFF (only TS6: -; only TS7: Symbol, ~fields, ~statics)
- access: {
			read: TS6 2, TS7 2, DIFF (only TS6: create, read; only TS7: create?, read?)

## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| 1 relation target typo | 3/3 | yes/yes | 2552/2552 | 52/52 | yes | yes |
| 2 local where field typo | 1/1 | yes/yes | 2345/2345 | 94/94 | yes | yes |
| 3 cross-schema field typo | 1/1 | yes/yes | 2345/2345 | 96/96 | yes | yes |
| 4 plugin field typo in hook | 1/1 | yes/yes | 2551/2551 | 76/76 | yes | yes |
| 5 mappedBy typo | 1/1 | no/no | 2322/2322 | 338/338 | yes | yes |
| 6 rules key typo | 7/7 | yes/yes | 2561/2561 | 140/140 | yes | yes |
| 7 wrong filter return | 1/1 | yes/yes | 2322/2322 | 73/73 | yes | yes |
| 8 query select typo | 1/1 | yes/yes | 2561/2561 | 138/138 | yes | yes |
| R1 second RoleSchema | 2/2 | no/no | 2322/2322 | 352/352 | yes | yes |
| R2 custom static/instance members | 1/1 | no/no | 2322/2322 | 634/634 | NO | yes |
| R3 unannotated options | 1/1 | no/no | 2322/2322 | 373/373 | yes | yes |
| R4 no RoleSchema registered | 1/1 | no/no | 2345/2345 | 486/486 | yes | yes |
| S1 hook reading isDeleted without softDelete | 3/3 | no/no | 2339/2339 | 51/51 | yes | yes |

### R2 custom static/instance members

TS6 (src/negative.ts:26):
```
Type 'typeof ActiveTodo' is not assignable to type 'typeof ActiveTodo & SchemaRegistrationError<"ActiveTodo: custom instance member 'save' is not allowed; models are immutable data without behaviour; ActiveTodo: custom static member 'archiveAll' is not allowed; a schema class declares fields and rules only">'.
  Property ''~error'' is missing in type 'typeof ActiveTodo' but required in type 'SchemaRegistrationError<"ActiveTodo: custom instance member 'save' is not allowed; models are immutable data without behaviour; ActiveTodo: custom static member 'archiveAll' is not allowed; a schema class declares fields and rules only">'.
```
TS7 (src/negative.ts:26):
```
Type 'typeof ActiveTodo' is not assignable to type 'typeof ActiveTodo & SchemaRegistrationError<"ActiveTodo: custom static member 'archiveAll' is not allowed; a schema class declares fields and rules only; ActiveTodo: custom instance member 'save' is not allowed; models are immutable data without behaviour">'.
  Property ''~error'' is missing in type 'typeof ActiveTodo' but required in type 'SchemaRegistrationError<"ActiveTodo: custom static member 'archiveAll' is not allowed; a schema class declares fields and rules only; ActiveTodo: custom instance member 'save' is not allowed; models are immutable data without behaviour">'.
```
