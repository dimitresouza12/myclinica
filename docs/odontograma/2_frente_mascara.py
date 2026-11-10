import os
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from collections import deque
SRC=HERE+'frente-original.jpg'
a=np.array(Image.open(SRC).convert('RGB')).astype(int)
h,w,_=a.shape
R,G,B=a[...,0],a[...,1],a[...,2]
cand=(np.minimum(np.minimum(R,G),B)>=236)&(np.abs(R-B)<=5)&(np.abs(R-G)<=4)
# fundo = quadriculado neutro ligado à borda
lab,_=ndi.label(cand)
border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
bg=np.isin(lab,list(border))
bg=ndi.binary_closing(bg,iterations=2)
fg=~bg
fg=ndi.binary_opening(fg,iterations=2)
l2,n=ndi.label(fg); sizes=ndi.sum(fg,l2,range(1,n+1))
print('componentes grandes', sorted([int(s) for s in sizes if s>5000],reverse=True))
np.save(HERE+'tmp-front_fg.npy',fg)
lum=a.mean(axis=2)
for name,(y0,y1) in (('upper',(300,420)),('lower',(560,700))):
    prof=np.where(fg[y0:y1], lum[y0:y1], np.nan)
    p=np.nanmean(prof,axis=0)
    xs=np.nonzero(~np.isnan(p))[0]
    print(name,'x de',xs.min(),'a',xs.max())
    ps=ndi.uniform_filter1d(np.nan_to_num(p,nan=255),9)
    mins=[x for x in range(xs.min()+5,xs.max()-5) if ps[x]==ps[x-12:x+13].min()]
    print(name,'minimos',[(x,int(ps[x])) for x in mins])
