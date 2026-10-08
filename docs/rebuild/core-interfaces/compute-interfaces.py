import os,re,collections,sys
# Partitions for parallel core rebuild
P={
 'core-plugins':['plugins','application','errors','foundation.ts','index.ts'],
 'core-schema':['schema'],
 'core-query':['query','access'],
 'core-runtime-pipeline':['runtime/pipeline','runtime/enforcement','runtime/behaviors','runtime/validation','runtime/operations','runtime/contributions','runtime/relation-filters','runtime/relations','runtime/virtual-fields','runtime/nested-writes'],
 'core-runtime-app':['runtime','private-storage'],
}
def part(p):
    best=None;bl=-1
    for k,ps in P.items():
        for pre in ps:
            if (p==pre or p.startswith(pre+'/')) and len(pre)>bl: best,bl=k,len(pre)
    return best
iface=collections.defaultdict(lambda: collections.defaultdict(set))
for base in ['src','tests']:
  for d,_,fs in os.walk(base):
    for f in fs:
        if not f.endswith('.ts'): continue
        p=os.path.join(d,f); rel=os.path.relpath(p,'src') if base=='src' else None
        src=part(rel) if rel else 'tests/'
        txt=open(p).read()
        for names,m in re.findall(r"import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(\.[^']+)'",txt):
            t=os.path.normpath(os.path.join(os.path.dirname(p),m))
            if not t.startswith('src/'): continue
            trel=t[4:].replace('.js','.ts'); tp=part(trel)
            if tp is None or tp==src: continue
            if trel=='index.ts': continue
            for n in names.split(','):
                n=n.strip().replace('type ','').split(' as ')[0].strip()
                if n: iface[tp][trel].add(n)
for k in P:
    out=open(f'/tmp/iface-{k}.txt','w')
    tot=0
    for mod in sorted(iface[k]):
        out.write(f"src/{mod}: {', '.join(sorted(iface[k][mod]))}\n"); tot+=len(iface[k][mod])
    print(k, len(iface[k]), 'modules', tot, 'symbols')
