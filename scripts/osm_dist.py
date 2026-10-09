import heapq, math, httpx
from collections import defaultdict

N = {'G':(23.789103,90.428049),'F':(23.788995,90.427394),'J':(23.788956,90.428972),'I':(23.788607,90.428505),'E':(23.788327,90.428103),'B':(23.788087,90.427545),'A':(23.788052,90.427888),'H':(23.788038,90.428666),'D':(23.787792,90.426949),'C':(23.787537,90.428408)}
E = [('A','B'),('A','C'),('A','E'),('A','H'),('A','D'),('B','F'),('B','D'),('E','G'),('F','G'),('G','J'),('H','I'),('I','J')]
BB = '23.7865,90.4260,23.7898,90.4298'

def hav(a,b,c,d):
    x=math.radians(c-a); y=math.radians(d-b)
    h=math.sin(x/2)**2+math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(y/2)**2
    return 2*6371000*math.asin(math.sqrt(h))

q = '[out:json][timeout:90];way[highway](%s);out body;>;out skel qt;' % BB
HDR = {'User-Agent': 'map-distance-script/1.0 (student assignment)'}
r = httpx.post('https://overpass-api.de/api/interpreter', data={'data': q}, headers=HDR, timeout=120)
d = r.json()

co={}; ad=defaultdict(list); ws=[]
for el in d['elements']:
    if el['type']=='node': co[el['id']]=(el['lat'],el['lon'])
    elif el['type']=='way': ws.append(el)
for w in ws:
    ns=w.get('nodes',[])
    for a,b in zip(ns,ns[1:]):
        if a in co and b in co:
            dd=hav(co[a][0],co[a][1],co[b][0],co[b][1])
            ad[a].append((b,dd)); ad[b].append((a,dd))
print('network: %d nodes, %d edges' % (len(co), sum(len(v) for v in ad.values())//2))

sn={}
for k in N:
    la,lo=N[k]; best=None; bd=1e18
    for nid,c in co.items():
        dd=hav(la,lo,c[0],c[1])
        if dd<bd: bd=dd; best=nid
    sn[k]=best
    if bd>25: print('  ! %s is %.0fm from nearest road' % (k,bd))

def dij(s,t):
    di={s:0.0}; pq=[(0.0,s)]
    while pq:
        dd,u=heapq.heappop(pq)
        if u==t: return dd
        if dd>di.get(u,1e18): continue
        for v,w in ad.get(u,[]):
            nd=dd+w
            if nd<di.get(v,1e18): di[v]=nd; heapq.heappush(pq,(nd,v))
    return None

print()
print('%-6s %9s %9s' % ('Edge','road m','road km'))
print('-'*26)
for a,b in E:
    m=dij(sn[a],sn[b])
    if m is None: print('%-6s %9s' % (a+'-'+b,'no path'))
    else: print('%-6s %9.0f %9.3f' % (a+'-'+b,m,m/1000))
