import path from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageServiceWorkspace } from '../../tooling/vitest/typescript-language-service.js'

// ADR-0297 amendment 1: constructing an application without the `Register`
// declaration is a clear type error, from source and from built packages.
const sourceSpecifier = '../../packages/core/src/index.js'
const builtSpecifier = '@ultimabase/core'

const application = (specifier: string, register: boolean): string => `
import { UltimaBase } from '${specifier}'

export const Todo = UltimaBase.Schema.define({
  className: 'RegisterTodo',
  fields: (field) => ({ title: field.string() }),
})
export const ultimabase = new UltimaBase({ schemas: [Todo] })
${
	register
		? `
declare module '${specifier}' {
  interface Register {
    readonly app: typeof ultimabase
  }
}
`
		: ''
}`

const diagnosticsOf = (specifier: string, register: boolean) => {
	const fileName = path.join(
		import.meta.dirname,
		`register-${register ? 'declared' : 'missing'}-${specifier === builtSpecifier ? 'built' : 'source'}.fixture.ts`,
	)
	const source = application(specifier, register)
	const workspace = createLanguageServiceWorkspace()
	workspace.addFile(fileName, source)
	try {
		return workspace.service
			.getSemanticDiagnostics(fileName)
			.map((diagnostic) => ({
				line:
					diagnostic.start === undefined
						? undefined
						: source.slice(0, diagnostic.start).split('\n').length,
				message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
			}))
	} finally {
		workspace.service.dispose()
	}
}

describe('Register is required (ADR-0297 amendment 1)', () => {
	it.each([
		['source', sourceSpecifier],
		['built packages', builtSpecifier],
	])(
		'reports a missing declaration on new UltimaBase() from %s',
		(_label, specifier) => {
			const diagnostics = diagnosticsOf(specifier, false)

			expect(diagnostics).toHaveLength(1)
			expect(diagnostics[0]?.line).toBe(8)
			expect(diagnostics[0]?.message).toContain(
				"Declare the application in Register: declare module '@ultimabase/core' { interface Register { readonly app: typeof ultimabase } }",
			)
		},
		60_000,
	)

	it.each([
		['source', sourceSpecifier],
		['built packages', builtSpecifier],
	])(
		'accepts the application once it is declared, from %s',
		(_label, specifier) => {
			expect(diagnosticsOf(specifier, true)).toStrictEqual([])
		},
		60_000,
	)
})

// Regression (spike register-cycle): an unfinished `define(...)` beside a
// finished declaration made `typeof ultimabase` circular in `Register`
// (TS7022 / TS2502), because the registry was read while TypeScript measured
// variances during the inference of `new UltimaBase(...)`.
const mixedApplication = (specifier: string): string => `
import { UltimaBase } from '${specifier}'

export const App = UltimaBase.use()
export const Unfinished = App.Schema.define({
  className: 'RegisterUnfinished',
  fields: (field) => ({ name: field.string() }),
})
export const Empty = App.Schema.define({
  className: 'RegisterEmpty',
  fields: () => ({}),
})
export const Finished = App.Schema.define({
  className: 'RegisterFinished',
  fields: (field) => ({ name: field.string() }),
}).with({})
export const ultimabase = new App({ schemas: [Unfinished, Empty, Finished] })
export const unfinishedRows = await Unfinished.findMany()

declare module '${specifier}' {
  interface Register {
    readonly app: typeof ultimabase
  }
}
`

describe('Register with unfinished declarations', () => {
	it.each([
		['source', sourceSpecifier],
		['built packages', builtSpecifier],
	])(
		'names the application beside unfinished define() calls, from %s',
		(_label, specifier) => {
			const fileName = path.join(
				import.meta.dirname,
				`register-unfinished-${specifier === builtSpecifier ? 'built' : 'source'}.fixture.ts`,
			)
			const source = mixedApplication(specifier)
			const workspace = createLanguageServiceWorkspace()
			workspace.addFile(fileName, source)
			try {
				const diagnostics = workspace.service
					.getSemanticDiagnostics(fileName)
					.map((diagnostic) =>
						ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
					)
				expect(diagnostics).toStrictEqual([])
				const at = source.indexOf('unfinishedRows')
				const hover = workspace.service.getQuickInfoAtPosition(fileName, at)
				expect(ts.displayPartsToString(hover?.displayParts)).toBe(
					'const unfinishedRows: readonly Model<"RegisterUnfinished">[]',
				)
			} finally {
				workspace.service.dispose()
			}
		},
		60_000,
	)
})
