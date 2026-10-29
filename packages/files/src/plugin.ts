// `filesPlugin({ storage, access })` (D-152): the plugin of the `file` field
// type, which runs its hooks on every model holding a file field, owns
// `FilesBlob`, sweeps what a crash left and serves `POST /files`.
import type { Http } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type {
	CallerRule,
	ExposedModel,
	Identity,
	PluginOf,
	PluginTypes,
} from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { FileOptions } from './field.ts'
import type { Checked } from './lifecycle.ts'
import {
	attach,
	check,
	deleteHeld,
	deleteLost,
	release,
	resolve,
	sweep,
} from './lifecycle.ts'
import { FilesBlob } from './model.ts'
import type { FileBody, FileStorage } from './storage.ts'
import { upload } from './upload.ts'
import { runningOf, useRunning } from './values.ts'

/** What `filesPlugin` takes (D-152). */
export interface FilesOptions {
	readonly storage: FileStorage
	readonly access?: {
		/** A signed-in user by default; Master always may. */
		readonly upload?: CallerRule
	}
}

/** The files plugin's types (D-57). */
export interface Files extends PluginTypes {
	readonly name: 'files'
	readonly appOptions: FilesOptions
	readonly requires: Http
}

/** Ten minutes, between two sweeps. */
const sweepEvery = 10 * 60 * 1000

/** Each model's file fields, with the options `file()` checked. */
function fieldsOf(
	models: readonly ExposedModel[],
): ReadonlyMap<string, ReadonlyMap<string, FileOptions>> {
	const fields = new Map<string, ReadonlyMap<string, FileOptions>>()
	for (const model of models) {
		const own = Object.entries(model.fieldTypes).flatMap(([field, type]) =>
			type.plugin === 'files'
				? [[field, type.options as FileOptions] as const]
				: [],
		)
		if (own.length > 0) fields.set(model.schema.name, new Map(own))
	}
	return fields
}

const signedIn: CallerRule = ({ caller }) => caller.kind === 'user'

// The sweep's timer, while the application runs.
let timer: NodeJS.Timeout | undefined

/** Sweeps, then again every ten minutes; a failed sweep is logged. */
async function sweeping(): Promise<void> {
	try {
		await sweep()
	} catch (error) {
		runningOf().logger.warn({ err: error }, 'The files sweep failed.')
	}
}

const definition = definePlugin<Files>({
	name: 'files',
	manifest,
	requires: { http: httpPlugin },
	models: [FilesBlob],
	hooks: {
		beforeCreate: (facts) => resolve(facts),
		beforeUpdate: (facts) => resolve(facts),
		afterCreate: (facts) => attach(facts),
		afterUpdate: (facts) => attach(facts),
		afterDelete: (facts) => release(facts),
		afterUpdateCommit: (facts) => deleteLost(facts),
		afterDeleteCommit: (facts) => deleteHeld(facts),
	},
	start: async ({ options, models, logger }) => {
		const { storage, access } = options
		storage.start()
		const fields = fieldsOf(models)
		useRunning({ storage, upload: access?.upload ?? signedIn, fields, logger })
		await sweeping()
		timer = setInterval(() => void sweeping(), sweepEvery)
		timer.unref()
	},
	stop: () => {
		clearInterval(timer)
		timer = undefined
		useRunning(undefined)
	},
})

/** Files for the application's file fields; it requires `httpPlugin()`. */
export const filesPlugin: PluginOf<Files> = definition.plugin

/** What `files.upload` takes. */
export interface UploadArgs {
	/** The field the file is for: `Post.cover`. */
	readonly for: string
	readonly name: string
	readonly as?: Identity
}

/** The running files plugin, from server code (D-152). */
export const files: {
	/** Stores a file as `POST /files` does, and gives its id. */
	upload(
		body: Uint8Array | Blob,
		args: UploadArgs,
	): Promise<{ readonly id: string }>
	/** Compares the storage's keys with `FilesBlob`. */
	check(options?: { readonly delete?: boolean }): Promise<Checked>
} = {
	upload: (body, args) => {
		const given: FileBody = body instanceof Uint8Array ? body : body.stream()
		const type = body instanceof Uint8Array ? undefined : body.type
		return upload(given, body instanceof Uint8Array ? body.length : body.size, {
			...args,
			type,
		})
	},
	check: (options) => check(options),
}
