"""One-time authoring recipe. Not part of the build; outputs are committed."""
import json, math, subprocess, pathlib, tempfile, wave, struct
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'
TMP=pathlib.Path(tempfile.mkdtemp(prefix='facet-'))
def run(tool,*args):
 subprocess.run([tool,*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def write(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(obj))
def line(ops,a,b,c):
 ops.append(dict(op='line',x0=round(a[0]),y0=round(a[1]),x1=round(b[0]),y1=round(b[1]),color=c))
def poly(ops,pts,c):
 for y in range(math.ceil(min(p[1] for p in pts)),math.ceil(max(p[1] for p in pts))):
  hits=[]
  for a,b in zip(pts,pts[1:]+pts[:1]):
   if min(a[1],b[1])<=y+.5<max(a[1],b[1]):hits.append(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  hits.sort()
  for l,r in zip(hits[::2],hits[1::2]):line(ops,(math.ceil(l),y),(math.floor(r),y),c)
def inside(x,y,pts):
 hits=0
 for a,b in zip(pts,pts[1:]+pts[:1]):
  if min(a[1],b[1])<=y<max(a[1],b[1]) and x<a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]):hits+=1
 return hits%2==1
def crack(ops,a,b,color,pts):
 steps=max(abs(b[0]-a[0]),abs(b[1]-a[1]))
 for i in range(steps+1):
  x=round(a[0]+(b[0]-a[0])*i/steps);y=round(a[1]+(b[1]-a[1])*i/steps)
  if inside(x,y,pts):line(ops,(x,y),(x,y),color)
def mix(c,k):
 rgb=[int(c[i:i+2],16) for i in [1,3,5]]
 return '#'+''.join(f'{max(0,min(255,round(v*k if k<1 else v+(255-v)*(k-1)))):02x}' for v in rgb)
kinds=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism']
colors=['#ed4676','#f79b46','#ecd768','#52ce93','#4cd7e3','#527ff0','#b580ef','#cbdfef']
shapes=[[(32,4),(56,29),(32,59),(7,30)],[(20,8),(43,8),(58,30),(43,54),(20,54),(5,30)],[(32,4),(57,47),(7,47)],[(18,7),(46,7),(53,16),(53,47),(44,55),(18,55),(10,47),(10,16)],[(32,4),(50,18),(53,41),(32,59),(11,41),(14,18)],[(13,13),(49,13),(57,32),(49,51),(13,51),(5,32)],[(32,4),(55,24),(47,49),(32,59),(17,49),(9,24)],[(32,3),(54,17),(54,45),(32,61),(10,45),(10,17)]]
def gem(idx,strain=0,frame=None,turn=0):
 pts=shapes[idx];base=colors[idx];ops=[]
 if idx==7 and turn:
  angle=turn*math.pi/4
  pts=[(32+(x-32)*math.cos(angle)-(y-32)*math.sin(angle),32+(x-32)*math.sin(angle)+(y-32)*math.cos(angle)) for x,y in pts]
 # Every face is independently lit. A dark girdle gives the pixel art depth.
 poly(ops,pts,mix(base,.32))
 outer=[(32+(x-32)*.94,32+(y-32)*.94) for x,y in pts]
 inner=[(32+(x-32)*.49,29+(y-32)*.49) for x,y in pts]
 for j,(a,b) in enumerate(zip(outer,outer[1:]+outer[:1])):
  face=[a,b,inner[(j+1)%len(pts)],inner[j]]
  if frame is not None:
   dx=((a[0]+b[0])/2-32)*frame*.22;dy=((a[1]+b[1])/2-32)*frame*.22
   face=[(x+dx,y+dy+frame*frame*.35) for x,y in face]
  col=colors[j%7] if idx==7 else base
  poly(ops,face,mix(col,[1.65,1.25,.62,.46,.85,1.45,1.2,1.6][(j+turn)%8]))
  line(ops,face[0],face[1],mix(col,1.55))
 if frame is None or frame<2:
  poly(ops,inner,mix(base,1.17))
  for j in range(0,len(inner),2):poly(ops,[inner[j],inner[(j+1)%len(inner)],(31,29)],mix(base,1.4 if j==0 else .94))
 if frame is None:
  line(ops,inner[0],inner[1],mix(base,1.88))
  line(ops,(22,18),(22,23),'#f7fbef');line(ops,(20,20),(24,20),'#f7fbef')
 if strain:
  cracks=[[(32,8),(28,22),(35,30),(29,40)],[(35,30),(45,33),(50,42)],[(29,40),(24,51),(28,56)],[(28,22),(17,29),(12,38)]]
  for path in cracks[:[0,1,2,4][strain]]:
   for a,b in zip(path,path[1:]):
    crack(ops,(a[0]+1,a[1]),(b[0]+1,b[1]),'#ffe5b5' if strain==3 else '#c7eeed',pts);crack(ops,a,b,'#191827',pts)
  if strain==3:
   for a,b in zip(pts,pts[1:]+pts[:1]):line(ops,a,b,'#fff0ba')
 return ops
def render(ops,path,w=64,h=64,sheet=False):
 log=TMP/'draw.json';write(log,ops);path=OUT/path;path.parent.mkdir(parents=True,exist_ok=True)
 run('draw-sheet' if sheet else 'draw','render','--actions',log,'--out',path,'--width',w,'--height',h,'--no-layers')
for i,k in enumerate(kinds):
 for s in range(4):render(gem(i,s),pathlib.Path('gems')/f'{k}-{s}.png')
 if i<7:
  for f in range(6):render(gem(i,frame=f),pathlib.Path('gems/break')/k/f'{f}.png',sheet=True)
for f in range(8):render(gem(7,turn=f),pathlib.Path('gems/prism-turn')/f'{f}.png',sheet=True)
for cut in ['brilliant','star']:
 ops=[]
 if cut=='brilliant':
  for r in [25,27]:
   pts=[(32+math.cos(a*math.pi/4)*r,32+math.sin(a*math.pi/4)*r) for a in range(8)]
   for a,b in zip(pts,pts[1:]+pts[:1]):line(ops,a,b,'#fff0b5')
 else:
  pts=[(32+math.sin(a*math.pi/4)*(27 if a%2==0 else 6),32+math.cos(a*math.pi/4)*(27 if a%2==0 else 6)) for a in range(8)]
  poly(ops,pts,'#fff6cf');poly(ops,[(32,21),(40,32),(32,43),(24,32)],'#70608b')
 render(ops,pathlib.Path('gems')/f'{cut}.png')
ops=[]
def rect(x,y,w,h,c):
 ops.append(dict(op='fill_rect',x=x,y=y,width=w,height=h,color=c))
# Bench frame: shadow, brass inlay, bevel, velvet recess, engraved cell lattice.
rect(0,0,612,612,'#080f16');rect(3,3,606,606,'#70654f');rect(5,5,602,602,'#192a32');rect(10,10,592,592,'#3d5152');rect(12,12,588,588,'#091922');rect(17,17,578,578,'#0d202a')
for r in range(8):
 for c in range(8):
  x=18+c*72;y=18+r*72
  rect(x+2,y+2,68,68,'#132832' if (r+c)%2==0 else '#10232d')
  line(ops,(x+4,y+3),(x+66,y+3),'#203943');line(ops,(x+3,y+4),(x+3,y+66),'#182f3a')
for x,y in [(8,8),(604,8),(8,604),(604,604)]:
 poly(ops,[(x,y-3),(x+3,y),(x,y+3),(x-3,y)],'#e3c68b')
render(ops,pathlib.Path('gems/board.png'),612,612)
# Author the live effects with the particle tool.
for name,amount,speed,size,color,life in [('clear',14,85,3,'#b5edec',400),('flawed',30,135,5,'#ffd59b',560),('cut',24,100,3,'#fff7cb',700),('aura',9,10,2,'#edd89c',1100)]:
 cfg=TMP/f'{name}.json';write(cfg,dict(width=128,height=128,duration_ms=1200,fps=30,seed=19,actions=str(TMP/f'{name}-ops.json'),preview=str(TMP/f'{name}.gif'),system=str(OUT/f'fx/{name}.json')))
 run('particle-2d','--config',cfg,'init')
 run('particle-2d','--config',cfg,'add-emitter','--name','shards','--shape','disc','--radius',24 if name=='aura' else 4,'--x',0,'--y',0,'--rate' if name=='aura' else '--burst',amount,'--lifetime',life,'--lifetime-spread',100,'--speed',speed,'--speed-spread',speed*.4,'--cone-angle',180)
 run('particle-2d','--config',cfg,'set-particle','--emitter','shards','--size-from',size,'--size-to',0,'--opacity-from',.65 if name=='aura' else 1,'--opacity-to',0,'--color-gradient',f'{color}@0,#f3e6c2@0.4,#487a9a@1','--rotation',90)
 if name=='aura':run('particle-2d','--config',cfg,'set-timeline','--loop','true')
 run('particle-2d','--config',cfg,'render','--frame',4,'--out',TMP/f'{name}-preview.png')
# Sound palettes: short mallet/chime voices with transient support.
def config(name,duration,tool):
 p=TMP/f'{name}-config.json';write(p,dict(sample_rate=22050,channels='stereo',max_duration_ms=duration,seed=73,actions=str(TMP/f'{name}-audio-ops.json'),preview=str(TMP/f'{name}-wave.png'),wav=str(OUT/f'audio/{name}.wav'),mid=str(OUT/f'audio/{name}.mid'),sample_pack='combat-core',instrument_bank='gm-lite'));run(tool,'--config',p,'init');return p
cues={'select':(880,80),'swap':(540,150),'refuse':(110,130),'land':(86,200),'flaw':(1800,80),'cut':(1320,450),'levelup':(523,750),'gameover':(392,900)}
for i,f in enumerate([523.25,587.33,659.25,783.99,880,1046.5,1174.66,1567.98]):cues[f'chain-{i+1}']=(f,400)
for name,(freq,dur) in cues.items():
 cfg=config(name,dur+100,'sfx-synth')
 for j in range(3 if name in ['levelup','gameover'] else 2):
  f=freq*(2**(j/3) if name=='levelup' else 2**(-j/3) if name=='gameover' else [1,2.76][j])
  run('sfx-synth','--config',cfg,'add-voice','--name',f'v{j}','--wave','noise' if name=='flaw' else 'sine','--freq',f,'--gain',-18-j*7,'--start',j*140 if name in ['levelup','gameover'] else 0,'--dur',dur//2 if name in ['levelup','gameover'] else dur)
  run('sfx-synth','--config',cfg,'set-envelope','--voice',f'v{j}','--env','pluck')
 run('sfx-synth','--config',cfg,'render')
cfg=config('shatter',650,'sfx-sample')
for sample,gain,t in [('debris_glass',-19,0),('impact_metal_dry',-25,0),('debris_rubble',-30,40)]:run('sfx-sample','--config',cfg,'add-sample','--name',sample,'--t',t,'--gain',gain,'--trim','0,550','--fade-out',150)
run('sfx-sample','--config',cfg,'render')
for name,tempo in [('title',96),('play',72)]:
 cfg=config(name,40000,'music');run('music','--config',cfg,'set-tempo','--bpm',tempo)
 for track,inst,gain in [('melody','music_box',-19),('harmony','vibraphone',-25),('bass','marimba',-23)]:
  run('music','--config',cfg,'define-track','--name',track,'--instrument',inst);run('music','--config',cfg,'set-track-fx','--track',track,'--gain',gain,'--reverb',.24)
 motif=[76,79,83,81,79,76,74,71,74,78,81,79,78,74,71,67]
 for bar,root in enumerate([52,48,55,50,52,48,55,59]):
  for beat in [0,2]:run('music','--config',cfg,'add-note','--track','bass','--pitch',root,'--t',bar*4+beat,'--dur',1.6,'--velocity',65)
  for note in [root+12,root+19,root+24]:run('music','--config',cfg,'add-note','--track','harmony','--pitch',note,'--t',bar*4,'--dur',3.6,'--velocity',48)
  for beat in range(4):
   if name=='play' and beat%2:continue
   run('music','--config',cfg,'add-note','--track','melody','--pitch',motif[(bar*4+beat)%len(motif)],'--t',bar*4+beat,'--dur',.65 if name=='title' else 1.4,'--velocity',72 if beat==0 else 54)
 run('music','--config',cfg,'render')
 # Trim the release padding to an exact eight-bar loop with a tiny endpoint fade.
 path=OUT/f'audio/{name}.wav'
 with wave.open(str(path)) as w:params=w.getparams();raw=w.readframes(w.getnframes())
 count=round(32*60/tempo*params.framerate)*params.nchannels;data=list(struct.unpack('<'+'h'*(len(raw)//2),raw));data=(data+[0]*count)[:count]
 for j in range(440):data[j]=round(data[j]*j/440);data[-j-1]=round(data[-j-1]*j/440)
 with wave.open(str(path),'wb') as w:w.setparams(params);w.writeframes(struct.pack('<'+'h'*len(data),*data))
# Master the produced PCM files to a consistent, restrained listening level.
for path in (OUT/'audio').glob('*.wav'):
 with wave.open(str(path)) as w:params=w.getparams();raw=w.readframes(w.getnframes())
 data=list(struct.unpack('<'+'h'*(len(raw)//2),raw))
 rms=math.sqrt(sum(x*x for x in data)/len(data));peak=max(abs(x) for x in data)
 music_asset=path.stem in ['title','play']
 target=750 if music_asset else 1100 if path.stem=='shatter' else 1500
 gain=min(target/max(1,rms),(8000 if music_asset else 14000)/max(1,peak))
 data=[round(x*gain) for x in data]
 with wave.open(str(path),'wb') as w:w.setparams(params);w.writeframes(struct.pack('<'+'h'*len(data),*data))
print('Produced all Facet assets in',OUT)
