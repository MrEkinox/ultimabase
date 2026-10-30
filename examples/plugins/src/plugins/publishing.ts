// A model plugin: the models that use it get a `publishedAt` date, and
// their unpublished rows are drafts, which only editors read.
//#region types
import type {
	Caller,
	Field,
	Payload,
	PluginOf,
	PluginTypes,
	Queries,
	UseOf,
} from 'ultimabase'
import { defineModel, definePlugin, isMaster, master } from 'ultimabase'

type Unique<F> = Parameters<Queries<F>['findUnique']>[0]['where']

/** What `publishing()` adds to a model: `Article.drafts`, `Article.publish`. */
export interface PublishingCommands<F> {
	/** The drafts, under the model's read rule. */
	readonly drafts: Pick<Queries<F>, 'findMany' | 'count'>
	/** Publishes a draft now. */
	readonly publish: (
		this: void,
		args: { readonly where: Unique<F> },
		options?: Parameters<Queries<F>['count']>[1],
	) => Promise<Payload<F, {}>>
}

export interface Publishing extends PluginTypes {
	readonly name: 'publishing'
	/** `publishing({ publishOnCreate: true })`, in a model's `use`. */
	readonly options: { readonly publishOnCreate?: boolean }
	readonly addedFields: {
		readonly publishedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: PublishingCommands<this['fields']>
}
//#endregion

//#region caller-keys
// Every user caller gets `editor`, which rules and hooks read.
declare module 'ultimabase' {
	interface UserCallerKeys {
		readonly editor: boolean
	}
}

/** The users who read drafts and publish them: the plugin's own model. */
export const Editor = defineModel({
	name: 'Editor',
	fields: (f) => ({ userId: f.string({ unique: true }) }),
})

const isEditor = (caller: Caller) =>
	isMaster(caller) || (caller.kind === 'user' && caller.editor)
//#endregion

//#region definition
const definition = definePlugin<Publishing>({
	name: 'publishing',
	// A published plugin imports its package.json instead.
	manifest: {
		name: 'example-publishing',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	models: [Editor],
	//#endregion
	//#region added-fields
	addedFields: (f) => ({
		// Only an editor dates a row, through `publish` or a write.
		publishedAt: f.dateTime({ optional: true }).with({
			access: {
				create: ({ caller }) => isEditor(caller),
				update: ({ caller }) => isEditor(caller),
			},
		}),
	}),
	addedIndexes: [{ fields: ['publishedAt'] }],
	//#endregion
	//#region caller
	caller: async ({ user }) => ({
		editor:
			(await Editor.count({ where: { userId: user.id } }, { as: master })) > 0,
	}),
	//#endregion
	//#region hooks
	hooks: {
		beforeFind: ({ caller, where, command }) => {
			if (command === 'drafts') return where({ publishedAt: null })
			if (isEditor(caller)) return undefined
			return where({ publishedAt: { lte: new Date(Date.now()) } })
		},
		beforeCreate: ({ data, options }) => {
			if (options.publishOnCreate === true) {
				data.publishedAt ??= new Date(Date.now())
			}
		},
	},
	//#endregion
	//#region commands
	commands: ({ queries }) => ({
		drafts: { findMany: queries.findMany, count: queries.count },
		publish: ({ where }, options) =>
			queries.update(
				{ where, data: { publishedAt: new Date(Date.now()) } },
				options,
			),
	}),
	//#endregion
})

//#region exports
/** The entry of a model's `use`. */
export const publishing: UseOf<Publishing> = definition.use
/** The value of the application's `plugins`. */
export const publishingPlugin: PluginOf<Publishing> = definition.plugin
//#endregion
