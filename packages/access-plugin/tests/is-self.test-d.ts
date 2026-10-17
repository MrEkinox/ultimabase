import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	accessPlugin,
	isSelf,
	type AccessRuleResult,
	type SchemaWhereAccessInput,
} from '../src/index.js'

// ADR-0341 decision 4: `isSelf` is a row rule for every schema.
const App = UltimaBase.use(accessPlugin())

test('is a generic row rule', () => {
	expectTypeOf(isSelf).toEqualTypeOf<
		<TSchema extends SchemaDefinition>(
			input: SchemaWhereAccessInput<TSchema>,
		) => AccessRuleResult<TSchema>
	>()
})

test('fits every row rule position, not a decision', () => {
	App.Schema.define({
		className: 'IsSelfTyped',
		fields: (field) => ({ name: field.string() }),
	}).with({
		access: {
			read: isSelf,
			update: { where: isSelf, item: ({ item }) => item.name !== 'root' },
			delete: isSelf,
		},
	})
	App.Schema.define({
		className: 'IsSelfReadForms',
		fields: (field) => ({ name: field.string() }),
	}).with({ access: { read: { one: isSelf, many: isSelf, count: false } } })
	App.Schema.define({
		className: 'IsSelfCreate',
		fields: (field) => ({ name: field.string() }),
	}).with({
		access: {
			// @ts-expect-error -- create decides before any row exists: no filter.
			create: isSelf,
		},
	})
})
