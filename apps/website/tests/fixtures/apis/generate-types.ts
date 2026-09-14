import { fileURLToPath } from 'node:url'

import {
	generateApplicationTypes,
	writeGeneratedTypeFile,
} from '@ultimabase/typegen'

import { createApiFixture } from './application.ts'

const fixture = await createApiFixture()
const outputPath = fileURLToPath(
	new URL('./.ultimabase/schema.generated.d.ts', import.meta.url),
)

try {
	const generated = generateApplicationTypes({
		application: fixture.application.application,
		applicationId: 'website-apis',
	})
	await writeGeneratedTypeFile({
		applicationId: 'website-apis',
		contents: generated.contents,
		outputPath,
	})
} finally {
	await fixture.application.dispose()
}
