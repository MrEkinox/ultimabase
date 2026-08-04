import {
	Query,
	Schema,
	intField,
	stringField,
	type InferCreateInput,
	type SchemaRelationTarget,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import { RoleSchema } from './index.js'

const User = Schema.define({
	className: 'TypedRoleUser',
	fields: { email: stringField({ validation: { required: true } }) },
})
const AppRole = RoleSchema.define({
	className: 'TypedAppRole',
	members: { schema: User },
	fields: { description: stringField(), priority: intField({ default: 0 }) },
})

test('preserves exact role schema, member, draft, Query, and reference types', () => {
	type CreateInput = InferCreateInput<typeof AppRole>
	type MemberTarget = SchemaRelationTarget<typeof AppRole, 'members'>
	type NestedRoleTarget = SchemaRelationTarget<typeof AppRole, 'roles'>

	expectTypeOf<CreateInput>().toEqualTypeOf<{
		name: string
		description?: string
		priority?: number
	}>()
	expectTypeOf<MemberTarget>().toEqualTypeOf<typeof User>()
	expectTypeOf<NestedRoleTarget['className']>().toEqualTypeOf<'TypedAppRole'>()
	expectTypeOf(new Query(AppRole).ast.schema.definition).toEqualTypeOf(AppRole)
	expectTypeOf(AppRole.query().ast.schema.definition.className).toEqualTypeOf<
		'TypedAppRole'
	>()
	expectTypeOf(new AppRole({ name: 'editor' }).create).toBeFunction()
	expectTypeOf(AppRole.role('editor').kind).toEqualTypeOf<'role'>()
	expectTypeOf(
		AppRole.role({ id: '123e4567-e89b-42d3-a456-426614174000' }).kind,
	).toEqualTypeOf<'role'>()
})

test('rejects reserved role fields and unrelated member values', () => {
	// @ts-expect-error -- RoleSchema owns its canonical name field.
	RoleSchema.define({
		className: 'InvalidRoleName',
		members: { schema: User },
		fields: { name: stringField() },
	})

	// @ts-expect-error -- RoleSchema owns its direct member relation.
	RoleSchema.define({
		className: 'InvalidRoleMembers',
		members: { schema: User },
		fields: { members: stringField() },
	})
})
