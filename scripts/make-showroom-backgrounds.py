"""Original glass-toy showroom: shelves, skylight and blue enamel counter. No external imagery."""
from PIL import Image,ImageDraw,ImageFilter
from pathlib import Path
import math,random
W,H,S=600,1040,2
for home,name in [(True,'background.png'),(False,'play-background.png')]:
 im=Image.new('RGB',(W,H));px=im.load()
 for y in range(H):
  for x in range(W):
   light=math.exp(-((x-100)**2+(y-60)**2)/(2*470**2));px[x,y]=(int(226+22*light),int(214+25*light),int(184+35*light))
 im=im.convert('RGBA');layer=Image.new('RGBA',(W*S,H*S));d=ImageDraw.Draw(layer)
 def rr(box,fill,r=8,outline=None,width=1):d.rounded_rectangle(tuple(int(v*S) for v in box),radius=r*S,fill=fill,outline=outline,width=width*S)
 def el(box,fill):d.ellipse(tuple(int(v*S) for v in box),fill=fill)
 def line(points,fill,width=1):d.line([(int(x*S),int(y*S)) for x,y in points],fill=fill,width=width*S)
 # Cabinet and inset shadow. Its stocked edges frame a quiet central display bay.
 rr((-26,70,626,420),(106,76,56,40),22)
 rr((-20,60,620,400),(123,89,67,255),20)
 rr((-9,68,609,385),(196,157,111,255),15)
 rr((22,94,578,369),(107,118,123,255),10)
 for y in [124,254,371]:
  rr((0,y+6,600,y+19),(93,72,65,100),3)
  rr((0,y,600,y+10),(255,222,157,255),3)
  rr((0,y,600,y+3),(255,245,205,255),2)
 colors=[(241,117,105),(85,179,191),(169,143,215),(237,187,69),(117,186,132)]
 for row,base in enumerate([246,363]):
  for i,x in enumerate([37,90,146,454,510,563]):
   col=colors[(i+row)%5];height=64+(i*17+row*9)%30;wid=28+(i%2)*5
   el((x-wid/2-4,base-5,x+wid/2+6,base+2),(41,52,64,50))
   rr((x-wid/2,base-height+11,x+wid/2,base),col+(255,),6)
   rr((x-8,base-height-4,x+8,base-height+15),(239,241,221,255),4)
   rr((x-wid/2+3,base-height+17,x-wid/2+6,base-8),(255,255,255,155),2)
   rr((x-wid/2+5,base-30,x+wid/2-5,base-14),(255,248,217,235),3)
   el((x-4,base-27,x+4,base-19),col+(255,))
 # Decorative awning, original scalloped trim with no lettering.
 for i in range(12):
  col=(55,153,173,255) if i%2==0 else (255,240,196,255)
  rr((i*50-2,-15,(i+1)*50+2,83),col,2)
  el((i*50-2,61,(i+1)*50+2,93),col)
 line([(0,92),(600,92)],(41,87,116,180),3)
 # Central cabinet glass wash suppresses detail behind the wordmark/HUD.
 rr((175,98,425,360),(249,239,208,235),22)
 for x in [187,405]:line([(x,112),(x,340)],(255,255,245,110),3)
 # Spacious blue counter, with a curved front and warm floor below.
 counterTop=390 if home else 285
 rr((-72,counterTop,672,865),(28,88,119,255),72)
 rr((-68,counterTop-8,668,844),(74,165,191,255),65)
 rr((-57,counterTop-5,657,815),(136,210,219,255),58)
 # Light desk center, dark edges; broad smooth reflection, no busy center pattern.
 rr((-32,counterTop+5,632,793),(146,214,222,255),46)
 line([(-10,counterTop+35),(610,counterTop+35)],(234,255,244,110),2)
 line([(0,821),(600,821)],(222,249,232,210),4)
 # Small plants and jars at peripheral corners only.
 for x,y in [(26,counterTop+58),(575,counterTop+93)]:
  el((x-26,y+25,x+29,y+36),(28,75,93,38));rr((x-18,y,x+18,y+28),(235,149,107,255),6)
  for dx,dy in [(-12,-23),(10,-34),(0,-45)]:el((x+dx-9,y+dy,x+dx+9,y+dy+29),(72,137+dx,110,255))
 # Cream tiled floor and three fine inset toy-track lanes.
 for y in [902,958,1011]:
  line([(0,y),(600,y)],(180,151,104,70),2)
  line([(0,y+2),(600,y+2)],(255,249,220,160),2)
 for x in range(-120,800,130):line([(x,870),(x-110,1040)],(174,143,96,35),1)
 im=Image.alpha_composite(im,layer.resize((W,H),Image.Resampling.LANCZOS))
 glow=Image.new('RGBA',(W,H));g=ImageDraw.Draw(glow);g.polygon([(-50,100),(80,100),(480,760),(250,815)],fill=(255,255,234,45))
 im=Image.alpha_composite(im,glow.filter(ImageFilter.GaussianBlur(24)))
 im.convert('RGB').save(Path('assets')/name,optimize=True)
 print(name,(Path('assets')/name).stat().st_size)
