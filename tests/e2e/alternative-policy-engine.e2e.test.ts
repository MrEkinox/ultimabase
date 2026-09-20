import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	FrameworkApplication,
	MasterAuthority,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	databasePluginFieldStructuralContainsCapability,
	definePlugin,
	provideCapability,
	typegenEmitterCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { generateApplicationTypes } from '@ultimabase/typegen'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	alternativePolicyPluginId,
	alternativeTenantPolicy,
	createAlternativePolicyEngine,
} from './fixtures/alternative-policy-engine.js'

const alternativeFixturePath = path.join(
	import.meta.dirname,
	'fixtures/alternative-policy-engine.ts',
)
const noAccessJavascriptFixturePath = path.join(
	import.meta.dirname,
	'fixtures/no-hooks-postgres.mjs',
)

class AlternativeReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
		pluginFieldStructuralContains:
			databasePluginFieldStructuralContainsCapability,
	}
	readonly requests: DatabaseOperationRequest[] = []

	constructor(private readonly result: unknown = []) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		return Promise.resolve(this.result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new Error('Alternative policy fixture reads only'))
	}
}

const createSupportPlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database-adapter',
					create: () => ({ value: adapter }),
				}),
				provideCapability(typegenEmitterCapability, {
					contributionId: 'typegen',
					value: { kind: 'typegen-emitter' },
				}),
			],
		},
		core: '^0.0.0',
		pluginId: 'fixture.alternative-policy-support',
		version: '1.0.0',
	})

const publicRead = new ACL().grantPublic('read')

const createAlternativeFixture = (withAcl = false) => {
	const Document = Schema.define({
		className: 'AlternativePolicyDocument',
		alternativePolicy: alternativeTenantPolicy({
			hiddenFields: ['secret'],
			tenant: 'community',
		}),
		...(withAcl ? { acl: { default: publicRead } } : {}),
		fields: (field) => ({
			secret: field.string(),
			tenant: field.string(),
			title: field.string(),
		}),
	})
	const adapter = new AlternativeReadAdapter([
		{
			...(withAcl ? { acl: publicRead } : {}),
			createdAt: '2026-08-20T10:00:00.000Z',
			id: '019c0000-0000-7000-8000-000000000002',
			secret: 'hidden',
			tenant: 'community',
			title: 'visible',
			updatedAt: '2026-08-20T10:00:00.000Z',
		},
	])
	const engine = createAlternativePolicyEngine({ instanceId: 'typed' })

	return { adapter, Document, engine }
}

describe('independent protected policy engine', () => {
	it('keeps no-Access and alternative declarations free of official vocabulary', async () => {
		const Plain = Schema.define({
			className: 'NoAccessGeneratedDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [Plain],
		})

		try {
			const generated = generateApplicationTypes({
				application,
				applicationId: 'no-access-proof',
			})
			const [source, javascriptSource] = await Promise.all([
				readFile(alternativeFixturePath, 'utf8'),
				readFile(noAccessJavascriptFixturePath, 'utf8'),
			])

			expect(application.typegenGraph.options).toStrictEqual([])
			expect(generated.contents).not.toContain('@ultimabase/access-plugin')
			expect(generated.contents).not.toContain('SchemaAccessOption')
			expect(source).not.toContain('@ultimabase/access-plugin')
			expect(source).not.toContain('accessPlugin')
			expect(javascriptSource).not.toContain('@ultimabase/access-plugin')
			expect(javascriptSource).not.toContain('accessPlugin')
		} finally {
			await application.dispose()
		}
	})

	it('runs row, field, ACL, diagnostics, Typegen, and conformance contracts', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: () => {
				const { adapter, Document, engine } = createAlternativeFixture()
				return createPluginConformanceFixture({
					schemas: [Document],
					subject: engine.plugin,
					supportPlugins: [createSupportPlugin(adapter)],
				})
			},
			expected: {
				core: '^0.0.0',
				pluginId: alternativePolicyPluginId,
				privileges: ['schema:declare', 'runtime:constrain'],
				version: '1.0.0',
			},
		}).check('middleware', async ({ createUltimaBase }) => {
			const { ultimabase, schemas } = createUltimaBase()
			await ultimabase.start()
			const result = await schemas[0].findMany(undefined, { ultimabase })

			expect(result[0]).not.toHaveProperty('secret')
			expect(
				ultimabase.application
					.getPlugin({
						instanceId: 'typed',
						pluginId: alternativePolicyPluginId,
					})
					.diagnostics(),
			).toStrictEqual([
				{
					operation: 'find-many',
					schema: 'AlternativePolicyDocument',
					tenant: 'community',
				},
			])
		})
		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				applicationId: 'alternative-policy-conformance',
				verify: ({ contents }) => {
					expect(contents).not.toContain('@ultimabase/access-plugin')
				},
			}),
		)

		expect(report.checks.map(({ contract }) => contract)).toEqual(
			expect.arrayContaining([
				'application-isolation',
				'lifecycle-cleanup',
				'middleware',
				'typegen',
			]),
		)
	}, 20_000)

	it('isolates diagnostics and cleans up each application lifetime', async () => {
		const disposed: string[] = []
		const Document = Schema.define({
			className: 'AlternativePolicyIsolationDocument',
			alternativePolicy: alternativeTenantPolicy({ tenant: 'isolated' }),
			fields: (field) => ({ tenant: field.string(), title: field.string() }),
		})
		const engine = createAlternativePolicyEngine({
			onDispose: () => disposed.push('disposed'),
		})
		const support = createSupportPlugin(new AlternativeReadAdapter())
		const first = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [support, engine.plugin],
			schemas: [Document],
		})
		const second = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [support, engine.plugin],
			schemas: [Document],
		})

		try {
			await first.start()
			await Document.findMany(undefined, { ultimabase: first })
			expect(
				first.application.getPlugin(alternativePolicyPluginId).diagnostics(),
			).toHaveLength(1)
			await first.dispose()
			await second.start()
			expect(
				second.application.getPlugin(alternativePolicyPluginId).diagnostics(),
			).toStrictEqual([])
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}

		expect(disposed).toStrictEqual(['disposed', 'disposed'])
	})

	it('composes official and alternative engines through disjoint claims', async () => {
		const { adapter, Document, engine } = createAlternativeFixture(true)
		const composed = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				accessPlugin({ default: true }),
				engine.plugin,
				aclPlugin(),
				createSupportPlugin(adapter),
			],
			schemas: [Document],
		})

		try {
			await composed.start()
			const result = await Document.findMany(undefined, {
				ultimabase: composed,
			})
			expect(result[0]).not.toHaveProperty('secret')
			expect(JSON.stringify(adapter.requests[0]?.rowFilter)).toContain(
				'community',
			)
		} finally {
			await composed.dispose()
		}
	})

	it('generates the installed direct ACL option and patched field contract', async () => {
		const { adapter, Document, engine } = createAlternativeFixture(true)
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [aclPlugin(), engine.plugin, createSupportPlugin(adapter)],
			schemas: [Document],
		})
		try {
			const generated = generateApplicationTypes({
				application,
				applicationId: 'direct-acl-option',
			}).contents

			expect(generated).toContain('@ultimabase/acl-permissions-plugin')
			expect(generated).toContain('ACLSchemaOption<this>')
			expect(
				application.schemas.get(Document.className)?.fields.acl?.kind,
			).toBe('ultimabase.acl')
		} finally {
			await application.dispose()
		}
	})

	it('keeps audited Core Master functional with no, official, and alternative policy engines', async () => {
		const audit: string[] = []
		const authority = (label: string) =>
			new MasterAuthority({
				keys: [{ id: label, value: `${label}-secret` }],
				onUse: ({ reason }) => {
					audit.push(`${label}:${reason}`)
				},
			})
		const Plain = Schema.define({
			className: 'MasterPolicyMatrixPlain',
			fields: (field) => ({ secret: field.string(), title: field.string() }),
		})
		const plainRow = [
			{
				createdAt: '2026-08-20T10:00:00.000Z',
				id: '019c0000-0000-7000-8000-000000000003',
				secret: 'visible-to-core',
				title: 'plain',
				updatedAt: '2026-08-20T10:00:00.000Z',
			},
		]
		const noAccess = new UltimaBase({
			masterAuthority: authority('none'),
			pluginPrivileges: { logger: false },
			plugins: [createSupportPlugin(new AlternativeReadAdapter(plainRow))],
			schemas: [Plain],
		})
		const official = new UltimaBase({
			masterAuthority: authority('official'),
			pluginPrivileges: { logger: false },
			plugins: [
				accessPlugin(),
				createSupportPlugin(new AlternativeReadAdapter(plainRow)),
			],
			schemas: [Plain],
		})
		const alternativeFixture = createAlternativeFixture()
		const alternative = new UltimaBase({
			masterAuthority: authority('alternative'),
			pluginPrivileges: { logger: false },
			plugins: [
				alternativeFixture.engine.plugin,
				createSupportPlugin(alternativeFixture.adapter),
			],
			schemas: [alternativeFixture.Document],
		})

		try {
			await noAccess.start()
			const plainMaster = await Plain.findMany(undefined, {
				ultimabase: noAccess,
				useMasterKey: true,
			})
			await noAccess.dispose()
			await official.start()
			const officialMaster = await Plain.findMany(undefined, {
				ultimabase: official,
				useMasterKey: true,
			})
			await official.dispose()
			await alternative.start()
			const anonymousAlternative = await alternativeFixture.Document.findMany(
				undefined,
				{ ultimabase: alternative },
			)
			const alternativeMaster = await alternativeFixture.Document.findMany(
				undefined,
				{ ultimabase: alternative, useMasterKey: true },
			)

			expect(plainMaster[0]).toHaveProperty('secret', 'visible-to-core')
			expect(officialMaster[0]).toHaveProperty('secret', 'visible-to-core')
			expect(anonymousAlternative[0]).not.toHaveProperty('secret')
			expect(alternativeMaster[0]).toHaveProperty('secret', 'hidden')
			expect(audit).toHaveLength(3)
			expect(audit).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/^none:Schema command find-many/u),
					expect.stringMatching(/^official:Schema command find-many/u),
					expect.stringMatching(/^alternative:Schema command find-many/u),
				]),
			)
		} finally {
			await Promise.all([
				noAccess.dispose(),
				official.dispose(),
				alternative.dispose(),
			])
		}
	})

	it('keeps generated contracts valid through compiled package exports', () => {
		const { adapter, Document, engine } = createAlternativeFixture()
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [createSupportPlugin(adapter), engine.plugin],
			schemas: [Document],
		})
		const generated = generateApplicationTypes({
			application,
			applicationId: 'alternative-policy-language-service',
		}).contents
		const repository = path.resolve(import.meta.dirname, '../..')
		const fileName = path.join(
			import.meta.dirname,
			'alternative-policy-language-service.fixture.ts',
		)
		const source = `import type {} from '@ultimabase/core'\n${generated}\nconst valid: AlternativePolicyDocumentCreateInput = { title: 'Post', tenant: 'community' }\n// @ts-expect-error -- The generated schema retains string fields.\nconst invalid: AlternativePolicyDocumentCreateInput = { title: 'Post', tenant: 1 }\nvoid valid\nvoid invalid\n`
		const host: ts.LanguageServiceHost = {
			fileExists: (requested) => ts.sys.fileExists(requested),
			getCompilationSettings: () => ({
				baseUrl: repository,
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				paths: {
					'@ultimabase/core': ['packages/core/dist/index.d.ts'],
					'@ultimabase/shared': ['packages/shared/dist/index.d.ts'],
				},
				strict: true,
				target: ts.ScriptTarget.ESNext,
			}),
			getCurrentDirectory: () => repository,
			getDefaultLibFileName: ts.getDefaultLibFilePath,
			getScriptFileNames: () => [fileName],
			getScriptSnapshot: (requested) => {
				const value =
					requested === fileName ? source : ts.sys.readFile(requested)
				return value === undefined
					? undefined
					: ts.ScriptSnapshot.fromString(value)
			},
			getScriptVersion: () => '0',
			readFile: (requested) => ts.sys.readFile(requested),
		}

		expect(
			ts.createLanguageService(host).getSemanticDiagnostics(fileName),
		).toStrictEqual([])
	})
})
