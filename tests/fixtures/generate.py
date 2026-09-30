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

# Low-resolution, French-labelled screenshot and an image-only PDF (no text layer).
french = ['Fournisseur : EMETTEUR SAS', 'seller@example.invalid',
          'Adresse de facturation :', 'DUPONT CONSTRUCTION SAS',
          '10 rue des Lilas', '75001 Paris', 'Email : acheteur@example.invalid',
          'Compte client : C-789', 'Facture n° FA-2026-123',
          'Date du document : 01/09/2026', 'Date echeance : 16/10/2026',
          'Montant HT : 1000,00', 'Montant TTC : 1200,00 EUR',
          'Montant restant du : 800,00 EUR']
shot=Image.new('RGB',(750,920),'white'); pen=ImageDraw.Draw(shot)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',26)
for i,line in enumerate(french): pen.text((25,25+i*60),line,fill='black',font=small)
shot.save(root/'french-screenshot.png')
scan=canvas.Canvas(str(root/'scanned.pdf'),pagesize=(750,920))
scan.drawInlineImage(shot,0,0,width=750,height=920);scan.save()
for name, omitted in [('missing-email.pdf','Email :'),('missing-due.pdf','Date echeance :')]:
    pdf=canvas.Canvas(str(root/name));pdf.setFont('Helvetica',12)
    for i,line in enumerate([line for line in french if not line.startswith(omitted)]):
        pdf.drawString(35,790-i*30,line)
    pdf.save()
pdf=canvas.Canvas(str(root/'too-many-pages.pdf'))
for i in range(4):
    pdf.drawString(40,790,'Facture synthetique TEST-4P - page '+str(i+1));pdf.showPage()
pdf.save()
