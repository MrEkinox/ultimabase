import { App } from './app.ts';
import { TodoUser } from './todo-user.ts';
export const TodoRole = App.RoleSchema.define({
    className: 'TodoRole',
    members: () => TodoUser,
    fields: (field) => ({ description: field.string() }),
    access: {
        read() {
            return this.where.some('members', (user) => user.eq('id', this.userId));
        },
        create: false,
    },
});
