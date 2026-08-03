import {
	normalizeUpdateExpression,
	Query,
	type CountOperationAst,
	type CreateOneOperationAst,
	type FindOperationAst,
	type QueryFilterNode,
	type UpdateExpression,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import {
	booleanField,
	jsonField,
	Schema,
	stringField,
	type HookValidationIssue,
} from '../../schema/index.js'
import { FrameworkError } from '../../foundation.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseOperationOutcome } from '../database/contracts.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { createRuntimeValidationStage } from '../validation/runtime-validation.js'
import { createRuntimeHookBoundaries } from './boundaries.js'

const fixedInstant = new Date('2026-08-02T12:34:56.000Z')
const generatedId = '00000000-0000-7000-8000-000000000001'
const requestContext = RequestContext.anonymous({
	requestId: 'runtime-hook-boundaries',
	source: requestSources.internal,
})

const createFixtureSchema = (defaultTitle: () => string) =>
	Schema.define({
		className: 'BoundaryArticle',
		fields: {
			metadata: jsonField(),
			published: booleanField({ default: false }),
			title: stringField({ default: defaultTitle }),
		},
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

describe('runtime hook boundaries', () => {
	it('revalidates mutation replacements without replaying generated values', async () => {
		const defaultTitle = vi.fn(() => 'Generated title')
		const uuidV7Generator = vi.fn(() => generatedId)
		const schema = createFixtureSchema(defaultTitle)
		const initialOperation = immutableRecord({
			input: { metadata: { nested: { enabled: true } } },
			kind: 'create-one',
			schema: new Query(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const validate = createRuntimeValidationStage({
			clock: () => fixedInstant,
			uuidV7Generator,
		})
		const normalized = await validate({
			context: requestContext,
			operation: initialOperation,
		})
		const boundaries = createRuntimeHookBoundaries()

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
			schema: new Query(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const boundaries = createRuntimeHookBoundaries()

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

	it('rejects cross-terminal and cross-schema operation replacements', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const siblingSchema = createFixtureSchema(() => 'Generated title')
		const operation = immutableRecord({
			input: completeRecord,
			kind: 'create-one',
			schema: new Query(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const boundaries = createRuntimeHookBoundaries()

		expect(() =>
			boundaries.snapshotOperationReplacement(operation, {
				...operation,
				kind: 'delete-one',
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(() =>
			boundaries.snapshotOperationReplacement(operation, {
				...operation,
				schema: new Query(siblingSchema).ast.schema,
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
		const query = new Query(schema).select('id').ast
		const initialOperation = immutableRecord({
			kind: 'update-one',
			query,
			update: normalizeUpdateExpression(schema, {
				set: { published: true },
			}),
		}) satisfies UpdateOneOperationAst<typeof schema>
		const validate = createRuntimeValidationStage({ clock: () => fixedInstant })
		const normalized = await validate({
			context: requestContext,
			operation: initialOperation,
		})
		const boundaries = createRuntimeHookBoundaries()

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
			query: new Query(schema).select('id').ast,
			update: normalizeUpdateExpression(schema, {
				set: { published: true },
			}),
		})
		const boundaries = createRuntimeHookBoundaries()
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

	it('rejects fields omitted by selection and invalid materialization cardinality', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const operation: UpdateOneOperationAst<
			typeof schema,
			UpdateExpression<typeof schema>,
			QueryFilterNode<typeof schema>,
			'id'
		> = immutableRecord({
			kind: 'update-one',
			query: new Query(schema).select('id').ast,
			update: normalizeUpdateExpression(schema, {
				set: { published: true },
			}),
		})
		const boundaries = createRuntimeHookBoundaries()

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

	it('preserves each scalar, collection, and nullable terminal result contract', () => {
		const schema = createFixtureSchema(() => 'Generated title')
		const selectedQuery = new Query(schema).select('id').ast
		const findOperation: FindOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'id'
		> = immutableRecord({ kind: 'find', query: selectedQuery })
		const countOperation = immutableRecord({
			kind: 'count',
			query: new Query(schema).ast,
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
				set: { published: true },
			}),
		})
		const createOperation = immutableRecord({
			input: completeRecord,
			kind: 'create-one',
			schema: new Query(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const boundaries = createRuntimeHookBoundaries()
		const found = boundaries.snapshotResultReplacement(findOperation, [
			{ id: generatedId },
		])

		expect(found).toStrictEqual([{ id: generatedId }])
		expect(Object.isFrozen(found)).toBe(true)
		expect(Object.isFrozen(found[0])).toBe(true)
		expect(boundaries.snapshotResultReplacement(countOperation, 2)).toBe(2)
		expect(
			boundaries.snapshotResultReplacement(updateOperation, null),
		).toBeNull()
		expect(() =>
			boundaries.snapshotResultReplacement(countOperation, -1),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(() =>
			boundaries.snapshotResultReplacement(createOperation, null),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
	})

	it('converts business issues into one immutable path-prefixed framework error', () => {
		const boundaries = createRuntimeHookBoundaries()
		const issues: readonly HookValidationIssue[] = [
			{
				code: 'article.invalid-title',
				message: 'Title is reserved',
				path: ['title'],
			},
		]

		try {
			boundaries.throwHookValidationIssues(issues, ['input'])
			expect.unreachable('Expected hook validation to fail')
		} catch (error: unknown) {
			expect(error).toMatchObject({
				code: 'VALIDATION_ERROR',
				publicMessage: 'A hook returned an invalid value.',
			})
			const normalizedIssues = readIssues(error)

			expect(normalizedIssues).toStrictEqual([
				{
					code: 'article.invalid-title',
					message: 'Title is reserved',
					path: ['input', 'title'],
				},
			])
			expect(Object.isFrozen(readRawIssues(error))).toBe(true)
			expect(Object.isFrozen(normalizedIssues[0]?.path)).toBe(true)
		}
	})
})
