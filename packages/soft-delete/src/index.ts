// Soft delete (D-17, D-89, D-96): a deleted row gets a `deletedAt` date and
// leaves every ordinary read; `trash` reads it, `restore` brings it back.
import type {
	Field,
	Payload,
	PluginOf,
	PluginTypes,
	Queries,
	UseOf,
} from 'ultimabase'
import { definePlugin, master } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }

export interface SoftDeleteCommands<F> {
	/** The deleted rows, under the model's read rule. */
	readonly trash: Pick<
		Queries<F>,
		'findMany' | 'findFirst' | 'findUnique' | 'count'
	>
	/** Brings a deleted row back, under the model's update rule. */
	readonly restore: (
		this: void,
		args: { readonly where: Unique<F> },
		options?: Parameters<Queries<F>['count']>[1],
	) => Promise<Payload<F, {}>>
}

type Unique<F> = Parameters<Queries<F>['findUnique']>[0]['where']

/** The soft delete plugin's types (D-57). */
export interface SoftDelete extends PluginTypes {
	readonly name: 'softDelete'
	readonly addedFields: {
		readonly deletedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: SoftDeleteCommands<this['fields']>
}

const softDeleteDefinition = definePlugin<SoftDelete>({
	name: 'softDelete',
	manifest,
	addedFields: (f) => ({
		// Only Master dates a row: a caller deletes through the delete rule.
		deletedAt: f.dateTime({ optional: true }).with({
			access: { create: () => false, update: ({ value }) => value === null },
		}),
	}),
	hooks: {
		// A command reads the trash; every other query, the rows not deleted.
		beforeFind: ({ where, command }) =>
			where({ deletedAt: command === undefined ? null : { not: null } }),
	},
	// Runs after the `delete` access rule and the `beforeDelete` hooks.
	redirect: {
		delete: ({ where, queries }) =>
			queries.update(
				{ where, data: { deletedAt: new Date(Date.now()) } },
				{ as: master },
			),
	},
	commands: ({ queries }) => ({
		trash: {
			findMany: queries.findMany,
			findFirst: queries.findFirst,
			findUnique: queries.findUnique,
			count: queries.count,
		},
		restore: ({ where }, options) =>
			queries.update({ where, data: { deletedAt: null } }, options),
	}),
})

export const softDelete: UseOf<SoftDelete> = softDeleteDefinition.use
export const softDeletePlugin: PluginOf<SoftDelete> =
	softDeleteDefinition.plugin
