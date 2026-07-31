import { describe, expect, it, vi } from 'vitest'

import {
	DatabaseDefault,
	bigintField,
	binaryField,
	booleanField,
	compileValidationPlans,
	dateField,
	dateTimeField,
	decimalField,
	defineSchema,
	enumField,
	floatField,
	intField,
	jsonField,
	objectField,
	stringField,
	timeField,
	uuidField,
	type FieldDefinition,
} from '../src/index.js'

describe('validation plans', () => {
	it('compiles primitive create and update rules without executing defaults', () => {
		const runtimeDefault = vi.fn(() => '2026-07-30T12:00:00.000Z')
		const databaseDefault = new DatabaseDefault<string>(
			'postgres.currentTimestamp',
			{},
		)
		const match = /^[a-z]+$/u
		const minDate = '2026-01-01'
		const maxDate = '2026-12-31'
		const avatarDefault = new Uint8Array([1, 2, 3])
		const schema = defineSchema({
			className: 'PrimitivePlan',
			fields: {
				name: stringField({
					validation: {
						required: true,
						length: { min: 2, max: 40 },
						match,
					},
				}),
				nickname: stringField({
					validation: { nullable: true },
				}),
				active: booleanField({ default: true }),
				price: decimalField({
					default: '19.99',
					validation: {
						precision: 12,
						scale: 2,
						range: { min: '0.00', max: '9999999999.99' },
					},
				}),
				unrestrictedDecimal: decimalField(),
				avatar: binaryField({
					default: avatarDefault,
					validation: { length: { min: 1, max: 1024 } },
				}),
				unrestrictedBinary: binaryField(),
				publishedAt: dateField({
					default: 'today',
					validation: { range: { min: minDate, max: maxDate } },
				}),
				importedAt: dateField({ default: databaseDefault }),
				processedAt: dateTimeField({
					default: runtimeDefault,
					validation: {
						range: {
							min: '2026-01-01T00:00:00.000Z',
							max: '2026-12-31T23:59:59.999Z',
						},
					},
				}),
				generatedAt: dateTimeField({ default: 'now' }),
				unrestrictedDateTime: dateTimeField({ timezone: false }),
				reminderTime: timeField({
					timezone: true,
					default: 'now',
					validation: {
						range: {
							min: '08:00:00.000Z',
							max: '18:00:00.000Z',
						},
					},
				}),
				unrestrictedTime: timeField(),
				sequence: intField({
					autoIncrement: true,
					validation: { required: true, range: { min: 1 } },
				}),
				largeSequence: bigintField({
					validation: {
						range: { min: 0n, max: 9_000_000_000_000_000_000n },
					},
				}),
				unrestrictedLargeSequence: bigintField(),
				ratio: floatField({
					validation: { range: { min: 0, max: 1 }, finite: true },
				}),
				unrestrictedRatio: floatField(),
				status: enumField({
					values: {
						Draft: 'draft',
						Published: 'published',
					},
				}),
				payload: jsonField(),
				immutableCode: stringField({
					validation: { required: true },
					immutable: true,
				}),
			},
		})

		const plans = compileValidationPlans(schema)

		expect(runtimeDefault).not.toHaveBeenCalled()
		expect(plans.create.operation).toBe('create')
		expect(plans.update.operation).toBe('update')
		expect(plans.create.unknownFields).toBe('reject')
		expect(plans.create.fields.name).toMatchObject({
			kind: 'string',
			presence: 'required',
			nullable: false,
			length: { min: 2, max: 40 },
			match,
		})
		expect(plans.update.fields.name).toMatchObject({
			kind: 'string',
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.nickname).toMatchObject({
			kind: 'string',
			presence: 'optional',
			nullable: true,
		})
		expect(plans.create.fields.active).toMatchObject({
			kind: 'boolean',
			presence: 'optional',
			default: { kind: 'static', value: true },
		})
		expect(plans.update.fields.active).not.toHaveProperty('default')
		expect(plans.create.fields.price).toMatchObject({
			kind: 'decimal',
			default: { kind: 'static', value: '19.99' },
			precision: 12,
			scale: 2,
			range: { min: '0.00', max: '9999999999.99' },
		})
		expect(plans.create.fields.unrestrictedDecimal).toStrictEqual({
			kind: 'decimal',
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.avatar).toMatchObject({
			kind: 'binary',
			default: {
				kind: 'static',
				value: new Uint8Array([1, 2, 3]),
			},
			length: { min: 1, max: 1024 },
		})
		if (plans.create.fields.avatar?.default?.kind === 'static') {
			// Plans own a second byte snapshot instead of sharing mutable schema storage.
			expect(plans.create.fields.avatar.default.value).not.toBe(
				schema.fields.avatar.options.default,
			)
		}
		expect(plans.create.fields.unrestrictedBinary).toStrictEqual({
			kind: 'binary',
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.publishedAt).toMatchObject({
			kind: 'date',
			default: { kind: 'runtimeClock', value: 'today' },
			range: { min: minDate, max: maxDate },
		})
		expect(plans.create.fields.importedAt).toMatchObject({
			kind: 'date',
			default: { kind: 'database', value: databaseDefault },
		})
		expect(plans.create.fields.processedAt).toMatchObject({
			kind: 'dateTime',
			timezone: true,
			default: { kind: 'runtime', factory: runtimeDefault },
			range: {
				min: '2026-01-01T00:00:00.000Z',
				max: '2026-12-31T23:59:59.999Z',
			},
		})
		expect(plans.create.fields.generatedAt).toMatchObject({
			kind: 'dateTime',
			timezone: true,
			default: { kind: 'runtimeClock', value: 'now' },
		})
		expect(plans.create.fields.unrestrictedDateTime).toStrictEqual({
			kind: 'dateTime',
			timezone: false,
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.reminderTime).toMatchObject({
			kind: 'time',
			timezone: true,
			default: { kind: 'runtimeClock', value: 'now' },
			range: {
				min: '08:00:00.000Z',
				max: '18:00:00.000Z',
			},
		})
		expect(plans.create.fields.unrestrictedTime).toStrictEqual({
			kind: 'time',
			timezone: false,
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.sequence).toMatchObject({
			kind: 'int',
			presence: 'optional',
			range: { min: 1 },
		})
		expect(plans.create.fields.largeSequence).toMatchObject({
			kind: 'bigint',
			range: { min: 0n, max: 9_000_000_000_000_000_000n },
		})
		expect(plans.create.fields.unrestrictedLargeSequence).toStrictEqual({
			kind: 'bigint',
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.ratio).toMatchObject({
			kind: 'float',
			range: { min: 0, max: 1 },
			finite: true,
		})
		expect(plans.create.fields.unrestrictedRatio).toStrictEqual({
			kind: 'float',
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.status).toMatchObject({
			kind: 'enum',
			values: ['draft', 'published'],
		})
		expect(plans.create.fields.payload).toMatchObject({
			kind: 'json',
			presence: 'optional',
		})
		expect(plans.create.fields.immutableCode?.presence).toBe('required')
		expect(plans.update.fields.immutableCode?.presence).toBe('forbidden')
	})

	it('compiles system fields and structured children recursively', () => {
		const schema = defineSchema({
			className: 'StructuredPlan',
			fields: {
				profile: objectField({
					validation: { required: true },
					fields: {
						displayName: stringField({
							validation: { required: true },
						}),
						internalCode: stringField({ immutable: true }),
					},
				}),
				tags: stringField({
					list: true,
					validation: {
						nullable: true,
						length: { min: 1 },
					},
					default: ['generated'],
				}),
				matrix: intField({
					list: [true, true],
				}),
			},
		})

		const plans = compileValidationPlans(schema)
		const createProfile = plans.create.fields.profile
		const updateProfile = plans.update.fields.profile
		const createTags = plans.create.fields.tags
		const createMatrix = plans.create.fields.matrix

		expect(plans.create.fields.id).toMatchObject({
			kind: 'uuid',
			version: 7,
			presence: 'forbidden',
		})
		expect(plans.create.fields.createdAt?.presence).toBe('forbidden')
		expect(plans.update.fields.updatedAt?.presence).toBe('forbidden')

		expect(createProfile).toMatchObject({
			kind: 'object',
			presence: 'required',
			unknownFields: 'reject',
			fields: {
				displayName: {
					kind: 'string',
					presence: 'required',
					nullable: false,
				},
			},
		})
		expect(updateProfile).toMatchObject({
			kind: 'object',
			presence: 'optional',
			fields: {
				displayName: { presence: 'optional' },
				internalCode: { presence: 'forbidden' },
			},
		})
		expect(createTags).toMatchObject({
			kind: 'array',
			nullable: true,
			default: {
				kind: 'static',
				value: ['generated'],
			},
			items: {
				kind: 'string',
				presence: 'required',
				nullable: false,
				length: { min: 1 },
			},
		})

		if (createTags?.kind === 'array') {
			// List items are values rather than optional properties, so defaults remain outer.
			expect(createTags.items).not.toHaveProperty('default')
		}
		expect(createMatrix).toMatchObject({
			kind: 'array',
			items: {
				kind: 'array',
				presence: 'required',
				nullable: false,
				items: {
					kind: 'int',
					presence: 'required',
					nullable: false,
				},
			},
		})
	})

	it('compiles optional developer UUID version constraints', () => {
		const schema = defineSchema({
			className: 'UuidPlan',
			fields: {
				unrestricted: uuidField(),
				versioned: uuidField({
					validation: {
						required: true,
						version: 4,
					},
				}),
			},
		})

		const unrestricted =
			compileValidationPlans(schema).create.fields.unrestricted
		const versioned = compileValidationPlans(schema).create.fields.versioned

		expect(unrestricted).toStrictEqual({
			kind: 'uuid',
			presence: 'optional',
			nullable: false,
		})
		expect(unrestricted).not.toHaveProperty('version')
		expect(versioned).toStrictEqual({
			kind: 'uuid',
			presence: 'required',
			nullable: false,
			version: 4,
		})
	})

	it('freezes every compiled container while retaining immutable metadata', () => {
		const schema = defineSchema({
			className: 'FrozenPlan',
			fields: {
				status: enumField({ values: ['draft', 'published'] }),
				profile: objectField({
					fields: {
						name: stringField(),
					},
				}),
			},
		})

		const plans = compileValidationPlans(schema)
		const status = plans.create.fields.status
		const profile = plans.create.fields.profile

		expect(Object.isFrozen(plans)).toBe(true)
		expect(Object.isFrozen(plans.create)).toBe(true)
		expect(Object.isFrozen(plans.create.fields)).toBe(true)
		expect(Object.isFrozen(status)).toBe(true)
		expect(Object.isFrozen(profile)).toBe(true)

		if (status?.kind === 'enum') {
			expect(Object.isFrozen(status.values)).toBe(true)
		}

		if (profile?.kind === 'object') {
			expect(Object.isFrozen(profile.fields)).toBe(true)
		}
	})

	it('rejects field kinds without a registered built-in validation contract', () => {
		const customField: FieldDefinition<'custom', string, object> = {
			kind: 'custom',
			options: {},
		}
		const schema = defineSchema({
			className: 'UnsupportedPlan',
			fields: {
				custom: customField,
			},
		})

		expect(() => compileValidationPlans(schema)).toThrow(
			new TypeError('Unsupported validation field kind: custom'),
		)
	})

	it('rejects forged list metadata before producing a validation plan', () => {
		const malformedListField: FieldDefinition<'string', string, object> = {
			kind: 'string',
			options: { list: 'invalid' },
		}
		const schema = defineSchema({
			className: 'MalformedListPlan',
			fields: {
				value: malformedListField,
			},
		})

		// Validation compilation protects JavaScript callers that bypass field factories.
		expect(() => compileValidationPlans(schema)).toThrow(
			new TypeError(
				'list must be true, false, or a non-empty list of true values',
			),
		)
	})
})
