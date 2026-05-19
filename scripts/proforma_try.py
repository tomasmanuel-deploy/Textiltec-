from reportlab.lib.pagesizes import A4 
from reportlab.pdfgen import canvas 
from reportlab.lib.units import mm 

# Create a canvas for A4 page (595 x 842 points) 
c = canvas.Canvas("replicated_proforma.pdf", pagesize=A4) 
width, height = A4 

# Set default font 
c.setFont("Helvetica", 10) 

# Helper function to draw horizontal lines for tables 
def draw_horizontal_line(y, start_x=40, end_x=555): 
    c.line(start_x, y, end_x, y) 

# Top section coordinates 
# Assuming logo is at top-left (replace with actual image if available; here using placeholder text) 
c.setFont("Helvetica-Bold", 12) 
c.drawString(60 * mm, height - 25 * mm, "NEGOMIL")  # Adjusted for logo position, approx below logo 

# Proforma Original on top-right 
c.setFont("Helvetica-Bold", 12) 
c.drawString(160 * mm, height - 20 * mm, "Proforma") 
c.setFont("Helvetica", 10) 
c.drawString(170 * mm, height - 25 * mm, "Original") 

# Company details (left side) 
c.setFont("Helvetica", 10) 
c.drawString(20 * mm, height - 35 * mm, "Textilec Solucoes") 
c.drawString(20 * mm, height - 40 * mm, "Contribuinte N°: 50014453696") 
c.drawString(20 * mm, height - 45 * mm, "Telefone: 921267422/") 
c.drawString(20 * mm, height - 50 * mm, "Site:") 
c.drawString(20 * mm, height - 55 * mm, "Email: - Angola Luanda.Luanda. Luanda - Angola") 

# Client details (right side) 
c.drawString(140 * mm, height - 40 * mm, "Exmo (s) Sr.(s)") 
c.drawString(140 * mm, height - 45 * mm, "Cliente: rajan") 
c.drawString(140 * mm, height - 50 * mm, "ANGOLA-Luanda.Luanda") 

# PP reference 
c.setFont("Helvetica-Bold", 12) 
c.drawString(20 * mm, height - 70 * mm, "PP XVE2025/2") 

# Date table headers and values 
# Columns approx: 20mm, 60mm, 100mm, 140mm 
current_y = height - 80 * mm 
draw_horizontal_line(current_y + 5) 
c.drawString(20 * mm, current_y, "Data Emissão") 
c.drawString(60 * mm, current_y, "Data Vencimento") 
c.drawString(100 * mm, current_y, "Contribuinte") 
c.drawString(140 * mm, current_y, "Data Ref. Doc.") 
draw_horizontal_line(current_y - 2) 
current_y -= 5 * mm 
c.drawString(20 * mm, current_y, "2025-10-22") 
c.drawString(60 * mm, current_y, "2025-10-22") 
c.drawString(100 * mm, current_y, "437323342434") 
draw_horizontal_line(current_y - 2) 

# Product table headers 
current_y -= 10 * mm 
draw_horizontal_line(current_y + 5) 
c.drawString(20 * mm, current_y, "Cod.Produto") 
c.drawString(35 * mm, current_y, "Descrição") 
c.drawString(100 * mm, current_y, "Preço Uni") 
c.drawString(120 * mm, current_y, "Uni") 
c.drawString(130 * mm, current_y, "Qtd") 
c.drawString(140 * mm, current_y, "Desc") 
c.drawString(150 * mm, current_y, "IEC %") 
c.drawString(160 * mm, current_y, "Taxa %") 
c.drawString(170 * mm, current_y, "Total S/Imp") 
draw_horizontal_line(current_y - 2) 

# Product row 
current_y -= 5 * mm 
c.drawString(20 * mm, current_y, "000702") 
c.drawString(35 * mm, current_y, "Quadro Resumo produto a de Imposto") 
c.drawString(100 * mm, current_y, "100.00,00") 
c.drawString(120 * mm, current_y, "Uni") 
c.drawString(130 * mm, current_y, "2.00") 
c.drawString(140 * mm, current_y, "0.00") 
c.drawString(150 * mm, current_y, "0") 
c.drawString(160 * mm, current_y, "14.00") 
c.drawString(170 * mm, current_y, "200.00,00") 
draw_horizontal_line(current_y - 2) 

# IVA table 
current_y -= 10 * mm 
draw_horizontal_line(current_y + 5) 
c.drawString(20 * mm, current_y, "DESCRIÇÃO") 
c.drawString(100 * mm, current_y, "INCIDÊNCIA") 
c.drawString(140 * mm, current_y, "IMPOSTO") 
draw_horizontal_line(current_y - 2) 
current_y -= 5 * mm 
c.drawString(20 * mm, current_y, "IVA 14%") 
c.drawString(100 * mm, current_y, "200.00,00") 
c.drawString(140 * mm, current_y, "28.00,00") 
draw_horizontal_line(current_y - 2) 

# Coordenadas Bancárias table 
current_y -= 10 * mm 
c.drawString(20 * mm, current_y, "Coordenadas Bancárias") 
current_y -= 5 * mm 
draw_horizontal_line(current_y + 5) 
c.drawString(20 * mm, current_y, "Banco") 
c.drawString(100 * mm, current_y, "Conta") 
c.drawString(140 * mm, current_y, "Iban") 
draw_horizontal_line(current_y - 2) 
current_y -= 5 * mm 
# Empty row 
draw_horizontal_line(current_y - 2) 

# Totals (right-aligned) 
current_y -= 10 * mm 
c.drawRightString(170 * mm, current_y, "Total Liquido: 200.00,00") 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "Total Desconto: 0.00") 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "Total Imposto: 28.00,00") 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "Total IEC: 0.00,00") 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "Total Imposto Cativo: 0.00") 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "Total Retenção na Fonte: 0.00") 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "Total Sem Retenção 0.00") 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "Total (Kz) 228.00,00") 

# Total in words 
current_y -= 5 * mm 
c.drawRightString(170 * mm, current_y, "duzentos e vinte e oito mil Kwanzas") 

# Document note 
current_y -= 10 * mm 
c.drawString(70 * mm, current_y, "Este Documento não serve de Factura") 

# Footer 
current_y -= 20 * mm 
draw_horizontal_line(current_y) 
current_y -= 5 * mm 
c.drawString(20 * mm, current_y, "md01 - Processado por Programa Validado n° 385/AGT/2022") 
current_y -= 5 * mm 
c.drawString(20 * mm, current_y, "Numeração Interna: NPP XVE2025/2 Impresso aos 01.17:17T2025-10-22 Utilizador: admin") 
current_y -= 5 * mm 
c.drawString(20 * mm, current_y, "Software Negomil_V.3.10 B02 Módulo: COMERCIAL") 
current_y -= 5 * mm 
c.drawString(20 * mm, current_y, "Regime: Geral") 
c.drawRightString(170 * mm, current_y, "página 1 de 1 Utilizador: admin") 

# Save the PDF 
c.save()