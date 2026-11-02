"""Original arcade display stage; no external artwork or fonts. Pillow offline only."""
from PIL import Image,ImageDraw,ImageFilter
from pathlib import Path
import math
W,H,S=600,1040,2
for home,name in [(True,'background.png'),(False,'play-background.png')]:
 im=Image.new('RGB',(W,H));pix=im.load()
 for y in range(H):
  for x in range(W):
   glow=math.exp(-((x-230)**2/(290**2)+(y-390)**2/(450**2)))
   pix[x,y]=(round(24+25*glow),round(29+43*glow),round(78+83*glow))
 im=im.convert('RGBA');layer=Image.new('RGBA',(W*S,H*S));d=ImageDraw.Draw(layer)
 def rect(box,fill,r=0,outline=None,width=1):
  d.rounded_rectangle(tuple(int(v*S) for v in box),radius=r*S,fill=fill,outline=outline,width=width*S)
 # Architectural frame and side pillars: low-frequency shapes, clear playing center.
 rect((35,150,565,855),(41,53,132,150),70,(92,121,231,110),3)
 rect((53,170,547,830),(20,39,101,160),58,(30,224,233,65),2)
 for x in [-28,566]:
  rect((x,65,x+62,840),(19,22,67,255),25)
  rect((x+16,95,x+28,790),(75,67,181,255),6)
  rect((x+18,190,x+25,400),(71,228,246,180),3)
 # Broad perspective stage, peripheral stripes rather than particles.
 d.polygon([(0,820*S),(300*S,740*S),(600*S,820*S),(600*S,1040*S),(0,1040*S)],fill=(37,39,112,255))
 for a in [0,1,2]:
  y=866+a*61
  d.line([(0,y*S),(300*S,(y-55)*S),(600*S,y*S)],fill=(90,89,205,65),width=3)
 if home:
  # Graphic arcade halo frames title/hero, never competes with gameplay.
  d.arc((110*S,210*S,490*S,620*S),195,345,fill=(66,235,224,180),width=10)
  d.arc((85*S,190*S,515*S,645*S),20,155,fill=(145,85,245,180),width=14)
  for x,y in [(82,230),(500,325),(110,570)]:
   d.polygon([(x*S,(y-9)*S),((x+4)*S,(y-3)*S),((x+10)*S,y*S),((x+4)*S,(y+3)*S),(x*S,(y+9)*S),((x-4)*S,(y+3)*S),((x-10)*S,y*S),((x-4)*S,(y-3)*S)],fill=(255,220,63,240))
 im=Image.alpha_composite(im,layer.resize((W,H),Image.Resampling.LANCZOS))
 # Fixed left-front light, intentionally very soft and broad.
 light=Image.new('RGBA',(W,H));q=ImageDraw.Draw(light)
 q.polygon([(-40,-30),(70,-30),(440,780),(180,800)],fill=(95,169,255,20))
 im=Image.alpha_composite(im,light.filter(ImageFilter.GaussianBlur(24)))
 Path('assets').mkdir(exist_ok=True);im.convert('RGB').save(Path('assets')/name,optimize=True)
 print(name,(Path('assets')/name).stat().st_size)
