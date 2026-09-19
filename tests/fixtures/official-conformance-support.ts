import { Schema, type SchemaDefinition } from '@ultimabase/core'
import { PluginConformanceError } from '@ultimabase/testing'
import { expect } from 'vitest'

export const createProofSchema = () =>
	Schema.define({
		className: 'OfficialCapabilityConformancePost',
		fields: (field) => ({ title: field.string() }),
	})

export const requireSchema = <TSchema extends SchemaDefinition>(
	schema: TSchema | undefined,
	label: string,
): TSchema => {
	if (schema === undefined)
		throw new TypeError(`${label} schema is unavailable`)
	return schema
}

export const expectConformanceFailure = (
	failure: unknown,
	pluginId: string,
	message: string,
): void => {
	expect(failure).toBeInstanceOf(PluginConformanceError)
	if (!(failure instanceof PluginConformanceError)) {
		throw new TypeError('Expected a plugin conformance failure')
	}
	expect(failure).toMatchObject({
		contract: 'capability-contracts',
		pluginId,
	})
	if (!(failure.cause instanceof Error)) {
		throw new TypeError('Expected the conformance failure to retain its cause')
	}
	expect(failure.cause.message).toContain(message)
}

export const requireEvidence = <TEvidence>(
	storage: WeakMap<object, TEvidence>,
	schema: SchemaDefinition,
	label: string,
): TEvidence => {
	const evidence = storage.get(schema)
	if (evidence === undefined) {
		throw new TypeError(`${label} conformance evidence is unavailable`)
	}
	return evidence
}
