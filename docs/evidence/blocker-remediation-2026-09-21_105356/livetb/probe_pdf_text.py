import fitz
import json

out = {}
p = "/app/uploads/001/drawings/drw_73b1fd8e-be16-448f-b46c-593dee54b0ef_E01_R1.pdf"
doc = fitz.open(p)
e01 = []
for i, page in enumerate(doc):
    t = page.get_text("text")
    needles = ["87STUB", "QDC1", "X420", "86STUB", "TB"]
    hits = [h for h in needles if h.upper() in (t or "").upper()]
    e01.append({"page": i + 1, "chars": len(t or ""), "hits": hits, "sample": (t or "")[:300]})
doc.close()
out["e01"] = e01

p2 = "/app/uploads/003/drawings/drw_b2c17e4b-8605-465a-8480-fe3750cc5e72_SIET-4 SOLAR WADI PV FEEDER-1_GA.pdf"
doc = fitz.open(p2)
out["siet_pages"] = doc.page_count
siet = []
for i in range(doc.page_count):
    page = doc[i]
    t = page.get_text("text")
    siet.append({"page": i + 1, "text_chars": len(t or ""), "images": len(page.get_images())})
doc.close()
out["siet"] = siet
print(json.dumps(out, indent=2))
