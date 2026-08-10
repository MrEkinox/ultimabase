import { expectTypeOf, test } from 'vitest'

import { Schema } from './schema/definition.js'
import type { SchemaItem } from './schema/values.js'
import type {
	BaseItem,
	BaseSchemaTypeInfo,
	SchemaTypeInfoFor,
} from './type-info.js'

const BootstrapTodo = Schema.define({
	className: 'BootstrapTodo',
	fields: (field) => ({
		completed: field.boolean({ default: false }),
		title: field.string({ validation: { required: true } }),
	}),
})
void BootstrapTodo

test('uses only the safe BaseItem contract before code generation', () => {
	expectTypeOf<SchemaTypeInfoFor<typeof BootstrapTodo>>().toEqualTypeOf<
		BaseSchemaTypeInfo<'BootstrapTodo'>
	>()
	expectTypeOf<SchemaItem<typeof BootstrapTodo>>().toEqualTypeOf<BaseItem>()

	const item = null as unknown as SchemaItem<typeof BootstrapTodo>
	expectTypeOf(item.id).toBeString()
	expectTypeOf(item.title).toBeUnknown()
	expectTypeOf(item.completed).toBeUnknown()
})
