import type {
	MasterRequestAccess,
	RequestAccess,
} from '../../src/access/index.js'
import {
	createTrustedMasterRequestContext,
	type RequestContext,
	setRequestContextOwner,
} from '../../src/runtime/context/request-context.js'

/** Creates one privately provenanced Master context for non-engine unit tests. */
export const createFixtureMasterContext = <
	TAccess extends RequestAccess,
	const TSource extends string,
>(
	reason: string,
	keyId: string,
	context: RequestContext<TAccess, TSource>,
): RequestContext<MasterRequestAccess, TSource> => {
	const application = Object.freeze({ kind: 'fixture-application' })
	const authority = Object.freeze({ kind: 'fixture-authority' })
	setRequestContextOwner(context, application)

	return createTrustedMasterRequestContext(reason, keyId, context, {
		application,
		authority,
	})
}
