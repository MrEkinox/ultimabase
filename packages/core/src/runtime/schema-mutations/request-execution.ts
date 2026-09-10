import { immutableRecord } from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import {
	assertOperationExecutionOwner,
	type NormalizedOperationOptions,
} from '../../query/operations/execution.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { runWithRequestEngineScope } from '../context/active-framework-storage.js'
import {
	isRequestContext,
	type RequestContext,
} from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import {
	assertApplicationEngineAvailable,
	bindRequestContextToApplication,
} from '../engine/application-binding.js'
import {
	assertMasterElevationPrivilege,
	getFrameworkMasterAuthority,
	readFrameworkMasterAuthority,
} from '../engine/framework-master-authority.js'
import { elevateTrustedMasterRequest } from '../master/master-authority.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import type { TransactionLifetime } from '../transactions/transaction-lifetime.js'
import { executeRuntimeSchemaMutation } from './pipeline-execution.js'
import { getFrameworkSchemaMutationRuntime } from './engine-integration.js'

type RequestSchemaMutationExecutor = (
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
	options: NormalizedOperationOptions,
) => Promise<unknown>

interface SchemaMutationRequestHost {
	readonly createContextEngine: (context: RequestContext) => RequestEngine
	readonly engine: RequestEngine
	readonly pipeline: RuntimePipeline
	readonly runRequiredTransaction: () => Promise<unknown>
	readonly transactionLifetime?: TransactionLifetime
}

interface RequestSchemaMutationHostOptions {
	readonly createContextEngine: (context: RequestContext) => RequestEngine
	readonly engine: RequestEngine
	readonly pipeline: RuntimePipeline
	readonly runTransaction: (
		handler: (engine: RequestEngine) => Promise<unknown>,
	) => Promise<unknown>
	readonly transactionLifetime?: TransactionLifetime
}

const executors = new WeakMap<RequestEngine, RequestSchemaMutationExecutor>()
const noAuthorityOptions: NormalizedOperationOptions = immutableRecord({
	context: undefined,
	ultimabase: undefined,
	useMasterKey: false,
})

/** Installs the private schema-mutation bridge on one request engine. */
export const registerRequestSchemaMutationExecutor = (
	engine: RequestEngine,
	executor: RequestSchemaMutationExecutor,
): void => {
	executors.set(engine, executor)
}

/** Installs all request-local schema-mutation orchestration in one bounded bridge. */
export const registerRequestSchemaMutationHost = (
	options: RequestSchemaMutationHostOptions,
): void => {
	registerRequestSchemaMutationExecutor(
		options.engine,
		(command, schema, envelope, operationOptions) =>
			executeSchemaMutationRequest(
				{
					createContextEngine: options.createContextEngine,
					engine: options.engine,
					pipeline: options.pipeline,
					runRequiredTransaction: () =>
						options.runTransaction((transaction) =>
							executeRequestSchemaMutation(
								transaction,
								command,
								schema,
								envelope,
								noAuthorityOptions,
							),
						),
					...(options.transactionLifetime === undefined
						? {}
						: { transactionLifetime: options.transactionLifetime }),
				},
				command,
				schema,
				envelope,
				operationOptions,
			),
	)
}

/** Enters the private bridge without adding schema mutations to RequestEngine's API. */
export const executeRequestSchemaMutation = (
	engine: RequestEngine,
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
	options: NormalizedOperationOptions,
): Promise<unknown> => {
	const executor = executors.get(engine)
	if (executor === undefined) {
		throw new TypeError('Request schema mutation execution is unavailable')
	}
	return executor(command, schema, envelope, options)
}

const assertEnvelope = (
	host: SchemaMutationRequestHost,
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
): void => {
	const surface = host.engine.application.getSchemaSurface(schema.className)
	const installed = surface?.schemaMutations.get(envelope.command)
	const installedModel = surface?.modelMutations.get(envelope.command)
	const envelopeKind: unknown = envelope.kind
	if (
		!host.engine.application.ownsSchema(schema) ||
		(installed !== command && installedModel !== command) ||
		envelopeKind !== 'plugin-schema-mutation' ||
		envelope.mutation !== command.mutation ||
		envelope.id.length === 0 ||
		envelope.query.schema.definition !== schema
	) {
		throw new FrameworkError(
			'PLUGIN_OPERATION_INVALID',
			'Schema mutation envelope does not match the installed declaration.',
			{
				publicMessage: 'The requested operation is not available.',
				internalDetails: { kind: 'schema-mutation-envelope-mismatch' },
			},
		)
	}
}

const resolveRequestContext = async (
	host: SchemaMutationRequestHost,
	command: CompiledSchemaMutationCommand,
	options: NormalizedOperationOptions,
): Promise<RequestContext> => {
	let context = host.engine.context
	if (options.context !== undefined) {
		if (!isRequestContext(options.context)) {
			throw new TypeError('operation context must be a RequestContext instance')
		}
		bindRequestContextToApplication(
			host.engine.application,
			options.context,
			readFrameworkMasterAuthority(host.engine.framework),
		)
		context = options.context
	}
	if (options.useMasterKey) {
		assertMasterElevationPrivilege(host.engine.application)
		context = await elevateTrustedMasterRequest(
			getFrameworkMasterAuthority(host.engine.framework),
			context,
			`Schema mutation ${command.mutation.name}`,
			host.engine.application,
		)
	}
	return context
}

/** Resolves authority, transaction scope, and the logical Runtime entry point. */
export const executeSchemaMutationRequest = async (
	host: SchemaMutationRequestHost,
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
	options: NormalizedOperationOptions,
): Promise<unknown> => {
	assertApplicationEngineAvailable(host.engine.application)
	assertOperationExecutionOwner(options.ultimabase, host.engine.application)
	assertEnvelope(host, command, schema, envelope)
	const context = await resolveRequestContext(host, command, options)
	if (context !== host.engine.context) {
		return executeRequestSchemaMutation(
			host.createContextEngine(context),
			command,
			schema,
			envelope,
			noAuthorityOptions,
		)
	}
	if (
		command.mutation.authority === 'master' &&
		context.access.mode !== 'master'
	) {
		throw new FrameworkError(
			'MASTER_ACCESS_DENIED',
			`Schema mutation ${command.mutation.name} requires Master authority.`,
			{ publicMessage: 'Master access is required.' },
		)
	}
	if (host.transactionLifetime === undefined) {
		return host.runRequiredTransaction()
	}

	const execution = await host.transactionLifetime.run(() =>
		runWithRequestEngineScope(host.engine, () =>
			executeRuntimeSchemaMutation(host.pipeline, {
				command,
				context,
				envelope,
				runtime: getFrameworkSchemaMutationRuntime(host.engine.framework),
				schema,
			}),
		),
	)
	return materializeOperationResult(
		execution.operation as never,
		execution.result as never,
	)
}
