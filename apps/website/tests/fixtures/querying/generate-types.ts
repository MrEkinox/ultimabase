import { fileURLToPath } from 'node:url'

import {
	generateApplicationTypes,
	writeGeneratedTypeFile,
} from '@ultimabase/typegen'

import { ultimabase } from './ultimabase.ts'

const outputPath = fileURLToPath(
	new URL('./.ultimabase/schema.generated.d.ts', import.meta.url),
)

try {
	const generated = generateApplicationTypes({
		application: ultimabase.application,
		applicationId: 'website-querying',
	})
	await writeGeneratedTypeFile({
		applicationId: 'website-querying',
		contents: generated.contents,
		outputPath,
	})
} finally {
	await ultimabase.dispose()
}
