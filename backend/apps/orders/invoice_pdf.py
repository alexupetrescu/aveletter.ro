"""Self-contained A4 documents with embedded Romanian fonts and frozen assets."""
import base64
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.core.models import format_bani

FONT_DIR = Path(__file__).parent / "fonts"
for name, filename in (("Noto", "NotoSans-Regular.ttf"), ("NotoBold", "NotoSans-Bold.ttf")):
    pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
pdfmetrics.registerFontFamily("Noto", normal="Noto", bold="NotoBold", italic="Noto", boldItalic="NotoBold")


def render_invoice_pdf(snapshot, *, preview=False):
    buffer = BytesIO()
    ink, olive = colors.HexColor("#24241f"), colors.HexColor("#5a6437")
    basic = ParagraphStyle("body", fontName="Noto", fontSize=8.5, leading=13, textColor=ink)
    title = ParagraphStyle("title", parent=basic, fontName="NotoBold", fontSize=20, leading=27)
    white = ParagraphStyle("white", parent=basic, textColor=colors.white, fontName="NotoBold")
    right = ParagraphStyle("right", parent=basic, alignment=TA_RIGHT)
    total_style = ParagraphStyle("total", parent=right, fontName="NotoBold", fontSize=13, leading=20)
    def p(value, style=basic):
        return Paragraph(escape(str(value if value is not None else "")).replace("\n", "<br/>"), style)
    def money(amount):
        return format_bani(amount)
    def date(value):
        return ".".join(str(value).split("-")[::-1]) if value else "—"

    seller, buyer = snapshot.get("seller", {}), snapshot.get("buyer", {})
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=16*mm, leftMargin=16*mm,
                            topMargin=17*mm, bottomMargin=20*mm, title=f"Factura {snapshot['number_display']}",
                            author=seller.get("legal_name", ""))
    logo = p("Ave Letter", title)
    if seller.get("logo_base64"):
        logo = Image(BytesIO(base64.b64decode(seller["logo_base64"])))
        ratio = min(55*mm / logo.imageWidth, 24*mm / logo.imageHeight)
        logo.drawWidth, logo.drawHeight = logo.imageWidth * ratio, logo.imageHeight * ratio
        logo.hAlign = "LEFT"
    heading = [p("PREVIZUALIZARE" if preview else "FACTURĂ", title), p(snapshot["number_display"]),
               p(f"Data emiterii: {date(snapshot.get('issued_at'))}"),
               p(f"Scadență: {date(snapshot.get('due_date'))}"),
               p(f"Comanda: {snapshot.get('order_number', '')}")]
    header = Table([[logo, heading]], colWidths=[88*mm, 90*mm])
    header.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0)]))
    story = [header, Spacer(1, 10*mm)]

    def identity(label, values):
        result = [p(label, ParagraphStyle(label, parent=basic, fontName="NotoBold", textColor=olive))]
        for key, value in values:
            if value:
                result.append(p(f"{key}: {value}" if key else value))
        return result
    supplier = identity("FURNIZOR", [("", seller.get("legal_name")), ("CIF", seller.get("cui")),
        ("Reg. com.", seller.get("reg_com")), ("Adresă", seller.get("fiscal_address")),
        ("IBAN", seller.get("iban")), ("Bancă", seller.get("bank")), ("SWIFT", seller.get("swift")),
        ("Telefon", seller.get("invoice_phone")), ("Email", seller.get("invoice_email")),
        ("Capital social", seller.get("share_capital"))])
    customer = identity("CLIENT", [("", buyer.get("company_name") or buyer.get("full_name")),
        ("CIF", buyer.get("cui")), ("Reg. com.", buyer.get("reg_com")), ("Adresă", buyer.get("address")),
        ("Telefon", buyer.get("phone")), ("Email", buyer.get("email"))])
    parties = Table([[supplier, customer]], colWidths=[88*mm, 90*mm])
    parties.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0),
                                ("RIGHTPADDING", (0,0), (-1,-1), 12)]))
    story.extend([parties, Spacer(1, 8*mm)])
    vat = snapshot.get("vat_enabled", False)
    headers = ["Nr.", "Produs / serviciu", "U.M.", "Cant.", "Preț unitar", "Valoare"]
    if vat:
        headers.append("TVA")
    rows = [[p(value, white) for value in headers]]
    for index, line in enumerate(snapshot.get("lines", []), 1):
        label = line.get("product_title", "")
        if line.get("variant_name"):
            label += "\n" + line["variant_name"]
        row = [p(index), p(label), p(line.get("unit", "BUC")), p(line["quantity"]),
               p(money(line.get("unit_net_amount", line["unit_price_amount"])), right),
               p(money(line.get("line_net_amount", line["line_total_amount"])), right)]
        if vat:
            row.append(p(f"{line.get('vat_rate_bp', 0) / 100:g}%\n{money(line.get('line_vat_amount', 0))}", right))
        rows.append(row)
    for label, amount in (("Livrare", snapshot.get("shipping_amount", 0)),
                          ("Reducere", -snapshot.get("discount_amount", 0))):
        if amount:
            row = [p(len(rows)), p(label), p("BUC"), p(1), p(money(amount), right), p(money(amount), right)]
            if vat:
                row.append(p("—", right))
            rows.append(row)
    widths = [9, 67 if vat else 87, 12, 14, 28, 28] + ([20] if vat else [])
    table = Table(rows, colWidths=[value*mm for value in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), olive), ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 9), ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ("LINEBELOW", (0,1), (-1,-1), .4, colors.HexColor("#deded5")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f8f8f3")]),
    ]))
    story.extend([table, Spacer(1, 5*mm)])
    totals = []
    if vat:
        totals.extend([p(f"Total fără TVA: {money(snapshot.get('net_amount', 0))} {snapshot.get('currency', 'RON')}", right),
                       p(f"TVA: {money(snapshot.get('vat_amount', 0))} {snapshot.get('currency', 'RON')}", right)])
    totals.append(p(f"Total factură: {money(snapshot.get('gross_amount', 0))} {snapshot.get('currency', 'RON')}", total_style))
    story.append(KeepTogether(totals))
    mentions = sorted({line.get("vat_legal_mention", "") for line in snapshot.get("lines", [])} - {""})
    if mentions:
        story.extend([Spacer(1, 8*mm), p("\n".join(mentions))])
    if snapshot.get("footer"):
        story.extend([Spacer(1, 6*mm), p(snapshot["footer"])])
    if preview:
        story.extend([Spacer(1, 5*mm), p("Previzualizare — document neemis, fără număr rezervat.")])

    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(olive)
        canvas.line(16*mm, 15*mm, 194*mm, 15*mm)
        canvas.setFont("Noto", 8)
        canvas.setFillColor(ink)
        canvas.drawString(16*mm, 10*mm, snapshot["number_display"])
        canvas.drawRightString(194*mm, 10*mm, f"Pagina {document.page}")
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
