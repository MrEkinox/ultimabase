import { app } from './ultimabase.js'
const role = app.registration.find((entry) => entry.className === 'TodoRole')
console.log('JS TodoRole fields:', Object.keys(role.fields).join(', '), '| rules:', Object.keys(role.rules).join(', '))
