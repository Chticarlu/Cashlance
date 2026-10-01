import { describe,it,expect } from 'vitest'
import { extractInvoice } from '../lib/imports/extract'
import { parseCSV,suggestMapping,mappedRows } from '../lib/imports/tabular'
import { emptyDraft,restoreDraft,dateISO,moneyCents,draftErrors,previewSchedule } from '../lib/imports/model'
import { cleanDrafts } from '../lib/imports/server'
import { canSendImportedReminder } from '../lib/trial'
import { onboardingMessage } from '../lib/onboarding-emails'
describe('document extraction',()=>{
  it('distinguishes supplier and debtor and extracts only debtor contact',()=>{
    const r=extractInvoice('Fournisseur : CASH SUPPLIER SAS\nseller@example.com\nClient : DUPONT CONSTRUCTION SAS\n12 rue Victor Hugo\n59000 Lille\nEmail : compta@example.com\nTéléphone : 0612345678\nSIRET : 12345678901234\nFacture FA-260\nDate facture : 01/09/2026\nÉchéance : 30/09/2026\nTotal HT : 1 000,00\nTVA : 200,00\nTotal TTC : 1 200,00 EUR\nReste dû : 800,00','invoice.pdf')
    expect(r).toMatchObject({client:'DUPONT CONSTRUCTION SAS',issuer:'CASH SUPPLIER SAS',email:'compta@example.com',invoiceNumber:'FA-260',due:'2026-09-30',amount:'800,00',total:'1 200,00',currency:'EUR',confirmed:false})
  })
  it('never guesses the first company or supplier email as debtor',()=>{
    expect(extractInvoice('Fournisseur : VENDEUR SAS\ncontact@vendeur.fr\nFacture F-100\nTotal TTC : 1280 EUR','a')).toMatchObject({client:'',email:''})
  })
  it('does not interpret a VAT percentage as its amount',()=>expect(extractInvoice('TVA 20%\nTotal TTC : 120 EUR','a').tax).toBe(''))
  it('leaves missing fields empty and rejects ambiguous currencies',()=>expect(extractInvoice('Client : TEST\n100 EUR 200 USD','a')).toMatchObject({currency:'',due:'',amount:''}))
  it('reads French billing blocks, document labels and remaining balance',()=>{
    const r=extractInvoice('Fournisseur : EMETTEUR SAS\nseller@example.invalid\nAdresse de facturation\nDUPONT CONSTRUCTION SAS\n10 rue des Lilas\n75001 Paris\nEmail : acheteur@example.invalid\nCompte client : C-789\nNuméro de facture : FA/2026-123\nDate du document : 01/09/2026\nDate d’échéance : 16/10/2026\nMontant HT : 1000,00\nTVA : 20 %\nMontant total EUR : 1 200,00\nMontant restant dû : 800,00 EUR','fr.pdf')
    expect(r).toMatchObject({client:'DUPONT CONSTRUCTION SAS',email:'acheteur@example.invalid',reference:'C-789',invoiceNumber:'FA/2026-123',invoiceDate:'2026-09-01',due:'2026-10-16',total:'1 200,00',amount:'800,00',tax:'',confirmed:false})
  })
  it.each(['Montant TTC','Net à payer','Montant total EUR'])('recognizes %s',label=>expect(extractInvoice(`${label} : 1 280,00 EUR`,'a').total).toBe('1 280,00'))
  it('does not confuse account, date or supplier with debtor and invoice number',()=>{
    expect(extractInvoice('Compte client : C-12\nDate de facture : 01/09/2026\nClient\nFournisseur : VENDEUR SAS','a')).toMatchObject({client:'',invoiceNumber:''})
  })
  it('proposes an unconfirmed due date only with an explicit starting point',()=>{
    const base='Date de facture : 01/09/2026\n'
    expect(extractInvoice(base+'Paiement à 45 jours date de facture','a')).toMatchObject({due:'2026-10-16',confirmed:false})
    for(const term of ['Paiement à 45 jours','Paiement à 45 jours date de facture fin de mois','Paiement à 45 jours date de facture ouvrés']) expect(extractInvoice(base+term,'a').due).toBe('')
    expect(extractInvoice('Paiement à 45 jours date de facture','a').due).toBe('')
  })
})
describe('CSV and column mapping',()=>{
  it('handles BOM, quoted separators, escaped quotes and multiline fields',()=>expect(parseCSV('\uFEFFCLIENT;SOLDE;NOTE\r\n"Dupont; SAS";"1 280,00";"a""b\nc"')).toEqual([['CLIENT','SOLDE','NOTE'],['Dupont; SAS','1 280,00','a"b\nc']]))
  it('maps accounting headers and preserves incomplete fields for review',()=>{
    const headers=['TIERS','NUM_PIECE','DATE_ECHEANCE','SOLDE','EMAIL_TIERS','DEVISE']
    const rows=mappedRows({name:'export.csv',headers,rows:[['Martin SARL','FA254','15/09/2026','840','client@example.com','EUR'],['Dupont','FA255','','1240','','']]},suggestMapping(headers))
    expect(rows[0]).toMatchObject({client:'Martin SARL',invoiceNumber:'FA254',due:'2026-09-15',amount:'840',confirmed:false})
    expect(draftErrors(rows[0],true)).toEqual([]);expect(draftErrors(rows[1],true).length).toBeGreaterThan(0)
  })
  it('does not assign the same destination twice',()=>expect(suggestMapping(['CLIENT','RAISON_SOCIALE'])).toEqual({'0':'client','1':''}))
  it('rejects malformed and oversized files',()=>{expect(()=>parseCSV('CLIENT;NOTE\n"unclosed')).toThrow();expect(()=>parseCSV('CLIENT\n'+Array(202).fill('x').join('\n'))).toThrow()})
})
describe('review and schedule guards',()=>{
  it('restores legacy drafts without losing values or trusting their previous confirmation',()=>{
    const saved={id:'old-id',source:'old.pdf',issuer:'SUPPLIER',client:'CLIENT',invoiceNumber:'OLD-1',amount:'100',currency:'EUR',due:'2026-10-10',email:'test@example.invalid',confirmed:true}
    const restored=restoreDraft(saved)
    expect(restored).toMatchObject({...saved,confirmed:false,paymentTerms:'',invoiceDate:''})
    expect(draftErrors(restored,true)).toEqual([])
    expect(saved).not.toHaveProperty('paymentTerms')
  })
  it('normalizes null fields in restored drafts and preserves current payment terms',()=>{
    expect(restoreDraft({client:null,email:3,paymentTerms:null})).toMatchObject({client:'',email:'',paymentTerms:'',confirmed:false})
    expect(restoreDraft({...emptyDraft(),paymentTerms:'45 jours'}).paymentTerms).toBe('45 jours')
    expect(()=>restoreDraft(null)).toThrow('Brouillon illisible')
  })
  it.each([['1 280,50',128050],['1.280,50',128050],['1,280.50',128050],['0',0],['(20,00)',-2000],['12oops',null],['1.234',null]])('parses money %s',(s,n)=>expect(moneyCents(s as string)).toBe(n))
  it.each(['31/02/2026','2026-13-01','09/10/26',''])('rejects invalid date %s',s=>expect(dateISO(s)).toBe(''))
  it('requires an email only to schedule, still requires other essential fields',()=>{
    const row={...emptyDraft(),client:'Demo',invoiceNumber:'TEST-1',due:'2026-10-01',amount:'12',currency:'EUR'}
    expect(draftErrors(row,false)).toEqual([]);expect(draftErrors(row,true)).toContain('Email client invalide ou manquant')
  })
  it('never schedules overdue reminders in a burst or immediately',()=>{
    const now=new Date('2026-09-30T12:00:00Z');const dates=previewSchedule('2025-01-01','complete',now).map(x=>Date.parse(x.at))
    expect(dates[0]-now.getTime()).toBe(86400000);expect(dates.every((d,i)=>i===0||d-dates[i-1]>=86400000)).toBe(true)
  })
  it('rejects demo payloads and excessive batches',()=>{expect(()=>cleanDrafts([{...emptyDraft(),demo:true}])).toThrow();expect(()=>cleanDrafts(Array(201).fill(emptyDraft()))).toThrow()})
  it('strips extraneous payload data',()=>expect(cleanDrafts([{...emptyDraft(),organization_id:'other',secret:'x'}])[0]).not.toHaveProperty('organization_id'))
})
describe('trial and useful emails',()=>{
  const now=new Date('2026-09-30T12:00:00Z'),org={created_at:'2026-09-17T12:00:00Z',subscription_status:'trialing',stripe_subscription_id:null}
  it('stops imported reminders after free trial without changing Stripe trials',()=>{
    expect(canSendImportedReminder(org,now.getTime())).toBe(true)
    expect(canSendImportedReminder({...org,created_at:'2026-09-01'},now.getTime())).toBe(false)
    expect(canSendImportedReminder({...org,created_at:'2026-09-01',stripe_subscription_id:'sub_test'},now.getTime())).toBe(true)
    expect(canSendImportedReminder({...org,subscription_status:'cancelled'},now.getTime())).toBe(false)
  })
  it('prioritizes trial ending and does not nag immediately',()=>{
    const state={stage:'empty',created_at:org.created_at,updated_at:now.toISOString()}
    expect(onboardingMessage(state,org,now)?.kind).toBe('trial_end')
    expect(onboardingMessage(state,{...org,created_at:now.toISOString()},now)).toBeNull()
  })
  it.each([['empty','welcome'],['review','review'],['draft','schedule'],['scheduled','activated']])('chooses useful email for %s',(stage,kind)=>expect(onboardingMessage({stage,created_at:'2026-09-28',updated_at:'2026-09-28'},{...org,created_at:'2026-09-28'},now)?.kind).toBe(kind))
})
