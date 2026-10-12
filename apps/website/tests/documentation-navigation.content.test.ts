import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(new URL('../content/docs', import.meta.url))

const canonicalNavigation = {
	'1.0.0': [
		'---Introduction---',
		'quick-start',
		'index',
		'manual-installation',
		'---Core---',
		'...core',
		'---Plugins---',
		'...plugins',
		'---Guides---',
		'...guides',
		'---Operate Your Application---',
		'...operations',
		'---Reference---',
		'...reference',
		'---Project---',
		'...project',
	],
	'1.0.0/core': [
		'application',
		'data-modeling',
		'reading-data',
		'writing-data',
		'runtime',
		'security-foundations',
	],
	'1.0.0/core/data-modeling': [
		'schemas',
		'fields',
		'models',
		'defaults',
		'embedded-objects',
		'virtual-fields',
		'relationships',
	],
	'1.0.0/core/reading-data': [
		'overview',
		'filters',
		'selections',
		'ordering-and-pagination',
		'related-data',
	],
	'1.0.0/core/writing-data': [
		'create',
		'update',
		'delete',
		'upserts',
		'bulk-operations',
		'nested-writes',
		'transactions',
	],
	'1.0.0/core/runtime': [
		'runtime-pipeline',
		'logical-operations-and-persistence',
		'api-errors',
	],
	'1.0.0/core/security-foundations': [
		'security-model',
		'request-identity',
		'master-authority',
	],
	'1.0.0/plugins': [
		'overview',
		'using-plugins',
		'official',
		'community-plugins',
		'build-a-plugin',
	],
	'1.0.0/plugins/official': [
		'postgresql',
		'soft-delete',
		'postgresql-vector',
		'validation',
		'hooks',
		'password-authentication',
		'access',
		'roles',
		'acl-permissions',
		'http',
		'hono-server',
		'rest',
		'graphql',
	],
	'1.0.0/plugins/build-a-plugin': [
		'index',
		'schemas-and-typegen',
		'operations-and-graphql',
		'runtime-and-infrastructure',
	],
	'1.0.0/guides': ['generate-types', 'test-an-application'],
	'1.0.0/operations': ['before-exposing-your-application', 'troubleshooting'],
	'1.0.0/reference': ['package-index'],
	'1.0.0/project': ['release-status', 'roadmap', 'contributing'],
} as const satisfies Readonly<Record<string, readonly string[]>>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null
}

describe('documentation navigation architecture', () => {
	it('matches the complete canonical navigation recorded by the milestone', async () => {
		for (const [directory, expectedPages] of Object.entries(
			canonicalNavigation,
		)) {
			const metadata: unknown = JSON.parse(
				await readFile(path.join(contentRoot, directory, 'meta.json'), 'utf8'),
			)
			expect(isRecord(metadata), directory).toBe(true)
			if (!isRecord(metadata))
				throw new TypeError(`Invalid metadata: ${directory}`)
			expect(metadata.pages, directory).toEqual(expectedPages)
		}
	})

	it('keeps Hono separate from HTTP while GraphQL companions share one guide', async () => {
		const directory = path.join(contentRoot, '1.0.0/plugins/official')
		const [http, hono, graphql] = await Promise.all([
			readFile(path.join(directory, 'http.mdx'), 'utf8'),
			readFile(path.join(directory, 'hono-server.mdx'), 'utf8'),
			readFile(path.join(directory, 'graphql.mdx'), 'utf8'),
		])

		expect(http).toContain('[Hono Server](./hono-server)')
		expect(http).not.toContain('## Run a Node.js server with Hono')
		expect(hono).toContain('`@ultimabase/hono-server-plugin`')
		expect(hono).toContain('## Configuration')
		expect(hono).toContain('## Troubleshooting')
		expect(graphql).toContain('## Serve GraphQL over HTTP with Yoga')
		expect(graphql).toContain('## Choose a development explorer')
		for (const plugin of ['graphql-yoga', 'graphql-explorer']) {
			expect(graphql).toContain(`@ultimabase/${plugin}-plugin`)
		}
	})

	it('owns virtual-field documentation in Core without a duplicate guide', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/core/data-modeling/virtual-fields.mdx'),
			'utf8',
		)
		expect(page).toContain('contentType: concept')
		expect(page).toContain('## Selection and private dependencies')
		await expect(
			readFile(
				path.join(contentRoot, '1.0.0/guides/add-virtual-fields.mdx'),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('publishes application testing guidance rather than repository test commands', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/guides/test-an-application.mdx'),
			'utf8',
		)
		expect(page).toContain('PostgresTestWorker')
		expect(page).toContain('Task.createOne(')
		expect(page).toContain('Task.findOneOrThrow(')
		expect(page).not.toContain('yarn test:e2e:built')
	})

	it('keeps operations in two task-shaped pages without the thin duplicates', async () => {
		const preflight = await readFile(
			path.join(
				contentRoot,
				'1.0.0/operations/before-exposing-your-application.mdx',
			),
			'utf8',
		)
		const troubleshooting = await readFile(
			path.join(contentRoot, '1.0.0/operations/troubleshooting.mdx'),
			'utf8',
		)
		expect(preflight).toContain('## Verify before exposure')
		expect(troubleshooting).toContain('## Report a problem')

		for (const removed of [
			'configuration-and-environment',
			'secrets',
			'production-checklist',
			'application-troubleshooting',
		]) {
			await expect(
				readFile(
					path.join(contentRoot, `1.0.0/operations/${removed}.mdx`),
					'utf8',
				),
			).rejects.toMatchObject({ code: 'ENOENT' })
		}
	})

	it('keeps package and compatibility lookup on one reference page', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/reference/package-index.mdx'),
			'utf8',
		)
		expect(page).toContain('## Platform and version compatibility')
		expect(page).toContain('## Public package roots')

		for (const removed of ['compatibility', 'architecture-decisions']) {
			await expect(
				readFile(
					path.join(contentRoot, `1.0.0/reference/${removed}.mdx`),
					'utf8',
				),
			).rejects.toMatchObject({ code: 'ENOENT' })
		}
	})

	it('keeps field builder lookup inside Fields without a duplicate reference page', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/core/data-modeling/fields.mdx'),
			'utf8',
		)
		expect(page).toContain('## Built-in field builders')
		expect(page).toContain('Native JavaScript `bigint`')
		await expect(
			readFile(
				path.join(contentRoot, '1.0.0/reference/core-api/fields.mdx'),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('keeps schema declaration lookup inside Schemas without a duplicate reference page', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/core/data-modeling/schemas.mdx'),
			'utf8',
		)
		for (const heading of [
			'## Declaration options',
			'## Indexes',
			'### Index one field',
			'### Index a combination',
			'## Schema classes and application handles',
			'## Compilation errors',
		]) {
			expect(page).toContain(heading)
		}
		await expect(
			readFile(
				path.join(contentRoot, '1.0.0/reference/core-api/schema.mdx'),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('keeps plain results inside Models without a duplicate reference page', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/core/data-modeling/models.mdx'),
			'utf8',
		)
		for (const heading of [
			'## Results are data',
			'## Visible fields and identity',
			'## Named types',
			'## Serialize with toJSON',
		]) {
			expect(page).toContain(heading)
		}
		expect(page).toContain("import { Product } from './product.js'")
		expect(page).toContain("name: 'Notebook'")
		await expect(
			readFile(
				path.join(contentRoot, '1.0.0/reference/core-api/models.mdx'),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('keeps application, query, errors, and relation tasks in their Core pages', async () => {
		const [application, query, errors, nestedWrites, relatedData] =
			await Promise.all(
				[
					'core/application',
					'core/reading-data/overview',
					'core/runtime/api-errors',
					'core/writing-data/nested-writes',
					'core/reading-data/related-data',
				].map((page) =>
					readFile(path.join(contentRoot, `1.0.0/${page}.mdx`), 'utf8'),
				),
			)
		expect(application).toContain('## Configure the application')
		expect(query).toContain('## Read failures')
		expect(errors).toContain('## FrameworkError')
		expect(nestedWrites).toContain('To verify atomicity')
		expect(relatedData).toContain('a relation filter is not a permission check')

		for (const retiredPage of [
			'reference/core-api/application',
			'reference/core-api/query',
			'reference/core-api/errors',
			'guides/write-nested-data',
			'guides/filter-contextual-relations',
		]) {
			await expect(
				readFile(path.join(contentRoot, `1.0.0/${retiredPage}.mdx`), 'utf8'),
			).rejects.toMatchObject({ code: 'ENOENT' })
		}
	})
})
