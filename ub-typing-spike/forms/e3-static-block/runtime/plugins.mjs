// Runtime stub of the plugins: what each one contributes to the generic Core slots.

export const accessPlugin = () => ({ id: 'access', optionKeys: ['access'] })
export const hooksPlugin = () => ({ id: 'hooks', optionKeys: ['hooks'], fieldOptionKeys: ['hooks'] })
export const aclPlugin = () => ({ id: 'acl', optionKeys: ['acl'], fields: { acl: { kind: 'json', required: true } } })
export const softDeletePlugin = () => ({
	id: 'soft-delete',
	shapeMethods: { softDelete: () => ({ isDeleted: { kind: 'boolean', required: true, default: false } }) },
})
export const postgresPlugin = () => ({ id: 'postgres', optionKeys: ['postgres'] })
export const rolesPlugin = () => ({
	id: 'roles',
	factories: {
		RoleSchema: (core) => (className, declaration) =>
			core.createBase(
				className,
				(field) => ({
					...(declaration.fields?.(field) ?? {}),
					name: field.string({ required: true }),
					members: field.relation({ target: declaration.members }),
				}),
				{ factory: 'RoleSchema', statics: { addMember: async () => {} } },
			),
	},
})
export const passwordAuthPlugin = () => ({
	id: 'password-auth',
	factories: {
		PasswordUserSchema: (core) => (className, fields) =>
			core.createBase(
				className,
				(field) => ({ ...fields(field), username: field.string({ required: true }), email: field.string({ required: true }) }),
				{ factory: 'PasswordUserSchema', statics: { signUp: async () => ({ id: 'u1' }), login: async () => ({ sessionToken: 't' }) } },
			),
	},
})
