import {
	defineSchemaMutation,
	provideSchemaMutationHandler,
	schemaMutationHandler,
	type CapabilityProviderDeclaration,
	type PluginSchemaMutationDefinition,
	type pluginSchemaMutationHandlerCapability,
} from '@ultimabase/core'

import {
	purgeMutationName,
	restoreMutationName,
	softDeleteNoInput,
} from './contracts.js'
import { softDeleteTombstoneFieldName } from './visibility.js'

/** @internal Restores one exact tombstoned item without exposing a public route. */
export const restoreMutation: PluginSchemaMutationDefinition<
	typeof restoreMutationName,
	'1.0.0',
	undefined,
	readonly [],
	'master',
	'update',
	'after'
> = defineSchemaMutation({
	authority: 'master',
	effect: 'update',
	input: softDeleteNoInput,
	name: restoreMutationName,
	returning: 'after',
	version: '1.0.0',
})

/** @internal Permanently deletes one exact tombstoned item. */
export const purgeMutation: PluginSchemaMutationDefinition<
	typeof purgeMutationName,
	'1.0.0',
	undefined,
	readonly [],
	'master',
	'delete',
	'before'
> = defineSchemaMutation({
	authority: 'master',
	effect: 'delete',
	input: softDeleteNoInput,
	name: purgeMutationName,
	returning: 'before',
	version: '1.0.0',
})

/** @internal Creates only direct execution providers; administration has no transport binding. */
export const createSoftDeleteAdministrationProviders = (): readonly [
	CapabilityProviderDeclaration<typeof pluginSchemaMutationHandlerCapability>,
	CapabilityProviderDeclaration<typeof pluginSchemaMutationHandlerCapability>,
] =>
	[
		provideSchemaMutationHandler({
			contributionId: 'official-soft-delete-restore-handler',
			create: () => ({
				value: schemaMutationHandler({
					mutation: restoreMutation,
					resolve: () => ({
						data: { [softDeleteTombstoneFieldName]: false },
					}),
				}),
			}),
		}),
		provideSchemaMutationHandler({
			contributionId: 'official-soft-delete-purge-handler',
			create: () => ({
				value: schemaMutationHandler({
					mutation: purgeMutation,
					resolve: (): undefined => undefined,
				}),
			}),
		}),
	] as const
