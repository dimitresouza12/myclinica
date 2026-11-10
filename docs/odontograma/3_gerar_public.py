import os
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import numpy as np, json
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
OUT=os.path.join(HERE,'../../public/odontograma/')
import os; os.makedirs(OUT, exist_ok=True)

def save(name, rgba, labels, width):
    img=Image.fromarray(rgba,'RGBA'); lab=Image.fromarray(labels,'L')
    hgt=round(img.height*width/img.width)
    img=img.resize((width,hgt),Image.LANCZOS); lab=lab.resize((width,hgt),Image.NEAREST)
    img.save(OUT+f'{name}.webp','WEBP',quality=82,alpha_quality=90,method=6)
    lab.save(OUT+f'{name}-dentes.png',optimize=True)
    la=np.array(lab); info={}
    for v in np.unique(la):
        if v==0: continue
        ys,xs=np.nonzero(la==v); info[int(v)]=[round(xs.mean()/width,4), round(ys.mean()/hgt,4)]
    print(name, img.size, len(info), os.path.getsize(OUT+f'{name}.webp')//1024,'KB', os.path.getsize(OUT+f'{name}-dentes.png')//1024,'KB')
    return {'w':width,'h':hgt,'centros':info}

meta={}
# ── frente ──
a=np.array(Image.open(HERE+'frente-original.jpg').convert('RGB'))
fg=np.load(HERE+'tmp-front_fg.npy')
comp,_=ndi.label(fg)
sizes=ndi.sum(fg,comp,range(1,comp.max()+1))
big=[i+1 for i in np.argsort(sizes)[::-1][:2]]
ycent={i:ndi.center_of_mass(fg,comp,i)[0] for i in big}
upper,lower=sorted(big,key=lambda i:ycent[i])
bounds={'up':[164,199,249,346,451,558,759,960,1067,1172,1269,1319,1354],
        'lo':[177,229,294,400,522,637,761,874,990,1114,1219,1286,1340]}
order={'up':[17,16,15,14,13,12,11,21,22,23,24,25,26,27],'lo':[47,46,45,44,43,42,41,31,32,33,34,35,36,37]}
labels=np.zeros(fg.shape,np.uint8)
X=np.arange(fg.shape[1])[None,:].repeat(fg.shape[0],0)
for key,c in (('up',upper),('lo',lower)):
    idx=np.searchsorted(bounds[key], X, side='right')  # 0..13
    m=comp==c
    labels[m]=np.array(order[key],np.uint8)[idx[m]]
# alfa: borda suave (o quadriculado deixa a máscara serrilhada)
alpha=Image.fromarray((fg*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.6))
al=np.array(alpha).astype(float)
al=np.clip((al-40)/(215-40),0,1)*255
rgba=np.dstack([a,al.astype(np.uint8)])
ys,xs=np.nonzero(fg); m=12
y0,y1,x0,x1=ys.min()-m,ys.max()+m,xs.min()-m,xs.max()+m
meta['frente']=save('frente', rgba[y0:y1,x0:x1], labels[y0:y1,x0:x1], 1200)

# ── vistas de cima (já recortadas pelo occlusal.py) ──
for name in ('superior','inferior'):
    img=np.array(Image.open(HERE+f'tmp-{name}.png')); lab=np.array(Image.open(HERE+f'tmp-{name}_labels.png'))
    meta[name]=save(name, img, lab, 720)

print(json.dumps({k:{'w':v['w'],'h':v['h']} for k,v in meta.items()}))
