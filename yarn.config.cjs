// Repository constraints checked by `yarn constraints` (part of `yarn validate:full`).
// See https://yarnpkg.com/features/constraints. `yarn constraints --fix` applies
// the manifest field rules; dependency direction errors need a deliberate fix.

/**
 * Runtime workspace dependencies each package may declare, mirroring the
 * package dependency graph in ARCHITECTURE.md. Every edge points toward a
 * foundation: Core depends only on Shared and never on Plugin Kit, a concrete
 * plugin or infrastructure.
 */
const allowedRuntimeDependencies = {
	'@ultimabase/shared': [],
	'@ultimabase/core': ['shared'],
	'@ultimabase/plugin-kit': ['core', 'shared'],
	'@ultimabase/typegen': ['core', 'shared'],
	'@ultimabase/testing': ['typegen', 'core', 'shared'],
	'@ultimabase/hooks-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/access-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/validation-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/soft-delete-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/pg-vector-plugin': ['core', 'shared'],
	'@ultimabase/roles-plugin': ['access-plugin', 'plugin-kit', 'core', 'shared'],
	'@ultimabase/acl-permissions-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/postgres-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/http-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/server-hono-plugin': [
		'http-plugin',
		'plugin-kit',
		'core',
		'shared',
	],
	'@ultimabase/rest-plugin': ['http-plugin', 'plugin-kit', 'core', 'shared'],
	'@ultimabase/password-auth-plugin': [
		'http-plugin',
		'plugin-kit',
		'core',
		'shared',
	],
	'@ultimabase/graphql-plugin': ['plugin-kit', 'core', 'shared'],
	'@ultimabase/graphql-http': ['core', 'shared'],
	'@ultimabase/graphql-yoga-plugin': [
		'graphql-http',
		'http-plugin',
		'graphql-plugin',
		'plugin-kit',
		'core',
		'shared',
	],
	'@ultimabase/graphiql-plugin': [
		'graphql-http',
		'http-plugin',
		'plugin-kit',
		'core',
	],
	'@ultimabase/apollo-sandbox-plugin': [
		'graphql-http',
		'http-plugin',
		'plugin-kit',
		'core',
	],
	// The initializer generates projects that install published packages.
	'@ultimabase/create-app': [],
}

/** Foundations stay independent of concrete plugins even in their tests. */
const foundations = new Set([
	'@ultimabase/shared',
	'@ultimabase/core',
	'@ultimabase/plugin-kit',
])

const workspacePrefix = '@ultimabase/'

/** @param {import('@yarnpkg/types').Yarn.Constraints.Workspace} workspace */
const isPublished = (workspace) =>
	workspace.cwd.startsWith('packages/') && workspace.manifest.private !== true

/** @param {import('@yarnpkg/types').Yarn.Constraints.Context} context */
const constrainDependencyDirection = ({ Yarn }) => {
	const privateWorkspaces = new Set(
		Yarn.workspaces()
			.filter((workspace) => workspace.manifest.private === true)
			.map((workspace) => workspace.ident),
	)

	for (const dependency of Yarn.dependencies()) {
		if (!dependency.ident.startsWith(workspacePrefix)) continue
		const owner = dependency.workspace.ident

		if (privateWorkspaces.has(dependency.ident)) {
			dependency.error(
				`${owner} must not depend on private ${dependency.ident}`,
			)
			continue
		}
		dependency.update('workspace:^')

		if (owner === null || !dependency.workspace.cwd.startsWith('packages/')) {
			continue
		}
		const allowed = allowedRuntimeDependencies[owner]
		if (allowed === undefined) {
			dependency.workspace.error(
				`${owner} is missing from the allowed dependency graph in yarn.config.cjs`,
			)
			continue
		}
		const checked =
			dependency.type !== 'devDependencies' || foundations.has(owner)
		const target = dependency.ident.slice(workspacePrefix.length)
		if (checked && !allowed.includes(target)) {
			dependency.error(
				`${owner} must not depend on ${dependency.ident} (${dependency.type}); see the package dependency graph in ARCHITECTURE.md`,
			)
		}
	}
}

/** @param {import('@yarnpkg/types').Yarn.Constraints.Context} context */
const constrainPublishedManifests = ({ Yarn }) => {
	for (const workspace of Yarn.workspaces()) {
		if (!isPublished(workspace)) continue
		workspace.set('type', 'module')
		workspace.set('license', 'Apache-2.0')
		workspace.set('files', ['dist'])
		workspace.set('repository', {
			type: 'git',
			url: 'git+https://github.com/MrEkinox/ultimadatabase.git',
			directory: workspace.cwd,
		})
		workspace.set(['exports', '.'], {
			types: './dist/index.d.ts',
			import: './dist/index.js',
		})
		// The initializer is a CLI whose entry runs on import.
		if (workspace.ident !== '@ultimabase/create-app') {
			workspace.set('sideEffects', false)
		}
	}
}

/**
 * Published packages and the root use one range per third-party dependency,
 * so no package is tested against a different version than it declares. The
 * most common range wins; `yarn constraints --fix` aligns the others.
 *
 * @param {import('@yarnpkg/types').Yarn.Constraints.Context} context
 */
const constrainConsistentRanges = ({ Yarn }) => {
	const checked = Yarn.dependencies().filter(
		(dependency) =>
			!dependency.ident.startsWith(workspacePrefix) &&
			dependency.type !== 'peerDependencies' &&
			(dependency.workspace.cwd === '.' || isPublished(dependency.workspace)),
	)
	const countsByIdent = new Map()
	for (const dependency of checked) {
		const counts = countsByIdent.get(dependency.ident) ?? new Map()
		counts.set(dependency.range, (counts.get(dependency.range) ?? 0) + 1)
		countsByIdent.set(dependency.ident, counts)
	}
	for (const dependency of checked) {
		const [[canonical]] = [...countsByIdent.get(dependency.ident)].sort(
			([leftRange, left], [rightRange, right]) =>
				right - left || leftRange.localeCompare(rightRange),
		)
		dependency.update(canonical)
	}
}

module.exports = {
	/** @param {import('@yarnpkg/types').Yarn.Constraints.Context} context */
	async constraints(context) {
		constrainDependencyDirection(context)
		constrainPublishedManifests(context)
		constrainConsistentRanges(context)
	},
}
