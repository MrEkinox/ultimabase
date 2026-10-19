#!/bin/sh
# Runs every measurement 3 times in fresh processes; appends JSON lines to results/.
# Usage: tools/run-bench.sh "c d e" "10 50 200" [suffix]   (suffix: results/bench<suffix>.jsonl, tsc<suffix>.jsonl)
cd "$(dirname "$0")/.." || exit 1
VARIANTS=${1:-"c d e"}
SIZES=${2:-"10 50 200"}
SUFFIX=${3:-}
echo "load: $(uptime)" | tee -a results/bench-load.txt
for n in $SIZES; do
	for v in $VARIANTS; do
		node tools/gen.mjs "$v" "$n" >/dev/null
		for run in 1 2 3; do
			node --expose-gc --max-old-space-size=12288 tools/bench.mjs "gen/$v-$n" >> "results/bench$SUFFIX.jsonl"
			( cd "gen/$v-$n" && /usr/bin/time -l ../../tsc -p tsconfig.json --extendedDiagnostics 2>&1 ) \
				| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const g=(r)=>{const m=s.match(r);return m?m[1]:null};console.log(JSON.stringify({dir:'$v-$n',run:$run,checkS:+g(/Check time:\s+([\d.]+)s/),totalS:+g(/Total time:\s+([\d.]+)s/),memoryK:+g(/Memory used:\s+(\d+)K/),instantiations:+g(/Instantiations:\s+(\d+)/),types:+g(/Types:\s+(\d+)/),maxRssBytes:+g(/(\d+)\s+maximum resident set size/),errors:(s.match(/error TS/g)||[]).length}))})" >> "results/tsc$SUFFIX.jsonl"
		done
		echo "done $v-$n $(uptime | sed 's/.*load averages: //')"
	done
done
