import type { FrameworkApplication } from '../../application/framework-application.js'
import { FrameworkError } from '../../errors/framework-error.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	getMasterRequestContextProvenance,
	getRequestContextOwner,
	setRequestContextOwner,
} from '../context/request-context.js'
import type { RequestContext } from '../context/request-context.js'

type EngineApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

/** Closes every escaped execution object when its application starts teardown. */
export const assertApplicationEngineAvailable = (
	application: EngineApplication,
): void => {
	if (
		application.state === 'stopping' ||
		application.state === 'stopped' ||
		application.state === 'disposing' ||
		application.state === 'disposed'
	) {
		throw new TypeError(
			`Framework engine cannot be used while application is ${application.state}`,
		)
	}
}

/** Claims an unbound context or rejects reuse across isolated applications. */
export const bindRequestContextToApplication = (
	application: EngineApplication,
	context: RequestContext,
	masterAuthority: object | undefined,
): void => {
	const owner = getRequestContextOwner(context)

	if (context.access.mode === 'master') {
		const provenance = getMasterRequestContextProvenance(context)

		if (
			provenance?.application !== application ||
			provenance.authority !== masterAuthority ||
			owner !== application
		) {
			throw new FrameworkError(
				'PERMISSION_DENIED',
				'Explicit master context was not issued by this application authority.',
				{
					publicMessage: 'Master authority is not available.',
					internalDetails: {
						reason: 'master-context-provenance-mismatch',
					},
				},
			)
		}

		return
	}

	if (owner !== undefined && owner !== application) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Explicit request context belongs to another application.',
			{
				publicMessage: 'The request context is not available.',
				internalDetails: {
					reason: 'operation-context-application-mismatch',
				},
			},
		)
	}

	if (owner === undefined) {
		setRequestContextOwner(context, application)
	}
}
