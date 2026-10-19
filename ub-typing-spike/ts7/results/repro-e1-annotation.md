# repro e1-annotation

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where | 44 | 44 | yes |
| cross builder | 43 | 43 | yes |
| hook item | 35 | 35 | yes |
| static options | 43 | 43 | yes |
| class Todo | 10 | 10 | yes |

## Completions


## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| control: annotation removed (contextual typing lost) | 3/3 | no/no | 7006/7006 | 47/47 | yes | yes |
| control: filter expressions typed by the schema type instead of its name | 0/0 | no/no | -/- | -/- | yes | yes |
| typo in cross filter detected | 1/1 | yes/yes | 2345/2345 | 76/76 | yes | yes |
