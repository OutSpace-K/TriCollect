"""Original dream-gallery backdrop: procedural light, architectural niches and a display plinth."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math, random
w,h=600,1040
rng=random.Random(19019)
im=Image.new('RGB',(w,h));pixels=im.load()
for y in range(h):
 for x in range(w):
  light=math.exp(-((x+20)**2+(y-160)**2)/(2*430**2))
  floor=max(0,min(1,(y-650)/390));noise=rng.random()*.65-.325
  pixels[x,y]=tuple(round(v+light*d-floor*f+noise) for v,d,f in [(239,16,6),(224,27,8),(204,30,12)])
im=im.convert('RGBA')
# Soft architectural depth behind a deliberately empty central gameplay region.
architecture=Image.new('RGBA',(w*2,h*2));d=ImageDraw.Draw(architecture)
d.rounded_rectangle((92,130,1108,1390),radius=500,fill=(255,250,235,52),outline=(176,158,133,29),width=6)
d.rounded_rectangle((120,156,1080,1360),radius=475,outline=(255,255,247,95),width=5)
d.rounded_rectangle((-230,520,140,1250),radius=170,fill=(167,148,131,26),outline=(255,255,244,90),width=5)
d.rounded_rectangle((1080,340,1410,1170),radius=160,fill=(160,164,174,25),outline=(255,255,244,80),width=5)
im=Image.alpha_composite(im,architecture.resize((w,h),Image.Resampling.LANCZOS))
# Broad, feathered left-front sunlight and faint corner bokeh.
light=Image.new('RGBA',(w,h));d=ImageDraw.Draw(light)
d.polygon([(-80,-50),(80,-50),(580,840),(420,900)],fill=(255,253,231,65))
d.polygon([(-80,100),(-20,30),(470,930),(340,1040)],fill=(255,252,235,38))
for _ in range(27):
 x=rng.randrange(10,w-10);y=rng.randrange(170,840)
 if 115<x<485 and 280<y<760:continue
 r=rng.randrange(3,11);d.ellipse((x-r,y-r,x+r,y+r),fill=(255,255,238,rng.randrange(25,75)))
im=Image.alpha_composite(im,light.filter(ImageFilter.GaussianBlur(10)))
# Grounded porcelain display with a soft far edge and shadow; it remains below the ball bundle.
shadow=Image.new('RGBA',(w,h));d=ImageDraw.Draw(shadow)
d.ellipse((25,718,610,872),fill=(126,104,82,27));im=Image.alpha_composite(im,shadow.filter(ImageFilter.GaussianBlur(18)))
plinth=Image.new('RGBA',(w*2,h*2));d=ImageDraw.Draw(plinth)
d.ellipse((22,1438,1178,1684),fill=(224,208,184,116))
d.ellipse((22,1400,1178,1636),fill=(255,249,232,148),outline=(255,255,248,150),width=3)
d.arc((45,1416,1155,1618),12,168,fill=(185,162,131,48),width=3)
im=Image.alpha_composite(im,plinth.resize((w,h),Image.Resampling.LANCZOS))
# Sparse foreground glints, never text or buttons.
details=Image.new('RGBA',(w*2,h*2));d=ImageDraw.Draw(details)
for x,y,r in [(51,370,5),(548,310,4),(554,622,5),(70,630,3),(505,218,3)]:
 x*=2;y*=2;r*=2
 d.polygon([(x,y-r),(x+2,y-2),(x+r,y),(x+2,y+2),(x,y+r),(x-2,y+2),(x-r,y),(x-2,y-2)],fill=(218,182,112,95))
im=Image.alpha_composite(im,details.resize((w,h),Image.Resampling.LANCZOS))
Path('assets').mkdir(exist_ok=True);im.convert('RGB').save('assets/background.png',optimize=True)
print('Original background:',Path('assets/background.png').stat().st_size,'bytes')
