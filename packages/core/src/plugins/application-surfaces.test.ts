import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'
import { provideTestRuntimeInterceptor } from '../../tests/runtime/fixtures/runtime-capabilities.js'

import { UltimaBase } from '../runtime/application/ultima-base.js'
import { preparedOperation } from '../runtime/contributions/definitions.js'

import { plugin as createPlugin } from './plugin.js'
import { contributeDeclarations } from './plugin-contributions.js'

import { defineOperation, defineOperationValue } from './plugin-operations.js'

const snapshotMessage = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const snapshotResult = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.accepted !== 'boolean') {
		throw new TypeError(`${path}.accepted must be a boolean`)
	}
	return immutableRecord({ accepted: value.accepted })
})
const applicationOperation = defineOperation({
	input: snapshotMessage,
	name: 'fixture.workflow.inspect',
	result: snapshotResult,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

const StablePost = UltimaBase.Schema.define({
	className: 'ApplicationSurfaceStablePost',
	fields: (field) => ({ title: field.string() }),
})

const createSurfacePlugin = (dynamicName: string) => {
	const DynamicSchema = UltimaBase.Schema.define({
		className: dynamicName,
		fields: (field) => ({ title: field.string() }),
	})
	return {
		DynamicSchema,
		plugin: createPlugin({
			core: '^0.0.0',
			id: `fixture.surface.${dynamicName.toLowerCase()}`,
			permissions: {
				'schema:declare': 'Declares one configuration-dependent schema.',
				'operation:declare': 'Declares inert operation contracts.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({
							contributionId: 'dynamic-schema',
							schema: DynamicSchema,
							staticOptions: { source: dynamicName },
						})
						return undefined
					},
					operations: ({ operations }) => {
						operations.declare(applicationOperation)
						return undefined
					},
				}),
			],
		}),
	}
}

describe('application-owned plugin surfaces', () => {
	it('binds stable and dynamic schemas and operations', async () => {
		const { DynamicSchema, plugin } = createSurfacePlugin(
			'ApplicationSurfaceDynamicPost',
		)
		const ultimabase = new (UltimaBase.use(plugin))({
			pluginPrivileges: { logger: false },
			schemas: [StablePost],
		})

		const stable = ultimabase.schema(StablePost)
		const dynamicName = ['ApplicationSurface', 'DynamicPost'].join('')
		const dynamic = ultimabase.schema(dynamicName)
		expect(ultimabase.schema(StablePost)).toBe(stable)
		expect(ultimabase.schema(DynamicSchema)).toBe(dynamic)
		expect(stable.schema).toBe(StablePost)
		expect(dynamic.schema).toBe(DynamicSchema)
		expect(Object.isFrozen(stable)).toBe(true)

		const tokenHandle = ultimabase.operation(applicationOperation)
		expect(ultimabase.operation(applicationOperation.name)).toBe(tokenHandle)
		expect(tokenHandle.owner.pluginId).toBe(plugin.manifest.identity.pluginId)
		expect(tokenHandle.prepare({ message: 'inspect' })).toStrictEqual({
			kind: 'plugin-operation',
			name: applicationOperation.name,
			payload: { message: 'inspect' },
			target: { kind: 'application' },
			transaction: 'forbidden',
			version: '1.0.0',
		})

		// Results have no model handles (ADR-0310).
		expect('for' in stable).toBe(false)
		expect(() => tokenHandle.prepare({ message: 1 } as never)).toThrow(
			'.message must be a string',
		)

		await ultimabase.dispose()
		expect(Reflect.has(stable, 'findMany')).toBe(false)
		expect(() => tokenHandle.prepare({ message: 'disposed' })).toThrow(
			'Application handle cannot be used after disposal',
		)
	})

	it('keeps declarations isolated and rejects duplicate or incompatible surfaces', () => {
		const first = createSurfacePlugin('ApplicationSurfaceIsolationOne')
		const second = createSurfacePlugin('ApplicationSurfaceIsolationTwo')
		const firstApplication = new (UltimaBase.use(first.plugin))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		const secondApplication = new (UltimaBase.use(second.plugin))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		expect(firstApplication.schema(first.DynamicSchema).schema).toBe(
			first.DynamicSchema,
		)
		expect(() => firstApplication.schema(second.DynamicSchema)).toThrow(
			'Unknown application schema',
		)
		expect(secondApplication.schema(second.DynamicSchema).schema).toBe(
			second.DynamicSchema,
		)

		const duplicate = createPlugin({
			core: '^0.0.0',
			id: 'fixture.duplicate-operation',
			permissions: {
				'operation:declare': 'Exercises operation declaration conflicts.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(applicationOperation)
						operations.declare(applicationOperation)

						return undefined
					},
				}),
			],
		})
		const duplicateApplication = new (UltimaBase.use(duplicate))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		expect(() => duplicateApplication.operation(applicationOperation)).toThrow(
			'Duplicate plugin operation name',
		)
	})

	it('does not let model privileges intercept Runtime implicitly', () => {
		const LocalSchema = UltimaBase.Schema.define({
			className: 'ApplicationSurfaceNoRuntimePrivilege',
			fields: (field) => ({ title: field.string() }),
		})
		expect(() =>
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.surface-no-runtime-privilege',
				permissions: {
					'model:extend': 'Declares one model surface.',
					'operation:declare': 'Declares its operation token.',
				},
				version: '1.0.0',
				contributions: [
					provideTestRuntimeInterceptor(
						'forged-interceptor',
						preparedOperation({
							handler: ({ operation }) => ({ operation }),
							schema: LocalSchema,
						}),
					),
				],
			}),
		).toThrow('Unused plugin permission reason: model:extend')
	})
})
