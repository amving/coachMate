export type InvitationFilter='all'|'invite'|'waiting'|'answered';
export function invitationProgress(input:{submitted?:boolean;delivery?:{status:string;channel?:string};confirmed?:boolean;attested?:boolean;opened?:boolean}){
 const answered=Boolean(input.submitted),status=input.delivery?.status;
 const sent=status==='sent'||Boolean(input.confirmed);
 const blocked=sent||['queued','processing','uncertain'].includes(status??'')||Boolean(input.attested)||answered;
 const invitation=sent?(input.delivery?.channel==='email'?'Verstuurd via e-mail':input.delivery?.channel==='whatsapp'||input.confirmed?'Verstuurd via WhatsApp':'Verstuurd · kanaal onbekend'):input.attested?'Verstuurd door jou · registratie nog niet opgeslagen':status==='queued'?'E-mail in wachtrij':status==='processing'?'E-mail wordt verstuurd':status==='uncertain'?'Verzending onzeker':status==='failed'?'Verzenden mislukt':input.opened?'WhatsApp-verzending bevestigen':'Verzending niet geregistreerd';
 return {answered,sent,blocked,invitation,answer:answered?'Antwoord ontvangen':'Nog geen antwoord',invite:!blocked,waiting:sent&&!answered,needsConfirmation:!sent&&!['queued','processing','uncertain'].includes(status??'')};
}
export function invitationMatches(filter:InvitationFilter,progress:ReturnType<typeof invitationProgress>){return filter==='all'||filter==='invite'&&progress.invite||filter==='waiting'&&progress.waiting||filter==='answered'&&progress.answered;}
