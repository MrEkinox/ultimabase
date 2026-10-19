# Section 10: drop chained calls from a generated F app (no usage.ts) and report check time.
import glob,sys,shutil,subprocess,os,re
src='/Users/mrekinox/Desktop/ub-typing-spike/gen/'+sys.argv[1]; dst='/Users/mrekinox/Desktop/ub-typing-spike/scratch/ftoggle'
shutil.rmtree(dst,ignore_errors=True); shutil.copytree(src,dst); os.remove(dst+'/src/usage.ts')
drop=[d for d in (sys.argv[2] if len(sys.argv)>2 else '').split(',') if d]
for f in glob.glob(dst+'/src/s*.ts'):
    s=open(f).read()
    for d in drop:
        s=re.sub(r'\n\t\.'+d+r'\((?:[^\n]*\n(?!\t\.))*?[^\n]*\)(?=\n\t\.|\n?$)', '', s)
    open(f,'w').write(s)
out=subprocess.run(['/Users/mrekinox/Desktop/ub-typing-spike/tsc','-p',dst+'/tsconfig.json','--extendedDiagnostics'],capture_output=True,text=True).stdout
print(sys.argv[1], drop, [l.split(':')[1].strip() for l in out.splitlines() if 'Check time' in l], len([l for l in out.splitlines() if 'error' in l]))
