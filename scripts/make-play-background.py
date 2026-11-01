"""Original warm glass-workshop interior for active play. No third-party imagery."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math
w,h=600,1040
im=Image.new('RGB',(w,h));pixels=im.load()
for y in range(h):
 for x in range(w):
  glow=math.exp(-((x-80)**2+(y-140)**2)/(2*450**2));table=max(0,min(1,(y-640)/400))
  pixels[x,y]=tuple(round(v+glow*d-table*t) for v,d,t in [(238,16,8),(225,24,12),(206,30,17)])
im=im.convert('RGBA')
far=Image.new('RGBA',(w*2,h*2));d=ImageDraw.Draw(far)
# Layered plaster wall and two recessed display niches frame an uncluttered center.
d.rounded_rectangle((190,60,1010,1300),radius=150,fill=(255,253,243,28),outline=(181,169,150,28),width=4)
for x,top in [(-95,355),(505,270)]:
 d.rounded_rectangle((x*2,top*2,(x+190)*2,(top+350)*2),radius=115,fill=(152,161,159,26),outline=(255,255,247,85),width=5)
 d.rounded_rectangle((x*2,(top+285)*2,(x+190)*2,(top+298)*2),radius=8,fill=(206,185,152,75))
 # Remote glass vessel silhouettes sit on the shelves, away from the playing field.
 bx=x+105;by=top+285
 d.rounded_rectangle(((bx-18)*2,(by-90)*2,(bx+18)*2,by*2),radius=22,fill=(168,201,203,40),outline=(255,255,244,85),width=3)
 d.ellipse(((bx-13)*2,(by-95)*2,(bx+13)*2,(by-84)*2),fill=(155,178,177,40))
im=Image.alpha_composite(im,far.resize((w,h),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.5)))
light=Image.new('RGBA',(w,h));d=ImageDraw.Draw(light)
d.polygon([(-90,-30),(70,-30),(585,875),(415,940)],fill=(255,254,231,70))
d.polygon([(-80,70),(-30,30),(420,960),(300,1040)],fill=(255,254,237,33))
d.ellipse((470,130,610,270),fill=(255,238,188,45))
im=Image.alpha_composite(im,light.filter(ImageFilter.GaussianBlur(19)))
# Broad countertop, without a painted center plinth: the rotating dish is rendered in-game.
surface=Image.new('RGBA',(w*2,h*2));d=ImageDraw.Draw(surface)
d.rectangle((0,1390,1200,2080),fill=(244,224,190,42))
d.line((0,1388,1200,1388),fill=(255,255,243,100),width=4)
for y in [770,900]:
 d.arc((-440,y*2-90,1650,y*2+120),2,178,fill=(178,150,114,19),width=2)
im=Image.alpha_composite(im,surface.resize((w,h),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.7)))
Path('assets').mkdir(exist_ok=True);im.convert('RGB').save('assets/play-background.png',optimize=True)
print('Original play background:',Path('assets/play-background.png').stat().st_size,'bytes')
