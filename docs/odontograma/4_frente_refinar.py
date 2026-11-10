"""Refina o mapa de dentes da vista de frente.

O 3_gerar_public.py corta os dentes em faixas retas na vertical; como os dentes se sobrepõem na foto, a faixa de um dente
cobre pedaço do vizinho e o destaque ao passar o mouse "vaza". Aqui cada dente cresce a partir de uma semente (miolo da
faixa antiga, ou um traço marcado à mão nos dentes de trás) e para nas bordas reais da imagem (gradiente de luminância).
Roda DEPOIS de 3_gerar_public.py e sobrescreve public/odontograma/frente-dentes.png.
"""
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
import numpy as np, heapq
from PIL import Image
from scipy import ndimage as ndi
im=np.array(Image.open('public/odontograma/frente.webp').convert('RGBA')).astype(float)
lb=np.array(Image.open('public/odontograma/frente-dentes.png').convert('L'))
fg=im[...,3]>128
lum=im[...,:3].mean(axis=2)
lum=ndi.gaussian_filter(lum,1.2)
gx=ndi.sobel(lum,axis=1); gy=ndi.sobel(lum,axis=0)
grad=np.hypot(gx,gy)
MANUAL={47:((40,330),(48,450)),46:((92,370),(98,490)),45:((155,380),(155,500)),35:((1050,400),(1050,480)),36:((1098,400),(1098,480)),37:((1150,380),(1150,450))}
seeds=np.zeros_like(lb)
for v in np.unique(lb):
    if not v: continue
    m=lb==v
    dt=ndi.distance_transform_edt(m)
    thr=min(dt.max()*0.55, 40)
    if v in MANUAL: continue
    seeds[dt>=thr]=v
for v,((x0,y0),(x1,y1)) in MANUAL.items():
    yy,xx=np.mgrid[:lb.shape[0],:lb.shape[1]]
    d=np.array([x1-x0,y1-y0],float); L2=(d**2).sum()
    t=np.clip(((xx-x0)*d[0]+(yy-y0)*d[1])/L2,0,1)
    dist=np.hypot(xx-(x0+t*d[0]),yy-(y0+t*d[1]))
    seeds[(dist<=9)&(im[...,3]>128)]=v
h,w=lb.shape
out=seeds.copy()
pq=[]
ys,xs=np.nonzero(seeds)
for y,x in zip(ys,xs): heapq.heappush(pq,(0.0,y,x))
done=seeds>0
while pq:
    c,y,x=heapq.heappop(pq)
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny,nx=y+dy,x+dx
        if 0<=ny<h and 0<=nx<w and not done[ny,nx] and fg[ny,nx]:
            done[ny,nx]=True; out[ny,nx]=out[y,x]
            heapq.heappush(pq,(max(c,grad[ny,nx]),ny,nx))
# suaviza
res=out.copy()
labels=[v for v in np.unique(out) if v]
stack=np.stack([ndi.gaussian_filter((out==v).astype(float),3) for v in labels])
am=np.array(labels)[stack.argmax(0)]
res=np.where(fg&(stack.max(0)>0.01),am,0).astype(np.uint8)
Image.fromarray(res).save('public/odontograma/frente-dentes.png', optimize=True)
