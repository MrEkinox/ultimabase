# repro e2-this-with

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where | 44 | 44 | yes |
| cross builder | 43 | 43 | yes |
| hook item | 35 | 35 | yes |
| static options | 49 | 49 | yes |
| class Todo | 10 | 10 | yes |

## Hovers — control: non-generic polymorphic this (diag TS6 0, TS7 0)

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where | 157 | 157 | yes |
| cross builder | 43 | 43 | yes |
| hook item | 148 | 148 | yes |
| static options | 162 | 162 | yes |
| class Todo | 10 | 10 | yes |

## Completions


## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| control: non-generic polymorphic this (compiles, see hoverSets) | 0/0 | no/no | -/- | -/- | yes | yes |
| control: filter expressions typed by the schema type instead of its name | 4/4 | no/no | 7022/7022 | 143/143 | yes | yes |
| typo in cross filter detected | 1/1 | yes/yes | 2345/2345 | 76/76 | yes | yes |
