import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import validatePackageName from 'validate-npm-package-name'

import {
	isPluginId,
	officialPlugins,
	selectedPluginIds,
	type ApiId,
	type PluginId,
} from './catalog.js'

export type Language = 'ts' | 'js'
export type Starter = 'task' | 'empty'
export type Database = 'existing' | 'docker'
export type PackageManager = 'npm' | 'yarn' | 'pnpm'

export interface SelectionInput {
	readonly name?: string
	readonly directory?: string
	readonly language?: Language
	readonly apis?: readonly ApiId[]
	readonly plugins?: readonly PluginId[]
	readonly starter?: Starter
	readonly database?: Database
	readonly packageManager?: PackageManager
	readonly install?: boolean
}

export interface ParsedOptions extends SelectionInput {
	readonly yes: boolean
	readonly help: boolean
}

export interface InitializerPlan {
	readonly name: string
	readonly destination: string
	readonly language: Language
	readonly apis: readonly ApiId[]
	readonly requestedPlugins: readonly PluginId[]
	readonly plugins: readonly PluginId[]
	readonly automaticPlugins: readonly PluginId[]
	readonly starter: Starter
	readonly database: Database
	readonly packageManager: PackageManager
	readonly install: boolean
	readonly typegen: boolean
}

const oneOf = <const T extends string>(
	value: string,
	options: readonly T[],
	flag: string,
): T => {
	const match = options.find((option) => option === value)
	if (match === undefined)
		throw new Error(`${flag} must be one of: ${options.join(', ')}`)
	return match
}

/** Parse only declared automation flags; unknown values fail before any destination write. */
export const parseOptions = (args: readonly string[]): ParsedOptions => {
	const parsed = parseArgs({
		args: [...args],
		strict: true,
		allowPositionals: false,
		options: {
			name: { type: 'string' },
			directory: { type: 'string' },
			language: { type: 'string' },
			api: { type: 'string', multiple: true },
			plugin: { type: 'string', multiple: true },
			starter: { type: 'string' },
			database: { type: 'string' },
			'package-manager': { type: 'string' },
			install: { type: 'boolean' },
			'no-install': { type: 'boolean' },
			yes: { type: 'boolean' },
			help: { type: 'boolean', short: 'h' },
		},
	})
	const values = parsed.values
	if (values.install && values['no-install'])
		throw new Error('--install conflicts with --no-install')
	const apiValues = values.api?.map((value) =>
		oneOf(value, ['rest', 'graphql'], '--api'),
	)
	const pluginValues = values.plugin?.map((value) => {
		if (!value.startsWith('@ultimabase/'))
			throw new Error(`Use the full official package ID for --plugin: ${value}`)
		const id = value.slice('@ultimabase/'.length)
		if (!isPluginId(id)) throw new Error(`Unknown official plugin: ${value}`)
		return id
	})
	return {
		...(values.name !== undefined && { name: values.name }),
		...(values.directory !== undefined && { directory: values.directory }),
		...(values.language !== undefined && {
			language: oneOf(values.language, ['ts', 'js'], '--language'),
		}),
		...(apiValues !== undefined && { apis: apiValues }),
		...(pluginValues !== undefined && { plugins: pluginValues }),
		...(values.starter !== undefined && {
			starter: oneOf(values.starter, ['task', 'empty'], '--starter'),
		}),
		...(values.database !== undefined && {
			database: oneOf(values.database, ['existing', 'docker'], '--database'),
		}),
		...(values['package-manager'] !== undefined && {
			packageManager: oneOf(
				values['package-manager'],
				['npm', 'yarn', 'pnpm'],
				'--package-manager',
			),
		}),
		...(values.install !== undefined || values['no-install'] !== undefined
			? { install: Boolean(values.install) }
			: {}),
		yes: Boolean(values.yes),
		help: Boolean(values.help),
	}
}

export const detectPackageManager = (
	agent: string | undefined,
): PackageManager | undefined => {
	const name = agent?.split('/')[0]
	return name === 'npm' || name === 'yarn' || name === 'pnpm' ? name : undefined
}

const unique = <T extends string>(values: readonly T[]): T[] => [
	...new Set(values),
]

/** Resolve one immutable model used by prompts, flags, preview, and later generation. */
export const resolveSelection = (
	input: SelectionInput,
	cwd: string,
): InitializerPlan => {
	if (!input.name) throw new Error('Project name is required (--name).')
	const validation = validatePackageName(input.name)
	if (!validation.validForNewPackages) {
		throw new Error(
			`Invalid npm package name "${input.name}": ${[...(validation.errors ?? []), ...(validation.warnings ?? [])].join('; ')}`,
		)
	}
	const directory = input.directory ?? input.name.split('/').at(-1)
	if (!directory?.trim())
		throw new Error('Destination directory is required (--directory).')
	const destination = path.resolve(cwd, directory)
	if (
		destination === path.parse(destination).root ||
		destination === cwd ||
		existsSync(destination)
	) {
		throw new Error(`Destination already exists or is unsafe: ${destination}`)
	}
	const apis = unique(input.apis ?? []).map((api) =>
		oneOf(api, ['rest', 'graphql'], '--api'),
	)
	// Programmatic JavaScript callers can pass any string.
	const requestedPluginValues: readonly string[] = input.plugins ?? []
	const requestedPlugins = unique(requestedPluginValues).map((id) => {
		if (!isPluginId(id)) throw new Error(`Unknown official plugin: ${id}`)
		return id
	})
	const selected = selectedPluginIds(apis, requestedPlugins)
	const plugins = officialPlugins
		.map((plugin) => plugin.id)
		.filter((id) => selected.has(id))
	const starter = input.starter ?? 'task'
	if (starter === 'empty' && selected.has('graphql-plugin')) {
		throw new Error(
			'The empty starter cannot enable GraphQL: GraphQL requires at least one public query field. Choose --starter task.',
		)
	}
	const language = input.language ?? 'ts'
	return Object.freeze({
		name: input.name,
		destination,
		language,
		apis: Object.freeze(apis),
		requestedPlugins: Object.freeze(requestedPlugins),
		plugins: Object.freeze(plugins),
		automaticPlugins: Object.freeze(
			plugins.filter((id) => !requestedPlugins.includes(id)),
		),
		starter,
		database: input.database ?? 'existing',
		packageManager: input.packageManager ?? 'npm',
		install: input.install ?? true,
		typegen: language === 'ts',
	})
}

/** Values whose condition holds, in declaration order. */
export const included = <T>(entries: readonly (readonly [boolean, T])[]): T[] =>
	entries.flatMap(([enabled, value]) => (enabled ? [value] : []))

export const hasPlugin = (plan: InitializerPlan, id: PluginId): boolean =>
	plan.plugins.includes(id)

/** REST or GraphQL schema exposure, with or without an HTTP transport. */
export const hasDataApi = (plan: InitializerPlan): boolean =>
	hasPlugin(plan, 'rest-plugin') || hasPlugin(plan, 'graphql-plugin')
