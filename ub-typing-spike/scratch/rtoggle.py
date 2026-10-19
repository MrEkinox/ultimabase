# Section 9: per-option check-time bisection of a generated app (no usage.ts).
import glob,sys,shutil,subprocess
src='/Users/mrekinox/Desktop/ub-typing-spike/gen/'+sys.argv[1]; dst='/Users/mrekinox/Desktop/ub-typing-spike/scratch/rtoggle'
shutil.rmtree(dst,ignore_errors=True); shutil.copytree(src,dst)
import os; os.remove(dst+'/src/usage.ts')
drop=sys.argv[2].split(',') if len(sys.argv)>2 and sys.argv[2] else []
parts={
 'read':"		read: { where: ({ where }) => where.eq('f2', false) },\n",
 'update':"		update: { where: ({ where }) => where.is('next', (next) => next.eq('f0', 'x')) },\n",
 'hooks':"	hooks: {\n		beforeSave: ({ item }) => {\n			if (item.f0.length === 0) throw new TypeError('f0')\n		},\n	},\n",
 'acl':"	acl: { default: (data) => (data.f0 === '' ? acl : acl.grantPublic('read')) },\n",
 'with':None,
}
for f in glob.glob(dst+'/src/s*.ts'):
    s=open(f).read()
    for d in drop:
        if d=='with':
            s=s[:s.index('.with(')]+'\n'
        else: s=s.replace(parts[d],'')
    open(f,'w').write(s)
out=subprocess.run(['/Users/mrekinox/Desktop/ub-typing-spike/tsc','-p',dst+'/tsconfig.json','--extendedDiagnostics'],capture_output=True,text=True).stdout
print(sys.argv[1], drop, [l.split(':')[1].strip() for l in out.splitlines() if 'Check time' in l], len([l for l in out.splitlines() if 'error' in l]))
