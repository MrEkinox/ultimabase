# usage: mk.sh <name> [python edits file]; copies fixture into scratch/<name> linked to ../../lib (or $LIB)
set -e
cd /Users/mrekinox/Desktop/ub-typing-spike/forms/d-class-body/scratch
rm -rf $1; cp -R ../fixture $1
echo '{ "extends": "../../../../tsconfig.base.json", "compilerOptions": { "allowImportingTsExtensions": true }, "include": ["src/**/*.ts"] }' > $1/tsconfig.json
rm $1/node_modules/@ultimabase/core; ln -s ${LIB:-../../../../lib} $1/node_modules/@ultimabase/core
if [ -n "$2" ]; then python3 $2 $1/src; fi
cd /Users/mrekinox/Desktop/ub-typing-spike && ./tsc -p forms/d-class-body/scratch/$1 > forms/d-class-body/scratch/$1/tsc.txt || true
echo "$1: $(grep -c 'error TS' forms/d-class-body/scratch/$1/tsc.txt) errors; $(grep -o 'error TS[0-9]*' forms/d-class-body/scratch/$1/tsc.txt | sort | uniq -c | tr '\n' ' ')"
