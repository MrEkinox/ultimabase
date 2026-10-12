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
	/** Offers Docker Compose first when Docker answers, else an existing database. */
	database(dockerAvailable: boolean): Promise<Database | null>
	/** An existing database URL for `.env`; an empty answer leaves it for later. */
	databaseUrl(): Promise<string | null>
	packageManager(): Promise<PackageManager | null>
	install(): Promise<boolean | null>
	confirm(plan: InitializerPlan): Promise<boolean | null>
	print(plan: InitializerPlan): void
	/** Tells the developer about a default the initializer could not apply. */
	notice(message: string): void
}

/** The defaults of the prompts and of `--yes` (ADR-0327 decision 6). */
export const defaultApis: readonly ApiId[] = ['rest']
export const defaultPlugins: readonly PluginId[] = ['access-plugin']

export const dockerMissingNotice =
	'Docker was not found, so the project uses an existing PostgreSQL database: set DATABASE_URL in .env, or install Docker and choose --database docker.'

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
		[options.apis === undefined, '--api (rest, graphql or none)'],
		[options.plugins === undefined, '--plugin (a package ID or none)'],
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
		/** Whether `docker compose` answers; Docker is the default database. */
		readonly dockerAvailable?: boolean
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
	const apis = await choose(options.apis, () => prompts.apis(), defaultApis)
	const plugins = await choose(
		options.plugins,
		() => prompts.plugins(pluginChoices(apis)),
		defaultPlugins,
	)
	const starter = await choose(options.starter, () => prompts.starter(), 'task')
	const dockerAvailable = context.dockerAvailable ?? true
	if (!dockerAvailable && options.database === undefined)
		prompts.notice(dockerMissingNotice)
	const database = await choose(
		options.database,
		() => prompts.database(dockerAvailable),
		dockerAvailable ? 'docker' : 'existing',
	)
	const databaseUrl =
		database === 'existing' && ask && options.databaseUrl === undefined
			? requiredValue(await prompts.databaseUrl())
			: options.databaseUrl
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
			...(databaseUrl !== undefined && { databaseUrl }),
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
			'Authentication operations are served under /api/auth and in GraphQL; logins are limited per account and address.',
		],
		[
			has('graphql-explorer-plugin'),
			'Explorers and introspection are development-only.',
		],
		[
			has('access-plugin'),
			'Access is a prototype: operations without a rule are open in development; production refuses to start until rules are written.',
		],
		[
			hasDataApi(plan) && !has('access-plugin'),
			'Task API mutations are disabled; public writes need a policy plugin or an explicit opt-in.',
		],
		[
			has('hono-server-plugin'),
			'HTTP binds to 127.0.0.1 in development; requests need no application header.',
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

const plannedFiles = (plan: InitializerPlan): readonly string[] => {
	const extension = plan.language
	return [
		'package.json',
		'.gitignore',
		'.env.example',
		`src/schema.${extension}`,
		`src/ultimabase.${extension}`,
		`src/main.${extension}`,
		`vitest.config.${extension}`,
		...(plan.starter === 'task' ? [`tests/task.test.${extension}`] : []),
		...(extension === 'ts' ? ['tsconfig.json', 'tsconfig.build.json'] : []),
		...(plan.database === 'docker' ? ['compose.yaml'] : []),
		...(plan.database === 'docker' || plan.databaseUrl !== undefined
			? ['.env']
			: []),
		'README.md',
	]
}

const formatPlan = (plan: InitializerPlan): string =>
	[
		`Destination: ${plan.destination}`,
		`Language: ${plan.language === 'ts' ? 'TypeScript (run by Node 24 in development)' : 'JavaScript'}`,
		`Data APIs: ${dataApis(plan)}`,
		`Plugins: ${plan.plugins.map((id) => `@ultimabase/${id}${plan.automaticPlugins.includes(id) ? ' (included)' : ''}`).join(', ')}`,
		`Starter: ${plan.starter}; database: ${plan.database}${plan.databaseUrl === undefined ? '' : ' (URL in .env)'}; manager: ${plan.packageManager}`,
		`Install dependencies: ${plan.install ? 'yes' : 'no'}`,
		`Files planned: ${plannedFiles(plan).join(', ')}`,
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
			{ value: 'ts', label: 'TypeScript', hint: 'Run by Node 24' },
			{ value: 'js', label: 'JavaScript' },
		]),
	apis: () =>
		answer(
			clack.multiselect<ApiId>({
				message: 'How will clients access your data?',
				options: [
					{ value: 'rest', label: 'REST' },
					{ value: 'graphql', label: 'GraphQL' },
				],
				initialValues: [...defaultApis],
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
				initialValues: [...defaultPlugins],
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
	database: (dockerAvailable) => {
		const docker: clack.Option<Database> = {
			value: 'docker',
			label: 'Local Docker Compose',
			hint: dockerAvailable
				? 'Disposable development database'
				: 'Docker was not found',
		}
		const existing: clack.Option<Database> = {
			value: 'existing',
			label: 'Existing database',
			hint: 'DATABASE_URL in .env',
		}
		return select<Database>(
			'PostgreSQL',
			dockerAvailable ? [docker, existing] : [existing, docker],
		)
	},
	databaseUrl: () =>
		answer(
			clack.text({
				message:
					'Existing PostgreSQL URL (leave empty to set it in .env later)',
				placeholder: 'postgres://user:password@127.0.0.1:5432/database',
				defaultValue: '',
			}),
		),
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
	notice: (message) => {
		clack.log.warn(message)
	},
}
