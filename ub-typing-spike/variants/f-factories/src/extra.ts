import { App } from './factory.ts'

// A second schema from the same password-auth factory; registering it must fail.
export const Customer = App.PasswordUserSchema.define({ className: 'Customer', fields: (field) => ({ note: field.string() }) })
