# d-class-body/js-check

Baseline diagnostics: 0

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (JS) | 38 | `(parameter) where: WhereBuilder<"Tag">` |
| cross builder (JS) | 42 | `(parameter) user: WhereBuilder<"TodoUser">` |
| class (JS) | 9 | `class Tag` |
| rules (JS) | 45 | `(property) Tag.rules: SchemaRules<typeof Tag>` |
| helper (JS) | 49 | `(method) Tag.findNamed(): Promise<Model<"Tag">[]>` |

### where (JS) — tag.js `where, userId }) => where.some` (38 chars)

```
(parameter) where: WhereBuilder<"Tag">
```

### cross builder (JS) — tag.js `(user) => user.eq` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### class (JS) — tag.js `class Tag extends` (9 chars)

```
class Tag
```

### rules (JS) — tag.js `static rules` (45 chars)

```
(property) Tag.rules: SchemaRules<typeof Tag>
```

### helper (JS) — tag.js `static findNamed` (49 chars)

```
(method) Tag.findNamed(): Promise<Model<"Tag">[]>
```

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |
| 1 | JS cross-schema builder typo | yes | yes | 1 | TS2345 (91) |
| 2 | JS wrong filter return | yes | yes | 1 | TS2322 (68) |
| 3 | JS rules key typo | yes | yes | 5 | TS2561 (258) |
| 4 | JS instance method | NO | — | 0 | — |

### 1. JS cross-schema builder typo (tag.js:14: `user.eq('id', userId)` -> `user.eq('emial', userId)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

- tag.js:14:110 TS2345: Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

### 2. JS wrong filter return (tag.js:14: `({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `() => 42`): 1 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

- tag.js:14:25 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

### 3. JS rules key typo (tag.js:12: `access: {` -> `acess: {`): 5 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Tag"> & AccessSchemaOption<"Tag"> & HooksSchemaOption<"Tag"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?

- tag.js:12:3 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Tag"> & AccessSchemaOption<"Tag"> & HooksSchemaOption<"Tag"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?
- tag.js:14:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- tag.js:14:29 TS7031: Binding element 'userId' implicitly has an 'any' type.
- tag.js:14:63 TS7006: Parameter 'todo' implicitly has an 'any' type.
- tag.js:14:93 TS7006: Parameter 'user' implicitly has an 'any' type.

### 4. JS instance method (tag.js:18: `
	static findNamed` -> `
	isNew() {
		return true
	}
	static findNamed`): 0 diagnostic(s)

Primary: (none)


