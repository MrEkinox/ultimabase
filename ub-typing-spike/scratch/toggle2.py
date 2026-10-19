import glob,sys,shutil,subprocess,os
src='/Users/mrekinox/Desktop/ub-typing-spike/gen/'+sys.argv[1]; dst='/Users/mrekinox/Desktop/ub-typing-spike/scratch/toggle2'
shutil.rmtree(dst,ignore_errors=True); shutil.copytree(src,dst)
repl=sys.argv[2]
for f in glob.glob(dst+'/src/s*.ts'):
    s=open(f).read()
    s=s.replace("		update: { where: ({ where }) => where.is('next', (next) => next.eq('f0', 'x')) },\n","")
    s=s.replace("	hooks: {\n		beforeSave: ({ item }) => {\n			if (item.f0.length === 0) throw new TypeError('f0')\n		},\n	},\n","")
    s=s.replace("	acl: { default: (data) => (data.f0 === '' ? acl : acl.grantPublic('read')) },\n","")
    s=s.replace("where.eq('f2', false)", repl)
    open(f,'w').write(s)
os.remove(dst+'/src/usage.ts')
out=subprocess.run(['/Users/mrekinox/Desktop/ub-typing-spike/tsc','-p',dst+'/tsconfig.json','--extendedDiagnostics'],capture_output=True,text=True).stdout
print(repl, [l.strip() for l in out.splitlines() if 'Check time' in l or 'error' in l][:3])
