import { FrameworkError } from '../../foundation.js'
import {
	QueryBuilder,
	increment,
	normalizeUpdateExpression,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type FindManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../../query/index.js'
import {
	definePluginField,
	compileValidationPlans,
	type FieldOptions,
	Schema,
	SchemaRegistry,
} from '../../schema/index.js'
import { createRelationUpdateExpression } from '../../schema/relations/mutation.js'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import { validate as validateUuid, version as readUuidVersion } from 'uuid'
import { describe, expect, it, vi } from 'vitest'
import {
	executeStage,
	runtimeDefault,
	schemaNode,
	validCreateInput,
	validationSchema,
	relationValidationSource,
	relationValidationTarget,
	binaryDefault,
} from '../../../tests/fixtures/runtime-validation.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { createFixtureMasterContext } from '../../../tests/fixtures/master-context.js'
import {
	createRuntimeValidationStage,
	revalidateRuntimeMutationOperation,
} from './runtime-validation.js'
describe('runtime validation', () => {
	it('applies immutable defaults and one timezone-aware operation clock', async () => {
		runtimeDefault.mockClear()
		const clock = vi.fn(() => new Date('2026-07-14T10:11:12.345Z'))
		const uuidV7Generator = vi.fn(() => '0198a43e-2431-7000-8000-000000000001')
		const stage = createRuntimeValidationStage({
			clock,
			timezone: 'Europe/Paris',
			uuidV7Generator,
		})
		const input = validCreateInput()
		const operation: CreateOneOperationAst<typeof validationSchema> = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: schemaNode,
			input,
		}

		const normalized = await executeStage(stage, operation)

		expect(normalized).not.toBe(operation)
		expect(normalized.input).toMatchObject({
			title: 'Valid title',
			immutableCode: 'public-code',
			id: '0198a43e-2431-7000-8000-000000000001',
			sequence: 42,
			state: 'draft',
			day: '2026-07-14',
			localTime: '12:11:12.345',
			zonedTime: '12:11:12.345+02:00',
			localMoment: '2026-07-14T12:11:12.345',
			zonedMoment: '2026-07-14T12:11:12.345+02:00',
			createdAt: '2026-07-14T12:11:12.345+02:00',
			updatedAt: '2026-07-14T12:11:12.345+02:00',
			profile: { name: 'Ada', level: 1 },
		})
		expect(normalized.input).not.toHaveProperty('serial')
		expect(normalized.input.payload).toStrictEqual(new Uint8Array([1, 2, 3]))
		expect(normalized.input.payload).not.toBe(binaryDefault)
		expect(input).toStrictEqual(validCreateInput())
		expect(Object.isFrozen(normalized.input)).toBe(true)
		expect(Object.isFrozen(normalized.input.profile)).toBe(true)
		expect(Object.isFrozen(normalized.input.items)).toBe(true)
		expect(runtimeDefault).toHaveBeenCalledTimes(1)
		expect(clock).toHaveBeenCalledTimes(1)
		expect(uuidV7Generator).toHaveBeenCalledExactlyOnceWith(
			Date.parse('2026-07-14T10:11:12.345Z'),
		)
	})

	it('runs runtime factories per bulk object while sharing one clock instant', async () => {
		runtimeDefault.mockClear()
		const clock = vi.fn(() => new Date('2026-01-02T03:04:05.006Z'))
		const stage = createRuntimeValidationStage({ clock })
		const operation: CreateManyOperationAst<typeof validationSchema> = {
			kind: 'create-many',
			schema: schemaNode,
			inputs: [validCreateInput(), validCreateInput()],
			selection: new QueryBuilder(validationSchema).ast.selection,
		}

		const normalized = await executeStage(stage, operation)

		expect(normalized.inputs).toHaveLength(2)
		expect(normalized.inputs[0]).toHaveProperty(
			'createdAt',
			'2026-01-02T03:04:05.006Z',
		)
		expect(normalized.inputs[1]).toHaveProperty(
			'createdAt',
			'2026-01-02T03:04:05.006Z',
		)
		expect(runtimeDefault).toHaveBeenCalledTimes(2)
		expect(clock).toHaveBeenCalledTimes(1)
		const identifiers = normalized.inputs.flatMap((input) => {
			const candidate: unknown = input

			return isPlainRecord(candidate) && typeof candidate.id === 'string'
				? [candidate.id]
				: []
		})

		expect(identifiers).toHaveLength(2)
		expect(new Set(identifiers)).toHaveLength(2)
		expect(
			identifiers.every(
				(identifier) =>
					validateUuid(identifier) && readUuidVersion(identifier) === 7,
			),
		).toBe(true)
	})

	it('canonicalizes optional fields without materializing forbidden relations', async () => {
		const schema = Schema.define({
			className: 'RuntimeOptionalWithoutRelation',
			fields: (field) => ({
				note: field.string(),
				targets: field.relation({
					target: 'RuntimeRelationValidationTarget',
				}),
			}),
		})
		new SchemaRegistry([
			relationValidationTarget,
			schema,
		]).resolveSchemaTargets()
		const operation: CreateOneOperationAst<typeof schema> = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
			input: {},
		}

		const normalized = await executeStage(
			createRuntimeValidationStage(),
			operation,
		)

		expect(normalized.input).toHaveProperty('note', null)
		expect(normalized.input).not.toHaveProperty('targets')
	})

	it('validates update replacements and appends the trusted update timestamp', async () => {
		const stage = createRuntimeValidationStage({
			clock: () => new Date('2026-05-01T08:00:00.000Z'),
		})
		const query = new QueryBuilder(validationSchema).where((where) =>
			where.eq('title', 'old'),
		)
		const update = normalizeUpdateExpression(validationSchema, {
			title: 'new title',
			profile: { name: 'Grace' },
			note: null,
			score: increment(100),
		})
		const operation: UpdateOneOperationAst<
			typeof validationSchema,
			typeof update
		> = { kind: 'update-one', query: query.ast, update }

		const normalized = await executeStage(stage, operation)

		expect(normalized.update.operations).toStrictEqual([
			{ field: 'title', kind: 'set', value: 'new title' },
			{ field: 'profile', kind: 'set', value: { name: 'Grace' } },
			{ field: 'note', kind: 'set', value: null },
			{ field: 'score', kind: 'increment', value: 100 },
			{
				field: 'updatedAt',
				kind: 'set',
				value: '2026-05-01T08:00:00.000Z',
			},
		])
		// A delta is structurally checked here; the complete persisted result is validated later.
		expect(Object.isFrozen(normalized.update.operations)).toBe(true)
	})

	it('normalizes singular and bulk upsert create and update branches', async () => {
		runtimeDefault.mockClear()
		const stage = createRuntimeValidationStage({
			clock: () => new Date('2026-01-01T00:00:00.000Z'),
		})
		const query = new QueryBuilder(validationSchema).where((where) =>
			where.eq('immutableCode', 'public-code'),
		)
		const update = normalizeUpdateExpression(validationSchema, {
			title: 'updated',
		})
		const target = {
			kind: 'unique-upsert-target',
			fields: ['immutableCode'],
		} as const
		const singular: UpsertOneOperationAst<
			typeof validationSchema,
			typeof update
		> = {
			kind: 'upsert-one',
			query: query.ast,
			target,
			create: validCreateInput(),
			update,
		}
		const bulk: UpsertManyOperationAst<typeof validationSchema, typeof update> =
			{
				kind: 'upsert-many',
				schema: schemaNode,
				items: [
					{
						query: query.ast,
						target,
						create: validCreateInput(),
						update,
					},
				],
				selection: query.ast.selection,
			}

		const normalizedSingular = await executeStage(stage, singular)
		const normalizedBulk = await executeStage(stage, bulk)

		expect(normalizedSingular.create).toHaveProperty(
			'id',
			expect.stringMatching(/^[0-9a-f-]+$/u),
		)
		expect(normalizedSingular.create).toHaveProperty(
			'createdAt',
			'2026-01-01T00:00:00.000Z',
		)
		expect(normalizedSingular.update.operations.at(-1)).toMatchObject({
			field: 'updatedAt',
		})
		expect(normalizedBulk.items[0]?.create).toHaveProperty('sequence', 42)
		expect(normalizedBulk.items[0]?.create).toHaveProperty(
			'id',
			expect.stringMatching(/^[0-9a-f-]+$/u),
		)
		expect(normalizedBulk.items[0]?.update.operations.at(-1)).toMatchObject({
			field: 'updatedAt',
		})
		expect(runtimeDefault).toHaveBeenCalledTimes(2)
	})

	it('seeds create candidates from unique targets and rejects conflicting values', async () => {
		const targetedId = '0198a43e-2431-7000-8000-000000000099'
		const generatedId = '0198a43e-2431-7000-8000-000000000001'
		const stage = createRuntimeValidationStage({
			clock: () => new Date('2026-01-01T00:00:00.000Z'),
			uuidV7Generator: () => generatedId,
		})
		const update = normalizeUpdateExpression(validationSchema, {
			title: 'updated',
		})
		const byId: UpsertOneOperationAst<typeof validationSchema, typeof update> =
			{
				kind: 'upsert-one',
				query: new QueryBuilder(validationSchema).where((where) =>
					where.eq('id', targetedId),
				).ast,
				target: { kind: 'unique-upsert-target', fields: ['id'] },
				create: validCreateInput(),
				update,
			}

		const normalized = await executeStage(stage, byId)

		expect(normalized.create).toHaveProperty('id', targetedId)
		expect(normalized.create).not.toHaveProperty('id', generatedId)

		const { immutableCode: omittedCode, ...withoutUniqueTarget } =
			validCreateInput()
		void omittedCode
		const seededRequired = await executeStage(stage, {
			...byId,
			create: withoutUniqueTarget as never,
			query: new QueryBuilder(validationSchema).where((where) =>
				where.eq('immutableCode', 'public-code'),
			).ast,
			target: {
				kind: 'unique-upsert-target',
				fields: ['immutableCode'],
			},
		})

		expect(seededRequired.create).toHaveProperty('immutableCode', 'public-code')

		await expect(
			executeStage(stage, {
				...byId,
				query: new QueryBuilder(validationSchema).where((where) =>
					where.eq('immutableCode', 'target-code'),
				).ast,
				target: {
					kind: 'unique-upsert-target',
					fields: ['immutableCode'],
				},
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: {
				issues: [
					{
						code: 'upsert.target',
						path: ['create', 'immutableCode'],
					},
				],
			},
		})
		await expect(
			executeStage(stage, { ...byId, create: null as never }),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: {
				issues: [{ code: 'object.type', path: ['create'] }],
			},
		})
	})

	it('revalidates unique upsert targets after hook transformations', async () => {
		const stage = createRuntimeValidationStage({
			clock: () => new Date('2026-01-01T00:00:00.000Z'),
		})
		const update = normalizeUpdateExpression(validationSchema, {
			title: 'updated',
		})
		const operation: UpsertOneOperationAst<
			typeof validationSchema,
			typeof update
		> = {
			kind: 'upsert-one',
			query: new QueryBuilder(validationSchema).where((where) =>
				where.eq('immutableCode', 'public-code'),
			).ast,
			target: {
				kind: 'unique-upsert-target',
				fields: ['immutableCode'],
			},
			create: validCreateInput(),
			update,
		}
		const normalized = await executeStage(stage, operation)
		const transformed = {
			...normalized,
			// The target query remains authoritative after hook transformations.
			create: { ...normalized.create, immutableCode: 'hook-replaced-code' },
		}

		let failure: unknown

		try {
			revalidateRuntimeMutationOperation(
				normalized,
				transformed,
				compileValidationPlans(validationSchema),
			)
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toBeInstanceOf(FrameworkError)
		if (failure instanceof FrameworkError) {
			expect(failure.code).toBe('VALIDATION_ERROR')
			expect(failure.publicDetails).toMatchObject({
				issues: [
					{
						code: 'upsert.target',
						path: ['create', 'immutableCode'],
					},
				],
			})
		}
	})

	it('prevents hooks from replacing an already authorized relation delta', async () => {
		const stage = createRuntimeValidationStage()
		const originalPointer = relationValidationTarget.pointer(
			'0198f090-2a50-7000-8000-000000000111',
		)
		const replacementPointer = relationValidationTarget.pointer(
			'0198f090-2a50-7000-8000-000000000112',
		)
		const update = createRelationUpdateExpression(
			relationValidationSource,
			'targets',
			relationValidationTarget,
			'connect',
			originalPointer.id,
		)
		const operation: UpdateOneOperationAst<
			typeof relationValidationSource,
			typeof update
		> = {
			kind: 'update-one',
			query: new QueryBuilder(relationValidationSource).ast,
			update,
		}
		const normalized = await executeStage(stage, operation)
		const replacement = createRelationUpdateExpression(
			relationValidationSource,
			'targets',
			relationValidationTarget,
			'connect',
			replacementPointer.id,
		)
		const [, ...generatedOperations] = normalized.update.operations
		// Replacing the normalized expression models a hook changing its authorized target.
		const transformed: typeof normalized = {
			...normalized,
			update: {
				...replacement,
				operations: [replacement.operations[0], ...generatedOperations],
			},
		}

		let failure: unknown

		try {
			revalidateRuntimeMutationOperation(
				normalized,
				transformed,
				compileValidationPlans(relationValidationSource),
			)
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toBeInstanceOf(FrameworkError)
		if (failure instanceof FrameworkError) {
			expect(failure.code).toBe('VALIDATION_ERROR')
			expect(failure.publicDetails).toMatchObject({
				issues: [
					{
						code: 'field.forbidden',
						path: ['update', 0, 'targets'],
					},
				],
			})
		}
	})

	it('returns immutable path-aware failures even for trusted master requests', async () => {
		const stage = createRuntimeValidationStage()
		const operation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: schemaNode,
			input: {
				title: 'x',
				immutableCode: 'public-code',
				id: '0198a43e-2431-7000-8000-000000000001',
				profile: { unknown: true },
				items: [{}],
			},
		} as unknown as CreateOneOperationAst<typeof validationSchema>
		const master = createFixtureMasterContext(
			'audited validation test',
			'test-key',
			RequestContext.anonymous({
				requestId: 'master-validation',
				source: requestSources.internal,
			}),
		)

		await executeStage(stage, operation, master).catch((error: unknown) => {
			expect(error).toBeInstanceOf(FrameworkError)
			if (error instanceof FrameworkError) {
				expect(error.code).toBe('VALIDATION_ERROR')
				const details: unknown = error.publicDetails

				expect(isPlainRecord(details)).toBe(true)
				if (isPlainRecord(details) && isUnknownArray(details.issues)) {
					expect(details.issues).toEqual(
						expect.arrayContaining([
							expect.objectContaining({
								code: 'field.forbidden',
								path: ['input', 'id'],
							}),
							expect.objectContaining({
								code: 'field.unknown',
								path: ['input', 'profile', 'unknown'],
							}),
							expect.objectContaining({
								code: 'field.required',
								path: ['input', 'items', 0, 'label'],
							}),
						]),
					)
					expect(Object.isFrozen(details.issues)).toBe(true)
				}
			}
		})
	})

	it('leaves reads unchanged without consulting the operation clock', async () => {
		const clock = vi.fn(() => new Date())
		const stage = createRuntimeValidationStage({ clock })
		const operation: FindManyOperationAst<typeof validationSchema> = {
			kind: 'find-many',
			query: new QueryBuilder(validationSchema).ast,
		}

		expect(await executeStage(stage, operation)).toBe(operation)
		expect(clock).not.toHaveBeenCalled()
	})

	it('reports every scalar, null, list, and object shape through stable codes', async () => {
		const pointerTarget = Schema.define({
			className: 'InvalidScalarPointerTarget',
			fields: () => ({}),
		})
		const customField = definePluginField<
			string,
			'fixture.rejecting',
			FieldOptions<string>
		>(
			'fixture.rejecting',
			{},
			{
				snapshotValue: (): never => {
					throw new TypeError('Plugin value rejected')
				},
			},
		)
		const scalarSchema = Schema.define({
			className: 'InvalidScalars',
			fields: (field) => ({
				bigint: field.bigint(),
				binary: field.binary(),
				boolean: field.boolean(),
				date: field.date(),
				dateTime: field.dateTime(),
				decimal: field.decimal(),
				enum: field.enum({ values: ['allowed'] }),
				float: field.float(),
				int: field.int(),
				json: field.json(),
				string: field.string(),
				time: field.time(),
				uuid: field.uuid(),
				custom: customField,
				nullable: field.string(),
				nonNullable: field.string({ required: true }),
				list: field.string({ list: true }),
				object: field.object({
					fields: (field) => ({ child: field.string() }),
				}),
				pointer: field.pointer({ target: 'InvalidScalarPointerTarget' }),
				badDefault: field.string({ default: () => 1 as never }),
			}),
		})
		new SchemaRegistry([pointerTarget, scalarSchema]).resolveSchemaTargets()
		const operation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(scalarSchema).ast.schema,
			input: {
				bigint: 1,
				binary: 'binary',
				boolean: 'true',
				date: 'not-date',
				dateTime: 'not-date-time',
				decimal: 'not-decimal',
				enum: 'denied',
				float: 'float',
				int: 'int',
				json: 'root-scalars-are-not-json-documents',
				string: 1,
				time: 'not-time',
				uuid: 1,
				custom: 'rejected',
				nullable: null,
				nonNullable: null,
				list: 'not-list',
				object: 'not-object',
				pointer: { className: pointerTarget.className, id: 'target-1' },
			},
		} as unknown as CreateOneOperationAst<typeof scalarSchema>

		await executeStage(createRuntimeValidationStage(), operation).catch(
			(error: unknown) => {
				expect(error).toBeInstanceOf(FrameworkError)
				if (!(error instanceof FrameworkError)) {
					return
				}

				const details: unknown = error.publicDetails
				if (!isPlainRecord(details) || !isUnknownArray(details.issues)) {
					throw new TypeError('Expected validation issues')
				}

				const codes = details.issues.flatMap((issue) =>
					isPlainRecord(issue) && typeof issue.code === 'string'
						? [issue.code]
						: [],
				)

				expect(codes).toEqual(
					expect.arrayContaining([
						'bigint.type',
						'binary.type',
						'boolean.type',
						'date.invalid',
						'dateTime.invalid',
						'decimal.invalid',
						'enum.value',
						'float.type',
						'int.type',
						'json.type',
						'string.type',
						'time.invalid',
						'uuid.type',
						'fixture.rejecting.invalid',
						'field.null',
						'array.type',
						'object.type',
						'pointer.type',
					]),
				)
			},
		)
	})
})
