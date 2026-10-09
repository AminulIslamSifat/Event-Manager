from PIL import Image, ImageDraw
import numpy as np, heapq

SCALE=0.2733
im=Image.open('/home/sifat/Pictures/map.png').convert('RGB')
a=np.array(im).astype(np.int16)
R,G,B=a[:,:,0],a[:,:,1],a[:,:,2]
mx=a.max(axis=2); mn=a.min(axis=2)
white=(mn>=250)&((mx-mn)<=6)
colored=((R>140)&(G<120)&(B<120))|((G>120)&(R<120)&(B<120))|((B>140)&(R<120)&(G<120))|((R<90)&(G<90)&(B<90))
mask=white|colored
print('white %d colored %d'%(white.sum(),colored.sum()))
m=mask.copy()
for _ in range(8):
    m=m|np.roll(m,1,0)|np.roll(m,-1,0)|np.roll(m,1,1)|np.roll(m,-1,1)
mask=m
print('after dilate %.1f%%'%(100*mask.sum()/mask.size))
H,W=mask.shape
PX={'G':(138,550),'F':(182,306),'J':(198,894),'I':(324,732),'E':(454,594),'B':(552,362),'A':(566,490),'H':(572,780),'D':(672,140),'C':(776,684)}

def snap(y,x,rad=40):
    best=None;bd=10**9
    for dy in range(-rad,rad+1):
        for dx in range(-rad,rad+1):
            ny,nx=y+dy,x+dx
            if 0<=ny<H and 0<=nx<W and mask[ny,nx]:
                d=dy*dy+dx*dx
                if d<bd: bd=d;best=(ny,nx)
    return best

SN={}
for k in PX:
    y,x=PX[k];s=snap(y,x);SN[k]=s
    if s is None: print('  ! %s no snap'%k)
    else:
        off=((s[0]-y)**2+(s[1]-x)**2)**0.5
        print('  %s -> %s off %.0fpx'%(k,s,off))

DIRS=((0,1,1.0),(0,-1,1.0),(1,0,1.0),(-1,0,1.0),(1,1,1.4142),(1,-1,1.4142),(-1,1,1.4142),(-1,-1,1.4142))

def dij(s,t):
    INF=float('inf')
    dist={s:0.0};par={}
    pq=[(0.0,s)]
    while pq:
        d,u=heapq.heappop(pq)
        if u==t:
            path=[u]
            while u in par:
                u=par[u];path.append(u)
            return d,path[::-1]
        if d>dist.get(u,INF):continue
        y,x=u
        for dy,dx,w in DIRS:
            ny,nx=y+dy,x+dx
            if 0<=ny<H and 0<=nx<W and mask[ny,nx]:
                nd=d+w
                if nd<dist.get((ny,nx),INF):
                    dist[(ny,nx)]=nd;par[(ny,nx)]=u
                    heapq.heappush(pq,(nd,(ny,nx)))
    return None,None

EDGES=[('A','B'),('A','C'),('A','E'),('A','H'),('A','D'),('B','F'),('B','D'),('E','G'),('F','G'),('G','J'),('H','I'),('I','J')]
vis=im.copy();dr=ImageDraw.Draw(vis)
cols=[(230,0,0),(0,150,0),(0,0,230),(230,140,0),(150,0,200),(0,170,170),(120,120,0),(0,0,0),(255,0,255),(0,100,255),(100,60,0),(60,60,60)]
print()
print('%-6s %8s %10s'%('Edge','px','km'))
print('-'*26)
for i,(u,v) in enumerate(EDGES):
    if SN.get(u) is None or SN.get(v) is None:
        print('%-6s  no snap'%(u+'-'+v));continue
    d,path=dij(SN[u],SN[v])
    if d is None:
        print('%-6s %8s %10s'%(u+'-'+v,'--','no path'));continue
    print('%-6s %8.0f %10.4f'%(u+'-'+v,d,d*SCALE/1000))
    c=cols[i%len(cols)]
    for (y1,x1),(y2,x2) in zip(path,path[1:]):
        dr.line([(x1,y1),(x2,y2)],fill=c,width=3)
    dr.ellipse((SN[u][1]-5,SN[u][0]-5,SN[u][1]+5,SN[u][0]+5),fill=c)
    dr.ellipse((SN[v][1]-5,SN[v][0]-5,SN[v][1]+5,SN[v][0]+5),fill=c)
vis.save('/tmp/paths.png')
print()
print('overlay -> /tmp/paths.png')
