import {
	increment,
	normalizeUpdateExpression,
	QueryBuilder,
	type CountOperationAst,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DeleteManyOperationAst,
	type FindManyOperationAst,
	type QueryFilterNode,
	type UpdateExpression,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
} from '../../query/index.js'
import { SchemaRegistry } from '../../schema/index.js'
import { FrameworkError } from '../../foundation.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseOperationOutcome } from '../database/contracts.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import {
	readRuntimeSchemaModelMetadata,
	retainRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import { createRuntimeValidationStage } from '../validation/runtime-validation.js'
import { createRuntimeBehaviorBoundaries } from './validation-boundaries.js'
import { UltimaBase } from '../application/ultima-base.js'

const fixedInstant = new Date('2026-08-02T12:34:56.000Z')
const generatedId = '00000000-0000-7000-8000-000000000001'
const requestContext = RequestContext.anonymous({
	requestId: 'runtime-behavior-boundaries',
	source: requestSources.internal,
})

const createFixtureSchema = (defaultTitle: () => string) =>
	UltimaBase.Schema.define({
		className: 'BoundaryArticle',
		fields: (field) => ({
			metadata: field.json(),
			published: field.boolean({ default: false }),
			title: field.string({ default: defaultTitle }),
		}),
	})

const completeRecord = immutableRecord({
	createdAt: fixedInstant.toISOString(),
	id: generatedId,
	metadata: immutableRecord({ nested: immutableRecord({ enabled: true }) }),
	published: false,
	title: 'Generated title',
	updatedAt: fixedInstant.toISOString(),
})

const readRawIssues = (error: unknown): readonly unknown[] => {
	if (!(error instanceof FrameworkError)) {
		throw error
	}

	const details: unknown = error.publicDetails

	if (!isPlainRecord(details) || !isUnknownArray(details.issues)) {
		throw new TypeError('Expected validation issues')
	}

	return details.issues
}

const readIssues = (
	error: unknown,
): readonly Readonly<Record<string, unknown>>[] =>
	readRawIssues(error).filter(
		(issue): issue is Readonly<Record<string, unknown>> => isPlainRecord(issue),
	)

describe('runtime behavior boundaries', () => {
	it('revalidates mutation replacements without replaying generated values', async () => {
		const defaultTitle = vi.fn(() => 'Generated title')
		const uuidV7Generator = vi.fn(() => generatedId)
		const schema = createFixtureSchema(defaultTitle)
		const initialOperation = immutableRecord({
			input: { metadata: { nested: { enabled: true } } },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const validate = createRuntimeValidationStage({
			clock: () => fixedInstant,
			uuidV7Generator,
		})
		const normalized = await validate({
			context: requestContext,
			operation: initialOperation,
		})
		const boundaries = createRuntimeBehaviorBoundaries()

		const replacement = boundaries.snapshotOperationReplacement(
			normalized,
			immutableRecord({ ...normalized, input: { ...normalized.input } }),
		)

		expect(replacement).toStrictEqual(normalized)
		expect(replacement).not.toBe(normalized)
		expect(Object.isFrozen(replacement)).toBe(true)
		expect(Object.isFrozen(replacement.input)).toBe(true)
		expect(defaultTitle).toHaveBeenCalledOnce()
		expect(uuidV7Generator).toHaveBeenCalledOnce()
	})

	it('reports precise paths for incompatible mutation replacements', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const operation = immutableRecord({
			input: completeRecord,
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const boundaries = createRuntimeBehaviorBoundaries()

		try {
			boundaries.snapshotOperationReplacement(operation, {
				...operation,
				input: { ...completeRecord, published: 'yes' },
			})
			expect.unreachable('Expected replacement validation to fail')
		} catch (error: unknown) {
			expect(error).toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(readIssues(error)).toContainEqual(
				expect.objectContaining({ path: ['input', 'published'] }),
			)
		}
	})

	it('accepts collection operation shapes without legacy atomic options', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const schemaNode = new QueryBuilder(schema).ast.schema
		const selection = { fields: [], kind: 'selection' as const }
		const create = immutableRecord({
			inputs: [completeRecord],
			kind: 'create-many',
			selection,
			schema: schemaNode,
		}) satisfies CreateManyOperationAst<typeof schema>
		const upsert = immutableRecord({
			items: [
				immutableRecord({
					create: completeRecord,
					query: new QueryBuilder(schema).where((where) =>
						where.eq('id', generatedId),
					).ast,
					target: immutableRecord({
						fields: ['id'],
						kind: 'unique-upsert-target' as const,
					}),
					update: normalizeUpdateExpression(schema, { published: true }),
				}),
			],
			kind: 'upsert-many',
			selection,
			schema: schemaNode,
		}) satisfies UpsertManyOperationAst<typeof schema>
		const boundaries = createRuntimeBehaviorBoundaries()

		expect(
			boundaries.snapshotOperationReplacement(create, create),
		).toStrictEqual(create)
		expect(
			boundaries.snapshotOperationReplacement(upsert, upsert),
		).toStrictEqual(upsert)
	})

	it('rejects cross-terminal and cross-schema operation replacements', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const siblingSchema = createFixtureSchema(() => 'Generated title')
		const operation = immutableRecord({
			input: completeRecord,
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const boundaries = createRuntimeBehaviorBoundaries()

		expect(() =>
			boundaries.snapshotOperationReplacement(operation, {
				...operation,
				kind: 'delete-one',
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(() =>
			boundaries.snapshotOperationReplacement(operation, {
				...operation,
				schema: new QueryBuilder(siblingSchema).ast.schema,
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(() =>
			boundaries.snapshotOperationReplacement(operation, {
				...operation,
				unexpected: true,
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
	})

	it('does not append a second generated timestamp during update revalidation', async () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const query = new QueryBuilder(schema).select({ id: true }).ast
		const initialOperation = immutableRecord({
			kind: 'update-one',
			query,
			update: normalizeUpdateExpression(schema, {
				published: true,
			}),
		}) satisfies UpdateOneOperationAst<typeof schema>
		const validate = createRuntimeValidationStage({ clock: () => fixedInstant })
		const normalized = await validate({
			context: requestContext,
			operation: initialOperation,
		})
		const boundaries = createRuntimeBehaviorBoundaries()

		const replacement = boundaries.snapshotOperationReplacement(
			normalized,
			normalized,
		)

		expect(replacement.update.operations).toHaveLength(2)
		expect(replacement.update.operations.at(-1)).toMatchObject({
			field: 'updatedAt',
			kind: 'set',
			value: fixedInstant.toISOString(),
		})
		expect(() =>
			boundaries.snapshotOperationReplacement(normalized, {
				...normalized,
				update: {
					...normalized.update,
					operations: normalized.update.operations.slice(0, -1),
				},
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
	})

	it('validates selected results and complete adapter materializations separately', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const operation: UpdateOneOperationAst<
			typeof schema,
			UpdateExpression<typeof schema>,
			QueryFilterNode<typeof schema>,
			'id'
		> = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).select({ id: true }).ast,
			update: normalizeUpdateExpression(schema, {
				published: true,
			}),
		})
		const boundaries = createRuntimeBehaviorBoundaries()
		const current = immutableRecord({ ...completeRecord, published: true })
		const sourceOutcome = {
			materializations: [{ current, kind: 'update', previous: completeRecord }],
			result: { id: generatedId },
		} satisfies DatabaseOperationOutcome<typeof operation>

		const outcome = boundaries.snapshotMutationOutcome(operation, sourceOutcome)

		expect(outcome).toStrictEqual(sourceOutcome)
		expect(outcome).not.toBe(sourceOutcome)
		expect(Object.isFrozen(outcome)).toBe(true)
		expect(Object.isFrozen(outcome.materializations)).toBe(true)
		expect(Object.isFrozen(outcome.materializations[0]?.current)).toBe(true)
		expect(Object.isFrozen(outcome.materializations[0]?.current.metadata)).toBe(
			true,
		)
	})

	it('validates mutation results against a private adapter projection override', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const operation: UpdateOneOperationAst<
			typeof schema,
			UpdateExpression<typeof schema>,
			QueryFilterNode<typeof schema>,
			'id'
		> = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).select({ id: true }).ast,
			update: normalizeUpdateExpression(schema, { published: true }),
		})
		const current = immutableRecord({ ...completeRecord, published: true })
		const sourceOutcome = {
			materializations: [{ current, kind: 'update', previous: completeRecord }],
			// @ts-expect-error -- Runtime must reject adapter fields outside the selected result.
			result: { id: generatedId, title: 'Private dependency' },
		} satisfies DatabaseOperationOutcome<typeof operation>
		const boundaries = createRuntimeBehaviorBoundaries()

		expect(() =>
			boundaries.snapshotMutationOutcome(operation, sourceOutcome),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(
			boundaries.snapshotMutationOutcome(operation, sourceOutcome, [
				'id',
				'title',
			]),
		).toStrictEqual(sourceOutcome)
	})

	it('keeps arithmetic outcome snapshots structural-only', () => {
		const schema = UltimaBase.Schema.define({
			className: 'ArithmeticOutcome',
			fields: (field) => ({
				score: field.int({ required: true }),
			}),
		})
		const operation = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).select({ id: true }).ast,
			update: normalizeUpdateExpression(schema, { score: increment(2) }),
		}) satisfies UpdateOneOperationAst<typeof schema>
		const previous = immutableRecord({
			createdAt: fixedInstant.toISOString(),
			id: generatedId,
			score: 10,
			updatedAt: fixedInstant.toISOString(),
		})

		const outcome = createRuntimeBehaviorBoundaries().snapshotMutationOutcome(
			operation,
			{
				materializations: [
					{ current: { ...previous, score: 12 }, kind: 'update', previous },
				],
				result: { id: generatedId },
			},
		)

		expect(outcome.materializations[0]).toMatchObject({
			current: { score: 12 },
		})
	})

	it('rejects fields omitted by selection and invalid materialization cardinality', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const operation: UpdateOneOperationAst<
			typeof schema,
			UpdateExpression<typeof schema>,
			QueryFilterNode<typeof schema>,
			'id'
		> = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).select({ id: true }).ast,
			update: normalizeUpdateExpression(schema, {
				published: true,
			}),
		})
		const boundaries = createRuntimeBehaviorBoundaries()

		try {
			boundaries.snapshotResultReplacement(operation, {
				id: generatedId,
				title: 'Not selected',
			})
			expect.unreachable('Expected selected result validation to fail')
		} catch (error: unknown) {
			expect(readIssues(error)).toContainEqual(
				expect.objectContaining({ path: ['result', 'title'] }),
			)
		}

		expect(() =>
			boundaries.snapshotMutationOutcome(operation, {
				materializations: [],
				result: { id: generatedId },
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
	})

	it('accepts optional complete materializations for set-based item hooks', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const query = new QueryBuilder(schema).select({ id: true }).ast
		const update = immutableRecord({
			kind: 'update-many',
			query,
			update: normalizeUpdateExpression(schema, { published: true }),
		}) satisfies UpdateManyOperationAst<typeof schema>
		const deletion = immutableRecord({
			kind: 'delete-many',
			query,
		}) satisfies DeleteManyOperationAst<typeof schema>
		const current = immutableRecord({ ...completeRecord, published: true })
		const boundaries = createRuntimeBehaviorBoundaries()

		expect(
			boundaries.snapshotMutationOutcome(update, {
				materializations: [
					{ current, kind: 'update', previous: completeRecord },
				],
				result: [{ id: generatedId }],
			}),
		).toMatchObject({ result: [{ id: generatedId }] })
		expect(
			boundaries.snapshotMutationOutcome(deletion, {
				materializations: [{ kind: 'delete', previous: current }],
				result: [{ id: generatedId }],
			}),
		).toMatchObject({ result: [{ id: generatedId }] })
		expect(
			boundaries.snapshotMutationOutcome(update, {
				materializations: [],
				result: [{ id: generatedId }],
			}),
		).toMatchObject({ materializations: [] })
	})

	it('preserves each scalar, collection, and nullable terminal result contract', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const selectedQuery = new QueryBuilder(schema).select({ id: true }).ast
		const findOperation: FindManyOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'id'
		> = immutableRecord({ kind: 'find-many', query: selectedQuery })
		const countOperation = immutableRecord({
			kind: 'count',
			query: new QueryBuilder(schema).ast,
		}) satisfies CountOperationAst<typeof schema>
		const updateOperation: UpdateOneOperationAst<
			typeof schema,
			UpdateExpression<typeof schema>,
			QueryFilterNode<typeof schema>,
			'id'
		> = immutableRecord({
			kind: 'update-one',
			query: selectedQuery,
			update: normalizeUpdateExpression(schema, {
				published: true,
			}),
		})
		const createOperation = immutableRecord({
			input: completeRecord,
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const boundaries = createRuntimeBehaviorBoundaries()
		const found: unknown = boundaries.snapshotResultReplacement(findOperation, [
			{ id: generatedId },
		])

		expect(found).toStrictEqual([{ id: generatedId }])
		if (!isUnknownArray(found)) {
			throw new TypeError('Expected an immutable collection result')
		}
		const first: unknown = found[0]
		if (!isPlainRecord(first)) {
			throw new TypeError('Expected an immutable record result')
		}
		expect(Object.isFrozen(found)).toBe(true)
		expect(Object.isFrozen(first)).toBe(true)
		const countResult: unknown = boundaries.snapshotResultReplacement(
			countOperation,
			2,
		)
		expect(countResult).toBe(2)
		const updateResult: unknown = boundaries.snapshotResultReplacement(
			updateOperation,
			null,
		)
		expect(updateResult).toBeNull()
		expect(() =>
			boundaries.snapshotResultReplacement(countOperation, -1),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(() =>
			boundaries.snapshotResultReplacement(createOperation, null),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
	})

	it('preserves the effective protected target projection across included-result snapshots', () => {
		const targetId = '00000000-0000-7000-8000-000000000002'
		const target = UltimaBase.Schema.define({
			className: 'BoundaryIncludedTarget',
			fields: (field) => ({
				name: field.string(),
				secret: field.string({ required: true }),
			}),
		})
		const source = UltimaBase.Schema.define({
			className: 'BoundaryIncludedSource',
			fields: (field) => ({
				target: field.pointer({ target: 'BoundaryIncludedTarget' }),
			}),
		})
		new SchemaRegistry([target, source]).resolveSchemaTargets()
		const targetQuery = new QueryBuilder(target)
		const operation = immutableRecord({
			kind: 'find-many',
			query: new QueryBuilder(source)
				.select({ target: true })
				.include('target', (query) => query).ast,
		}) satisfies FindManyOperationAst<typeof source>
		const targetOperation = immutableRecord({
			kind: 'find-one',
			query: targetQuery.ast,
		})
		const includedTarget = immutableRecord({ id: targetId, name: 'Ada' })

		retainRuntimeSchemaModelMetadata(
			targetOperation,
			immutableArray([targetId]),
			includedTarget,
			immutableArray(['name', 'id']),
		)

		const snapshot =
			createRuntimeBehaviorBoundaries().snapshotResultReplacement(
				operation,
				immutableArray([
					immutableRecord({
						id: '00000000-0000-7000-8000-000000000003',
						target: includedTarget,
					}),
				]),
			)
		const snapshotTarget: unknown = snapshot[0]?.target

		expect(isPlainRecord(snapshotTarget)).toBe(true)

		if (!isPlainRecord(snapshotTarget)) {
			throw new TypeError('Expected an included target snapshot')
		}

		expect(readRuntimeSchemaModelMetadata(snapshotTarget)).toStrictEqual({
			objectId: targetId,
			selectedFields: ['name', 'id'],
		})
	})
})
