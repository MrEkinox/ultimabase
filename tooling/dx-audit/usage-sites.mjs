// Part (c): editor results at representative usage sites read from each root:
// language-service fixture sources embedded in tests, type tests (*.test-d.ts)
// and the example applications.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

import {
	completionValue,
	createProject,
	defaultCompilerOptions,
	diagnosticsValue,
	locationOf,
	quickInfoValue,
	readConfig,
} from './language-service.mjs'
import { extractSnippets, replaceMarkers } from './fixture-sources.mjs'

const git = (root, args) =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' })
		.split('\n')
		.filter(Boolean)

/** Test and tooling files that drive the TypeScript language service. */
export const listFixtureFiles = (root) =>
	git(root, [
		'grep',
		'-l',
		'-E',
		'language-service|getQuickInfoAtPosition|getCompletionsAtPosition',
		'--',
		'packages',
		'tests',
		'tooling',
	]).filter(
		(file) =>
			/\.(?:ts|mts|cts|mjs)$/.test(file) &&
			// The audit itself matches the fixture pattern; older baselines keep
			// it under its former rebuild path.
			!file.startsWith('tooling/dx-audit/') &&
			!file.startsWith('tooling/rebuild/'),
	)

export const listTypeTests = (root) => git(root, ['ls-files', '*.test-d.ts'])

export const listExamples = (root) =>
	fs.existsSync(path.join(root, 'examples'))
		? fs
				.readdirSync(path.join(root, 'examples'), { withFileTypes: true })
				.filter((entry) =>
					fs.existsSync(
						path.join(root, 'examples', entry.name, 'tsconfig.json'),
					),
				)
				.map((entry) => `examples/${entry.name}`)
		: []

/** Report group of a repository-relative file: the package directory or the top folder. */
export const groupOf = (relativeFile) => {
	const [top, second] = relativeFile.split('/')

	return top === 'packages'
		? second
		: top === 'examples'
			? `examples/${second}`
			: top
}

/**
 * Hovers every identifier, asks completions at markers (and, when requested,
 * at every member access) and reads semantic diagnostics of one file.
 */
const collectFileSites = (context, service, site) => {
	const { completions, fileName, group, label, markers = [] } = site
	const sourceFile = service.getProgram().getSourceFile(fileName)
	const records = []
	const occurrences = new Map()
	const occurrence = (key) => {
		const count = occurrences.get(key) ?? 0

		occurrences.set(key, count + 1)
		return `${key}@${count}`
	}
	const push = (section, key, position, value) =>
		records.push({
			group,
			key: `${label} ${key}`,
			location: `${label}:${locationOf(sourceFile, position)}`,
			section,
			value,
		})
	const visit = (node) => {
		if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
			const position = node.getStart()

			push(
				'usage-hover',
				occurrence(node.text),
				position,
				quickInfoValue(
					context,
					service.getQuickInfoAtPosition(fileName, position),
				),
			)
		}
		if (completions && ts.isPropertyAccessExpression(node)) {
			const position = node.name.getStart()

			push(
				'usage-completions',
				occurrence(`.${node.name.text}`),
				position,
				completionValue(
					context,
					service.getCompletionsAtPosition(fileName, position, {}),
				),
			)
		}
		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	for (const { marker, position } of markers) {
		push(
			'usage-completions',
			occurrence(`marker ${marker}`),
			position,
			completionValue(
				context,
				service.getCompletionsAtPosition(fileName, position, {}),
			),
		)
	}
	push(
		'usage-diagnostics',
		'semantic',
		0,
		diagnosticsValue(context, service.getSemanticDiagnostics(fileName)),
	)
	return records
}

// Augmentations and global scripts would leak into other snippets of a shared program.
const needsOwnProgram = (source) =>
	/\bdeclare\s+(?:module|global)\b/.test(source) ||
	!/^\s*(?:import|export)\b/m.test(source)

/**
 * Resolves a file name mentioned by a test to one tracked file: a unique
 * path-suffix match, preferring the test's own package.
 */
const resolveReference = (trackedFiles, testFile, reference) => {
	const suffix = reference.replace(/^\.?\//, '')
	const matches = trackedFiles.filter(
		(file) => file === suffix || file.endsWith(`/${suffix}`),
	)
	const local = matches.filter((file) => groupOf(file) === groupOf(testFile))
	const candidates = local.length > 0 ? local : matches

	return candidates.length === 1 ? candidates[0] : undefined
}

// Program roots such as package `src/index.ts` and other tests are not usage sites.
const isDiskFixture = (file) =>
	!/\.test(?:-d)?\.ts$/.test(file) &&
	!file.startsWith('tooling/') &&
	(!/^packages\/[^/]+\/src\//.test(file) ||
		/\.(?:fixture|prototype)\./.test(file))

/**
 * Fixture sources of one root: snippets embedded in the fixture tests (virtual
 * files next to their test) and on-disk fixture files those tests read.
 */
export const collectFixtureSites = (context, fixtureFiles) => {
	const records = []
	const partial = []
	const sites = []
	const trackedFiles = git(context.root, ['ls-files'])
	const diskFixtures = new Map()

	for (const relativeFile of fixtureFiles) {
		const absoluteFile = path.join(context.root, relativeFile)

		if (!fs.existsSync(absoluteFile)) {
			records.push({
				group: groupOf(relativeFile),
				key: relativeFile,
				section: 'usage-source',
				value: null,
			})
			continue
		}
		const extracted = extractSnippets(
			absoluteFile,
			fs.readFileSync(absoluteFile, 'utf8'),
		)

		extracted.snippets.forEach((snippet, index) => {
			const label = `${relativeFile}#${index}`

			if (snippet.unresolved.length > 0)
				partial.push({ label, unresolved: snippet.unresolved })
			if (snippet.source !== '') {
				const fileName = `${absoluteFile.replace(/\.[cm]?[jt]s$/, '')}.dx-audit-${index}.ts`

				sites.push({
					fileName,
					group: groupOf(relativeFile),
					label,
					...snippet,
				})
			}
		})
		for (const reference of extracted.references) {
			const file = resolveReference(trackedFiles, relativeFile, reference)

			if (
				file === undefined ||
				!isDiskFixture(file) ||
				fixtureFiles.includes(file)
			)
				continue
			diskFixtures.set(
				file,
				new Set([...(diskFixtures.get(file) ?? []), ...extracted.literals]),
			)
		}
	}
	for (const [file, literals] of diskFixtures) {
		const fileName = path.join(context.root, file)

		sites.push({
			fileName,
			group: groupOf(file),
			label: file,
			...replaceMarkers(fs.readFileSync(fileName, 'utf8'), literals),
		})
	}

	const shared = sites.filter((site) => !needsOwnProgram(site.source))
	const sharedService = createProject(
		context,
		defaultCompilerOptions,
		new Map(shared.map((site) => [site.fileName, site.source])),
	)

	for (const site of sites) {
		const service = shared.includes(site)
			? sharedService
			: createProject(
					context,
					defaultCompilerOptions,
					new Map([[site.fileName, site.source]]),
				)

		records.push({
			group: site.group,
			key: site.label,
			section: 'usage-source',
			value: site.source,
		})
		records.push(
			...collectFileSites(context, service, { ...site, completions: true }),
		)
	}
	return { partial, records }
}

/** Type tests of one root, one program per package with its test tsconfig. */
export const collectTypeTestSites = (context, typeTests) => {
	const records = []
	const byGroup = Map.groupBy(typeTests, groupOf)

	for (const [group, files] of byGroup) {
		const packageConfig = path.join(
			context.root,
			'packages',
			group,
			'tsconfig.test.json',
		)
		const config = readConfig(
			fs.existsSync(packageConfig)
				? packageConfig
				: path.join(context.root, 'tooling/tsconfig/test.json'),
		)
		const present = files
			.map((file) => path.join(context.root, file))
			.filter((file) => fs.existsSync(file))
		const declarations = config.fileNames.filter((file) =>
			file.endsWith('.d.ts'),
		)
		const service = createProject(context, config.options, new Map(), [
			...present,
			...declarations,
		])

		for (const file of files) {
			const fileName = path.join(context.root, file)

			if (fs.existsSync(fileName)) {
				records.push(
					...collectFileSites(context, service, {
						completions: false,
						fileName,
						group,
						label: file,
					}),
				)
			} else {
				records.push({ group, key: file, section: 'usage-source', value: null })
			}
		}
	}
	return records
}

/** Example applications of one root, with their own tsconfig (including generated types). */
export const collectExampleSites = (context, examples) =>
	examples.flatMap((example) => {
		const config = readConfig(path.join(context.root, example, 'tsconfig.json'))
		const service = createProject(
			context,
			config.options,
			new Map(),
			config.fileNames,
		)
		const sources = config.fileNames.filter((file) =>
			context.relative(file).startsWith(`${example}/src/`),
		)

		return sources.flatMap((fileName) =>
			collectFileSites(context, service, {
				completions: true,
				fileName,
				group: example,
				label: context.relative(fileName),
			}),
		)
	})
