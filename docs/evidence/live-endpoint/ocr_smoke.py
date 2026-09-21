import json, io
import fitz
import pytesseract
from PIL import Image

path = (
    "/app/uploads/backups/"
    "DRAWING_REPLACE_33kV_BUSBAR_PROTECTION_PANEL___H00_R_.pd_2026-07-21T09-16-42/"
    "drw_d40a722e-9399-413e-a477-aa7367926771_33kV BUSBAR PROTECTION PANEL (_H00+R).pdf"
)
doc = fitz.open(path)
page = doc.load_page(0)
text = (page.get_text("text") or "").strip()
mat = fitz.Matrix(150 / 72, 150 / 72)
pix = page.get_pixmap(matrix=mat, alpha=False)
img = Image.open(io.BytesIO(pix.tobytes("png")))
data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
words = []
for i in range(len(data["text"])):
    t = str(data["text"][i]).strip()
    if not t:
        continue
    conf = float(data["conf"][i])
    if conf < 0:
        continue
    words.append(
        {
            "text": t,
            "x": data["left"][i],
            "y": data["top"][i],
            "w": data["width"][i],
            "h": data["height"][i],
            "conf": conf,
        }
    )
tb_like = [w for w in words if w["text"].upper().startswith("X") or "TB" in w["text"].upper()]
out = {
    "page_count": doc.page_count,
    "page0_native_text_len": len(text),
    "classification": "IMAGE_ONLY" if len(text) < 40 else "SEARCHABLE",
    "ocr_word_count": len(words),
    "ocr_sample": words[:30],
    "tb_like": tb_like[:30],
    "engine": "pymupdf+tesseract",
    "dpi": 150,
}
open("/tmp/ocr-smoke.json", "w", encoding="utf-8").write(json.dumps(out, indent=2))
print(json.dumps({k: out[k] for k in ("page_count", "page0_native_text_len", "classification", "ocr_word_count", "engine")}, indent=2))
print("tb_like_count", len(tb_like))
