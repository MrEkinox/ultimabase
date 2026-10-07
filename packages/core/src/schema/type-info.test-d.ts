import { expectTypeOf, test } from 'vitest'

import type { SchemaItem } from './schema/values.js'
import type { BaseItem, SchemaTypeInfoFor } from './type-info.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

const BootstrapTodo = UltimaBase.Schema.define({
	className: 'BootstrapTodo',
	fields: (field) => ({
		completed: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
})
void BootstrapTodo

test('infers local Core item fields before code generation', () => {
	expectTypeOf<
		SchemaTypeInfoFor<typeof BootstrapTodo>['key']
	>().toEqualTypeOf<'BootstrapTodo'>()
	expectTypeOf<SchemaItem<typeof BootstrapTodo>>().toExtend<BaseItem>()

	const item = null as unknown as SchemaItem<typeof BootstrapTodo>
	expectTypeOf(item.id).toBeString()
	expectTypeOf(item.title).toBeString()
	expectTypeOf(item.completed).toEqualTypeOf<boolean | null>()
})
