# usage: mk.sh <name> <register:yes|no> <cross:yes|no>
set -e
cd /Users/mrekinox/Desktop/ub-typing-spike/forms/d-class-wrapper/scratch
rm -rf $1; cp -R ../fixture $1
echo '{ "extends": "../../../../tsconfig.base.json", "compilerOptions": { "allowImportingTsExtensions": true }, "include": ["src/**/*.ts"] }' > $1/tsconfig.json
rm $1/node_modules/@ultimabase/core; ln -s ../../../../lib $1/node_modules/@ultimabase/core
if [ "$2" = no ]; then sed -i '' 's/readonly app: typeof ultimabase/readonly unrelated: true/' $1/src/ultimabase.ts; fi
if [ "$3" = no ]; then
python3 - $1 <<'PY'
import sys
d=sys.argv[1]+'/src/'
def sub(p,a,b):
    s=open(d+p).read(); assert a in s,(p,a); open(d+p,'w').write(s.replace(a,b))
sub('todo.ts',"where.is('assignee', (user) => user.eq('id', userId))","where.eq('id', userId)")
sub('todo.ts',"delete: { where: () => ({ assignee: { is: { email: { endsWith: '@admin.test' } } } }) },","")
sub('todo-user.ts',"where.some('assignedTodos', (todo) => todo.eq('archived', false))","where.eq('displayName', 'x')")
sub('tag.ts',"where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))","where.eq('name', userId)")
sub('todo-role.ts',"where.some('members', (user) => user.eq('id', userId))","where.eq('name', userId)")
PY
fi
cd /Users/mrekinox/Desktop/ub-typing-spike && ./tsc -p forms/d-class-wrapper/scratch/$1 > forms/d-class-wrapper/scratch/$1/tsc.txt || true
echo "$1: $(grep -c 'error TS' forms/d-class-wrapper/scratch/$1/tsc.txt) errors; $(grep -o 'error TS[0-9]*' forms/d-class-wrapper/scratch/$1/tsc.txt | sort | uniq -c | tr '\n' ' ')"
