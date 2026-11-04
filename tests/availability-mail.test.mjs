import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../scripts/google-sheets/AvailabilityMail.gs',import.meta.url),'utf8');
function fixture(email='parent@example.com') {
  const data={Forms:[['teamSeasonId','formId','round','matchId','statusQuestion'],['a','f',2,'','{"m":"q"}']],TeamSeasons:[['teamSeasonId','seasonId','teamName'],['a','2026','Team']],Seasons:[['seasonId','name','archived'],['2026','2026/2027',false]],Players:[['teamSeasonId','playerId','name','parentEmail'],['a','p','Speler',email],['other','p','Andere speler','other@example.com']],FormInvites:[['formId','playerId','code','personalUrl'],['f','p','secret','https://docs.google.com/forms/d/e/test/viewform?entry.123=secret']]};
  const mail=[];
  const book={getSheetByName:name=>({getDataRange:()=>({getValues:()=>structuredClone(data[name])}),getRange:(row,col)=>({setValue:value=>{data[name][row-1]??=[];data[name][row-1][col-1]=value;}})})};
  const context=vm.createContext({SpreadsheetApp:{openById:()=>book,flush:()=>{}},LockService:{getUserLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},MailApp:{getRemainingDailyQuota:()=>100,sendEmail:value=>mail.push(value)}});
  vm.runInContext(script,context);
  const codeItem={getItem:()=>({getTitle:()=> 'Persoonlijke code'}),getResponse:()=> 'secret'};
  const choiceItem={getItem:()=>({getTitle:()=> 'Wedstrijd'}),getResponse:()=> 'Aanwezig'};
  const response={getItemResponses:()=>[codeItem,choiceItem],getEditResponseUrl:()=> 'https://docs.google.com/forms/d/e/test/viewform?edit2=opaque',getTimestamp:()=>new Date('2026-10-17T10:00:00Z'),getId:()=> 'r'};
  return {data,mail,context,response,submit:()=>context.coachMateAvailabilitySubmitted({source:{getId:()=> 'f'},response})};
}
test('submitted edit link is stored; confirmation goes only to scoped parentEmail without links, once per response',()=>{
  const f=fixture();f.submit();assert.equal(f.mail.length,1);assert.equal(f.mail[0].to,'parent@example.com');assert.doesNotMatch(f.mail[0].body,/https:|edit2=/);
  const headers=f.data.FormInvites[0],row=f.data.FormInvites[1];assert.equal(row[headers.indexOf('editUrl')],f.response.getEditResponseUrl());assert.equal(row[3],'https://docs.google.com/forms/d/e/test/viewform?entry.123=secret');
  f.submit();assert.equal(f.mail.length,1);
  f.response.getId=()=> 'new-response';f.submit();assert.equal(f.mail.length,2);
});
test('bad codes, incomplete answers and archived seasons never send mail',()=>{
  for(const change of [f=>f.data.FormInvites[1][2]='wrong',f=>f.response.getItemResponses=()=>[],f=>f.data.Seasons[1][2]=true]){const f=fixture();change(f);assert.throws(f.submit);assert.equal(f.mail.length,0);}
});
test('missing or unsafe parentEmail retains edit link without sending to another address',()=>{
  for(const email of ['', 'parent@example.com\ncc:other@example.com']){const f=fixture(email);assert.throws(f.submit,/parentEmail/);assert.equal(f.mail.length,0);assert.equal(f.data.FormInvites[1][f.data.FormInvites[0].indexOf('editUrl')],f.response.getEditResponseUrl());}
});

test('confirmation mail acknowledges receipt and keeps start and edit links private until explicitly requested',()=>{
 const f=fixture();f.data.TeamSeasons[1][2]='JO10-2';f.data.Players[1][2]='Tijn Miedema';f.submit();const mail=f.mail[0];
 assert.equal(mail.subject,'JO10-2 | Speelronde 2 | Beschikbaarheid Tijn');
 assert.match(mail.body,/is ontvangen/);assert.doesNotMatch(mail.body,/https:|edit2=|entry\./);assert.doesNotMatch(mail.htmlBody,/<a /);
 assert.equal(f.data.FormInvites[1][f.data.FormInvites[0].indexOf('editUrl')],f.response.getEditResponseUrl());
});
test('initial invitation cannot pretend an edit link already exists and escapes HTML names and URL parameters',()=>{
 const f=fixture();const mail=f.context.coachMateInvitationMail_({player:{name:'Tijn <img src=x>'},team:{teamName:'JO10-2'},season:{name:'2026'},form:{round:2},invite:{personalUrl:'https://docs.google.com/forms/d/e/test/viewform?entry.1=code&entry.2=Aanwezig'}},'',false);
 assert.doesNotMatch(mail.htmlBody,/Pas beschikbaarheid aan via deze link/);assert.match(mail.htmlBody,/&amp;entry.2/);assert.match(mail.htmlBody,/&lt;img src=x&gt;/);assert.match(mail.body,/Geef beschikbaarheid op via deze link/);
});
