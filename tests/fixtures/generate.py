# Synthetic documents only. Optional regeneration with Pillow/reportlab/openpyxl.
from pathlib import Path
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont
from openpyxl import Workbook
root = Path(__file__).parent
lines = ['Fournisseur : FOURNISSEUR SAS', 'seller@example.invalid', 'Client : MARTIN SARL', '12 rue Victor Hugo', '59000 Lille', 'Email : compta@example.invalid', 'Facture FA-260', 'Date facture : 01/09/2026', 'Echeance : 30/09/2026', 'Total HT : 1000,00', 'TVA : 280,00', 'Total TTC : 1280,00 EUR', 'Reste du : 1280,00']
for filename, ref in [('invoice.pdf','FA-260'),('invoice2.pdf','FA-261')]:
    pdf=canvas.Canvas(str(root/filename));pdf.setFont('Helvetica',14)
    for i,line in enumerate(lines): pdf.drawString(50,790-i*30,line.replace('FA-260',ref))
    pdf.save()
img=Image.new('RGB',(1500,1000),'white');draw=ImageDraw.Draw(img)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',36)
for i,line in enumerate(lines):draw.text((60,45+i*66),line,fill='black',font=font)
img.save(root/'invoice.png')
img.save(root/'invoice.jpg',quality=95)
wb=Workbook();ws=wb.active;ws.title='Creances'
ws.append(['TIERS','NUM_PIECE','ECHEANCE','SOLDE','EMAIL_TIERS','DEVISE'])
ws.append(['DUPONT SAS','EX-001','30/09/2026',1280,None,'EUR'])
wb.save(root/'invoices.xlsx')
