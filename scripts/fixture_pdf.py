from pathlib import Path
from reportlab.pdfgen import canvas

target = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "sis-sample.pdf"
file = canvas.Canvas(str(target), invariant=True)
positions = [40, 175, 270, 345, 430, 500]
rows = [
    ["Course", "Day", "Start", "End", "Room", "Code"],
    ["Data Structures", "Monday", "09:00", "10:30", "B204", "CS201"],
    ["Physics Lab", "Sunday", "13:00", "15:00", "Lab C", "PHY102"]
]
for line, row in enumerate(rows):
    for x, word in zip(positions, row):
        file.drawString(x, 780-line*26, word)
file.save()

