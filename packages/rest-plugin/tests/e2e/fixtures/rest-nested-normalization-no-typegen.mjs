/* global Request, process */

import { Schema, SchemaRegistry } from '@ultimabase/core'
import {
	normalizeRestMutationRequest,
	restMutationErrorCodes,
} from '@ultimabase/rest-plugin'

const Target = Schema.define({
	className: 'JavaScriptRestNestedTarget',
	fields: (field) => ({ score: field.bigint() }),
})

const Source = Schema.define({
	className: 'JavaScriptRestNestedSource',
	fields: (field) => ({
		primary: field.pointer({ target: 'JavaScriptRestNestedTarget' }),
		targets: field.relation({ target: 'JavaScriptRestNestedTarget' }),
	}),
})

new SchemaRegistry([Target, Source]).resolveSchemaTargets()

const request = (body) =>
	new Request('https://example.test/sources', {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})

const id = '01991f00-0000-7000-8000-000000000401'
const command = await normalizeRestMutationRequest(Source, {
	operation: 'create',
	request: request({
		primary: { create: { score: '7' } },
		targets: { connect: [id] },
	}),
})

let legacyCode = null
try {
	await normalizeRestMutationRequest(Source, {
		operation: 'create',
		request: request({
			primary: {
				className: 'JavaScriptRestNestedTarget',
				id,
				type: 'pointer',
			},
		}),
	})
} catch (error) {
	legacyCode = error?.code ?? null
}

process.stdout.write(
	JSON.stringify({
		connect: command.input.data.targets.connect,
		kind: command.kind,
		legacyCode,
		score: String(command.input.data.primary.create.score),
		validLegacyRejection: legacyCode === restMutationErrorCodes.invalidInput,
	}),
)
