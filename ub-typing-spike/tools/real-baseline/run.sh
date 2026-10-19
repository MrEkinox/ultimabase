#!/bin/sh
# Real Typegen baseline (ub-small built packages, generated declarations), 3 fresh runs per size.
cd "$(dirname "$0")" || exit 1
for n in ${1:-10 50 200}; do
	for run in 1 2 3; do
		node --expose-gc --max-old-space-size=12288 probe.mjs "$n" >> ../../results/real-baseline.jsonl
	done
	echo "done real-$n $(uptime | sed 's/.*load averages: //')"
done
