import {
	Schema,
	defineEvent,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	defineSchemaOption,
	intField,
	onEvent,
	operationTransportBinding,
	operationWireCodec,
	optionalCapability,
	provideOperationTransportBinding,
	provideRuntimeObserver,
	stringField,
	type PluginOperationExecutionTarget,
	type JsonObject,
	type SchemaDefinition,
	typegenEmitterCapability,
} from '@ultimabase/core'
import {
	definePluginModule,
	defineTypegenModule,
	patchSchemas,
	providePluginOperation,
	schemaPatch,
} from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

export interface WorkflowSchemaOption extends JsonObject {
	readonly initialState: 'draft' | 'review'
}

export interface WorkflowTransitionInput {
	readonly reason: string
}

export interface WorkflowTransitionResult {
	readonly schema: string
	readonly state: 'application' | 'draft' | 'persisted' | 'schema'
}

export interface WorkflowCommittedPayload extends JsonObject {
	readonly action: string
	readonly auditId: string
}

export const workflowCommittedEvent = defineEvent<WorkflowCommittedPayload>()(
	'fixture.workflow.committed',
	{ delivery: 'required' },
)

const workflowTypes = defineTypegenModule('@fixture/open-kernel')
const transitionInputReference = workflowTypes.reference(
	'WorkflowTransitionInput',
)
const transitionResultReference = workflowTypes.reference(
	'WorkflowTransitionResult',
)
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
		module: workflowTypes.module,
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
			(value.state !== 'application' &&
				value.state !== 'draft' &&
				value.state !== 'persisted' &&
				value.state !== 'schema')
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
export const publishWorkflowSchema = defineOperation({
	input: transitionInput,
	name: 'fixture.workflow.publish-schema',
	result: transitionResult,
	target: 'schema',
	transaction: 'required',
	version: '1.0.0',
})
export const publishWorkflowModel = defineOperation({
	input: transitionInput,
	name: 'fixture.workflow.publish-model',
	result: transitionResult,
	target: 'model',
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
const emitter = optionalCapability(typegenEmitterCapability, '^1.0.0')

const targetResult = (
	target: PluginOperationExecutionTarget,
): WorkflowTransitionResult => {
	if (target.kind === 'application') {
		return immutableRecord({ schema: 'application', state: 'application' })
	}
	if (target.kind === 'schema') {
		return immutableRecord({ schema: target.schema.className, state: 'schema' })
	}
	return immutableRecord({
		schema: target.schema.className,
		state: target.state,
	})
}

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
			action: field.string({ validation: { required: true } }),
		}),
		hooks: {
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
		},
	})
	const targetSchemas = [options.stableSchema, DynamicAudit] as const
	const plugin = workflowModule.plugin({
		capabilities: {
			optional: [emitter],
			provides: [
				providePluginOperation({
					contributionId: 'inspect-handler',
					execute: ({ target }) => targetResult(target),
					operation: inspectWorkflow,
				}),
				providePluginOperation({
					contributionId: 'schema-handler',
					execute: ({ target }) => targetResult(target),
					operation: publishWorkflowSchema,
				}),
				providePluginOperation({
					contributionId: 'model-handler',
					execute: ({ target }) => targetResult(target),
					operation: publishWorkflowModel,
				}),
				provideOperationTransportBinding({
					contributionId: 'fake-transport',
					create: () => ({ value: workflowTransportBinding }),
				}),
				provideRuntimeObserver({
					contributionId: 'committed-events',
					create: () => ({
						value: onEvent<
							typeof workflowCommittedEvent.name,
							WorkflowCommittedPayload
						>({
							handler: ({ event }) => options.onCommitted?.(event.payload),
							name: workflowCommittedEvent.name,
						}),
					}),
				}),
			],
		},
		declare: ({
			models,
			operations,
			schemas,
			typegenContributions,
			typegenReferences,
		}) => {
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
			operations.declare(inspectWorkflow)
			operations.declare(publishWorkflowSchema)
			operations.declare(publishWorkflowModel)
			for (const target of targetSchemas) {
				models.extend(target, {
					contributionId: `workflow-surfaces:${target.className}`,
					modelCommands: { publish: publishWorkflowModel },
					schemaCommands: { publish: publishWorkflowSchema },
				})
			}
			if (typegenReferences !== undefined) {
				typegenReferences.register(transitionInputReference)
				typegenReferences.register(transitionResultReference)
			}
			typegenContributions?.add({
				contributionId: 'workflow-contracts',
				declarations: [
					{
						description: 'One immutable workflow history entry.',
						kind: 'type',
						name: 'WorkflowHistoryEntry',
						type: {
							kind: 'object',
							properties: [
								{
									name: 'at',
									readonly: true,
									type: { kind: 'string' },
								},
								{
									name: 'state',
									readonly: true,
									type: {
										kind: 'union',
										values: [
											{ kind: 'literal', value: 'draft' },
											{ kind: 'literal', value: 'review' },
										],
									},
								},
							],
						},
					},
				],
				staticOptions: { instanceId: options.instanceId },
			})
		},
		instanceId: options.instanceId,
		privileges: [
			{ name: 'schema:declare', reason: 'Adds workflow schema declarations.' },
			{ name: 'model:extend', reason: 'Adds workflow handle commands.' },
			{ name: 'operation:declare', reason: 'Declares workflow operations.' },
			{
				name: 'transport:expose',
				reason: 'Binds the explicit fake transport.',
			},
			{
				name: 'runtime:observe',
				reason: 'Consumes committed workflow events.',
			},
			{
				name: 'typegen:reference',
				reason: 'References workflow public types.',
				when: emitter,
			},
			{
				name: 'typegen:contribute',
				reason: 'Contributes workflow declarations.',
				when: emitter,
			},
		] as const,
	})

	return immutableRecord({ DynamicAudit, plugin })
}
