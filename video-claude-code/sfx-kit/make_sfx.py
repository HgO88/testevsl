import numpy as np, wave, sys, os
SR=48000; out=sys.argv[1]; rng=np.random.default_rng(7)
def t(d): return np.arange(int(SR*d))/SR
def env(n,a,r):  # attack/release in s, exponential release
    x=np.arange(n)/SR; e=np.minimum(1,x/max(a,1e-4)); return e*np.exp(-x/r)
def lp(x,a):  # one-pole lowpass, a in 0..1 (array or scalar)
    y=np.zeros_like(x); a=np.broadcast_to(a,x.shape); s=0.
    for i in range(len(x)): s+=a[i]*(x[i]-s); y[i]=s
    return y
def save(name,x,stereo_w=0.0):
    x=x/np.max(np.abs(x))*0.89
    L=x; R=x
    if stereo_w: d=int(SR*0.0007); R=np.concatenate([np.zeros(d),x[:-d]])
    s=np.stack([L,R],1); s=(s*32767).astype('<i2')
    with wave.open(os.path.join(out,name),'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(s.tobytes())
# whoosh: noise through sweeping lowpass, bell-shaped envelope
def whoosh(d=0.45,up=True):
    n=int(SR*d); x=rng.standard_normal(n); p=np.linspace(0,1,n)
    sweep=(0.02+0.35*p) if up else (0.37-0.35*p)
    e=np.sin(np.pi*p**(0.6 if up else 1.4))**2
    y=lp(lp(x,sweep),sweep); return y*e
save('whoosh.wav',whoosh(0.45),1); save('whoosh-curto.wav',whoosh(0.22),1)
save('swish.wav',whoosh(0.28,False)-0.3*np.diff(np.concatenate([[0],whoosh(0.28,False)])),1)
# click: short broadband tick + body
n=int(SR*0.06); c=rng.standard_normal(n)*env(n,0.0002,0.003)+0.6*np.sin(2*np.pi*1800*t(0.06))*env(n,0.0002,0.008)
save('click.wav',c)
# pop / "cute": pitch-dropping sine blip
d=0.12; ph=2*np.pi*np.cumsum(np.linspace(1400,500,int(SR*d)))/SR
save('pop.wav',np.sin(ph)*env(int(SR*d),0.002,0.035))
# ding: bell partials
d=1.4; tt=t(d); b=sum(a*np.sin(2*np.pi*f*tt)*np.exp(-tt/dec) for f,a,dec in [(1318,1,0.6),(2637,.5,.35),(3520,.3,.2),(5274,.15,.12)])
save('ding.wav',b*np.minimum(1,tt/0.002),1)
# shutter (camera): two mechanical clacks
n=int(SR*0.22); s=np.zeros(n)
for at,g in [(0,1),(0.075,0.8)]:
    i=int(at*SR); m=int(SR*0.04); k=rng.standard_normal(m)*env(m,0.0003,0.006)
    k=k-lp(k,0.15); s[i:i+m]+=g*k
save('shutter.wav',s)
# glitter / sparkle: random high sine pings
d=0.9; n=int(SR*d); g=np.zeros(n)
for _ in range(26):
    at=rng.uniform(0,0.6); f=rng.uniform(3500,9000); m=int(SR*0.15); i=int(at*SR)
    g[i:i+m]+=rng.uniform(.3,1)*np.sin(2*np.pi*f*t(0.15))*env(m,0.001,0.03)
save('glitter.wav',g*np.linspace(1,0.4,n),1)
# typing (letter by letter): soft clicks, 8 per second-ish
n=int(SR*0.12); tk=rng.standard_normal(n)*env(n,0.0003,0.004); tk=lp(tk,0.4)
save('tecla.wav',tk)
# impact / boom for big keyword
d=0.7; tt=t(d); ph=2*np.pi*np.cumsum(np.linspace(110,38,len(tt)))/SR
bm=np.sin(ph)*np.exp(-tt/0.22)+0.4*lp(rng.standard_normal(len(tt)),0.05)*np.exp(-tt/0.08)
save('impacto.wav',bm)
# riser into transition
d=1.0; tt=t(d); p=tt/d; x=lp(rng.standard_normal(len(tt)),0.02+0.4*p**2)*p**2
save('riser.wav',x+0.25*np.sin(2*np.pi*np.cumsum(300+900*p**2)/SR)*p**2,1)
