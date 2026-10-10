import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	contributeDeclarations,
	contributeSchemaMutation,
	defineCapability,
	defineOperationValue,
	plugin as createPlugin,
	defineSchemaMutation,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '../../foundation.js'
import { createApplication } from '../../application/framework-application.js'
import { addSchemaField } from '../../plugins/schema-field-patch-operations.js'
import { stringField } from '../../schema/index.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from '../schema-mutations/transport-capabilities.js'
import {
	applicationOperationTransportPlanningCapability,
	type ApplicationOperationTransportPlanner,
} from './application-operation-transport-planning.js'
import { UltimaBase } from './ultima-base.js'

const Document = UltimaBase.Schema.define({
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
	createPlugin({
		id: 'fixture.schema-mutation-planning.owner',
		core: '^0.0.0',
		version: '1.0.0',
		permissions: {
			'model:extend': 'Attaches archive.',
			'operation:declare': 'Declares archive.',
			'persistence:rewrite': 'Persists archive.',
			'schema:declare': 'Adds workflow state.',
			...(bindingCount > 0
				? { 'transport:expose': 'Binds the transport.' }
				: {}),
		},
		contributions: [
			contributeSchemaMutation({
				bindings: Array.from({ length: bindingCount }, () => binding),
				mutation: archive,
				resolve: () => ({ data: { workflowState: 'archived' } }),
			}),
			contributeDeclarations({
				schema: ({ schemas }) => {
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
				},
				models: ({ models }) => {
					if (selected)
						models.extend(Document, {
							contributionId: 'archive',
							schemaMutations: {
								archive: { mutation: archive, surfaces: ['schema'] },
							},
						})
				},
			}),
		],
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
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.schema-mutation-planning.consumer',
		permissions: { 'transport:expose': 'Plans the fixture transport.' },
		version: '1.0.0',
		contributions: [
			withPluginPrivileges(
				provideCapability(harnessCapability, {
					contributionId: 'harness',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.owner = owner
						harness.planner = capabilities.get(planningRequirement)
						return { value: immutableRecord({ ready: true as const }) }
					},
				}),
				['transport:expose'],
			),
			planningRequirement,
		],
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
			logger: false,
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
			logger: false,
			plugins: [createOwnerPlugin(1, false), consumerPlugin(harness)],
			schemas: [Document],
		})
		// A provider factory alone cannot add a route or a second execution registry.
		expect(runPlanning(harness)?.mutations).toEqual([])
		await application.dispose()
	})

	it('rejects duplicate bindings before transport startup', async () => {
		const harness: Harness = {}
		await expect(
			createApplication({
				logger: false,
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
