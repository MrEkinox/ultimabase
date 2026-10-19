# repro k-constants

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where | 252 | 252 | yes |
| cross builder | 130 | 255 | NO |
| hook item | 243 | 243 | yes |
| const Todo | 231 | 231 | yes |
| const todoRules | 36 | 36 | yes |

### cross builder

TS6:
```
(parameter) user: WhereBuilder<Defined<"User", {
    email: Scalar<string>;
    lastTodo: Pointer<() => Defined<"Todo", ...>>;
}>>
```
TS7:
```
(parameter) user: WhereBuilder<Defined<"User", {
    email: Scalar<string>;
    lastTodo: Pointer<() => Defined<"Todo", {
        title: Scalar<string>;
        archived: Scalar<boolean>;
        assignee: Pointer<() => Defined<"User", ...>>;
    }>>;
}>>
```

## Completions


## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| control: generic rules call | 0/0 | no/no | -/- | -/- | yes | yes |
| control: filter expressions typed by the schema type instead of its name | 0/0 | no/no | -/- | -/- | yes | yes |
| typo in cross filter detected | 1/1 | yes/yes | 2345/2345 | 76/76 | yes | yes |
