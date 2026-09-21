import fitz
import json

p = "/app/uploads/001/drawings/drw_73b1fd8e-be16-448f-b46c-593dee54b0ef_E01_R1.pdf"
doc = fitz.open(p)
needles = ["87STUB", "QDC1", "X420", "86STUB"]
out = []
for i, page in enumerate(doc):
    w, h = page.rect.width, page.rect.height
    for n in needles:
        rects = page.search_for(n)
        for r in rects:
            out.append({
                "needle": n,
                "page": i + 1,
                "pdf_rect": [r.x0, r.y0, r.x1, r.y1],
                "norm": {
                    "x": r.x0 / w,
                    "y": r.y0 / h,
                    "width": (r.x1 - r.x0) / w,
                    "height": (r.y1 - r.y0) / h,
                },
                "page_size": [w, h],
            })
doc.close()
print(json.dumps({"hits": out, "count": len(out)}, indent=2))
