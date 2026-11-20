from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "resources"
image = Image.new("RGBA", (512, 512))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((17, 17, 495, 495), radius=113, fill="#6243bb")
draw.rounded_rectangle((36, 36, 476, 476), radius=98, outline="#9678e4", width=3)
draw.line([(255, 346), (255, 207), (210, 182), (127, 182), (127, 318), (206, 318), (255, 346),
           (304, 318), (385, 318), (385, 182), (301, 182), (255, 207)], fill="white", width=16, joint="curve")
draw.line([(158, 228), (205, 228), (228, 240)], fill="#ded0fd", width=8, joint="curve")
draw.line([(283, 240), (306, 228), (353, 228)], fill="#ded0fd", width=8, joint="curve")
image.save(root / "icon.png")
image.save(root / "icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

