"""Original procedural cream studio backdrop; Pillow drawing, no external images."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math
w,h=600,1040
im=Image.new('RGB',(w,h));pixels=im.load()
for y in range(h):
 for x in range(w):
  light=math.exp(-((x+30)**2+(y-150)**2)/(2*450**2))
  pixels[x,y]=tuple(round(v+light*d) for v,d in [(240,15),(223,27),(198,37)])
layer=Image.new('RGBA',(w,h));d=ImageDraw.Draw(layer)
# Broad sunlight entering from upper left; open, low-contrast center for gameplay.
d.polygon([(-160,-80),(60,-80),(600,700),(600,910)],fill=(255,253,231,72))
d.polygon([(-100,15),(-30,0),(500,920),(390,1040)],fill=(255,252,231,45))
for x,y,r,color in [(-120,850,210,(209,163,127,30)),(640,180,170,(187,177,161,24)),(550,1100,210,(172,185,154,24))]:
 d.ellipse((x-r,y-r,x+r,y+r),fill=color)
layer=layer.filter(ImageFilter.GaussianBlur(18));im=Image.alpha_composite(im.convert('RGBA'),layer)
details=Image.new('RGBA',(w,h));d=ImageDraw.Draw(details)
for y in [90,950]:
 d.arc((-90,y-160,170,y+130),-85,85,fill=(182,155,121,38),width=2)
Path('assets').mkdir(exist_ok=True)
Image.alpha_composite(im,details).convert('RGB').save('assets/background.png',optimize=True)
print('Original background:',Path('assets/background.png').stat().st_size,'bytes')
