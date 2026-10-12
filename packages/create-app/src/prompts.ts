import * as clack from '@clack/prompts'
import path from 'node:path'

import {
	officialPlugins,
	pluginGroups,
	selectedPluginIds,
	type ApiId,
	type PluginId,
} from './catalog.js'
import {
	detectPackageManager,
	hasDataApi,
	hasPlugin,
	included,
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

export const pluginChoices = (
	apis: readonly ApiId[],
): readonly PluginChoice[] => {
	const required = selectedPluginIds(apis)
	return officialPlugins.map((plugin) => ({
		...plugin,
		required: required.has(plugin.id),
	}))
}

const missingFlags = (
	options: ParsedOptions,
	detectedManager: PackageManager | undefined,
): string[] =>
	included([
		[options.name === undefined, '--name'],
		[options.language === undefined, '--language'],
		[options.apis === undefined, '--api (or --yes for none)'],
		[options.plugins === undefined, '--plugin (or --yes for none)'],
		[options.starter === undefined, '--starter'],
		[options.database === undefined, '--database'],
		[
			(options.packageManager ?? detectedManager) === undefined,
			'--package-manager',
		],
		[options.install === undefined, '--install or --no-install'],
	])

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
	// A given value wins; otherwise ask in order, or fall back without a terminal.
	const choose = async <T>(
		given: T | undefined,
		prompt: () => Promise<T | null>,
		fallback: T,
	): Promise<T> => given ?? (ask ? requiredValue(await prompt()) : fallback)
	const name = await choose(options.name, () => prompts.name(), undefined)
	if (name === undefined) throw new Error('Project name is required (--name).')
	const directory = await choose(
		options.directory,
		() => prompts.directory(name.split('/').at(-1) ?? name),
		undefined,
	)
	const language = await choose(
		options.language,
		() => prompts.language(),
		'ts',
	)
	const apis = await choose(options.apis, () => prompts.apis(), [])
	const plugins = await choose(
		options.plugins,
		() => prompts.plugins(pluginChoices(apis)),
		[],
	)
	const starter = await choose(options.starter, () => prompts.starter(), 'task')
	const database = await choose(
		options.database,
		() => prompts.database(),
		'existing',
	)
	const packageManager = await choose(
		options.packageManager ?? detectedManager,
		() => prompts.packageManager(),
		'npm',
	)
	const install = await choose(options.install, () => prompts.install(), true)
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

const capabilityNotes = (plan: InitializerPlan): string[] => {
	const has = (id: PluginId): boolean => hasPlugin(plan, id)
	return included([
		[
			has('auth-plugin'),
			'Authentication adds identity and sessions, not CRUD permission.',
		],
		[
			has('auth-plugin') && hasDataApi(plan),
			'Authentication operations are served under /auth and in GraphQL; logins are limited per account and address.',
		],
		[
			has('graphql-explorer-plugin'),
			'Explorers and introspection are development-only.',
		],
		[
			hasDataApi(plan),
			'Task API mutations are disabled; public writes need a policy plugin or an explicit opt-in.',
		],
		[
			has('hono-server-plugin'),
			'HTTP binds to 127.0.0.1; API requests need the exact application ID.',
		],
		[
			plan.starter === 'empty',
			'An empty application has no schema for schema-local plugins to act on.',
		],
	])
}

const dataApis = (plan: InitializerPlan): string =>
	included([
		[hasPlugin(plan, 'rest-plugin'), 'REST'],
		[hasPlugin(plan, 'graphql-yoga-plugin'), 'GraphQL over HTTP'],
		[
			hasPlugin(plan, 'graphql-plugin') &&
				!hasPlugin(plan, 'graphql-yoga-plugin'),
			'direct GraphQL',
		],
	]).join(', ') || 'none; direct application calls'

const formatPlan = (plan: InitializerPlan): string =>
	[
		`Destination: ${plan.destination}`,
		`Language: ${plan.language === 'ts' ? 'TypeScript + automatic Typegen' : 'JavaScript (no Typegen)'}`,
		`Data APIs: ${dataApis(plan)}`,
		`Plugins: ${plan.plugins.map((id) => `@ultimabase/${id}${plan.automaticPlugins.includes(id) ? ' (included)' : ''}`).join(', ')}`,
		`Starter: ${plan.starter}; database: ${plan.database}; manager: ${plan.packageManager}`,
		`Install dependencies: ${plan.install ? 'yes' : 'no'}`,
		`Files planned: package.json, .gitignore, .env.example, src/schema.${plan.language}, src/ultimabase.${plan.language}, src/main.${plan.language}${plan.typegen ? ', tsconfig.json, scripts/generate-types.mjs' : ''}${plan.database === 'docker' ? ', compose.yaml, .env' : ''}`,
		...capabilityNotes(plan),
		`Next: cd ${path.relative(process.cwd(), plan.destination) || plan.destination}`,
	].join('\n')

/** Clack resolves a cancelled prompt to its cancel symbol; adapters report null. */
const answer = async <T>(
	prompt: Promise<T | typeof clack.CANCEL_SYMBOL>,
): Promise<T | null> => {
	const value = await prompt
	return value === clack.CANCEL_SYMBOL ? null : value
}

const select = <T>(
	message: string,
	options: clack.Option<T>[],
): Promise<T | null> => answer(clack.select<T>({ message, options }))

const confirm = (message: string): Promise<boolean | null> =>
	answer(clack.confirm({ message, initialValue: true }))

export const terminalPrompts: PromptAdapter = {
	name: () =>
		answer(
			clack.text({
				message: 'Project name',
				placeholder: 'notes',
				validate: (value) =>
					value?.trim() ? undefined : 'Enter a package name.',
			}),
		),
	directory: (defaultName) =>
		answer(
			clack.text({
				message: 'Destination directory',
				defaultValue: defaultName,
				placeholder: defaultName,
			}),
		),
	language: () =>
		select<Language>('Language', [
			{ value: 'ts', label: 'TypeScript', hint: 'Typegen included' },
			{ value: 'js', label: 'JavaScript', hint: 'No Typegen' },
		]),
	apis: () =>
		answer(
			clack.multiselect<ApiId>({
				message: 'How will clients access your data?',
				options: [
					{ value: 'rest', label: 'REST' },
					{ value: 'graphql', label: 'GraphQL' },
				],
				required: false,
			}),
		),
	plugins: (choices) =>
		answer(
			clack.groupMultiselect<PluginId>({
				message: 'Official plugins',
				options: Object.fromEntries(
					pluginGroups.map((group) => [
						group,
						choices
							.filter((choice) => choice.group === group)
							.map((choice) => ({
								value: choice.id,
								label: choice.label,
								hint: choice.required
									? `${choice.hint} · included`
									: choice.hint,
								disabled: choice.required,
							})),
					]),
				),
				required: false,
				selectableGroups: false,
				maxItems: 16,
			}),
		),
	starter: () =>
		select<Starter>('Starter', [
			{ value: 'task', label: 'Runnable Task example' },
			{ value: 'empty', label: 'Empty application' },
		]),
	database: () =>
		select<Database>('PostgreSQL', [
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
		]),
	packageManager: () =>
		select<PackageManager>('Package manager', [
			{ value: 'npm' },
			{ value: 'yarn' },
			{ value: 'pnpm' },
		]),
	install: () => confirm('Install dependencies now?'),
	confirm: () => confirm('Create this project?'),
	print: (plan) => {
		clack.note(formatPlan(plan), 'Project plan')
	},
}
