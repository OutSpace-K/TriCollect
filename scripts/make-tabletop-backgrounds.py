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
 # Original room details stay around the board, never on top of play objects.
 # Side window with a thick sill, leaf silhouettes and a wooden floor establish depth.
 d.rounded_rectangle((-32*S,85*S,100*S,245*S),radius=12*S,fill=(106,154,164,255),outline=(247,236,188,255),width=10*S)
 d.rectangle((5*S,100*S,84*S,229*S),fill=(174,223,227,255))
 d.line((43*S,100*S,43*S,229*S),fill=(255,248,216,255),width=6*S)
 d.line((5*S,160*S,84*S,160*S),fill=(255,248,216,255),width=6*S)
 d.rounded_rectangle((-20*S,243*S,110*S,255*S),radius=4*S,fill=(151,116,74,255))
 d.rectangle((0,820*S,600*S,1040*S),fill=(192,162,112,190))
 for yy in [850,900,950,1000]:
  d.line((0,yy*S,600*S,yy*S),fill=(128,100,64,45),width=2*S)
 for xx,yy in [(555,235),(568,580),(28,700)]:
  d.ellipse(((xx-34)*S,(yy+17)*S,(xx+34)*S,(yy+33)*S),fill=(40,67,45,38))
  d.polygon([((xx-22)*S,yy*S),((xx+22)*S,yy*S),((xx+16)*S,(yy+28)*S),((xx-16)*S,(yy+28)*S)],fill=(205,112,68,255))
  for dx,dy in [(-13,-32),(12,-47),(0,-58)]:
   d.ellipse(((xx+dx-13)*S,(yy+dy)*S,(xx+dx+13)*S,(yy+dy+34)*S),fill=(72,134+dx,77,235))
 # Subtle patterned runners at the very edges leave the central bundle quiet.
 for yy in range(320,770,56):
  for xx in [7,590]:
   d.polygon([(xx*S,(yy-5)*S),((xx+5)*S,yy*S),(xx*S,(yy+5)*S),((xx-5)*S,yy*S)],fill=(255,246,201,145))
 im=Image.alpha_composite(im,layer.resize((W,H),Image.Resampling.LANCZOS))
 daylight=Image.new('RGBA',(W,H));q=ImageDraw.Draw(daylight)
 q.polygon([(-90,0),(90,0),(500,650),(280,720)],fill=(255,255,225,38))
 im=Image.alpha_composite(im,daylight.filter(ImageFilter.GaussianBlur(28)))
 Path('assets').mkdir(exist_ok=True);im.convert('RGB').save(Path('assets')/name,optimize=True)
 print(name,(Path('assets')/name).stat().st_size)
