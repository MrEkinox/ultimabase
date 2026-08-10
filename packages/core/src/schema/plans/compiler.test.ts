import { describe, expect, it, vi } from 'vitest'

import {
	binaryField,
	compileValidationPlans,
	definePluginField,
	Schema,
	objectField,
	stringField,
	type FieldDefinition,
} from '../index.js'

describe('validation plans', () => {
	it('compiles operation rules while retaining scalar field identity', () => {
		const runtimeDefault = vi.fn(() => 'generated')
		const schema = Schema.define({
			className: 'ScalarPlan',
			fields: (field) => ({
				name: field.string({
					validation: {
						required: true,
						length: { min: 2, max: 40 },
						match: /^[a-z]+$/u,
					},
				}),
				nickname: field.string(),
				active: field.boolean({ default: true }),
				generated: field.string({ default: runtimeDefault }),
				automaticDate: field.date({
					autoNow: true,
					validation: { required: true },
				}),
				immutableCode: field.string({
					validation: { required: true },
					immutable: true,
				}),
			}),
		})

		const plans = compileValidationPlans(schema)

		expect(runtimeDefault).not.toHaveBeenCalled()
		expect(plans.create.operation).toBe('create')
		expect(plans.update.operation).toBe('update')
		expect(plans.create.unknownFields).toBe('reject')
		expect(plans.create.fields.name).toStrictEqual({
			kind: 'scalar',
			field: schema.fields.name,
			presence: 'required',
			nullable: false,
		})
		expect(plans.update.fields.name).toStrictEqual({
			kind: 'scalar',
			field: schema.fields.name,
			presence: 'optional',
			nullable: false,
		})
		expect(plans.create.fields.nickname?.nullable).toBe(true)
		expect(plans.create.fields.active?.field).toBe(schema.fields.active)
		expect(plans.create.fields.generated?.field).toBe(schema.fields.generated)
		expect(plans.create.fields.automaticDate).toMatchObject({
			kind: 'scalar',
			field: schema.fields.automaticDate,
			presence: 'optional',
		})
		expect(plans.create.fields.immutableCode?.presence).toBe('required')
		expect(plans.update.fields.immutableCode?.presence).toBe('forbidden')

		// Scalar constraints and defaults remain available from one source of truth.
		expect(schema.fields.name?.options).toMatchObject({
			validation: {
				length: { min: 2, max: 40 },
				match: /^[a-z]+$/u,
			},
		})
		expect(schema.fields.active?.options).toMatchObject({ default: true })
		expect(schema.fields.generated?.options).toMatchObject({
			default: runtimeDefault,
		})
	})

	it('compiles system fields and structured children recursively', () => {
		const schema = Schema.define({
			className: 'StructuredPlan',
			fields: (field) => ({
				profile: field.object({
					validation: { required: true },
					fields: (field) => ({
						displayName: field.string({
							validation: { required: true },
						}),
						internalCode: field.string({ immutable: true }),
					}),
				}),
				tags: field.string({
					list: true,
					default: ['generated'],
				}),
				matrix: field.int({ list: true }),
			}),
		})

		const plans = compileValidationPlans(schema)
		const createProfile = plans.create.fields.profile
		const updateProfile = plans.update.fields.profile
		const createTags = plans.create.fields.tags

		expect(plans.create.fields.id).toMatchObject({
			kind: 'scalar',
			field: schema.fields.id,
			presence: 'forbidden',
		})
		expect(plans.create.fields.createdAt?.presence).toBe('forbidden')
		expect(plans.update.fields.updatedAt?.presence).toBe('forbidden')
		expect(createProfile).toMatchObject({
			kind: 'object',
			field: schema.fields.profile,
			presence: 'required',
			unknownFields: 'reject',
			fields: {
				displayName: { kind: 'scalar', presence: 'required' },
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
			field: schema.fields.tags,
			nullable: true,
			items: {
				kind: 'scalar',
				field: schema.fields.tags,
				presence: 'required',
				nullable: false,
			},
		})
		expect(plans.create.fields.matrix).toMatchObject({
			kind: 'array',
			items: {
				kind: 'scalar',
				presence: 'required',
				nullable: false,
			},
		})
	})

	it('defers required plugin values until resolveInput without weakening output', () => {
		const generated = definePluginField(
			'fixture.deferred',
			{ validation: { required: true } },
			{
				deferRequiredUntilResolveInput: true,
				snapshotValue: (value: unknown): string => String(value),
			},
		)
		const schema = Schema.define({
			className: 'DeferredPlan',
			fields: () => ({ generated }),
		})
		const plans = compileValidationPlans(schema)

		expect(plans.create.fields.generated?.presence).toBe('optional')
		expect(plans.update.fields.generated?.presence).toBe('optional')
	})

	it('uses create child rules when an update replaces an object list', () => {
		const listedObject = objectField({
			list: true,
			fields: {
				name: stringField({ validation: { required: true } }),
			},
		})
		const schema = Schema.define({
			className: 'ListedObjectPlan',
			fields: () => ({ listedObject }),
		})

		expect(
			compileValidationPlans(schema).update.fields.listedObject,
		).toMatchObject({
			kind: 'array',
			presence: 'optional',
			items: {
				kind: 'object',
				fields: { name: { presence: 'required' } },
			},
		})
	})

	it('freezes only compiled containers and reuses declared fields', () => {
		const binaryDefault = new Uint8Array([1, 2, 3])
		const structuredField = objectField({
			fields: { payload: binaryField() },
			default: { payload: binaryDefault },
		})
		const schema = Schema.define({
			className: 'FrozenPlan',
			fields: () => ({ structured: structuredField }),
		})

		const plans = compileValidationPlans(schema)
		const structured = plans.create.fields.structured

		expect(Object.isFrozen(plans)).toBe(true)
		expect(Object.isFrozen(plans.create)).toBe(true)
		expect(Object.isFrozen(plans.create.fields)).toBe(true)
		expect(Object.isFrozen(structured)).toBe(true)
		expect(structured?.field).toBe(structuredField)

		binaryDefault[0] = 9
		// Declaration snapshots remain responsible for detaching caller-owned values.
		expect(structuredField.options.default).toStrictEqual({
			payload: new Uint8Array([1, 2, 3]),
		})
	})

	it('preserves plugin fields through the shared scalar plan', () => {
		const customField = definePluginField(
			'fixture.custom',
			{},
			{
				snapshotValue: (value: unknown): string => String(value),
			},
		)
		const schema = Schema.define({
			className: 'PluginPlan',
			fields: () => ({ custom: customField }),
		})

		expect(compileValidationPlans(schema).create.fields.custom).toStrictEqual({
			kind: 'scalar',
			field: customField,
			presence: 'optional',
			nullable: true,
		})
	})

	it('rejects forged field metadata before producing a schema', () => {
		const malformedListField: FieldDefinition<'string', string, object> = {
			kind: 'string',
			options: { list: 'invalid' },
		}

		// Schema composition rejects JavaScript callers that bypass field factories.
		expect(() =>
			Schema.define({
				className: 'MalformedListPlan',
				fields: () => ({ value: malformedListField }),
			}),
		).toThrow(
			new TypeError(
				'MalformedListPlan.fields.value must be created by a field factory',
			),
		)
	})
})
