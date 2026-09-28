export function reminderCopy(stage: string, customer: string, amountCents: number, invoiceNumber?: string | null) {
  const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amountCents / 100)
  const ref = invoiceNumber ? ` ${invoiceNumber}` : ''
  const subjectByStage: Record<string,string> = {
    'J-3': `Rappel avant échéance — facture${ref}`,
    'J+1': `Échéance dépassée — facture${ref}`,
    'J+7': `Relance — facture${ref} en attente`,
    'J+15': `Deuxième relance — facture${ref}`,
    'J+30': `Relance importante — facture${ref}`,
  }
  const intro: Record<string,string> = {
    'J-3': `Sauf erreur de notre part, la facture${ref} d’un montant de ${amount} arrive prochainement à échéance.`,
    'J+1': `Sauf erreur de notre part, la facture${ref} d’un montant de ${amount} est arrivée à échéance et reste en attente de règlement.`,
    'J+7': `Nous revenons vers vous concernant la facture${ref} d’un montant de ${amount}, toujours indiquée comme non réglée.`,
    'J+15': `Malgré notre précédent message, la facture${ref} d’un montant de ${amount} apparaît toujours en attente de règlement.`,
    'J+30': `Nous vous recontactons au sujet de la facture${ref} d’un montant de ${amount}, dont l’échéance est dépassée depuis plusieurs semaines.`,
  }
  return {
    subject: subjectByStage[stage] || `Relance facture${ref}`,
    text: `Bonjour ${customer},\n\n${intro[stage] || intro['J+7']}\n\nSi le règlement a déjà été effectué, vous pouvez ignorer ce message. Dans le cas contraire, merci de nous indiquer la date de règlement prévue ou toute difficulté concernant cette facture.\n\nCordialement,`,
  }
}

export function classifyReply(text: string): {classification:'promise'|'paid'|'dispute'|'duplicate'|'other', extractedDate?: string} {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  if (/déjà (payé|réglé)|paiement (effectué|fait)|virement (effectué|fait)|facture (payée|réglée)/i.test(t)) return { classification: 'paid' }
  if (/pas reçu|renvoyer.*facture|duplicata|copie.*facture/i.test(t)) return { classification: 'duplicate' }
  if (/conteste|désaccord|erreur.*montant|montant.*incorrect|prestation.*non/i.test(t)) return { classification: 'dispute' }
  if (/je (paie|paye|règle|regle)|nous (paierons|réglerons|reglerons)|virement.*(demain|vendredi|lundi|mardi|mercredi|jeudi)|règlement.*prévu/i.test(t)) return { classification: 'promise' }
  return { classification: 'other' }
}
