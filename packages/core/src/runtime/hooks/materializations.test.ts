import {
	normalizeUpdateExpression,
	Query,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DeleteManyOperationAst,
	type DeleteOneOperationAst,
	type QueryFilterNode,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
} from '../../query/index.js'
import {
	definePluginField,
	intField,
	objectField,
	Schema,
	stringField,
	type InferObject,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import type { DatabaseOperationOutcome } from '../database/contracts.js'
import {
	collectMutationAfterFieldValues,
	collectMutationBeforeFieldValues,
	collectMutationFieldChanges,
} from './materializations.js'

const opaqueValues = new WeakMap<object, string>()

/** Models plugin values whose semantic state deliberately has no own properties. */
class OpaqueValue {
	constructor(value: string) {
		opaqueValues.set(this, value)
		Object.freeze(this)
	}

	toJSON(): Readonly<{ readonly value: string }> {
		const value = opaqueValues.get(this)

		if (value === undefined) {
			throw new TypeError('Opaque fixture has no value')
		}

		return { value }
	}
}

const snapshotOpaqueValue = (value: unknown): OpaqueValue => {
	if (!(value instanceof OpaqueValue)) {
		throw new TypeError('Opaque fixture field requires OpaqueValue')
	}

	return value
}

const opaqueStorageCodec = {
	decode: (value: unknown): OpaqueValue => {
		const decoded: unknown =
			typeof value === 'object' && value !== null
				? Reflect.get(value, 'value')
				: undefined

		if (typeof decoded !== 'string') {
			throw new TypeError('Opaque fixture storage requires a string value')
		}

		return new OpaqueValue(decoded)
	},
	encode: (value: OpaqueValue) => value.toJSON(),
	format: 'json' as const,
	version: 1,
}

const opaqueField = definePluginField(
	'fixture.opaque-materialization',
	{},
	{
		snapshotValue: snapshotOpaqueValue,
		storageCodec: opaqueStorageCodec,
	},
)
const opaqueListField = definePluginField(
	'fixture.opaque-list-materialization',
	{ list: true },
	{
		snapshotValue: snapshotOpaqueValue,
		storageCodec: opaqueStorageCodec,
	},
)
const opaqueSchema = Schema.define({
	className: 'OpaqueFieldMaterialization',
	fields: { opaque: opaqueField, opaqueList: opaqueListField },
})

const materializationSchema = Schema.define({
	className: 'FieldMaterialization',
	fields: {
		'literal.name': stringField(),
		profile: objectField({
			fields: {
				displayName: stringField(),
				details: objectField({ fields: { code: stringField() } }),
			},
		}),
		groups: objectField({
			list: [true, true],
			fields: { label: stringField() },
		}),
		count: intField(),
		removable: stringField(),
	},
})

const schemaNode = new Query(materializationSchema).ast.schema

const makeRecord = (
	suffix: string,
): InferObject<typeof materializationSchema> => ({
	'literal.name': `literal-${suffix}`,
	profile: {
		displayName: `name-${suffix}`,
		details: { code: `code-${suffix}` },
	},
	groups: [[{ label: `group-${suffix}` }]],
	count: 1,
	removable: `remove-${suffix}`,
	id: `00000000-0000-7000-8000-00000000000${String(suffix.length)}`,
	createdAt: '2026-08-02T10:00:00.000Z',
	updatedAt: '2026-08-02T10:00:00.000Z',
})

const createOperation = {
	input: {
		'literal.name': 'literal-create',
		profile: {
			displayName: 'name-create',
			details: { code: 'code-create' },
		},
	},
	kind: 'create-one',
	schema: schemaNode,
} satisfies CreateOneOperationAst<typeof materializationSchema>

const updateExpression = normalizeUpdateExpression(materializationSchema, {
	profile: {
		displayName: 'name-after',
		details: { code: 'code-before' },
	},
	removable: null,
})

const updateOperation: UpdateOneOperationAst<
	typeof materializationSchema,
	typeof updateExpression,
	QueryFilterNode<typeof materializationSchema>,
	'id'
> = {
	kind: 'update-one',
	query: new Query(materializationSchema).select({ id: true }).ast,
	update: updateExpression,
}

const deleteOperation: DeleteOneOperationAst<
	typeof materializationSchema,
	QueryFilterNode<typeof materializationSchema>,
	'id'
> = {
	kind: 'delete-one',
	query: new Query(materializationSchema).select({ id: true }).ast,
}

describe('runtime mutation materializations', () => {
	it('compares opaque plugin values through their portable storage codec', () => {
		const query = new Query(opaqueSchema).select({ id: true }).ast
		const update = normalizeUpdateExpression(opaqueSchema, {
			opaque: new OpaqueValue('after'),
		})
		const operation: UpdateOneOperationAst<
			typeof opaqueSchema,
			typeof update,
			QueryFilterNode<typeof opaqueSchema>,
			'id'
		> = { kind: 'update-one', query, update }
		const base = {
			createdAt: '2026-08-04T10:00:00.000Z',
			id: '00000000-0000-7000-8000-000000000099',
			updatedAt: '2026-08-04T10:00:00.000Z',
		}
		const previous = { ...base, opaque: new OpaqueValue('before') }
		const changed = { ...base, opaque: new OpaqueValue('after') }
		const unchanged = { ...base, opaque: new OpaqueValue('before') }

		expect(
			collectMutationFieldChanges(operation, {
				materializations: [{ current: changed, kind: 'update', previous }],
			}).map(({ fieldPath, itemId }) => ({ fieldPath, itemId })),
		).toStrictEqual([{ fieldPath: ['opaque'], itemId: base.id }])
		expect(
			collectMutationFieldChanges(operation, {
				materializations: [{ current: unchanged, kind: 'update', previous }],
			}),
		).toStrictEqual([])
	})

	it('compares listed opaque plugin values through the scalar codec', () => {
		const query = new Query(opaqueSchema).select({ id: true }).ast
		const update = normalizeUpdateExpression(opaqueSchema, {
			opaqueList: [new OpaqueValue('after')],
		})
		const operation: UpdateOneOperationAst<
			typeof opaqueSchema,
			typeof update,
			QueryFilterNode<typeof opaqueSchema>,
			'id'
		> = { kind: 'update-one', query, update }
		const base = {
			createdAt: '2026-08-04T10:00:00.000Z',
			id: '00000000-0000-7000-8000-000000000098',
			opaque: new OpaqueValue('stable'),
			updatedAt: '2026-08-04T10:00:00.000Z',
		}
		const previous = { ...base, opaqueList: [new OpaqueValue('before')] }
		const changed = { ...base, opaqueList: [new OpaqueValue('after')] }
		const unchanged = { ...base, opaqueList: [new OpaqueValue('before')] }

		expect(
			collectMutationFieldChanges(operation, {
				materializations: [{ current: changed, kind: 'update', previous }],
			}).map(({ fieldPath }) => fieldPath),
		).toStrictEqual([['opaqueList']])
		expect(
			collectMutationFieldChanges(operation, {
				materializations: [{ current: unchanged, kind: 'update', previous }],
			}),
		).toStrictEqual([])
	})

	it('builds parent-first before values from candidates and stabilized targets', () => {
		const target = makeRecord('before')

		expect(
			collectMutationBeforeFieldValues(createOperation, undefined).map(
				({ fieldPath, mode }) => ({ fieldPath, mode }),
			),
		).toStrictEqual([
			{ fieldPath: ['literal.name'], mode: 'create' },
			{ fieldPath: ['profile'], mode: 'create' },
			{ fieldPath: ['profile', 'displayName'], mode: 'create' },
			{ fieldPath: ['profile', 'details'], mode: 'create' },
			{ fieldPath: ['profile', 'details', 'code'], mode: 'create' },
		])
		expect(
			collectMutationBeforeFieldValues(updateOperation, target).map(
				({ fieldPath, mode }) => ({ fieldPath, mode }),
			),
		).toStrictEqual([
			{ fieldPath: ['profile'], mode: 'update' },
			{ fieldPath: ['profile', 'displayName'], mode: 'update' },
			{ fieldPath: ['profile', 'details'], mode: 'update' },
			{ fieldPath: ['profile', 'details', 'code'], mode: 'update' },
			{ fieldPath: ['removable'], mode: 'update' },
		])
		expect(
			collectMutationBeforeFieldValues(deleteOperation, target).map(
				({ fieldPath }) => fieldPath,
			),
		).toStrictEqual([
			['literal.name'],
			['profile'],
			['profile', 'displayName'],
			['profile', 'details'],
			['profile', 'details', 'code'],
			['groups'],
			['groups', 'label'],
			['count'],
			['removable'],
			['id'],
			['createdAt'],
			['updatedAt'],
		])
		expect(
			collectMutationBeforeFieldValues(updateOperation, null),
		).toStrictEqual([])
		expect(
			collectMutationBeforeFieldValues(deleteOperation, null),
		).toStrictEqual([])
		expect(() =>
			collectMutationBeforeFieldValues(updateOperation, undefined),
		).toThrow('require a prepared target')
		expect(() =>
			collectMutationBeforeFieldValues(deleteOperation, undefined),
		).toThrow('require a prepared target')
	})

	it('unwinds after values from complete snapshots rather than selected results', () => {
		const previous = makeRecord('before')
		const current: InferObject<typeof materializationSchema> = {
			...previous,
			profile: {
				displayName: 'name-after',
				details: { code: 'code-before' },
			},
			removable: null,
		}
		const outcome = {
			materializations: [{ current, kind: 'update', previous }],
			result: { id: current.id },
		} as const satisfies DatabaseOperationOutcome<typeof updateOperation>

		const values = collectMutationAfterFieldValues(updateOperation, outcome)

		expect(values.map(({ fieldPath }) => fieldPath)).toStrictEqual([
			['removable'],
			['profile', 'details', 'code'],
			['profile', 'details'],
			['profile', 'displayName'],
			['profile'],
		])
		expect(values.every(({ mode }) => mode === 'update')).toBe(true)
		expect(
			values.find(
				({ fieldPath }) => fieldPath.length === 1 && fieldPath[0] === 'profile',
			)?.value,
		).toEqual(current.profile)
		expect(Object.isFrozen(values)).toBe(true)
		expect(Object.isFrozen(values[0])).toBe(true)
	})

	it('emits only real child-first semantic changes including an explicit clear', () => {
		const previous = makeRecord('before')
		const current: InferObject<typeof materializationSchema> = {
			...previous,
			profile: {
				displayName: 'name-after',
				details: { code: 'code-before' },
			},
			removable: null,
		}
		const outcome = {
			materializations: [{ current, kind: 'update', previous }],
			result: { id: current.id },
		} as const satisfies DatabaseOperationOutcome<typeof updateOperation>

		const changes = collectMutationFieldChanges(updateOperation, outcome)

		expect(changes.map(({ fieldPath }) => fieldPath)).toStrictEqual([
			['removable'],
			['profile', 'displayName'],
			['profile'],
		])
		expect(changes[0]?.change).toStrictEqual({
			current: { present: true, value: null },
			previous: { present: true, value: 'remove-before' },
		})
		expect(changes[1]?.change).toStrictEqual({
			current: { present: true, value: 'name-after' },
			previous: { present: true, value: 'name-before' },
		})
		expect(changes[0]).toHaveProperty('timing', 'before-commit')
		expect(Object.isFrozen(changes)).toBe(true)
		expect(Object.isFrozen(changes[0]?.change)).toBe(true)
	})

	it('retains dotted names and list indexes as distinct path segments', () => {
		const current = makeRecord('create')
		const outcome = {
			materializations: [{ current, kind: 'create' }],
			result: current,
		} as const satisfies DatabaseOperationOutcome<typeof createOperation>

		const changes = collectMutationFieldChanges(createOperation, outcome)
		const dotted = changes.find(
			({ fieldPath }) => fieldPath[0] === 'literal.name',
		)
		const listed = changes.find(({ fieldPath }) => fieldPath.at(-1) === 'label')

		expect(dotted?.fieldPath).toStrictEqual(['literal.name'])
		expect(dotted?.valuePath).toStrictEqual(['literal.name'])
		expect(listed?.fieldPath).toStrictEqual(['groups', 'label'])
		expect(listed?.valuePath).toStrictEqual(['groups', 0, 0, 'label'])
		expect(dotted?.change.previous).toStrictEqual({ present: false })
	})

	it('preserves materialized bulk item order while unwinding each item', () => {
		const update = normalizeUpdateExpression(materializationSchema, {
			'literal.name': 'updated',
		})
		const query = new Query(materializationSchema).equalTo(
			'literal.name',
			'lookup',
		)
		const target = {
			fields: ['literal.name'],
			kind: 'unique-upsert-target',
		} as const
		const operation = {
			items: [
				{ create: {}, query: query.ast, target, update },
				{ create: {}, query: query.ast, target, update },
			],
			kind: 'upsert-many',
			options: { atomic: true },
			schema: schemaNode,
		} satisfies UpsertManyOperationAst<
			typeof materializationSchema,
			typeof update
		>
		const created = makeRecord('created')
		const previous = makeRecord('previous')
		const current = { ...previous, 'literal.name': 'updated' }
		const outcome = {
			materializations: [
				{ current: created, kind: 'create' },
				{ current, kind: 'update', previous },
			],
			result: [created, current],
		} as const satisfies DatabaseOperationOutcome<typeof operation>

		const values = collectMutationAfterFieldValues(operation, outcome)
		const changes = collectMutationFieldChanges(operation, outcome)

		expect(values[0]?.itemIndex).toBe(0)
		expect(values.at(-1)).toMatchObject({
			fieldPath: ['literal.name'],
			itemIndex: 1,
			mode: 'update',
		})
		expect(
			changes.find(({ itemIndex }) => itemIndex === 1)?.fieldPath,
		).toStrictEqual(['literal.name'])
		expect(changes.filter(({ itemIndex }) => itemIndex === 1)).toHaveLength(1)
	})

	it('uses delete preimages for child-first after and onChange values', () => {
		const previous = makeRecord('delete')
		const outcome = {
			materializations: [{ kind: 'delete', previous }],
			result: { id: previous.id },
		} as const satisfies DatabaseOperationOutcome<typeof deleteOperation>

		const values = collectMutationAfterFieldValues(deleteOperation, outcome)
		const changes = collectMutationFieldChanges(deleteOperation, outcome)

		expect(values[0]?.fieldPath).toStrictEqual(['updatedAt'])
		expect(values.at(-1)?.fieldPath).toStrictEqual(['literal.name'])
		expect(values.every(({ mode }) => mode === 'object')).toBe(true)
		expect(changes[0]?.change.current).toStrictEqual({ present: false })
		expect(changes.at(-1)?.fieldPath).toStrictEqual(['literal.name'])
	})

	it('never materializes set-based update-many or delete-many operations', () => {
		const updateMany = {
			kind: 'update-many',
			query: new Query(materializationSchema).ast,
			update: updateExpression,
		} satisfies UpdateManyOperationAst<
			typeof materializationSchema,
			typeof updateExpression
		>
		const deleteMany = {
			kind: 'delete-many',
			query: new Query(materializationSchema).ast,
		} satisfies DeleteManyOperationAst<typeof materializationSchema>
		const forgedOutcome = {
			materializations: [
				{ current: makeRecord('forged'), kind: 'create' as const },
			],
			result: 1,
		}

		expect(
			collectMutationBeforeFieldValues(updateMany, undefined),
		).toStrictEqual([])
		expect(
			collectMutationBeforeFieldValues(deleteMany, undefined),
		).toStrictEqual([])
		expect(
			collectMutationAfterFieldValues(
				updateMany,
				forgedOutcome as unknown as DatabaseOperationOutcome<typeof updateMany>,
			),
		).toStrictEqual([])
		expect(
			collectMutationFieldChanges(
				deleteMany,
				forgedOutcome as unknown as DatabaseOperationOutcome<typeof deleteMany>,
			),
		).toStrictEqual([])
	})

	it('keeps stable item indexes for create-many snapshots', () => {
		const operation = {
			inputs: [{}, {}],
			kind: 'create-many',
			options: { atomic: true },
			schema: schemaNode,
		} satisfies CreateManyOperationAst<typeof materializationSchema>
		const first = makeRecord('first')
		const second = makeRecord('second')
		const outcome = {
			materializations: [
				{ current: first, kind: 'create' },
				{ current: second, kind: 'create' },
			],
			result: [first, second],
		} as const satisfies DatabaseOperationOutcome<typeof operation>

		const values = collectMutationAfterFieldValues(operation, outcome)

		expect(values[0]?.itemIndex).toBe(0)
		expect(values.at(-1)?.itemIndex).toBe(1)
	})
})
