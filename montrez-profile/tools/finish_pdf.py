"""Final touch on the exported PDF: ask viewers to show the document title
("Montrez · Company Profile · Zimbabwe") instead of the file name.  Pages,
fonts, links and tags are carried over untouched.

usage: python3 -I tools/finish_pdf.py <in.pdf> <out.pdf>
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import BooleanObject, DictionaryObject, NameObject

src, dst = sys.argv[1], sys.argv[2]
writer = PdfWriter(clone_from=PdfReader(src))
prefs = writer._root_object.get("/ViewerPreferences")
prefs = prefs.get_object() if prefs is not None else DictionaryObject()
prefs[NameObject("/DisplayDocTitle")] = BooleanObject(True)
writer._root_object[NameObject("/ViewerPreferences")] = prefs
writer.add_metadata({"/Title": "Montrez · Company Profile · Zimbabwe",
                     "/Author": "Montrez Global Ventures (Private) Limited",
                     "/Subject": "Company Profile · Zimbabwe"})
with open(dst, "wb") as fh:
    writer.write(fh)
print("written", dst)
