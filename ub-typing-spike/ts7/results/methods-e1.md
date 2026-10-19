# methods e1

Baseline diagnostics: TS6 4, TS7 4
- TS7 src/methods.ts:15 TS2339 Property 'isLate' does not exist on type '{ readonly id: string; readonly title: string; }'.
- TS7 src/methods.ts:16 TS2339 Property 'isLate' does not exist on type '{ readonly acl: ACL; readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null; readonly archived: boolean | null; readonly assignee: PointerRef | null; ... 8 more ...; readonly updatedAt: Date; }'.
- TS7 src/methods.ts:17 TS2322 Type '{ readonly acl: ACL; readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null; readonly archived: boolean | null; readonly assignee: PointerRef | null; ... 8 more ...; readonly updatedAt: Date; } | null' is not assignable to type 'Todo | null'.
- TS7 src/usage.ts:39 TS2322 Type '{ readonly acl: ACL; readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null; readonly archived: boolean | null; readonly assignee: PointerRef | null; ... 8 more ...; readonly updatedAt: Date; } | null' is not assignable to type 'Todo | null'.

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| static findOverdue (declaration) | 555 | 555 | NO |
| this.findMany in the helper | 728 | 846 | NO |
| isLate (declaration) | 31 | 31 | yes |
| hook item | 22 | 22 | yes |
| overdue | 532 | 532 | NO |
| titles (select title) | 72 | 72 | yes |
| OverdueHasMethod | 29 | 29 | yes |
| TitlesHaveMethod | 29 | 29 | yes |
| FullHasMethod | 26 | 26 | yes |
| OverdueIsFull | 25 | 25 | yes |

### static findOverdue (declaration)

TS6:
```
(method) Todo.findOverdue(): Promise<{
    readonly acl: ACL;
    readonly parent: PointerRef | null;
    readonly archived: boolean | null;
    readonly id: string;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    readonly status: "open" | "inProgress" | "done";
    readonly assignee: PointerRef | null;
    readonly dueAt: Date | null;
    readonly isDeleted: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}[]>
```
TS7:
```
(method) Todo.findOverdue(): Promise<{
    readonly acl: ACL;
    readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    readonly archived: boolean | null;
    readonly assignee: PointerRef | null;
    readonly createdAt: Date;
    readonly dueAt: Date | null;
    readonly id: string;
    readonly isDeleted: boolean;
    readonly parent: PointerRef | null;
    readonly priority: "high" | "low" | "normal" | null;
    readonly status: "done" | "inProgress" | "open";
    readonly title: string;
    readonly updatedAt: Date;
}[]>
```

### this.findMany in the helper

TS6:
```
(method) SchemaQueries.findMany<typeof Todo, {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
    };
}>(this: typeof Todo, args?: {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
    };
} | undefined, options?: QueryOptions): Promise<{
    readonly acl: ACL;
    readonly parent: PointerRef | null;
    readonly archived: boolean | null;
    readonly id: string;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    readonly status: "open" | "inProgress" | "done";
    ... 4 more ...;
    readonly updatedAt: Date;
}[]>
```
TS7:
```
(method) SchemaQueries.findMany<typeof Todo, {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
    };
}>(this: typeof Todo, args?: {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
    };
} | undefined, options?: QueryOptions): Promise<{
    readonly acl: ACL;
    readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    readonly archived: boolean | null;
    readonly assignee: PointerRef | null;
    readonly createdAt: Date;
    readonly dueAt: Date | null;
    readonly id: string;
    readonly isDeleted: boolean;
    readonly parent: PointerRef | null;
    readonly priority: "high" | ... 2 more ... | null;
    readonly status: "done" | ... 1 more ... | "open";
    readonly title: string;
    readonly updatedAt: Date;
}[]>
```

### overdue

TS6:
```
const overdue: {
    readonly acl: ACL;
    readonly parent: PointerRef | null;
    readonly archived: boolean | null;
    readonly id: string;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    readonly status: "open" | "inProgress" | "done";
    readonly assignee: PointerRef | null;
    readonly dueAt: Date | null;
    readonly isDeleted: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}[]
```
TS7:
```
const overdue: {
    readonly acl: ACL;
    readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    readonly archived: boolean | null;
    readonly assignee: PointerRef | null;
    readonly createdAt: Date;
    readonly dueAt: Date | null;
    readonly id: string;
    readonly isDeleted: boolean;
    readonly parent: PointerRef | null;
    readonly priority: "high" | "low" | "normal" | null;
    readonly status: "done" | "inProgress" | "open";
    readonly title: string;
    readonly updatedAt: Date;
}[]
```

## Completions

- Todo.: TS6 15, TS7 18, DIFF (only TS6: -; only TS7: Symbol, ~fields, ~statics)

## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| M1 registration check restored (current form rule) | 5/5 | no/no | 2339/2339 | 92/92 | yes | yes |
