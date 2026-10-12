import { ACL } from './acl.js'
import {
	normalizeACLSchemaOption,
	type ACLClientSharing,
	type ACLDefaultFactory,
	type ACLDefaultInput,
	type ACLInputResolver,
	type ACLSchemaLimits,
	type NormalizedACLSchemaOption,
} from './acl-option.js'

interface ACLTestOptions<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly clientSharing?: ACLClientSharing
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
	// Unit fixtures keep the empty default unless a test states one.
	normalizeACLSchemaOption({ default: new ACL(), ...options }, 'test.acl')

export type { ACLDefaultInput }
