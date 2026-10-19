import sys
p=sys.argv[1]+'/ultimabase.ts'; s=open(p).read(); open(p,'w').write(s.replace('readonly app: typeof ultimabase','readonly unrelated: true'))
