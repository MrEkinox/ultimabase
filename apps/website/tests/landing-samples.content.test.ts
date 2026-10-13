import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	applicationExample,
	readExample,
	schemaExample,
	writeExample,
} from '../components/landing/content'
import { demoExamples } from '../components/landing/demo-content'
import {
	compileLandingApplication,
	compileLandingSample,
	formatLandingDiagnostics,
	withLandingDirectory,
} from './landing-check'

// The application excerpt imports Article from its own file; one module holds both here.
const applicationModule = applicationExample
	.replace("import { Article } from './article.js'", '')
	.replace("import { UltimaBase } from '@ultimabase/core'", '')

describe('landing page examples', () => {
	it('compiles the displayed application and preserves selected result types', async () => {
		await withLandingDirectory(async (directory) => {
			// Core validates the displayed declarations without opening storage.
			const compiled = await compileLandingApplication(
				path.join(directory, 'application.ts'),
				schemaExample +
					'\n' +
					applicationModule
						.replace('const app =', 'export const app =')
						.replace('await app.start()', ''),
			)
			expect(compiled.schemas.has('Article')).toBe(true)

			// Compile the displayed excerpts themselves, so copy cannot drift from the API.
			// The types come from the schema and the Register declaration alone.
			const filename = path.join(directory, 'landing-example.ts')
			const program = await compileLandingSample(
				filename,
				[
					schemaExample,
					applicationModule,
					readExample,
					writeExample,
					`const title: string = article.title
const selectedTitle: string | undefined = articles[0]?.title
// @ts-expect-error A field excluded by select must not leak into the result type.
articles[0]?.published
// @ts-expect-error The schema requires a string title.
const invalid: number = article.title
void title; void selectedTitle; void invalid;
await app.dispose()`,
				].join('\n\n'),
				{ noUncheckedIndexedAccess: true },
			)
			expect(formatLandingDiagnostics(program)).toBe('')
			// Read the compiler's inferred model properties, not handwritten substitute types.
			const checker = program.getTypeChecker()
			const compiledSample = program.getSourceFile(filename)
			if (!compiledSample) throw new Error('Landing sample was not compiled')
			const declarations = compiledSample.statements.flatMap((statement) =>
				ts.isVariableStatement(statement)
					? [...statement.declarationList.declarations]
					: [],
			)
			for (const example of demoExamples) {
				const name = example.label === 'Read' ? 'articles' : 'article'
				const declaration = declarations.find(
					(item) => item.name.getText(compiledSample) === name,
				)
				if (!declaration) throw new Error(`Missing sample variable: ${name}`)
				const inferred = checker.getTypeAtLocation(declaration.name)
				const model =
					example.label === 'Read'
						? checker.getIndexTypeOfType(inferred, ts.IndexKind.Number)
						: inferred
				if (!model) throw new Error('Missing inferred Article model')
				for (const field of example.fields) {
					const property = model.getProperty(field.name)
					if (!property) throw new Error(`Missing model field: ${field.name}`)
					expect(
						checker.typeToString(
							checker.getTypeOfSymbolAtLocation(property, declaration),
						),
					).toBe(field.type)
				}
				if (example.label === 'Read')
					expect(model.getProperty('published')).toBeUndefined()
			}
		})
	}, 20_000)
})
