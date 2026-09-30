import { describe, expect, it, vi } from 'vitest'

import {
	addSchemaField,
	contributeDeclarations,
	contributeSchemaMutation,
	defineOperationValue,
	plugin as createPlugin,
	defineSchemaMutation,
} from '../../foundation.js'
import { Schema, stringField } from '../../schema/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'

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
	const plugin = createPlugin({
		id: 'fixture.schema-mutation-instances',
		instanceId,
		core: '^0.0.0',
		version: '1.0.0',
		permissions: {
			'model:extend': 'Adds one instance-owned command.',
			'operation:declare': 'Declares one instance mutation.',
			'persistence:rewrite': 'Persists its owned field.',
			'schema:declare': 'Adds one instance-owned field.',
		},
		contributions: [
			contributeSchemaMutation({ mutation, resolve }),
			contributeDeclarations({
				schema: ({ schemas }) => {
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
				},
				models: ({ models }) => {
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
			}),
		],
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
		const database = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-instances-database',
			version: '1.0.0',
			contributions: [provideTestDatabaseAdapter(adapter)],
		})
		const ultimabase = new (UltimaBase.use(
			database,
			first.plugin,
			second.plugin,
		))({
			pluginPrivileges: { logger: false },
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
