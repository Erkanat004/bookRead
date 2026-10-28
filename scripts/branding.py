"""Optional regeneration of Android launcher PNGs (Python + Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'android/app/src/main/res'
def icon(size, transparent=False):
    s = 4
    im = Image.new('RGBA', (size*s,size*s), (0,0,0,0) if transparent else '#252b28')
    d = ImageDraw.Draw(im)
    def pt(x,y): return (int(x/108*size*s),int(y/108*size*s))
    gold = '#d9bb80'
    width = max(1,round(size*s/108*2.4))
    d.line([pt(54,43),pt(54,76)],fill=gold,width=width)
    for points in [[(54,45),(43,39),(29,39),(29,69),(43,69),(54,76)],[(54,45),(65,39),(79,39),(79,69),(65,69),(54,76)]]:
        d.line([pt(x,y) for x,y in points],fill=gold,width=width,joint='curve')
    for a,b in [((54,24),(54,31)),((39,27),(43,33)),((69,27),(65,33))]:
        d.line([pt(*a),pt(*b)],fill=gold,width=width)
    return im.resize((size,size),Image.Resampling.LANCZOS)
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    folder = root / ('mipmap-'+density)
    for name in ['ic_launcher','ic_launcher_round']:
        icon(size).save(folder/(name+'.png'))
    icon(round(size*2.25),True).save(folder/'ic_launcher_foreground.png')
for path in root.glob('drawable*/splash.png'):
    im = Image.open(path)
    canvas = Image.new('RGB',im.size,'#f6f3ec')
    logo = icon(max(48,min(180,round(min(im.size)*.2))))
    canvas.paste(logo,((im.width-logo.width)//2,(im.height-logo.height)//2),logo)
    canvas.save(path,optimize=True)
