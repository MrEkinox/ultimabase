import glob,re,sys,shutil,subprocess,os
src='/Users/mrekinox/Desktop/ub-typing-spike/gen/'+sys.argv[1]
keep=sys.argv[2]
dst='/Users/mrekinox/Desktop/ub-typing-spike/scratch/toggle'
shutil.rmtree(dst,ignore_errors=True); shutil.copytree(src,dst)
blocks={
 'read':"		read: { where: ({ where }) => where.eq('f2', false) },\n",
 'cross':"		update: { where: ({ where }) => where.is('next', (next) => next.eq('f0', 'x')) },\n",
 'hooks':"	hooks: {\n		beforeSave: ({ item }) => {\n			if (item.f0.length === 0) throw new TypeError('f0')\n		},\n	},\n",
 'acl':"	acl: { default: (data) => (data.f0 === '' ? acl : acl.grantPublic('read')) },\n",
}
for f in glob.glob(dst+'/src/s*.ts'):
    s=open(f).read()
    for k,b in blocks.items():
        if k not in keep.split(','):
            b2=b
            if sys.argv[1].startswith('e'): b2=b.replace('\n\t','\n\t\t')
            s=s.replace(b,'').replace(b2,'')
    open(f,'w').write(s)
os.remove(dst+'/src/usage.ts')
out=subprocess.run(['/Users/mrekinox/Desktop/ub-typing-spike/tsc','-p',dst+'/tsconfig.json','--extendedDiagnostics'],capture_output=True,text=True).stdout
err=[l for l in out.splitlines() if 'error' in l][:2]
ct=[l for l in out.splitlines() if 'Check time' in l or 'Instantiations' in l]
print(keep, ' | '.join(x.strip() for x in ct), err)
