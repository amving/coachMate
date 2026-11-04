export const parentEmailValid=(value:string|undefined)=>Boolean(value&&value.length<=254&&/^[^\s@<>:,;\\]+@[^\s@<>:,;\\]+\.[^\s@<>:,;\\]+$/.test(value));
export function parentPhoneNumber(value:string|undefined):string {
  if(!value||value.length>40||!/^[+\d ()-]+$/.test(value))return '';
  let number=value.replace(/[ ()-]/g,'');
  if(number.startsWith('00'))number='+'+number.slice(2);
  if(/^0\d{9}$/.test(number))number='+31'+number.slice(1);
  return /^\+[1-9]\d{7,14}$/.test(number)?number.slice(1):'';
}
export function whatsappInviteUrl(phone:string|undefined,message:string,web=false):string {
  const number=parentPhoneNumber(phone);
  return web&&number?`https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(message)}`:`https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
export const defaultInvitationMessage='Wil je de beschikbaarheid van {shortName} voor speelronde {speelronde} doorgeven?';
export function normalizeInvitationMessage(value:unknown):string {
  if(value===undefined)return '';
  if(typeof value!=='string'||value.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error('Gebruik een uitnodigingstekst van maximaal 2000 tekens.');
  return value.replace(/\r\n?/g,'\n').trim();
}
export type InvitationInput={playerName:string;shortName?:string;parentName?:string;teamName:string;seasonName:string;round:number;count:number;url:string;startUrl?:string;editing?:boolean;message?:string};
export function invitationParts(input:InvitationInput){
  const parent=(input.parentName??'').trim().split(/\s+/)[0]||'ouder/verzorger';
  const shortName=input.shortName||input.playerName;
  const values:Record<string,string>={speler:input.playerName,shortName,parentName:parent,ouder:parent,team:input.teamName,seizoen:input.seasonName,speelronde:String(input.round),wedstrijden:String(input.count)};
  const template=input.editing?'Wil je de beschikbaarheid van {shortName} voor speelronde {speelronde} aanpassen?':normalizeInvitationMessage(input.message)||defaultInvitationMessage;
  const body=template.replace(/\{(speler|shortName|parentName|ouder|team|seizoen|speelronde|wedstrijden)\}/g,(_,key)=>values[key]);
  return {intro:`Hi ${parent},\n\n${body}`,label:input.editing?'Pas beschikbaarheid aan via deze link':'Geef beschikbaarheid op via deze link',url:input.url,
    instructions:input.editing?'Verzend de wijzigingen opnieuw via het formulier.':'',extraLink:null,later:'',footer:'Bedankt!'};
}
export function invitationText(input:InvitationInput){const p=invitationParts(input);return [p.intro,`${p.label}\n\n${p.url}`,p.instructions,p.footer].filter(Boolean).join('\n\n');}
