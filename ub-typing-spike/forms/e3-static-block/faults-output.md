baseline diagnostics: 0

| Cas | Détecté | Sur la ligne | Diagnostics | Premier message (longueur) |
| --- | --- | --- | --- | --- |
| 1 relation target typo | oui | oui | 3 | `TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (59) |
| 2 local where field typo | oui | oui | 1 | `TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<typeof Todo>'.` (101) |
| 3 cross-schema field typo | oui | oui | 1 | `TS2345 Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<typeof TodoUser>'.` (103) |
| 4 plugin field typo in hook | oui | oui | 1 | `TS2551 Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?` (83) |
| 5 mappedBy typo | oui | non (src/ultimabase.ts:7) | 1 | `TS2322 Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.` (169) |
| 6 rules key typo | oui | oui | 7 | `TS2551 Property 'acess' does not exist on type 'typeof Todo'. Did you mean 'access'?` (84) |
| 7 wrong filter return | oui | oui | 1 | `TS2322 Type 'number' is not assignable to type 'AccessFilterResult<typeof Tag>'.` (80) |
| 8 query select typo | oui | oui | 1 | `TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?` (145) |
| R1 second RoleSchema | oui | non (src/negative.ts:26) | 2 | `TS2322 Type 'typeof TodoRole' is not assignable to type 'typeof TodoRole & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.` (176) |
| R2 custom static/instance members | oui | non (src/negative.ts:28) | 1 | `TS2322 Type 'typeof ActiveTodo' is not assignable to type 'typeof ActiveTodo & SchemaRegistrationError<"ActiveTodo: custom instance member 'save' is not allowed; models are immutable data without behaviour; ActiveTodo: custom static member 'archiveAll' is not allowed; a schema class declares fields and rules only">'.` (318) |
| R3 static options property | oui | non (src/negative.ts:30) | 1 | `TS2322 Type 'typeof StaticOptions' is not assignable to type 'typeof StaticOptions & SchemaRegistrationError<"StaticOptions: custom static member 'options' is not allowed; a schema class declares fields and rules only">'.` (221) |
| R4 no RoleSchema registered | oui | non (src/negative.ts:32) | 1 | `TS2345 Argument of type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [typeof TodoUser, typeof Todo, typeof Tag]> & { readonly '~missingSchemas': "register one schema created by App.RoleSchema"; }'.` (279) |
| S1 hook reading isDeleted without softDelete | oui | non (src/todo.ts:31) | 3 | `TS2339 Property 'isDeleted' does not exist on type 'Todo'.` (58) |
| E3b rules key typo inside access | oui | oui | 1 | `TS2561 Object literal may only specify known properties, but 'delet' does not exist in type 'AccessOptions<typeof Tag>'. Did you mean to write 'delete'?` (152) |
| E3c rule method of a plugin that is not installed | oui | non (src/negative.ts:14) | 22 | `TS2339 Property 'access' does not exist on type 'typeof ActiveTodo'.` (68) |
