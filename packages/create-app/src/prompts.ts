import * as clack from '@clack/prompts'
import path from 'node:path'

import {
	apiPlugins,
	officialPlugins,
	pluginDependencies,
	pluginGroups,
	type ApiId,
	type PluginId,
} from './catalog.js'
import {
	detectPackageManager,
	resolveSelection,
	type Database,
	type InitializerPlan,
	type Language,
	type PackageManager,
	type ParsedOptions,
	type Starter,
} from './config.js'

export interface PluginChoice {
	readonly id: PluginId
	readonly label: string
	readonly group: string
	readonly hint: string
	readonly required: boolean
}

/** Keep terminal rendering outside the selection flow so decisions are deterministic in tests. */
export interface PromptAdapter {
	name(): Promise<string | null>
	directory(defaultName: string): Promise<string | null>
	language(): Promise<Language | null>
	apis(): Promise<readonly ApiId[] | null>
	plugins(choices: readonly PluginChoice[]): Promise<readonly PluginId[] | null>
	starter(): Promise<Starter | null>
	database(): Promise<Database | null>
	packageManager(): Promise<PackageManager | null>
	install(): Promise<boolean | null>
	confirm(plan: InitializerPlan): Promise<boolean | null>
	print(plan: InitializerPlan): void
}

export class CancelledError extends Error {
	constructor() {
		super('Project creation cancelled.')
	}
}

const requiredValue = <T>(value: T | null): T => {
	if (value === null) throw new CancelledError()
	return value
}

export const requiredPluginIds = (
	apis: readonly ApiId[],
): ReadonlySet<PluginId> => {
	const required = new Set<PluginId>([
		'postgres-plugin',
		...apis.map((api) => apiPlugins[api]),
	])
	let count = -1
	while (count !== required.size) {
		count = required.size
		for (const id of required)
			for (const dependency of pluginDependencies[id] ?? [])
				required.add(dependency)
	}
	return required
}

export const pluginChoices = (
	apis: readonly ApiId[],
): readonly PluginChoice[] => {
	const required = requiredPluginIds(apis)
	return officialPlugins.map((plugin) => ({
		...plugin,
		required: required.has(plugin.id),
	}))
}

const missingFlags = (
	options: ParsedOptions,
	detectedManager: PackageManager | undefined,
): string[] => {
	const missing: string[] = []
	if (options.name === undefined) missing.push('--name')
	if (options.language === undefined) missing.push('--language')
	if (options.apis === undefined) missing.push('--api (or --yes for none)')
	if (options.plugins === undefined)
		missing.push('--plugin (or --yes for none)')
	if (options.starter === undefined) missing.push('--starter')
	if (options.database === undefined) missing.push('--database')
	if (options.packageManager === undefined && detectedManager === undefined)
		missing.push('--package-manager')
	if (options.install === undefined) missing.push('--install or --no-install')
	return missing
}

/** The same flow accepts prompt answers and flags, then validates one final plan. */
export const collectSelection = async (
	options: ParsedOptions,
	context: {
		readonly cwd: string
		readonly isTTY: boolean
		readonly userAgent?: string
	},
	prompts: PromptAdapter,
): Promise<InitializerPlan> => {
	const detectedManager = detectPackageManager(context.userAgent)
	if (!context.isTTY && !options.yes) {
		const missing = missingFlags(options, detectedManager)
		if (missing.length > 0)
			throw new Error(
				`Non-interactive mode needs ${missing.join(', ')}; or use --yes for documented defaults.`,
			)
	}
	if (!context.isTTY && options.name === undefined)
		throw new Error('Non-interactive mode requires --name.')
	const ask = context.isTTY && !options.yes
	const name =
		options.name ?? (ask ? requiredValue(await prompts.name()) : undefined)
	if (name === undefined) throw new Error('Project name is required (--name).')
	const directory =
		options.directory ??
		(ask
			? requiredValue(await prompts.directory(name.split('/').at(-1) ?? name))
			: undefined)
	const language =
		options.language ?? (ask ? requiredValue(await prompts.language()) : 'ts')
	const apis = options.apis ?? (ask ? requiredValue(await prompts.apis()) : [])
	const plugins =
		options.plugins ??
		(ask ? requiredValue(await prompts.plugins(pluginChoices(apis))) : [])
	const starter =
		options.starter ?? (ask ? requiredValue(await prompts.starter()) : 'task')
	const database =
		options.database ??
		(ask ? requiredValue(await prompts.database()) : 'existing')
	const packageManager =
		options.packageManager ??
		detectedManager ??
		(ask ? requiredValue(await prompts.packageManager()) : 'npm')
	const install =
		options.install ?? (ask ? requiredValue(await prompts.install()) : true)
	const plan = resolveSelection(
		{
			name,
			...(directory !== undefined && { directory }),
			language,
			apis,
			plugins,
			starter,
			database,
			packageManager,
			install,
		},
		context.cwd,
	)
	prompts.print(plan)
	if (ask && !requiredValue(await prompts.confirm(plan)))
		throw new CancelledError()
	return plan
}

const fromClack = <T>(value: T | typeof clack.CANCEL_SYMBOL): T | null =>
	value === clack.CANCEL_SYMBOL ? null : value

const capabilityNotes = (plan: InitializerPlan): string[] => [
	...(plan.plugins.includes('pg-vector-plugin')
		? [
				'Vector values are logical only; this starter does not store or search vectors.',
			]
		: []),
	...(plan.plugins.includes('password-auth-plugin')
		? ['Password Auth adds identity and sessions, not CRUD permission.']
		: []),
	...(plan.plugins.includes('graphiql-plugin') ||
	plan.plugins.includes('apollo-sandbox-plugin')
		? ['Explorers and introspection are development-only.']
		: []),
	...(plan.apis.length > 0
		? ['HTTP binds to 127.0.0.1; API requests need the exact application ID.']
		: []),
	...(plan.starter === 'empty'
		? ['An empty application has no schema for schema-local plugins to act on.']
		: []),
]

export const formatPlan = (plan: InitializerPlan): string =>
	[
		`Destination: ${plan.destination}`,
		`Language: ${plan.language === 'ts' ? 'TypeScript + automatic Typegen' : 'JavaScript (no Typegen)'}`,
		`HTTP APIs: ${plan.apis.join(', ') || 'none; direct application calls'}`,
		`Plugins: ${plan.plugins.map((id) => `@ultimabase/${id}${plan.automaticPlugins.includes(id) ? ' (included)' : ''}`).join(', ')}`,
		`Starter: ${plan.starter}; database: ${plan.database}; manager: ${plan.packageManager}`,
		`Install dependencies: ${plan.install ? 'yes' : 'no'}`,
		`Files planned: package.json, .gitignore, .env.example, src/schema.${plan.language}, src/ultimabase.${plan.language}, src/main.${plan.language}${plan.typegen ? ', tsconfig.json, scripts/generate-types.mjs' : ''}${plan.database === 'docker' ? ', compose.yaml, .env' : ''}`,
		...capabilityNotes(plan),
		`Next: cd ${path.relative(process.cwd(), plan.destination) || plan.destination}`,
	].join('\n')

export const terminalPrompts: PromptAdapter = {
	name: async () =>
		fromClack(
			await clack.text({
				message: 'Project name',
				placeholder: 'notes',
				validate: (value) =>
					value?.trim() ? undefined : 'Enter a package name.',
			}),
		),
	directory: async (defaultName) =>
		fromClack(
			await clack.text({
				message: 'Destination directory',
				defaultValue: defaultName,
				placeholder: defaultName,
			}),
		),
	language: async () =>
		fromClack(
			await clack.select<Language>({
				message: 'Language',
				options: [
					{ value: 'ts', label: 'TypeScript', hint: 'Typegen included' },
					{ value: 'js', label: 'JavaScript', hint: 'No Typegen' },
				],
			}),
		),
	apis: async () =>
		fromClack(
			await clack.multiselect<ApiId>({
				message: 'How will clients access your data?',
				options: [
					{ value: 'rest', label: 'REST' },
					{ value: 'graphql', label: 'GraphQL' },
				],
				required: false,
			}),
		),
	plugins: async (choices) => {
		const groups = Object.fromEntries(
			pluginGroups.map((group) => [
				group,
				choices
					.filter((choice) => choice.group === group)
					.map((choice) => ({
						value: choice.id,
						label: choice.label,
						hint: choice.required ? `${choice.hint} · included` : choice.hint,
						disabled: choice.required,
					})),
			]),
		)
		return fromClack(
			await clack.groupMultiselect<PluginId>({
				message: 'Official plugins',
				options: groups,
				required: false,
				selectableGroups: false,
				maxItems: 16,
			}),
		)
	},
	starter: async () =>
		fromClack(
			await clack.select<Starter>({
				message: 'Starter',
				options: [
					{ value: 'task', label: 'Runnable Task example' },
					{ value: 'empty', label: 'Empty application' },
				],
			}),
		),
	database: async () =>
		fromClack(
			await clack.select<Database>({
				message: 'PostgreSQL',
				options: [
					{
						value: 'existing',
						label: 'Existing database',
						hint: 'Add DATABASE_URL to .env',
					},
					{
						value: 'docker',
						label: 'Local Docker Compose',
						hint: 'Disposable development database',
					},
				],
			}),
		),
	packageManager: async () =>
		fromClack(
			await clack.select<PackageManager>({
				message: 'Package manager',
				options: [{ value: 'npm' }, { value: 'yarn' }, { value: 'pnpm' }],
			}),
		),
	install: async () =>
		fromClack(
			await clack.confirm({
				message: 'Install dependencies now?',
				initialValue: true,
			}),
		),
	confirm: async () =>
		fromClack(
			await clack.confirm({
				message: 'Create this project?',
				initialValue: true,
			}),
		),
	print: (plan) => {
		clack.note(formatPlan(plan), 'Project plan')
	},
}
