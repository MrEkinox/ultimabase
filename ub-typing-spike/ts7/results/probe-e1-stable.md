# e1 TS6-stableTypeOrdering vs TS7

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| class Todo extends | 10 | 10 | yes |
| where }) => where.eq('archived' | 44 | 44 | yes |
| (user) => user.eq('id' | 47 | 47 | yes |
| item }) => | 22 | 22 | yes |
| options: Options | 45 | 45 | yes |
| softDelete() { | 699 | 699 | yes |
| pending = await | 325 | 325 | yes |
| one: Todo | 22 | 22 | yes |
| value }) => value.trim() | 25 | 25 | yes |
| (user) => user.eq | 47 | 47 | yes |

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
| R2 custom static/instance members | 1/1 | no/no | 2322/2322 | 634/634 | yes | yes |
| R3 unannotated options | 1/1 | no/no | 2322/2322 | 373/373 | yes | yes |
| R4 no RoleSchema registered | 1/1 | no/no | 2345/2345 | 486/486 | yes | yes |
| S1 hook reading isDeleted without softDelete | 3/3 | no/no | 2339/2339 | 51/51 | yes | yes |
