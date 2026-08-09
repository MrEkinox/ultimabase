import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	type InferCreateInput,
	type InferObject,
	type Pointer,
	QueryBuilder,
} from '../../src/index.js'

const Member = Schema.define({
	className: 'TypedEdgeMember',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})

const Project = Schema.define({
	className: 'TypedEdgeProject',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
})

const Membership = Schema.define({
	className: 'TypedEdgeMembership',
	fields: (field) => ({
		member: field.pointer({
			onDelete: 'cascade',
			target: () => Member,
			validation: { required: true },
		}),
		position: field.int({ default: 0 }),
		project: field.pointer({
			onDelete: 'cascade',
			target: () => Project,
			validation: { required: true },
		}),
		role: field.enum({
			validation: { required: true },
			values: ['editor', 'viewer'] as const,
		}),
	}),
	indexes: [{ fields: ['project', 'member'], unique: true }],
})

test('infers exact explicit-edge pointers, inputs, models, and selections', () => {
	interface ExpectedCreateInput {
		member: Pointer<typeof Member>
		position?: number | null
		project: Pointer<typeof Project>
		role: 'editor' | 'viewer'
	}

	interface ExpectedObject {
		readonly createdAt: string
		readonly id: string
		readonly member: Pointer<typeof Member>
		readonly position: number | null
		readonly project: Pointer<typeof Project>
		readonly role: 'editor' | 'viewer'
		readonly updatedAt: string
	}

	expectTypeOf<
		InferCreateInput<typeof Membership>
	>().toEqualTypeOf<ExpectedCreateInput>()
	expectTypeOf<InferObject<typeof Membership>>().toEqualTypeOf<ExpectedObject>()

	const selected = new QueryBuilder(Membership).select({
		id: true,
		member: true,
		role: true,
	})
	const selectedRead = Membership.findMany(selected.build())
	type SelectedMembership = NonNullable<Awaited<typeof selectedRead>[number]>
	type SelectedRecord = ReturnType<SelectedMembership['toJSON']>
	void selectedRead

	expectTypeOf(selected).toEqualTypeOf<
		QueryBuilder<typeof Membership, 'id' | 'member' | 'role'>
	>()
	expectTypeOf<SelectedRecord>().toEqualTypeOf<
		Readonly<{
			id: string
			member: Pointer<typeof Member>
			role: 'editor' | 'viewer'
		}>
	>()

	new QueryBuilder(Membership).where((where) => where.eq('member', 'member-id'))
	new QueryBuilder(Membership).where((where) =>
		// @ts-expect-error -- Pointer identity filters accept target IDs directly.
		where.eq('member', Project.pointer('project-id')),
	)
})
