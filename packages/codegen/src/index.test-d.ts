import {
	FrameworkApplication,
	Schema,
	type PluginDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	codegenPlugin,
	generateApplicationTypes,
	loadTypegenApplication,
	readGeneratedTypeFingerprint,
	writeGeneratedTypeFile,
	writeGeneratedTypeFiles,
	type CodegenPlugin,
	type CodegenPluginExports,
	type GeneratedApplicationTypes,
	type TypegenApplicationSnapshot,
} from './index.js'

const Document = Schema.define({
	className: 'CodegenPublicTypeDocument',
	fields: (field) => ({
		title: field.string(),
	}),
})
const application = new FrameworkApplication({
	plugins: [],
	schemas: [Document],
})

test('exposes precise generation, loading, and atomic writer contracts', () => {
	const generated = generateApplicationTypes({
		application,
		applicationId: 'fixture.public-types',
	})

	expectTypeOf(generated).toEqualTypeOf<GeneratedApplicationTypes>()
	expectTypeOf(generated.snapshot).toEqualTypeOf<TypegenApplicationSnapshot>()
	expectTypeOf(generated.contents).toEqualTypeOf<string>()
	expectTypeOf(generated.fingerprint).toEqualTypeOf<string>()
	expectTypeOf(readGeneratedTypeFingerprint(generated.contents)).toEqualTypeOf<
		string | undefined
	>()
	expectTypeOf(
		loadTypegenApplication({
			exportName: 'ultimabase',
			sourcePath: './application.ts',
		}),
	).toEqualTypeOf<
		Promise<
			FrameworkApplication<
				readonly SchemaDefinition[],
				readonly PluginDefinition[]
			>
		>
	>()
	expectTypeOf(
		writeGeneratedTypeFile({
			applicationId: 'fixture.public-types',
			contents: generated.contents,
			outputPath: './generated.d.ts',
		}),
	).toEqualTypeOf<Promise<void>>()
	expectTypeOf(writeGeneratedTypeFiles([])).toEqualTypeOf<Promise<void>>()
})

test('exposes automatic startup generation as a typed application plugin', () => {
	const plugin = codegenPlugin({
		applicationId: 'fixture.public-types',
		outputPath: './generated.d.ts',
	})
	const generatedApplication = new FrameworkApplication({
		plugins: [plugin],
		schemas: [Document],
	})

	expectTypeOf(plugin).toEqualTypeOf<CodegenPlugin>()
	expectTypeOf(
		generatedApplication.getPlugin('@ultimabase/codegen'),
	).toEqualTypeOf<Readonly<CodegenPluginExports>>()
})
