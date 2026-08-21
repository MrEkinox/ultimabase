import type { ACL } from './acl.js'
import {
	normalizeACLSchemaOption,
	type ACLDefaultFactory,
	type ACLDefaultInput,
	type ACLInputResolver,
	type ACLSchemaLimits,
	type ACLSchemaOption,
	type NormalizedACLSchemaOption,
} from './acl-option.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly acl?: ACLSchemaOption<this>
	}
}

interface ACLTestOptions<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly default?: ACL | ACLDefaultFactory<TData>
	readonly limits?: ACLSchemaLimits
	readonly resolveInput?: ACLInputResolver<TData>
}

export const normalizedACL = <
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
>(
	options: ACLTestOptions<TData> = {},
): NormalizedACLSchemaOption<TData> =>
	normalizeACLSchemaOption(options, 'test.acl')

export type { ACLDefaultInput }
