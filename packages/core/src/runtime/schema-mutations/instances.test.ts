import { describe, expect, it, vi } from 'vitest'

import {
	addSchemaField,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
} from '../../foundation.js'
import { Schema, stringField } from '../../schema/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	provideSchemaMutationHandler,
	schemaMutationHandler,
} from './capabilities.js'

const Post = Schema.define({
	className: 'SchemaMutationInstancePost',
	fields: (field) => ({ title: field.string() }),
})
const noInput = defineOperationValue((value, path): undefined => {
	if (value !== undefined) throw new TypeError(`${path} must be undefined`)
	return undefined
})

const createWorkflowInstance = (
	instanceId: string,
	command: string,
	field: string,
) => {
	const mutation = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: noInput,
		name: `fixture.schema-mutation-instances.${instanceId}`,
		returning: 'after',
		version: '1.0.0',
	})
	const resolve = vi.fn(() => ({ data: { [field]: `handled-${instanceId}` } }))
	const plugin = definePlugin({
		capabilities: [
			provideSchemaMutationHandler({
				contributionId: `${command}-handler`,
				create: () => ({
					value: schemaMutationHandler({ mutation, resolve }),
				}),
			}),
		],
		core: '^0.0.0',
		declare: ({ models, operations, schemas }) => {
			operations.declare(mutation)
			schemas.patch({
				operations: [
					addSchemaField({
						contributionId: `${field}-field`,
						field: stringField(),
						name: field,
					}),
				],
				targets: schemas.select({ className: Post.className }),
			})
			models.extend(
				{ className: Post.className },
				{
					contributionId: `${command}-surface`,
					schemaMutations: {
						[command]: { mutation, surfaces: ['schema'] },
					},
				},
			)
		},
		instanceId,
		pluginId: 'fixture.schema-mutation-instances',
		privileges: [
			{ name: 'model:extend', reason: 'Adds one instance-owned command.' },
			{ name: 'operation:declare', reason: 'Declares one instance mutation.' },
			{ name: 'persistence:rewrite', reason: 'Persists its owned field.' },
			{ name: 'schema:declare', reason: 'Adds one instance-owned field.' },
		] as const,
		version: '1.0.0',
	})

	return { plugin, resolve }
}

describe('schema mutation instance ownership', () => {
	it('executes two explicit instances through their exact handlers and fields', async () => {
		const first = createWorkflowInstance('first', 'archiveFirst', 'firstState')
		const second = createWorkflowInstance(
			'second',
			'archiveSecond',
			'secondState',
		)
		const id = '0199325a-0c00-7000-8000-000000000201'
		const original = {
			createdAt: '2026-09-10T00:00:00.000Z',
			firstState: 'pending',
			id,
			secondState: 'pending',
			title: 'Release notes',
			updatedAt: '2026-09-10T00:00:00.000Z',
		}
		const firstCurrent = { ...original, firstState: 'handled-first' }
		const secondCurrent = { ...firstCurrent, secondState: 'handled-second' }
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [
						{ current: firstCurrent, kind: 'update', previous: original },
					],
					status: 'fulfilled',
					target: original,
					value: firstCurrent,
				},
				{
					materializations: [
						{ current: secondCurrent, kind: 'update', previous: firstCurrent },
					],
					status: 'fulfilled',
					target: firstCurrent,
					value: secondCurrent,
				},
			],
			[],
		)
		const database = definePlugin({
			capabilities: [provideTestDatabaseAdapter(adapter)],
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-instances-database',
			version: '1.0.0',
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, first.plugin, second.plugin],
			schemas: [Post],
		})
		await ultimabase.start()
		const schema = ultimabase.schema(Post)

		await (
			Reflect.get(schema, 'archiveFirst') as (
				input: unknown,
			) => Promise<unknown>
		)({ id })
		await (
			Reflect.get(schema, 'archiveSecond') as (
				input: unknown,
			) => Promise<unknown>
		)({ id })

		expect(first.resolve).toHaveBeenCalledOnce()
		expect(second.resolve).toHaveBeenCalledOnce()
		expect(adapter.transactions[0]?.executions[0]?.operation).toMatchObject({
			update: { operations: [{ field: 'firstState', kind: 'set' }] },
		})
		expect(adapter.transactions[1]?.executions[0]?.operation).toMatchObject({
			update: { operations: [{ field: 'secondState', kind: 'set' }] },
		})
	})
})
