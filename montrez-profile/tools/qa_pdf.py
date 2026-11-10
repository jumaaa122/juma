"""PDF-level quality gate for the Montrez profile.

Checks the exported PDF itself (not the HTML): page count and size, title,
font embedding, every approved string present on the right page with nothing
else printed, and the three contact links.

usage: python3 -I tools/qa_pdf.py <profile.pdf>
"""
import json
import pathlib
import re
import subprocess
import sys

from pypdf import PdfReader

pdf = sys.argv[1]
here = pathlib.Path(__file__).resolve().parent
copy = json.loads((here / "copy.json").read_text())
errors = []


def norm(s):
    s = s.replace(" ", " ").replace("’", "'")
    return re.sub(r"\s+", " ", s).strip().casefold()


reader = PdfReader(pdf)
if len(reader.pages) != 4:
    errors.append(f"page count {len(reader.pages)} != 4")
for i, pg in enumerate(reader.pages, 1):
    w, h = float(pg.mediabox.width), float(pg.mediabox.height)
    if abs(w - 595.28) > 1 or abs(h - 841.89) > 1:
        errors.append(f"page {i} is {w:.2f} x {h:.2f} pt, not A4")

title = (reader.metadata or {}).get("/Title")
if title != "Montrez · Company Profile · Zimbabwe":
    errors.append(f"PDF title is {title!r}")

fonts = subprocess.run(["pdffonts", pdf], capture_output=True, text=True).stdout.splitlines()[2:]
for line in fonts:
    if "Type 3" in line or " no " in line[60:75]:
        errors.append("font not embedded as TrueType: " + line.strip())

extra = {"2": ["02", copy["allowed_additions"][4]], "3": ["03", copy["allowed_additions"][4]], "4": ["04"]}
for pn, items in copy["pages"].items():
    raw = subprocess.run(["pdftotext", "-raw", "-f", pn, "-l", pn, pdf, "-"],
                         capture_output=True, text=True).stdout
    text = norm(raw)
    squeezed = re.sub(r"\s", "", text)
    # longest strings first, so a short label is never matched inside a paragraph
    checks = sorted(items + [("extra", e) for e in extra.get(pn, [])], key=lambda kv: -len(kv[1]))
    for key, want in checks:
        w = norm(want)
        if w in text:
            text = text.replace(w, " ", 1)
            squeezed = re.sub(r"\s", "", text)
            continue
        # letter-spaced labels can extract with extra spaces between letters
        ws = re.sub(r"\s", "", w)
        if ws in squeezed:
            squeezed = squeezed.replace(ws, "", 1)
            # remove the same characters from the spaced text
            pattern = r"\s*".join(map(re.escape, ws))
            text = re.sub(pattern, " ", text, count=1)
            continue
        errors.append(f"page {pn}: missing or altered [{key}] {want!r}")
    left = re.sub(r"\s", "", text)
    if left:
        errors.append(f"page {pn}: unexpected printed text {left!r}")

links = []
for i, pg in enumerate(reader.pages, 1):
    for a in pg.get("/Annots") or []:
        a = a.get_object()
        if a.get("/Subtype") == "/Link" and "/A" in a:
            links.append((i, a["/A"].get("/URI"), [round(float(v), 1) for v in a["/Rect"]]))
want_links = sorted(u for _, u in copy["links"])
got_links = sorted(u for _, u, _ in links)
if got_links != want_links:
    errors.append(f"links {got_links} != {want_links}")
if any(p != 4 for p, _, _ in links):
    errors.append("a link is not on page 4")

print(json.dumps({"pdf": pdf, "title": title, "links": links,
                  "fonts": [l.split()[0] for l in fonts], "errors": errors}, indent=1))
sys.exit(1 if errors else 0)
