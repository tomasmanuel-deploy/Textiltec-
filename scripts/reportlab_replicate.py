#!/usr/bin/env python3
"""
ReportLab PDF Generation Script
Replicates the exact layout with precise coordinates
Accepts dynamic document data from Node.js application
"""

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.lib.colors import black, red, blue
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import sys
import json
import os
from datetime import datetime

A4_W, A4_H = 595.0, 842.0   # points (width x height)

# Coordinates (from the computed table above).
coords = {
    "logo": {"x0_pt": 61.4,  "y0_pt": 37.3,  "w_pt": 45.1,  "h_pt": 34.9},
    "qr":   {"x0_pt": 454.0, "y0_pt": 72.9,  "w_pt": 85.0,  "h_pt": 85.0},
    "client_block": {"x0_pt": 492.5, "y0_pt": 87.2, "w_pt": 83.1, "h_pt": 96.7},
    "heading_band": {"x0_pt": 43.5, "y0_pt": 175.2, "w_pt": 514.2, "h_pt": 65.8},
    "table_header": {"x0_pt": 43.5, "y0_pt": 237.9, "w_pt": 517.3, "h_pt": 51.5},
    "totals_box": {"x0_pt": 376.7, "y0_pt": 505.8, "w_pt": 177.9, "h_pt": 29.3},
    "totals_rule": {"x0_pt": 374.4, "y0_pt": 492.4, "w_pt": 181.0, "h_pt": 11.1},
    "footer_band": {"x0_pt": 25.6, "y0_pt": 701.7, "w_pt": 531.3, "h_pt": 51.5},
    "watermark_band": {"x0_pt": 43.5, "y0_pt": 175.2, "w_pt": 514.2, "h_pt": 65.8}
}

def top_to_bottom_y(top_y_pt, height_pt):
    """
    Convert y measured from top (top_y_pt) to ReportLab bottom-left y coordinate.
    The values in coords are measured from top; ReportLab expects bottom-left.
    """
    return A4_H - (top_y_pt + height_pt)

def format_currency(amount):
    """Format currency with proper thousands separators"""
    return f"{amount:,.2f}".replace(',', ' ')

def format_date(date_str):
    """Format date string to DD/MM/YYYY"""
    try:
        if isinstance(date_str, str):
            # Try parsing ISO format
            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        else:
            dt = date_str
        return dt.strftime("%d/%m/%Y")
    except:
        return date_str

def generate_pdf(output_path="test_factura.pdf", document_data=None):
    """Generate PDF with provided document data"""
    
    # Handle stdin input for Node.js integration
    if document_data is None and not sys.stdin.isatty():
        try:
            input_data = sys.stdin.read()
            document_data = json.loads(input_data)
        except:
            pass
    
    # Default data if none provided
    if document_data is None:
        document_data = {
            "number": "PP XVE2025/2",
            "issueDate": "2025-01-17",
            "seller": {
                "name": "NEGOMIL",
                "tradeName": "Textilec Soluções",
                "nif": "5401453696",
                "phone": "921261422",
                "address": "Luanda - Angola    Luanda,Luanda, Luanda"
            },
            "buyer": {
                "name": "rajan",
                "address": "ANGOLA - Luanda, Luanda, Luanda"
            },
            "items": [{
                "product": {"code": "Service", "name": "Serviço Resumo do Projecto"},
                "unitPrice": 100000.00,
                "quantity": 2.00,
                "discount": 0,
                "vatRate": 14.00,
                "total": 200000.00
            }],
            "totals": {
                "subtotal": 200000.00,
                "discount": 0.00,
                "tax": 28000.00,
                "total": 228000.00
            },
            "status": "draft"
        }
    
    c = canvas.Canvas(output_path, pagesize=A4)
    c.setTitle(f"Document {document_data.get('number', 'N/A')}")

    # 1) Logo
    try:
        logo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "icon.png")
        if os.path.exists(logo_path):
            logo = ImageReader(logo_path)
            L = coords["logo"]
            c.drawImage(logo, L["x0_pt"], top_to_bottom_y(L["y0_pt"], L["h_pt"]), 
                       width=L["w_pt"], height=L["h_pt"], preserveAspectRatio=True, mask='auto')
        else:
            raise Exception("Logo not found")
    except:
        # Logo placeholder
        L = coords["logo"]
        c.rect(L["x0_pt"], top_to_bottom_y(L["y0_pt"], L["h_pt"]), L["w_pt"], L["h_pt"])
        c.setFont("Helvetica-Bold", 8)
        seller_name = document_data.get("seller", {}).get("name", "NEGOMIL")
        c.drawString(L["x0_pt"]+2, top_to_bottom_y(L["y0_pt"], L["h_pt"]) + 2, seller_name)

    # Company details (left side, below logo)
    c.setFont("Helvetica", 7)
    seller = document_data.get("seller", {})
    company_lines = [
        seller.get("tradeName", seller.get("name", "")),
        f"Contribuinte Nº: {seller.get('nif', '')}",
        f"Telefone: {seller.get('phone', '')}",
        "Site:",
        f"Email: {seller.get('email', '')}",
        seller.get("address", "")
    ]
    
    y_offset = 0
    for line in company_lines:
        if line.strip():
            c.drawString(L["x0_pt"], top_to_bottom_y(L["y0_pt"], L["h_pt"]) - 15 - y_offset, line)
            y_offset += 10

    # 2) QR Code (AGT URL)
    QB = coords["qr"]
    try:
        from reportlab.graphics.barcode import qr
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics import renderPDF
        issuer = (document_data.get('seller') or {}).get('nif') or ''
        doc_no = document_data.get('number') or ''
        doc_param = str(doc_no).replace(' ', '%20')
        qr_value = f"https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor={issuer}&document={doc_param}"
        qr_code = qr.QrCodeWidget(qr_value)
        try:
            if hasattr(qr_code, 'barLevel'):
                qr_code.barLevel = 'M'
        except Exception:
            pass
        bounds = qr_code.getBounds()
        width = bounds[2] - bounds[0]
        height = bounds[3] - bounds[1]
        d = Drawing(QB["w_pt"], QB["h_pt"])
        d.add(qr_code)
        renderPDF.draw(d, c, QB["x0_pt"], top_to_bottom_y(QB["y0_pt"], QB["h_pt"]))
    except Exception:
        c.rect(QB["x0_pt"], top_to_bottom_y(QB["y0_pt"], QB["h_pt"]), QB["w_pt"], QB["h_pt"])
        c.setFont("Helvetica", 6)
        c.drawString(QB["x0_pt"]-50, top_to_bottom_y(QB["y0_pt"], QB["h_pt"]) + QB["h_pt"]/2 - 4, "QR code here")

    # Client block
    CB = coords["client_block"]
    c.rect(CB["x0_pt"], top_to_bottom_y(CB["y0_pt"], CB["h_pt"]), CB["w_pt"], CB["h_pt"])
    c.setFont("Helvetica-Bold", 8)
    buyer = document_data.get("buyer", {})
    c.drawString(CB["x0_pt"]+4, top_to_bottom_y(CB["y0_pt"], CB["h_pt"]) + CB["h_pt"] - 10, 
                f"Cliente: {buyer.get('name', 'N/A')}")
    c.setFont("Helvetica", 7)
    c.drawString(CB["x0_pt"]+4, top_to_bottom_y(CB["y0_pt"], CB["h_pt"]) + CB["h_pt"] - 22, 
                buyer.get('address', 'N/A'))

    # Document type in top right
    c.setFont("Helvetica-Bold", 10)
    doc_type = "Proforma" if document_data.get("status") == "draft" else "Factura"
    c.drawRightString(580, 800, doc_type)
    c.drawRightString(580, 785, "Original")
    # Additional top-right texts to match reference
    c.setFont("Helvetica", 10)
    c.drawRightString(580, 760, "...")
    c.setFont("Helvetica", 9)
    c.drawRightString(580, 746, "Exmo.(s) Sr.(s)")
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(580, 732, f"Cliente: {buyer.get('name', 'N/A')}")
    c.setFont("Helvetica", 8)
    c.drawRightString(580, 718, buyer.get('address', 'N/A'))

    # 3) Heading band with document number and dates
    HB = coords["heading_band"]
    c.setFillColorRGB(1,1,1)
    c.rect(HB["x0_pt"], top_to_bottom_y(HB["y0_pt"], HB["h_pt"]), HB["w_pt"], HB["h_pt"], fill=0)
    c.setFillColorRGB(0,0,0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(HB["x0_pt"]+2, top_to_bottom_y(HB["y0_pt"], HB["h_pt"]) + HB["h_pt"] - 16, 
                document_data.get('number', 'N/A'))

    # Date fields
    c.setFont("Helvetica", 8)
    base_y = top_to_bottom_y(HB["y0_pt"], HB["h_pt"]) + HB["h_pt"]
    c.drawString(HB["x0_pt"]+2,  base_y - 35, "Data Emissão")
    c.drawString(HB["x0_pt"]+120,base_y - 35, "Data Vencimento")
    c.drawString(HB["x0_pt"]+250,base_y - 35, "Contribuinte")
    c.drawString(HB["x0_pt"]+380,base_y - 35, "Data Ref. Doc")

    # Underlines to match the reference bands
    c.setLineWidth(1)
    c.line(HB["x0_pt"]+2,   base_y - 40, HB["x0_pt"]+110, base_y - 40)
    c.line(HB["x0_pt"]+120, base_y - 40, HB["x0_pt"]+235, base_y - 40)
    c.line(HB["x0_pt"]+250, base_y - 40, HB["x0_pt"]+370, base_y - 40)
    c.line(HB["x0_pt"]+380, base_y - 40, HB["x0_pt"]+520, base_y - 40)
    c.setLineWidth(0.5)

    # Date values
    c.drawString(HB["x0_pt"]+4,   base_y - 50, format_date(document_data.get('issueDate', '')))
    c.drawString(HB["x0_pt"]+252, base_y - 50, buyer.get('nif', 'N/A'))

    # 4) Table header
    TH = coords["table_header"]
    c.rect(TH["x0_pt"], top_to_bottom_y(TH["y0_pt"], TH["h_pt"]), TH["w_pt"], TH["h_pt"])
    c.setFont("Helvetica", 8)
    c.drawString(TH["x0_pt"]+4, top_to_bottom_y(TH["y0_pt"], TH["h_pt"]) + TH["h_pt"] - 12, 
                "Cod.Produto    Descrição                    Preço Uni    Unid.   Qtd   Desc   IEC%  Taxa%  Total S/Imp")

    # Product rows
    c.setFont("Helvetica", 7)
    product_y = top_to_bottom_y(TH["y0_pt"], TH["h_pt"]) - 15
    
    items = document_data.get("items", [])
    for i, item in enumerate(items[:5]):  # Limit to 5 items for space
        y_pos = product_y - (i * 12)
        product = item.get("product", {})
        
        c.drawString(TH["x0_pt"]+4, y_pos, product.get("code", "Service"))
        c.drawString(TH["x0_pt"]+60, y_pos, product.get("name", item.get("description", "")))
        c.drawString(TH["x0_pt"]+250, y_pos, format_currency(item.get("unitPrice", 0)))
        c.drawString(TH["x0_pt"]+320, y_pos, item.get("unit", "UNI"))
        c.drawString(TH["x0_pt"]+350, y_pos, f"{item.get('quantity', 0):.2f}")
        c.drawString(TH["x0_pt"]+380, y_pos, f"{item.get('discount', 0):.0f}")
        c.drawString(TH["x0_pt"]+400, y_pos, "0")  # IEC%
        c.drawString(TH["x0_pt"]+420, y_pos, f"{item.get('vatRate', 0):.2f}")
        c.drawString(TH["x0_pt"]+460, y_pos, format_currency(item.get("total", 0)))

    # Quadro Resumo de Imposto
    c.setFont("Helvetica-Bold", 8)
    c.drawString(TH["x0_pt"]+4, product_y + 5, "Quadro Resumo de Imposto")
    c.setFont("Helvetica-Bold", 8)
    c.drawString(TH["x0_pt"]+4, product_y - 8, "DESCRIÇÃO")
    c.drawString(TH["x0_pt"]+140, product_y - 8, "INCIDÊNCIA")
    c.drawString(TH["x0_pt"]+260, product_y - 8, "IMPOSTO")
    c.setFont("Helvetica", 7)
    c.line(TH["x0_pt"], product_y - 12, TH["x0_pt"] + 320, product_y - 12)
    iva_rate = (items[0].get('vatRate', 0) if items else 0)
    c.drawString(TH["x0_pt"]+4, product_y - 26, f"IVA {iva_rate:.0f}%")
    c.drawRightString(TH["x0_pt"]+240, product_y - 26, format_currency(document_data.get('totals', {}).get('subtotal', 0)))
    c.drawRightString(TH["x0_pt"]+320, product_y - 26, format_currency(document_data.get('totals', {}).get('tax', 0)))

    # Bank coordinates section
    c.setFont("Helvetica-Bold", 8)
    c.drawString(TH["x0_pt"]+4, product_y - 80, "DESCRIÇÃO")
    c.setFont("Helvetica", 7)
    c.drawString(TH["x0_pt"]+4, product_y - 95, "Coordenadas Bancárias")
    c.drawString(TH["x0_pt"]+4, product_y - 110, "Banco                    Conta                    Iban")

    # 5) Totals section
    TB = coords["totals_box"]
    c.rect(TB["x0_pt"], top_to_bottom_y(TB["y0_pt"], TB["h_pt"]), TB["w_pt"], TB["h_pt"], fill=0)
    
    c.setFont("Helvetica", 8)
    totals_y = top_to_bottom_y(TB["y0_pt"], TB["h_pt"]) + TB["h_pt"] - 10
    totals = document_data.get("totals", {})
    
    # Labels (right-aligned)
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y, "Total líquido:")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y - 12, "Total Desconto:")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y - 24, "Total Imposto:")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y - 36, "Total IEC:")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y - 48, "Total Imposto Carimbo:")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y - 60, "Total Retenção na Fonte:")

    # Values
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y, format_currency(totals.get("subtotal", 0)))
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y - 12, format_currency(totals.get("discount", 0)))
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y - 24, format_currency(totals.get("tax", 0)))
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y - 36, "0.00")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y - 48, "0.00")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y - 60, "0.00")

    # Final total
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y - 80, "Total Sem Retenção")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 4, totals_y - 95, "Total (Kz)")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y - 80, "0.00")
    c.drawRightString(TB["x0_pt"] + TB["w_pt"] - 80, totals_y - 95, format_currency(totals.get("total", 0)))

    # Amount in words box (right side)
    def number_to_words_pt_thousands(n):
        units = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove"]
        tens = ["","dez","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"]
        hundreds = ["","cem","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"]
        def two_digits(x):
            if x < 10: return units[x]
            if 10 <= x < 20:
                teens = {10:"dez",11:"onze",12:"doze",13:"treze",14:"catorze",15:"quinze",16:"dezasseis",17:"dezassete",18:"dezoito",19:"dezanove"}
                return teens[x]
            t = x // 10
            u = x % 10
            return tens[t] + (" e " + units[u] if u else "")
        def three_digits(x):
            if x == 100: return "cem"
            h = x // 100
            r = x % 100
            if h == 0: return two_digits(r)
            return hundreds[h] + (" e " + two_digits(r) if r else "")
        thousands = n // 1000
        remainder = n % 1000
        if thousands and remainder:
            return three_digits(thousands) + " mil " + three_digits(remainder)
        if thousands and not remainder:
            return three_digits(thousands) + " mil"
        return three_digits(remainder)
    words_box_x = TB["x0_pt"] + TB["w_pt"] - 170
    words_box_y = totals_y - 130
    words_box_w = 165
    words_box_h = 40
    c.rect(words_box_x, words_box_y, words_box_w, words_box_h)
    total_kwz = int(round(totals.get("total", 0)))
    words_text = number_to_words_pt_thousands(total_kwz) + " Kwanzas"
    c.setFont("Helvetica", 7)
    c.drawString(words_box_x + 6, words_box_y + words_box_h/2 - 4, words_text)

    # Totals rule
    TR = coords["totals_rule"]
    c.line(TR["x0_pt"], top_to_bottom_y(TR["y0_pt"], TR["h_pt"]) + TR["h_pt"]/2, 
           TR["x0_pt"] + TR["w_pt"], top_to_bottom_y(TR["y0_pt"], TR["h_pt"]) + TR["h_pt"]/2)

    # Document validity note
    c.setFont("Helvetica", 8)
    validity_text = "Este Documento não serve de Factura" if document_data.get("status") == "draft" else "Documento processado electronicamente"
    c.drawCentredString(300, 200, validity_text)

    # 6) Footer
    FB = coords["footer_band"]
    c.setFont("Helvetica", 6)
    
    footer_text = "md01 - Processado por Programa Validado nº 365/AGT/2022"
    c.drawString(FB["x0_pt"] + 2, top_to_bottom_y(FB["y0_pt"], FB["h_pt"]) + FB["h_pt"]/2 + 10, footer_text)
    
    current_time = datetime.now().strftime("%H:%M:%S/%Y-%m-%d")
    footer_text2 = f"Numeração Interna: {document_data.get('number', 'N/A')} Impresso aos {current_time} Utilizador: admin"
    c.drawString(FB["x0_pt"] + 2, top_to_bottom_y(FB["y0_pt"], FB["h_pt"]) + FB["h_pt"]/2 - 3, footer_text2)
    
    footer_text3 = "Software Negomil_V_6.3.10 B2 Módulo: COMERCIAL"
    c.drawString(FB["x0_pt"] + 2, top_to_bottom_y(FB["y0_pt"], FB["h_pt"]) + FB["h_pt"]/2 - 16, footer_text3)

    c.drawString(FB["x0_pt"] + 2, top_to_bottom_y(FB["y0_pt"], FB["h_pt"]) + FB["h_pt"]/2 - 30, "Regime: Geral")
    c.drawRightString(FB["x0_pt"] + FB["w_pt"] - 2, top_to_bottom_y(FB["y0_pt"], FB["h_pt"]) + FB["h_pt"]/2 - 30, "Utilizador: admin")
    c.drawCentredString(300, top_to_bottom_y(FB["y0_pt"], FB["h_pt"]) + FB["h_pt"]/2 - 30, "página 1 de 1")

    # 7) Watermark (only for draft documents)
    if document_data.get("status") == "draft":
        WB = coords["watermark_band"]
        wb_center_x = WB["x0_pt"] + WB["w_pt"]/2
        wb_center_y = top_to_bottom_y(WB["y0_pt"], WB["h_pt"]) + WB["h_pt"]/2
        
        c.saveState()
        c.translate(wb_center_x, wb_center_y)
        c.rotate(-40)
        c.setFont("Helvetica-Bold", 36)
        c.setFillAlpha(0.08)
        c.drawCentredString(0, 0, "DOCUMENTO EMITIDO PARA FINS DE PROFORMA")
        c.restoreState()

    c.showPage()
    c.save()
    return output_path

if __name__ == "__main__":
    # Handle command line arguments or stdin input
    output_path = "replicated_page.pdf"
    document_data = None
    
    if len(sys.argv) > 1:
        output_path = sys.argv[1]
    
    if len(sys.argv) > 2:
        try:
            document_data = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            print("Invalid JSON data provided", file=sys.stderr)
            sys.exit(1)
    
    result_path = generate_pdf(output_path, document_data)
    print(f"PDF generated: {result_path}")
