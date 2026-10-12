import { accessPlugin } from '../../../../access-plugin/dist/index.js'
import { password } from '../../../../auth-password/dist/index.js'
import { authPlugin } from '../../../../auth-plugin/dist/index.js'
import { UltimaBase } from '../../../../core/dist/index.js'
import { hooksPlugin } from '../../../../hooks-plugin/dist/index.js'
import { pgVectorPlugin } from '../../../../pg-vector-plugin/dist/index.js'
import { rolesPlugin } from '../../../../roles-plugin/dist/index.js'
import { softDeletePlugin } from '../../../../soft-delete-plugin/dist/index.js'
import { validationPlugin } from '../../../../validation-plugin/dist/index.js'

const scalarFieldCount = 12
const schemaName = (index) =>
	index === 0 ? 'User' : index === 1 ? 'Role' : `Schema${String(index)}`
const scalarName = (index) => `field${String(index)}`
const scalarMethod = (index) => (index % 2 === 0 ? 'string' : 'int')

const runtimeFields = (field) => {
	const fields = {}
	for (let index = 0; index < scalarFieldCount; index += 1) {
		fields[scalarName(index)] = field[scalarMethod(index)]({
			...(index === 0 ? { required: true } : {}),
		})
	}
	return {
		...fields,
		children: field.relation({ target: 'User' }),
		details: field.object({
			fields: (embedded) => ({
				label: embedded.string({ required: true }),
			}),
		}),
		embedding: field.vector({ dimensions: 3 }),
		related: field.pointer({ target: 'User' }),
	}
}

/** Builds the exact current static graph used by both benchmark forms. */
export const createCurrentTypegenRuntimeFixture = (schemaCount) => {
	const Base = UltimaBase.use(
		accessPlugin(),
		hooksPlugin(),
		pgVectorPlugin(),
		rolesPlugin(),
		softDeletePlugin(),
		validationPlugin(),
		authPlugin({ methods: [password()] }),
	)
	const schemas = []
	const User = Base.UserSchema.define({
		className: 'User',
		fields: runtimeFields,
	})
	schemas.push(User)
	if (schemaCount > 1) {
		schemas.push(
			Base.RoleSchema.define({
				className: 'Role',
				fields: runtimeFields,
				members: () => User,
			}).with({}),
		)
	}
	const Application = Base
	for (let index = 2; index < schemaCount; index += 1) {
		schemas.push(
			Application.Schema.define({
				className: schemaName(index),
				fields: runtimeFields,
			}).softDelete({ mode: 'command' }),
		)
	}

	return new Application({
		logger: false,
		schemas,
	})
}
