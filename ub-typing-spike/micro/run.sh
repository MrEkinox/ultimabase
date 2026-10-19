#!/bin/sh
# Usage: ./run.sh <dir>...  — strict check of each micro experiment directory.
for d in "$@"; do echo "== $d"; node /Users/mrekinox/Desktop/ub-small/node_modules/typescript/bin/tsc --noEmit --strict --module nodenext --target es2024 --allowImportingTsExtensions --exactOptionalPropertyTypes --noUncheckedIndexedAccess --skipLibCheck "$d"/*.ts 2>&1 | head -14; done
