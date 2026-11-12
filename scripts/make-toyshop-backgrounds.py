from PIL import Image,ImageDraw,ImageFilter
from pathlib import Path
W,H=600,1040
for home,name in [(True,'background.png'),(False,'play-background.png')]:
 im=Image.new('RGB',(W,H)); px=im.load()
 for y in range(H):
  for x in range(W):
   if y<220 and home: c=(42+int(y*.1),185+int(y*.12),238)
   else:
    t=min(1,max(0,(y-200)/840));c=(255,int(240-35*t),int(204-45*t))
   px[x,y]=c
 d=ImageDraw.Draw(im)
 # Warm edge shelving leaves the gameplay silhouette unobstructed.
 for left in [-45,555]:
  d.rounded_rectangle((left,160,left+90,760),20,fill='#d3a16b')
  d.rounded_rectangle((left+8,168,left+82,748),16,fill='#f5d29b')
  for y in [265,410,555,700]:
   d.rectangle((left,y,left+90,y+14),fill='#dcb078')
   x=left+45
   d.rounded_rectangle((x-24,y-100,x+24,y-7),14,fill='#f9f1d5',outline='#bca58b',width=3)
   for j,(dx,dy,col) in enumerate([(-10,-29,'#ff8380'),(10,-32,'#8bdb2f'),(0,-48,'#ffc630'),(-9,-64,'#34bafe'),(10,-78,'#f887ca')]):
    d.ellipse((x+dx-10,y+dy-10,x+dx+10,y+dy+10),fill=col)
    d.ellipse((x+dx-6,y+dy-7,x+dx-1,y+dy-2),fill='white')
   d.rounded_rectangle((x-24,y-108,x+24,y-98),4,fill='#e5be79')
 # Peripheral striped awning.
 for x in range(0,600,50):
  d.rounded_rectangle((x-2,-20,x+51,55 if home else 28),12,fill='#ff977e' if x%100==0 else '#fff6db')
 # Subtle perspective floor.
 for y in [810,890,985]:d.line((0,y,600,y),fill='#f0c49d',width=3)
 for x in range(-300,1000,150):d.line((300,680,x,1040),fill='#f0c49d',width=2)
 if home:
  for y in [920,975,1030]:
   d.arc((-100,y-70,700,y+50),0,180,fill='#d69650',width=25)
   d.arc((-100,y-75,700,y+45),0,180,fill='#ffe8a5',width=20)
 im.save(Path('assets')/name,optimize=True)
