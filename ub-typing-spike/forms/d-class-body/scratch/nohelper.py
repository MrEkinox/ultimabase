import sys,re
p=sys.argv[1]+'/todo.ts'; s=open(p).read()
i=s.index('\n\t/** Static helper'); j=s.index('\n}',i)
open(p,'w').write(s[:i]+s[j:])
