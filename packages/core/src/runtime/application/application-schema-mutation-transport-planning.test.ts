import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	createApplication,
	defineCapability,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
	provideCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '../../foundation.js'
import { addSchemaField } from '../../plugins/schema-field-patch-operations.js'
import { Schema, stringField } from '../../schema/index.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import {
	provideSchemaMutationTransportBinding,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from '../schema-mutations/transport-capabilities.js'
import {
	applicationOperationTransportPlanningCapability,
	type ApplicationOperationTransportPlanner,
} from './application-operation-transport-planning.js'

const Document = Schema.define({
	className: 'SchemaMutationTransportPlanningDocument',
	fields: (field) => ({ title: field.string() }),
})
const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['fixture.archive-rejected'] as const,
	input: defineOperationValue((value) => value),
	name: 'fixture.schema-mutation-planning.archive',
	returning: 'after',
	version: '1.0.0',
})
const protocol = defineOperationTransport({
	name: 'fixture.schema-mutation-planning.transport',
	version: '1.0.0',
})
const binding = schemaMutationTransportBinding({
	codec: schemaMutationWireCodec({
		decode: (value: unknown) => value,
		mutation: archive,
		transport: protocol,
	}),
	metadata: { errors: { 'fixture.archive-rejected': 409 } },
	mutation: archive,
})

const createOwnerPlugin = (bindingCount = 1, selected = true) =>
	definePlugin({
		capabilities:
			bindingCount > 0
				? [
						provideSchemaMutationTransportBinding({
							contributionId: 'rest-binding',
							create: () => ({ value: binding }),
						}),
						...(bindingCount > 1
							? [
									provideSchemaMutationTransportBinding({
										contributionId: 'duplicate-rest-binding',
										create: () => ({ value: binding }),
									}),
								]
							: []),
					]
				: [],
		core: '^0.0.0',
		declare: ({ models, operations, schemas }) => {
			operations.declare(archive)
			schemas.patch({
				operations: [
					addSchemaField({
						contributionId: 'workflow-state',
						field: stringField(),
						name: 'workflowState',
					}),
				],
				targets: schemas.select({ className: Document.className }),
			})
			if (selected)
				models.extend(Document, {
					contributionId: 'archive',
					schemaMutations: {
						archive: { mutation: archive, surfaces: ['schema'] },
					},
				})
		},
		pluginId: 'fixture.schema-mutation-planning.owner',
		privileges: [
			{ name: 'model:extend', reason: 'Attaches archive.' },
			{ name: 'operation:declare', reason: 'Declares archive.' },
			{ name: 'schema:declare', reason: 'Adds workflow state.' },
			{ name: 'transport:expose', reason: 'Binds the transport.' },
		] as const,
		version: '1.0.0',
	})

const planningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
)
const harnessCapability = defineCapability<
	Readonly<{ readonly ready: true }>
>()({
	capabilityId: 'fixture.schema-mutation-planning.harness',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'application',
	version: '1.0.0',
})
interface Harness {
	callbacks?: ApplicationCallbackExecutor
	owner?: PluginIdentity
	planner?: ApplicationOperationTransportPlanner
}
const consumerPlugin = (harness: Harness) =>
	definePlugin({
		capabilities: [
			provideCapability(harnessCapability, {
				contributionId: 'harness',
				create: ({ callbacks, capabilities, owner }) => {
					harness.callbacks = callbacks
					harness.owner = owner
					harness.planner = capabilities.get(planningRequirement)
					return { value: immutableRecord({ ready: true as const }) }
				},
			}),
			planningRequirement,
		],
		core: '^0.0.0',
		pluginId: 'fixture.schema-mutation-planning.consumer',
		privileges: [
			{ name: 'transport:expose', reason: 'Plans the fixture transport.' },
		],
		version: '1.0.0',
	})

const runPlanning = (harness: Harness) => {
	if (
		harness.callbacks === undefined ||
		harness.owner === undefined ||
		harness.planner === undefined
	) {
		throw new TypeError('Planning harness is unavailable')
	}
	return harness.callbacks.runPlugin(harness.owner, () =>
		harness.planner?.planSchemaMutations({ transport: protocol }),
	)
}

describe('application schema mutation transport planning', () => {
	it('returns immutable schema-local descriptors without executable state', async () => {
		const harness: Harness = {}
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [createOwnerPlugin(), consumerPlugin(harness)],
			schemas: [Document],
		})
		const plan = runPlanning(harness)
		expect(plan).toStrictEqual({
			mutations: [
				{
					authority: 'request',
					command: 'archive',
					effect: 'update',
					errors: ['fixture.archive-rejected'],
					metadata: { errors: { 'fixture.archive-rejected': 409 } },
					mutation: archive.name,
					owner: {
						kind: 'plugin',
						pluginId: 'fixture.schema-mutation-planning.owner',
						version: '1.0.0',
					},
					returning: 'after',
					schema: Document.className,
					version: archive.version,
				},
			],
			transport: protocol,
		})
		expect(Object.isFrozen(plan)).toBe(true)
		expect(plan?.mutations[0]).not.toHaveProperty('codec')
		await application.dispose()
	})

	it('leaves bindings with no selected alias dormant', async () => {
		const harness: Harness = {}
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [createOwnerPlugin(1, false), consumerPlugin(harness)],
			schemas: [Document],
		})
		// A provider factory alone cannot add a route or a second execution registry.
		expect(runPlanning(harness)?.mutations).toEqual([])
		await application.dispose()
	})

	it('rejects an owner mismatch before transport startup', async () => {
		const foreign = definePlugin({
			capabilities: [
				provideSchemaMutationTransportBinding({
					contributionId: 'foreign-binding',
					create: () => ({ value: binding }),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-planning.foreign',
			privileges: [
				{ name: 'transport:expose', reason: 'Exercises owner validation.' },
			],
			version: '1.0.0',
		})
		const harness: Harness = {}
		// Ownership now fails at materialization, before a transport can obtain its planner.
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [createOwnerPlugin(0), foreign, consumerPlugin(harness)],
				schemas: [Document],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'schema-mutation-transport-owner-invalid' },
		})
		expect(harness.planner).toBeUndefined()
	})

	it('rejects duplicate bindings before transport startup', async () => {
		const harness: Harness = {}
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [createOwnerPlugin(2), consumerPlugin(harness)],
				schemas: [Document],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'schema-mutation-transport-conflict' },
		})
		expect(harness.planner).toBeUndefined()
	})
})
