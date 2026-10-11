import {
	contributeSchemaMutation,
	defineSchemaMutation,
	type PluginSchemaMutationContribution,
	type PluginSchemaMutationDefinition,
} from '@ultimabase/core/plugin'

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

/** @internal Creates private administration contributions without wire bindings. */
export const createSoftDeleteAdministrationContributions = (): readonly [
	PluginSchemaMutationContribution<typeof restoreMutation>,
	PluginSchemaMutationContribution<typeof purgeMutation>,
] =>
	[
		contributeSchemaMutation({
			mutation: restoreMutation,
			resolve: () => ({
				data: { [softDeleteTombstoneFieldName]: false },
			}),
		}),
		contributeSchemaMutation({
			mutation: purgeMutation,
			resolve: (): undefined => undefined,
		}),
	] as const
