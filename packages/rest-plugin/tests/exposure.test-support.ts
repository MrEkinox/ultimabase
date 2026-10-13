/** Fixtures shared by the ADR-0324 exposure and OpenAPI tests. */
import {
	PluginError,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	databasePointerCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
	dateTimeField,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	contributeOperation,
	defineOperation as defineOperationToken,
	defineOperationValue,
	plugin,
	provideCapability,
} from '@ultimabase/core/plugin'
import { httpPlugin, httpRoutes } from '@ultimabase/http-plugin'
import {
	command,
	defineOperation,
	definePlugin,
	shapeMethod,
} from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { onTestFinished } from 'vitest'
import { z } from 'zod'

import { restPlugin, type RestPluginOptions } from '../src/index.js'

// A database that answers every read with no row; writes never run here.
class EmptyDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
		pointers: databasePointerCapability,
		relationPredicates: databaseRelationPredicateCapability,
		relations: databaseRelationCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		const result: unknown =
			request.operation.kind === 'find-many'
				? []
				: request.operation.kind === 'count'
					? 0
					: request.operation.kind === 'exists'
						? false
						: null
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('The exposure fixture never writes')
	}
}

const databasePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.rest-exposure.database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: new EmptyDatabase() }),
		}),
	],
})

// A facade command plugin: REST binds none of its commands by itself.
const archivePlugin = () =>
	definePlugin({
		name: '@fixture/rest-archive',
		shape: {
			archivable: shapeMethod({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
						target: 'many',
					}),
					purgeOne: command({ authority: 'master', effect: 'delete' }),
				},
			}),
		},
	})

const text = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.text !== 'string') {
		throw new TypeError(`${path}.text must be a string`)
	}
	return immutableRecord({ text: value.text })
})
const operation = (name: string) =>
	defineOperationToken({
		errors: ['fixture.rest-exposure.refused'] as const,
		input: text,
		name: `fixture.rest-exposure.${name}`,
		result: text,
		target: 'application',
		transaction: 'forbidden',
		version: '1.0.0',
	})
export const echo = operation('echo')
export const whisper = operation('whisper')
export const secret = operation('secret')
const echoPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.rest-exposure.operations',
	version: '1.0.0',
	contributions: [
		contributeOperation({
			execute: ({ input }) => {
				if (input.text === 'refuse') {
					throw new PluginError(
						'fixture.rest-exposure.refused',
						'private refusal',
						{ publicMessage: 'Refused.' },
					)
				}
				return input
			},
			operation: echo,
			public: { name: 'echo' },
		}),
		contributeOperation({
			execute: ({ input }) => input,
			operation: whisper,
			public: { name: 'whisper' },
		}),
		// Never public: no transport may expose it.
		contributeOperation({ execute: ({ input }) => input, operation: secret }),
	],
})

export const createInvoice = defineOperation({
	name: 'createInvoice',
	input: z.object({
		customer: z.string().min(2),
		amount: z.number().int().positive(),
	}),
	output: z.object({ invoice: z.string() }),
	handler: ({ input }) => ({
		invoice: `${input.customer}-${String(input.amount)}`,
	}),
})

const ExposureApplication = UltimaBase.use(archivePlugin())
	.use(validationPlugin())
	.use(restPlugin())
export const Note = ExposureApplication.Schema.define({
	className: 'RestExposureNote',
	fields: (field) => ({
		title: field.string({
			required: true,
			validation: z.string().max(20),
		}),
		views: field.int(),
	}),
})
	.archivable()
	.with({ rest: { archiveOne: true, count: true, deleteOne: false } })
export const Draft = ExposureApplication.Schema.define({
	className: 'RestExposureDraft',
	fields: (field) => ({ title: field.string() }),
})
	.archivable()
	.with({ rest: { findMany: true } })
// Relationship fields, to compare the OpenAPI inputs with the REST decoder.
export const Shelf = ExposureApplication.Schema.define({
	className: 'RestExposureShelf',
	fields: (field) => ({
		label: field.string(),
		count: field.int(),
		note: field.pointer({ target: () => Note }),
		pinned: field.pointer({ target: () => Note, required: true }),
		drafts: field.relation({ target: () => Draft }),
	}),
}).with({ rest: { createMany: true, upsertOne: true } })
export const Hidden = ExposureApplication.Schema.define({
	className: 'RestExposureHidden',
	fields: (field) => ({ title: field.string() }),
}).with({ rest: false })

/** Another plugin's routes, to share REST's base path (6.4a amendment). */
export const neighbourPlugin = (paths: readonly string[]) =>
	definePlugin({
		name: '@fixture/rest-neighbour',
		contributions: [
			httpRoutes(
				Object.fromEntries(
					paths.map((path) => [
						`POST ${path}`,
						() => Response.json({ neighbour: path }),
					]),
				),
			),
		],
	})

export const startExposure = async (
	options: RestPluginOptions = {},
	neighbour: ReturnType<typeof neighbourPlugin> = neighbourPlugin([]),
) => {
	const Application = UltimaBase.use(
		databasePlugin,
		archivePlugin(),
		validationPlugin(),
		echoPlugin,
		createInvoice,
		restPlugin({ publicWrites: true, ...options }),
		httpPlugin(),
		neighbour,
	)
	const ultimabase = new Application({
		logger: false,
		schemas: [Note, Draft, Shelf, Hidden],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const http = ultimabase.plugin(httpPlugin)
	const send = async (
		path: string,
		init: RequestInit & { readonly json?: unknown } = {},
	) => {
		const { json, ...rest } = init
		const response = await http.fetch(
			new Request(`http://localhost${path}`, {
				...rest,
				...(json === undefined
					? {}
					: {
							body: JSON.stringify(json),
							headers: { 'Content-Type': 'application/json' },
							method: rest.method ?? 'POST',
						}),
			}),
		)
		const body: unknown = await response.json()
		return { body, response }
	}
	return { send, ultimabase }
}
