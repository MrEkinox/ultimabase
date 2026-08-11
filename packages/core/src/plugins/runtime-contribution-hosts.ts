import type { PluginPrivilege } from './manifest.js'
import {
	getEnforcementContributionImplementation,
	type ConstraintDefinition,
	type GuardDefinition,
	type InputRestrictionDefinition,
	type OutputRestrictionDefinition,
	type SelectionRestrictionDefinition,
} from '../runtime/enforcement/definitions.js'
import {
	getRuntimeContributionImplementation,
	type AfterOperationDefinition,
	type BeforeOperationDefinition,
	type PostCommitEventDefinition,
	type PreparedOperationDefinition,
} from '../runtime/hooks/definitions.js'
import {
	getHookEventImplementation,
	type HookEventDefinition,
} from '../runtime/hooks/events.js'
import {
	getRuntimePipelineStageImplementation,
	type RuntimePipelineStageDefinition,
	type RuntimePipelineStageName,
} from '../runtime/pipeline/definitions.js'
import type { OperationKind } from '../query/index.js'
import type { DatabaseConstraintNode } from '../runtime/database/contracts.js'
import type { JsonDocument, SchemaDefinition } from '../schema/index.js'

/** Registers only provenance-protected Runtime interception or enforcement definitions. */
export interface PluginRuntimeContributionDefinition {
	readonly kind:
		| 'after-operation'
		| 'before-operation'
		| 'constraint'
		| 'guard'
		| 'prepared-operation'
		| 'restrictInput'
		| 'restrictOutput'
		| 'restrictSelection'
	readonly operations: readonly OperationKind[] | undefined
	readonly schema: SchemaDefinition | undefined
}

export interface PluginRuntimeContributionHost {
	register<
		TSchema extends SchemaDefinition,
		TOperationKind extends OperationKind,
	>(
		name: string,
		definition:
			| AfterOperationDefinition<TSchema, TOperationKind>
			| BeforeOperationDefinition<TSchema, TOperationKind>
			| GuardDefinition<TSchema, TOperationKind>
			| InputRestrictionDefinition<TSchema, TOperationKind>
			| OutputRestrictionDefinition<TSchema, TOperationKind>
			| SelectionRestrictionDefinition<TSchema, TOperationKind>,
	): void
	register<
		TSchema extends SchemaDefinition,
		TOperationKind extends OperationKind,
		TConstraint extends DatabaseConstraintNode,
	>(
		name: string,
		definition: ConstraintDefinition<TSchema, TOperationKind, TConstraint>,
	): void
	register<TSchema extends SchemaDefinition>(
		name: string,
		definition: PreparedOperationDefinition<TSchema>,
	): void
	register(name: string, definition: PluginRuntimeContributionDefinition): void
}

/** Registers only post-commit observers and named event consumers. */
export interface PluginEventContributionHost {
	register<
		TSchema extends SchemaDefinition,
		TOperationKind extends OperationKind,
	>(
		name: string,
		definition: PostCommitEventDefinition<TSchema, TOperationKind>,
	): void
	register<TName extends string, TPayload extends JsonDocument>(
		name: string,
		definition: HookEventDefinition<TName, TPayload>,
	): void
}

/** Registers only provenance-protected handlers for the fixed Runtime pipeline positions. */
export interface PluginRuntimePipelineHost {
	register<TStage extends RuntimePipelineStageName>(
		name: string,
		definition: RuntimePipelineStageDefinition<TStage>,
	): void
}

interface CreateContributionHostOptions {
	readonly assertPrivilege: (privilege: PluginPrivilege) => void
	readonly isOpen: () => boolean
	readonly register: (name: string, value: unknown) => void
}

const assertSetupOpen = (isOpen: () => boolean, host: string): void => {
	if (!isOpen()) {
		throw new TypeError(
			`${host} contributions can only be registered during setup`,
		)
	}
}

/** Creates the exact Core-owned host for low-level Runtime contributions. */
export const createPluginRuntimeContributionHost = ({
	assertPrivilege,
	isOpen,
	register,
}: CreateContributionHostOptions): PluginRuntimeContributionHost =>
	Object.freeze({
		register: (name: string, definition: unknown): void => {
			assertSetupOpen(isOpen, 'Runtime')
			const enforcement = getEnforcementContributionImplementation(definition)

			if (enforcement !== undefined) {
				assertPrivilege('runtime:constrain')
				register(name, definition)
				return
			}

			const runtime = getRuntimeContributionImplementation(definition)
			if (runtime === undefined || runtime.kind === 'post-commit-event') {
				throw new TypeError(
					'Runtime contributions must be created by a Runtime interception or enforcement factory',
				)
			}

			assertPrivilege('runtime:intercept')
			register(name, definition)
		},
	})

/** Creates the exact Core-owned host for post-commit event work. */
export const createPluginEventContributionHost = ({
	assertPrivilege,
	isOpen,
	register,
}: CreateContributionHostOptions): PluginEventContributionHost =>
	Object.freeze({
		register: (name: string, definition: unknown): void => {
			assertSetupOpen(isOpen, 'Event')
			const runtime = getRuntimeContributionImplementation(definition)
			const namedEvent = getHookEventImplementation(definition)

			if (runtime?.kind !== 'post-commit-event' && namedEvent === undefined) {
				throw new TypeError(
					'Event contributions must be created by postCommitEvent or onEvent',
				)
			}

			assertPrivilege('runtime:observe')
			register(name, definition)
		},
	})

/** Creates the exact Core-owned host for the fixed Runtime pipeline positions. */
export const createPluginRuntimePipelineHost = ({
	assertPrivilege,
	isOpen,
	register,
}: CreateContributionHostOptions): PluginRuntimePipelineHost =>
	Object.freeze({
		register: (name: string, definition: unknown): void => {
			assertSetupOpen(isOpen, 'Runtime pipeline')

			if (getRuntimePipelineStageImplementation(definition) === undefined) {
				throw new TypeError(
					'Runtime pipeline contributions must be created by runtimePipelineStage',
				)
			}

			assertPrivilege('runtime:intercept')
			register(name, definition)
		},
	})
