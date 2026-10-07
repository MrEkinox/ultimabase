import { ACL } from '@ultimabase/acl-permissions-plugin'

/** Narrows one Typegen-free plugin field after verifying its Runtime value. */
export const requireACLValue = (value: unknown, message: string): ACL => {
	if (!(value instanceof ACL)) throw new TypeError(message)

	return value
}
