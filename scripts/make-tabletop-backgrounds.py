"""Original toy-table room, quiet matte surfaces with left-front daylight; no external assets."""
from PIL import Image,ImageDraw,ImageFilter
from pathlib import Path
import math
W,H,S=600,1040,2
for home,name in [(True,'background.png'),(False,'play-background.png')]:
 im=Image.new('RGB',(W,H));pix=im.load()
 for y in range(H):
  for x in range(W):
   light=math.exp(-((x-90)**2+(y-140)**2)/(2*500**2))
   grain=1.2*math.sin(x*.12+y*.017)*math.sin(y*.07)
   pix[x,y]=tuple(round(base+light*gain+grain) for base,gain in [(166,46),(194,39),(155,48)])
 im=im.convert('RGBA');layer=Image.new('RGBA',(W*S,H*S));d=ImageDraw.Draw(layer)
 # Inset tabletop edge, viewed obliquely, no luminous frame.
 d.rounded_rectangle((-52*S,-110*S,652*S,1015*S),radius=80*S,fill=(80,110,68,35))
 d.rounded_rectangle((-50*S,-128*S,650*S,992*S),radius=80*S,fill=(201,215,177,255),outline=(119,150,100,255),width=4*S)
 # Matte green work surface, left edge highlight and subtle seams at the periphery.
 d.rounded_rectangle((-36*S,-113*S,636*S,973*S),radius=66*S,fill=(205,220,185,255),outline=(240,246,219,180),width=2*S)
 if home:
  # Quiet room/floor boundary behind the central display, not another UI panel.
  d.rectangle((0,740*S,600*S,1040*S),fill=(183,191,146,90))
  for x in [-240,60,360,660]:
   d.line((300*S,740*S,x*S,1040*S),fill=(107,128,79,22),width=2*S)
 else:
  for y in [330,670]:
   d.line((-15*S,y*S,18*S,(y+2)*S),fill=(106,137,85,80),width=2*S)
 im=Image.alpha_composite(im,layer.resize((W,H),Image.Resampling.LANCZOS))
 daylight=Image.new('RGBA',(W,H));q=ImageDraw.Draw(daylight)
 q.polygon([(-90,0),(90,0),(500,650),(280,720)],fill=(255,255,225,38))
 im=Image.alpha_composite(im,daylight.filter(ImageFilter.GaussianBlur(28)))
 Path('assets').mkdir(exist_ok=True);im.convert('RGB').save(Path('assets')/name,optimize=True)
 print(name,(Path('assets')/name).stat().st_size)
