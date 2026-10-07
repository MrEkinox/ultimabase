import { describe, expect, it } from 'vitest'

import {
	assertOutputDescriptor,
	definePluginOutputDescriptor,
	definePluginFieldFamily,
	snapshotOutputValue,
	stringField,
	type GenericOutputDescriptor,
} from '../../index.js'
import { FieldBuilderMethodRegistry } from '../schema/field-builder-method-registry.js'
import type { FieldBuilderMethodResolver } from '../schema/field-builder-methods.js'
import type { OutputBuilder } from './contracts.js'
import {
	captureOutputBuilderCallback,
	resolveCapturedOutputDescriptor,
} from './builder.js'

/** Exercises the production capture and resolution stages together. */
const resolveOutputBuilder = <TOutput extends GenericOutputDescriptor>(
	declaration: (output: OutputBuilder) => TOutput,
	path: string,
	fieldMethods?: FieldBuilderMethodResolver,
): TOutput =>
	resolveCapturedOutputDescriptor(
		captureOutputBuilderCallback(declaration, path),
		path,
		fieldMethods,
	) as TOutput

describe('OutputBuilder', () => {
	it('uses only output-context plugin methods and validates their descriptors', () => {
		const outputMethod = definePluginFieldFamily({
			fieldKind: 'fixture.slug',
			typegen: { module: '@fixture/slug-plugin', valueType: 'SlugValue' },
			builder: {
				name: 'slug',
				contexts: {
					output: {
						factory: () =>
							definePluginOutputDescriptor(
								'fixture.slug',
								{ list: false, nullable: false },
								(value, path) => {
									if (typeof value !== 'string') {
										throw new TypeError(`${path} must be a string`)
									}
									return value.toLowerCase()
								},
							),
						methodType: 'SlugOutputBuilderMethod',
					},
				},
			},
		})
		const registry = new FieldBuilderMethodRegistry()
		const declaration = registry.beginPluginDeclaration('fixture.slug-plugin')
		declaration.fields.register(outputMethod)
		declaration.commit()
		declaration.close()
		registry.close()

		const descriptor = resolveOutputBuilder(
			(output) =>
				(
					output as typeof output & {
						readonly slug: () => GenericOutputDescriptor
					}
				).slug(),
			'User.slug.output',
			registry,
		)

		expect(snapshotOutputValue(descriptor, 'HELLO', 'result')).toBe('hello')
	})

	it('rejects stored factories and forged outputs in the output context', () => {
		const storedOnly = definePluginFieldFamily({
			fieldKind: 'fixture.stored-only',
			typegen: {
				module: '@fixture/stored-only-plugin',
				valueType: 'StoredOnlyValue',
			},
			builder: {
				name: 'storedOnly',
				contexts: {
					stored: {
						factory: stringField,
						methodType: 'StoredOnlyFieldBuilderMethod',
					},
				},
			},
		})
		const invalidOutput = definePluginFieldFamily({
			fieldKind: 'fixture.invalid-output',
			typegen: {
				module: '@fixture/invalid-output-plugin',
				valueType: 'InvalidOutputValue',
			},
			builder: {
				name: 'invalidOutput',
				contexts: {
					output: {
						factory: stringField,
						methodType: 'InvalidOutputBuilderMethod',
					},
				},
			},
		})
		const registry = new FieldBuilderMethodRegistry()
		for (const [owner, method] of [
			['fixture.stored-only-plugin', storedOnly],
			['fixture.invalid-output-plugin', invalidOutput],
		] as const) {
			const declaration = registry.beginPluginDeclaration(owner)
			declaration.fields.register(method)
			declaration.commit()
			declaration.close()
		}
		registry.close()

		expect(() =>
			resolveOutputBuilder(
				(output) =>
					(
						output as typeof output & {
							readonly storedOnly: () => GenericOutputDescriptor
						}
					).storedOnly(),
				'User.invalid.output',
				registry,
			),
		).toThrow('does not support the output context')
		expect(() =>
			resolveOutputBuilder(
				(output) =>
					(
						output as typeof output & {
							readonly invalidOutput: () => GenericOutputDescriptor
						}
					).invalidOutput(),
				'User.invalid.output',
				registry,
			),
		).toThrow('must be created by OutputBuilder')
	})

	it('normalizes immutable output-only metadata', () => {
		let calls = 0
		const descriptor = resolveOutputBuilder((output) => {
			calls += 1

			return output.string({
				description: 'Public label',
				list: false,
				nullable: false,
			})
		}, 'User.label.output')

		expect(calls).toBe(1)
		expect(descriptor).toStrictEqual({
			kind: 'string',
			options: {
				description: 'Public label',
				list: false,
				nullable: false,
			},
		})
		expect(Object.isFrozen(descriptor)).toBe(true)
		expect(Object.isFrozen(descriptor.options)).toBe(true)
	})

	it('snapshots every built-in scalar representation', () => {
		const outputs = resolveOutputBuilder(
			(output) =>
				output.object({
					fields: (nested) => ({
						bigint: nested.bigint({ nullable: false }),
						binary: nested.binary({ nullable: false }),
						boolean: nested.boolean({ nullable: false }),
						date: nested.date({ nullable: false }),
						dateTime: nested.dateTime({ nullable: false }),
						decimal: nested.decimal({
							nullable: false,
							precision: 4,
							scale: 2,
						}),
						enum: nested.enum({
							nullable: false,
							values: ['draft', 'published'],
						}),
						float: nested.float({ nullable: false }),
						int: nested.int({ nullable: false }),
						json: nested.json({ nullable: false }),
						string: nested.string({ nullable: false }),
						time: nested.time({ nullable: false }),
						uuid: nested.uuid({ nullable: false }),
					}),
					nullable: false,
				}),
			'User.summary.output',
		)
		const binary = new Uint8Array([1, 2, 3])
		const json = { tags: ['core'] }
		const snapshot = snapshotOutputValue(
			outputs,
			{
				bigint: 9n,
				binary,
				boolean: true,
				date: '2026-09-09',
				dateTime: '2026-09-09T12:30:00.000Z',
				decimal: '12.34',
				enum: 'draft',
				float: 1.5,
				int: 2,
				json,
				string: 'Ada',
				time: '12:30:00.000',
				uuid: '018f5f6d-9c6f-7f0c-b70b-49d70f503c8b',
			},
			'User.summary',
		)

		binary[0] = 9
		json.tags.push('changed')
		expect(snapshot).toMatchObject({
			binary: new Uint8Array([1, 2, 3]),
			json: { tags: ['core'] },
		})
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(Object.isFrozen(snapshot.json)).toBe(true)
	})

	it('applies nullability to the container and keeps list elements non-null', () => {
		const optional = resolveOutputBuilder(
			(output) => output.string(),
			'User.nickname.output',
		)
		const requiredList = resolveOutputBuilder(
			(output) => output.string({ list: true, nullable: false }),
			'User.tags.output',
		)

		expect(snapshotOutputValue(optional, null, 'User.nickname')).toBeNull()
		expect(() => snapshotOutputValue(requiredList, null, 'User.tags')).toThrow(
			new TypeError('User.tags must not be null'),
		)
		expect(() =>
			snapshotOutputValue(requiredList, ['core', null], 'User.tags'),
		).toThrow(new TypeError('User.tags[1] must not be null'))

		const snapshot = snapshotOutputValue(requiredList, ['core'], 'User.tags')
		expect(snapshot).toStrictEqual(['core'])
		expect(Object.isFrozen(snapshot)).toBe(true)
	})

	it('requires every recursively declared object property', () => {
		const descriptor = resolveOutputBuilder(
			(output) =>
				output.object({
					fields: (nested) => ({
						label: nested.string({ nullable: false }),
						note: nested.string(),
					}),
					nullable: false,
					typeName: 'Summary',
				}),
			'User.summary.output',
		)

		expect(descriptor.options).toMatchObject({
			typeName: 'Summary',
			fields: {
				label: { kind: 'string' },
				note: { kind: 'string' },
			},
		})
		expect(Object.isFrozen(descriptor.options.fields)).toBe(true)
		expect(() =>
			snapshotOutputValue(descriptor, { label: 'Ada' }, 'User.summary'),
		).toThrow(new TypeError('User.summary.note is required'))
		expect(() =>
			snapshotOutputValue(
				descriptor,
				{ extra: true, label: 'Ada', note: null },
				'User.summary',
			),
		).toThrow(
			new TypeError('User.summary.extra is not a declared output property'),
		)
	})

	it('enforces temporal, decimal, enum, and UUID shapes', () => {
		const invalidCases = [
			{
				descriptor: resolveOutputBuilder(
					(output) => output.dateTime({ nullable: false, timezone: false }),
					'output',
				),
				value: '2026-09-09T12:30:00.000Z',
			},
			{
				descriptor: resolveOutputBuilder(
					(output) =>
						output.decimal({ nullable: false, precision: 3, scale: 1 }),
					'output',
				),
				value: '123.4',
			},
			{
				descriptor: resolveOutputBuilder(
					(output) =>
						output.enum({ nullable: false, values: ['draft', 'published'] }),
					'output',
				),
				value: 'archived',
			},
			{
				descriptor: resolveOutputBuilder(
					(output) => output.uuid({ nullable: false }),
					'output',
				),
				value: 'not-a-uuid',
			},
		] as const

		for (const { descriptor, value } of invalidCases) {
			expect(() => snapshotOutputValue(descriptor, value, 'result')).toThrow()
		}
	})

	it('rejects every persisted or plugin-owned option at runtime', () => {
		for (const optionName of [
			'access',
			'autoIncrement',
			'autoNow',
			'column',
			'default',
			'hooks',
			'immutable',
			'indexed',
			'postgres',
			'required',
			'validation',
		] as const) {
			expect(() =>
				resolveOutputBuilder(
					(output) => output.string({ [optionName]: true } as never),
					'User.invalid.output',
				),
			).toThrow(
				new TypeError(
					`User.invalid.output.string does not support output option ${optionName}`,
				),
			)
		}
	})

	it('rejects malformed callbacks and forged descriptors', () => {
		expect(() =>
			resolveOutputBuilder(
				(output) => output.string(null as never),
				'User.label.output',
			),
		).toThrow(
			new TypeError('User.label.output.string options must be a plain object'),
		)
		expect(() =>
			resolveOutputBuilder(
				(output) =>
					(
						output as unknown as {
							readonly pointer: () => GenericOutputDescriptor
						}
					).pointer(),
				'User.owner.output',
			),
		).toThrow(TypeError)
		expect(() =>
			resolveOutputBuilder(
				(output) =>
					output.object({
						// @ts-expect-error -- Runtime coverage rejects asynchronous maps.
						fields: async () => {
							await Promise.resolve()
							return {}
						},
					}),
				'User.summary.output',
			),
		).toThrow(
			new TypeError(
				'User.summary.output.object.fields must return an output descriptor map',
			),
		)

		const forged = Object.freeze({
			kind: 'string',
			options: Object.freeze({ list: false, nullable: false }),
		}) as GenericOutputDescriptor
		expect(() => {
			assertOutputDescriptor(forged, 'forged')
		}).toThrow(new TypeError('forged must be created by OutputBuilder'))
	})
})
