import json, random, datetime as dt
import numpy as np
random.seed(29); rng=np.random.default_rng(29)
N=162
# Real checkpoints (game number, cumulative HR) from reporting; in-between placement approximated.
anchors=[(4,0),(5,1),(30,10),(56,22),(62,24),(63,26),(76,30),(77,32),(84,33),(97,38),(105,40),(108,41),
         (130,47),(131,49),(134,50),(149,54),(150,55),(154,56),(155,57),(157,58),(158,60),(162,60)]
hr=[0]*(N+1)  # hr[g] for game g (1-indexed)
forced={63:2,131:2,158:2,5:1,150:1,155:1,105:1,134:1}
for g,v in forced.items(): hr[g]=v
prev_g,prev_c=0,0
for g,c in anchors:
    need=c-prev_c-sum(hr[prev_g+1:g+1])
    pool=[x for x in range(prev_g+1,g+1) if x not in forced]
    while need>0:
        x=random.choice(pool)
        if hr[x]<1 or (hr[x]<2 and random.random()<.12):
            hr[x]+=1; need-=1
    assert need==0,(g,c,need)
    prev_g,prev_c=g,c
cum=np.cumsum(hr[1:]).tolist()
for g,c in anchors: assert cum[g-1]==c,(g,c,cum[g-1])
# approximate game dates: Mar 27 -> Sep 28, ASB Jul 14-17
days=[]
d=dt.date(2025,3,27); end=dt.date(2025,9,28)
cal=[]
while d<=end:
    if not (dt.date(2025,7,14)<=d<=dt.date(2025,7,17)): cal.append(d)
    d+=dt.timedelta(1)
# pick 162 of ~181 days evenly (off days spread)
pins=[(1,'2025-03-27'),(5,'2025-03-31'),(63,'2025-06-07'),(77,'2025-06-24'),(97,'2025-07-13'),(105,'2025-07-26'),(131,'2025-08-24'),(155,'2025-09-20'),(158,'2025-09-24'),(162,'2025-09-28')]
pi=[(g,cal.index(dt.date.fromisoformat(x))) for g,x in pins]
gi=np.interp(np.arange(1,N+1),[p[0] for p in pi],[p[1] for p in pi])
dates=[cal[int(round(i))].isoformat() for i in gi]
bettors=[("Dad",29),("Tori",34),("Big Mike",38),("Nguyen",43),("Me",47)]
k=150; prior=34/153
def sim(g,n=20000):
    h=cum[g-1] if g>0 else 0
    a=prior*k+h; b=k+g
    lam=rng.gamma(a,1/b,n)
    rem=N-g
    fin=h+rng.poisson(lam*rem)
    return fin
odds=[];hist=[];pct=[]
for g in range(0,N+1):
    fin=sim(g)
    dist=np.array([[abs(fin-v) for _,v in bettors]]).squeeze().T
    mn=dist.min(1,keepdims=True); win=(dist==mn); share=win/win.sum(1,keepdims=True)
    odds.append([round(float(x),4) for x in share.mean(0)])
    h=np.bincount(fin,minlength=91)[:91]/len(fin)
    hist.append([round(float(x),4) for x in h])
    pct.append([int(np.percentile(fin,q)) for q in (5,50,95)])
data=dict(hr=hr[1:],cum=cum,dates=dates,bettors=[dict(name=n,guess=v) for n,v in bettors],
          odds=odds,hist=hist,pct=pct,prior=dict(k=k,rate=prior))
json.dump(data,open("season.json","w"),separators=(",",":"))
print(cum[-1], max(hr), odds[0], odds[60], odds[97], odds[130], pct[0], pct[97])
print(len(json.dumps(data)))
