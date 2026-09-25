import {
	Schema,
	contributeOperation,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	definePluginModule,
	defineSchemaOption,
	defineTypegenReference,
	intField,
	operationTransportBinding,
	operationWireCodec,
	stringField,
	type JsonObject,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	defineEvent,
	onEvent,
	provideHookContributions,
	provideHookEvent,
	schemaHooks,
} from '@ultimabase/hooks-plugin'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

export interface WorkflowSchemaOption extends JsonObject {
	readonly initialState: 'draft' | 'review'
}

export interface WorkflowTransitionInput {
	readonly reason: string
}

export interface WorkflowTransitionResult {
	readonly schema: string
	readonly state: 'application'
}

export interface WorkflowCommittedPayload extends JsonObject {
	readonly action: string
	readonly auditId: string
}

export const workflowCommittedEvent = defineEvent<WorkflowCommittedPayload>()(
	'fixture.workflow.committed',
	{ delivery: 'required' },
)

const transitionInputReference = defineTypegenReference({
	exportName: 'WorkflowTransitionInput',
	module: '@fixture/open-kernel',
})
const transitionResultReference = defineTypegenReference({
	exportName: 'WorkflowTransitionResult',
	module: '@fixture/open-kernel',
})
const workflowOption = defineSchemaOption<WorkflowSchemaOption>({
	normalize: (value, path) => {
		if (
			!isPlainRecord(value) ||
			(value.initialState !== 'draft' && value.initialState !== 'review')
		) {
			throw new TypeError(`${path}.initialState must be draft or review`)
		}
		return immutableRecord({ initialState: value.initialState })
	},
	protocolVersion: 1,
	typegen: {
		module: '@fixture/open-kernel',
		type: 'WorkflowSchemaOption',
	},
})

const transitionInput = defineOperationValue(
	(value, path): WorkflowTransitionInput => {
		if (!isPlainRecord(value) || typeof value.reason !== 'string') {
			throw new TypeError(`${path}.reason must be a string`)
		}
		return immutableRecord({ reason: value.reason })
	},
	transitionInputReference,
)
const transitionResult = defineOperationValue(
	(value, path): WorkflowTransitionResult => {
		if (
			!isPlainRecord(value) ||
			typeof value.schema !== 'string' ||
			value.state !== 'application'
		) {
			throw new TypeError(`${path} must be a workflow transition result`)
		}
		return immutableRecord({ schema: value.schema, state: value.state })
	},
	transitionResultReference,
)

export const inspectWorkflow = defineOperation({
	input: transitionInput,
	name: 'fixture.workflow.inspect',
	result: transitionResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

export const workflowFakeTransport = defineOperationTransport({
	name: 'fixture.workflow.fake',
	version: '1.0.0',
})
const workflowWireCodec = operationWireCodec({
	decode: (value: Readonly<{ readonly reason: string }>) => value,
	encode: (value) =>
		immutableRecord({ schema: value.schema, state: value.state }),
	operation: inspectWorkflow,
	transport: workflowFakeTransport,
})
const workflowTransportBinding = operationTransportBinding({
	codec: workflowWireCodec,
	operation: inspectWorkflow,
})

const workflowModule = definePluginModule({
	core: '^0.0.0',
	pluginId: 'fixture.open-kernel-workflow',
	version: '1.0.0',
})

export interface WorkflowPluginOptions {
	readonly instanceId: string
	readonly onCommitted?: (payload: WorkflowCommittedPayload) => void
	readonly stableSchema: SchemaDefinition
}

/** Builds one complete workflow proof without using a private framework import. */
export const createWorkflowPlugin = (options: WorkflowPluginOptions) => {
	const dynamicName = `WorkflowAudit${options.instanceId.replace(/[^A-Za-z0-9]/gu, '')}`
	const DynamicAudit = Schema.define({
		className: dynamicName,
		fields: (field) => ({
			action: field.string({ required: true }),
		}),
	})
	const plugin = workflowModule.plugin({
		peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
		capabilities: [
			provideHookContributions('workflow-audit-hooks', () =>
				schemaHooks(DynamicAudit, {
					afterOperation: {
						create: ({ context, item }) => {
							const action = item.action
							if (typeof action !== 'string') {
								throw new TypeError('Workflow audit action must be a string')
							}
							context.emit(workflowCommittedEvent, {
								action,
								auditId: item.id,
							})
						},
					},
				}),
			),
			provideHookEvent(
				'committed-events',
				onEvent<typeof workflowCommittedEvent.name, WorkflowCommittedPayload>({
					handler: ({ event }) => options.onCommitted?.(event.payload),
					name: workflowCommittedEvent.name,
				}),
			),
		],
		operations: [
			contributeOperation({
				bindings: [workflowTransportBinding],
				execute: () =>
					immutableRecord({
						schema: 'application',
						state: 'application' as const,
					}),
				operation: inspectWorkflow,
			}),
		],
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'workflow-options',
				schema: { workflow: workflowOption },
			})
			schemas.add({
				contributionId: 'workflow-audit-schema',
				schema: DynamicAudit,
				staticOptions: { instanceId: options.instanceId },
			})
			schemas.patch(
				patchSchemas({
					patch: schemaPatch()
						.addField({
							contributionId: 'workflow-state',
							field: stringField({ default: 'draft' }),
							name: 'workflowState',
						})
						.addField({
							contributionId: 'workflow-revision',
							field: intField({ default: 0 }),
							name: 'workflowRevision',
						})
						.setSchemaOption({
							contributionId: 'workflow-config',
							name: 'workflow',
							value: { initialState: 'draft' },
						}),
					targets: schemas.select({
						className: options.stableSchema.className,
					}),
				}),
			)
		},
		instanceId: options.instanceId,
		privileges: [
			{ name: 'schema:declare', reason: 'Adds workflow schema declarations.' },
			{ name: 'operation:declare', reason: 'Declares workflow operations.' },
			{
				name: 'transport:expose',
				reason: 'Binds the explicit fake transport.',
			},
			{
				name: 'runtime:intercept',
				reason: 'Contributes the workflow audit lifecycle.',
			},
			{
				name: 'runtime:observe',
				reason: 'Consumes committed workflow events.',
			},
			{
				name: 'typegen:reference',
				reason: 'References workflow public types.',
			},
		] as const,
	})

	return immutableRecord({ DynamicAudit, plugin })
}
