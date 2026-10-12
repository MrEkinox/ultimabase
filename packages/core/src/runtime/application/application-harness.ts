import { readApplicationRuntimeKernelState } from '../../application/application-kernel-state.js'
import type { MasterRequestAccess } from '../../access/request/access.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type {
	RequestContext,
	RequestContextOptions,
} from '../context/request-context.js'
import { databaseResetCapability } from '../database/adapter-capabilities.js'
import { readHarnessAuthority } from '../engine/application-binding.js'
import type { RequestEngine } from '../engine/request-engine.js'
import { elevateTrustedMasterRequest } from '../master/master-authority.js'
import {
	readStartedUltimaBaseEngine,
	readUltimaBaseKernel,
	type UltimaBase,
} from './ultima-base.js'

/**
 * Powers a test harness holds over one application (ADR-0327). Only the code
 * that opened the harness before the application started holds them.
 */
export interface ApplicationHarness<
	TSchemas extends readonly SchemaDefinition[] = readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[] = readonly PluginDefinition[],
> {
	/**
	 * Creates a request engine with Master authority on the started
	 * application, without a configured key. Each elevation is logged at
	 * `debug` with its reason.
	 *
	 * @example `runWithRequestEngine(await harness.master({ requestId, source: 'test' }), fn)`
	 */
	master<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): Promise<
		RequestEngine<
			TSchemas,
			TPlugins,
			RequestContext<MasterRequestAccess, TSource>
		>
	>
	/**
	 * Empties every table the database adapter manages for the started
	 * application through its reset capability; tables stay in place.
	 *
	 * @example `await harness.resetDatabase()`
	 */
	resetDatabase(): Promise<void>
}

const harnessedApplications = new WeakSet<object>()

/**
 * Opens the test harness of an application that has not started yet
 * (ADR-0327). Master without a key and data reset exist only on the returned
 * object: an application started without a harness can never gain one, and
 * no option, environment variable or transport input opens it.
 *
 * @example
 * ```ts
 * const harness = openApplicationHarness(ultimabase)
 * await ultimabase.start()
 * await harness.resetDatabase()
 * ```
 */
export const openApplicationHarness = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
): ApplicationHarness<TSchemas, TPlugins> => {
	const application = readUltimaBaseKernel(ultimabase)
	if (application.state !== 'idle') {
		throw new TypeError(
			`An application harness must be opened before the application starts; received ${application.state}`,
		)
	}
	if (harnessedApplications.has(application)) {
		throw new TypeError('This application already has a harness')
	}
	harnessedApplications.add(application)

	return Object.freeze({
		master: async <const TRequestSource extends string>(
			options: RequestContextOptions<TRequestSource>,
		) => {
			const engine = readStartedUltimaBaseEngine(ultimabase).anonymous(options)
			const context = await elevateTrustedMasterRequest(
				readHarnessAuthority(application),
				engine.context,
				`Application harness (${options.source})`,
				application,
			)
			return readStartedUltimaBaseEngine(ultimabase).withContext(context)
		},
		resetDatabase: async () => {
			// Reading the engine asserts a started application first.
			readStartedUltimaBaseEngine(ultimabase)
			const reset = readApplicationRuntimeKernelState(application).capability(
				databaseResetCapability,
			)
			if (reset === undefined) {
				throw new TypeError(
					'The database plugin of this application provides no data reset (ultimabase.database-reset)',
				)
			}
			await reset.reset()
		},
	})
}
