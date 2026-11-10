import os
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import numpy as np, json, math, sys
from PIL import Image
from scipy import ndimage as ndi
SRC=HERE

def chroma(a):
    r,g,b=a[...,0],a[...,1],a[...,2]
    spill=g-np.maximum(r,b)
    alpha=np.clip((110-spill)/(110-40),0,1)   # spill>=110 fundo, <=40 dente
    out=a.copy()
    edge=(alpha<1)
    out[...,1]=np.where(spill>0, np.maximum(r,b)+np.minimum(spill,6), g)  # tira o verde da borda
    return out,alpha

import heapq
def flood(seeds, dt, mask):
    # inundação por prioridade (watershed) a partir das sementes, do centro dos dentes para fora;
    # dois dentes se encontram nos pontos de contato, onde a distância até a borda é menor
    h,w=mask.shape
    lab=seeds.astype(np.int32).copy()
    heap=[]
    ys,xs=np.nonzero(lab>0)
    for y,x in zip(ys,xs): heapq.heappush(heap,(-dt[y,x],y,x))
    while heap:
        _,y,x=heapq.heappop(heap)
        l=lab[y,x]
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and mask[ny,nx] and lab[ny,nx]==0:
                lab[ny,nx]=l; heapq.heappush(heap,(-dt[ny,nx],ny,nx))
    return lab

def process(n, flip, quads, name):
    a=np.array(Image.open(SRC+f'{n}-original.jpg').convert('RGB')).astype(float)
    if flip: a=a[::-1]
    rgb,alpha=chroma(a)
    mask=alpha>0.5
    mask=ndi.binary_opening(mask, iterations=2)
    lab,_=ndi.label(mask); sizes=ndi.sum(mask,lab,range(1,lab.max()+1))
    keep=np.isin(lab, [i+1 for i,s in enumerate(sizes) if s>2000]); mask&=keep; alpha=np.where(keep,alpha,0)
    dt=ndi.distance_transform_edt(mask)
    # sementes: picos da distância até a borda (o centro de cada dente); contatos entre dentes são "gargalos"
    peaks=(dt==ndi.maximum_filter(dt,size=71))&(dt>22)
    pl,pc=ndi.label(ndi.binary_dilation(peaks,iterations=12))
    seeds=pl
    print(name,'sementes',pc)
    assert pc==16, pc
    # watershed: custo = distância invertida (dentes se separam nos pontos de contato, onde a distância é menor)
    ws=flood(seeds, dt, mask)
    ws[~mask]=0; ws[ws<0]=0
    h,w=mask.shape
    cents=ndi.center_of_mass(mask, ws, range(1,17))
    cx=w/2; cy=h*0.55
    lab_map=np.zeros((h,w),np.uint8)
    info={}
    for side,quad in ((-1,quads[0]),(1,quads[1])):
        byx=sorted(range(16), key=lambda i: cents[i][1])
        idx=byx[:8] if side<0 else byx[8:]
        cx=(cents[byx[7]][1]+cents[byx[8]][1])/2
        # ao longo do arco: dos incisivos (perto do centro) para os molares
        incisor_up = not flip if name=='superior' else True
        def arc(i):
            y,x=cents[i]
            dy=(cy-y) if incisor_top else (y-cy)
            return abs(math.atan2(abs(x-cx), dy))
        incisor_top = cents and min(c[0] for c in cents) < h*0.2 and True
        # incisivos ficam na borda (topo ou base) mais próxima dos dentes centrais
        top_center = min((abs(c[1]-cx),c[0]) for c in cents)[1]
        incisor_top = top_center < h/2
        idx.sort(key=arc)
        for pos,i in enumerate(idx, start=1):
            fdi=quad*10+pos
            lab_map[ws==i+1]=fdi
            ys,xs=np.nonzero(ws==i+1)
            info[fdi]={'cx':float(xs.mean()),'cy':float(ys.mean())}
    return rgb, alpha, lab_map, info

for n,flip,quads,name in (('superior',True,(1,2),'superior'),('inferior',False,(4,3),'inferior')):
    rgb,alpha,lab,info=process(n,flip,quads,name)
    ys,xs=np.nonzero(alpha>0.02); m=16
    y0,y1,x0,x1=max(0,ys.min()-m),min(alpha.shape[0],ys.max()+m),max(0,xs.min()-m),min(alpha.shape[1],xs.max()+m)
    rgb=rgb[y0:y1,x0:x1]; alpha=alpha[y0:y1,x0:x1]; lab=lab[y0:y1,x0:x1]
    img=Image.fromarray(np.dstack([np.clip(rgb,0,255),alpha*255]).astype(np.uint8),'RGBA')
    img.save(HERE+f'tmp-{name}.png'); Image.fromarray(lab,'L').save(HERE+f'tmp-{name}_labels.png')
    # prévia: cada dente com uma cor e o número
    from PIL import ImageDraw
    pal=np.random.RandomState(3).randint(60,255,(100,3))
    prev=np.where(lab[...,None]>0, pal[lab]*0.55+rgb*0.45, 30).astype(np.uint8)
    p=Image.fromarray(prev); d=ImageDraw.Draw(p)
    for f,v in info.items(): d.text((v['cx']-x0-8,v['cy']-y0-6),str(f),fill=(0,0,0))
    p.save(HERE+f'tmp-{name}_preview.png'); print(name, img.size, sorted(info))
