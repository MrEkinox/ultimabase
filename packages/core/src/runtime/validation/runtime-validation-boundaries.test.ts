import { describe, expect, it } from 'vitest'
import {
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../../query/index.js'
import { createRuntimeValidationStage } from './runtime-validation.js'
import {
	executeStage,
	schemaNode,
	validCreateInput,
	validationSchema,
} from '../../../tests/fixtures/runtime-validation.js'
import { QueryBuilder } from '../../plugin.js'

describe('runtime validation boundaries', () => {
	it('rejects every malformed update and bulk boundary from JavaScript callers', async () => {
		const stage = createRuntimeValidationStage()
		const query = new QueryBuilder(validationSchema).ast
		const malformedOperations = [
			null,
			{ kind: 'set', field: 'missing', value: 'value' },
			{ kind: 'set', field: 'immutableCode', value: 'changed' },
			{ kind: 'unset', field: 'title' },
			{ kind: 'set', field: 'score', value: 'not-an-int' },
			{ kind: 'decrement', field: 'score', value: 'not-an-int' },
		]
		const malformedUpdate = {
			kind: 'update-one',
			query,
			update: { kind: 'update-expression', operations: malformedOperations },
		} as unknown as UpdateOneOperationAst<typeof validationSchema>
		const unnormalizedUpdate = {
			kind: 'update-one',
			query,
			update: { kind: 'custom-update' },
		} as unknown as UpdateOneOperationAst<typeof validationSchema>
		const malformedCreateMany = {
			kind: 'create-many',
			schema: schemaNode,
			inputs: {},
		} as unknown as CreateManyOperationAst<typeof validationSchema>
		const malformedUpsertMany = {
			kind: 'upsert-many',
			schema: schemaNode,
			items: [null],
		} as unknown as UpsertManyOperationAst<typeof validationSchema>
		const nonArrayUpsertMany = {
			...malformedUpsertMany,
			items: {},
		} as unknown as UpsertManyOperationAst<typeof validationSchema>

		for (const operation of [
			malformedUpdate,
			unnormalizedUpdate,
			malformedCreateMany,
			malformedUpsertMany,
			nonArrayUpsertMany,
		]) {
			await expect(executeStage(stage, operation)).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
			})
		}
	})

	it('rejects a forged schema identity before compiling plans', async () => {
		const operation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: { kind: 'schema', definition: {} },
			input: {},
		} as unknown as CreateOneOperationAst<typeof validationSchema>

		await expect(
			executeStage(createRuntimeValidationStage(), operation),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('validates output from an injected UUID v7 generator', async () => {
		const operation: CreateOneOperationAst<typeof validationSchema> = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: schemaNode,
			input: validCreateInput(),
		}
		const stage = createRuntimeValidationStage({
			uuidV7Generator: () => 'not-a-uuid',
		})

		await expect(executeStage(stage, operation)).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: {
				issues: [
					expect.objectContaining({ code: 'uuid.type', path: ['input', 'id'] }),
				],
			},
		})
	})

	it('rejects malformed JavaScript options at the application boundary', () => {
		expect(() => createRuntimeValidationStage(null as never)).toThrow(
			new TypeError('Runtime validation options must be a plain object'),
		)
		expect(() =>
			createRuntimeValidationStage({ unknown: true } as never),
		).toThrow(
			new TypeError('Runtime validation contains unknown option: unknown'),
		)
		expect(() =>
			createRuntimeValidationStage({ clock: true } as never),
		).toThrow(new TypeError('Runtime validation clock must be a function'))
		expect(() =>
			createRuntimeValidationStage({ uuidV7Generator: true } as never),
		).toThrow(new TypeError('Runtime UUID v7 generator must be a function'))
		expect(() => createRuntimeValidationStage({ timezone: '' })).toThrow(
			new TypeError('Runtime validation timezone must be a non-empty string'),
		)
	})

	it('reports inherited Object.prototype update fields as unknown', async () => {
		const stage = createRuntimeValidationStage()
		const query = new QueryBuilder(validationSchema).ast

		for (const field of ['missing', 'toString', 'constructor', '__proto__']) {
			const operation = {
				kind: 'update-one',
				query,
				update: {
					kind: 'update-expression',
					operations: [{ field, kind: 'set', value: 'value' }],
				},
			} as unknown as UpdateOneOperationAst<typeof validationSchema>

			await expect(executeStage(stage, operation)).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				publicDetails: {
					issues: [
						expect.objectContaining({
							code: 'field.unknown',
							path: ['update', 0, field],
						}),
					],
				},
			})
		}
	})

	it('reports inherited Object.prototype upsert target fields as undeclared', async () => {
		const stage = createRuntimeValidationStage()
		const where = new QueryBuilder(validationSchema).where((where) =>
			where.eq('immutableCode', 'public-code'),
		).ast.where

		for (const field of ['missing', 'toString']) {
			const operation = {
				kind: 'upsert-one',
				query: {
					...new QueryBuilder(validationSchema).ast,
					where: {
						...where,
						expression: { ...where?.expression, field },
					},
				},
				target: { kind: 'unique-upsert-target', fields: [field] },
				create: validCreateInput(),
				update: {
					kind: 'update-expression',
					operations: [{ field: 'title', kind: 'set', value: 'updated' }],
				},
			} as unknown as UpsertOneOperationAst<typeof validationSchema>

			await expect(executeStage(stage, operation)).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				publicDetails: {
					issues: [
						expect.objectContaining({
							code: 'field.unknown',
							message: 'Upsert target field is not declared by the schema',
							path: ['create', field],
						}),
					],
				},
			})
		}
	})
})
