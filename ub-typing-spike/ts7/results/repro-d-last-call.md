# repro d-last-call

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where | 368 | 368 | yes |
| cross builder | 191 | 319 | NO |
| hook item | 359 | 359 | yes |
| const Todo | 350 | 350 | yes |

### cross builder

TS6:
```
(parameter) user: WhereBuilder<Configured<"User", {
    email: Scalar<string>;
    lastTodo: Pointer<() => Configured<"Todo", ... & {
        readonly isDeleted: Scalar<boolean>;
    }>>;
}>>
```
TS7:
```
(parameter) user: WhereBuilder<Configured<"User", {
    email: Scalar<string>;
    lastTodo: Pointer<() => Configured<"Todo", {
        title: Scalar<string>;
        archived: Scalar<boolean>;
        assignee: Pointer<() => Configured<"User", ...>>;
    } & {
        readonly isDeleted: Scalar<boolean>;
    }>>;
}>>
```

## Completions


## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| control: generic final call (reads its arguments) -> cycle | 11/11 | no/no | 7022/7022 | 140/140 | yes | yes |
| control: filter expressions typed by the schema type instead of its name | 0/0 | no/no | -/- | -/- | yes | yes |
| typo in cross filter detected | 1/1 | yes/yes | 2345/2345 | 76/76 | yes | yes |
