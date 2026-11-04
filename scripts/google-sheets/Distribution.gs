// Add alongside AvailabilityMail.gs. Uses the same account and source workbook.
var COACHMATE_JOB_HEADERS = ['jobId','teamSeasonId','round','type','status','templateFormId','formId','createdAt','completedAt','error'];
var COACHMATE_DELIVERY_HEADERS = ['deliveryId','batchId','teamSeasonId','formId','playerId','channel','recipient','status','createdAt','sentAt','error','message','renderedMessage'];

function coachMateDistributionTable_(book,name,headers) {
  var sheet=book.getSheetByName(name);
  if(!sheet){sheet=book.insertSheet(name);sheet.getRange(1,1,1,headers.length).setValues([headers]);}
  var table=coachMateRows_(book,name);
  if(name==='FormDeliveries'&&[11,12].indexOf(table.headers.length)>=0&&JSON.stringify(table.headers)===JSON.stringify(headers.slice(0,table.headers.length))){headers.slice(table.headers.length).forEach(function(key){table.headers.push(key);table.sheet.getRange(1,table.headers.length).setValue(key);});}
  if(JSON.stringify(table.headers)!==JSON.stringify(headers))throw new Error('Kolommen van '+name+' zijn gewijzigd.');
  return table;
}
function coachMateWriteFields_(table,row,fields) {
  Object.keys(fields).forEach(function(key){
    var col=table.headers.indexOf(key);
    if(col<0)throw new Error('Kolom ontbreekt: '+key);
    table.sheet.getRange(row,col+1).setValue(fields[key]);
  });
}
function coachMateAppend_(table,record) {
  table.sheet.getRange(Math.max(2,table.sheet.getLastRow()+1),1,1,table.headers.length).setValues([table.headers.map(function(key){return record[key]===undefined?'':record[key];})]);
}
function coachMateInstallDistribution() {
  var book=SpreadsheetApp.openById(COACHMATE_AVAILABILITY_BOOK);
  coachMateDistributionTable_(book,'FormJobs',COACHMATE_JOB_HEADERS);
  coachMateDistributionTable_(book,'FormDeliveries',COACHMATE_DELIVERY_HEADERS);
  // Resolve the fixed club template now, so Google requests copy rights at setup.
  var template=coachMateRows_(book,'Forms').rows.filter(function(form){return form.codeEntryId&&form.prefillDefaults;})[0];
  if(!template)throw new Error('Stel eerst één vaste clubopmaak in.');
  DriveApp.getFileById(template.formId).getName();
  var triggers=ScriptApp.getProjectTriggers();
  if(!triggers.some(function(trigger){return trigger.getHandlerFunction()==='coachMateProcessDistribution';}))ScriptApp.newTrigger('coachMateProcessDistribution').timeBased().everyMinutes(1).create();
  coachMateDistributionHeartbeat_(book);
}
function coachMateDistributionHeartbeat_(book) {
  var table=coachMateDistributionTable_(book,'FormJobs',COACHMATE_JOB_HEADERS);
  var row=table.rows.filter(function(row){return row.jobId==='worker';})[0];
  var fields={type:'worker-invitations-v3',status:'ready',completedAt:new Date().toISOString(),error:''};
  if(row)coachMateWriteFields_(table,row._row,fields);
  else coachMateAppend_(table,{jobId:'worker',type:fields.type,status:'ready',completedAt:fields.completedAt});
}
function coachMateDistributionSeason_(book,teamSeasonId) {
  var team=coachMateRows_(book,'TeamSeasons').rows.filter(function(row){return row.teamSeasonId===teamSeasonId;})[0];
  var season=team&&coachMateRows_(book,'Seasons').rows.filter(function(row){return row.seasonId===team.seasonId;})[0];
  if(!team||!season||String(season.archived).toLowerCase()!=='false')throw new Error('Teamseizoen ontbreekt of is gearchiveerd.');
  return {team:team,season:season};
}
function coachMatePrepareRound_(book,job,table) {
  var context=coachMateDistributionSeason_(book,job.teamSeasonId);
  var forms=coachMateRows_(book,'Forms');
  var existing=forms.rows.filter(function(form){return form.teamSeasonId===job.teamSeasonId&&!form.matchId&&Number(form.round)===Number(job.round);})[0];
  if(existing){coachMateWriteFields_(table,job._row,{status:existing.codeQuestion&&existing.statusQuestion!=='{}'?'ready':'awaiting-mapping',formId:existing.formId,completedAt:new Date().toISOString(),error:''});return;}
  var template=forms.rows.filter(function(form){return form.formId===job.templateFormId&&form.teamSeasonId===job.teamSeasonId&&form.codeEntryId&&form.prefillDefaults;})[0];
  if(!template)throw new Error('De vaste clubopmaak ontbreekt voor dit team.');
  var matchTable=coachMateRows_(book,'Matches');
  var matches=matchTable.rows.filter(function(match){return match.teamSeasonId===job.teamSeasonId&&Number(match.availabilityRound||1)===Number(job.round);});
  var players=coachMateRows_(book,'Players').rows.filter(function(player){return player.teamSeasonId===job.teamSeasonId;});
  if(!matches.length||!players.length)throw new Error('Voeg eerst wedstrijden en spelers toe.');
  matches.forEach(function(match){match.time=matchTable.sheet.getRange(match._row,matchTable.headers.indexOf('time')+1).getDisplayValue();match.shortDate=matchTable.sheet.getRange(match._row,matchTable.headers.indexOf('shortDate')+1).getDisplayValue();});
  var title=(context.team.clubName||'CoachMate')+' · '+context.team.teamName+' · '+context.season.name+' · speelronde '+job.round;
  var file=job.formId?DriveApp.getFileById(job.formId):DriveApp.getFileById(template.formId).makeCopy(title);
  coachMateWriteFields_(table,job._row,{formId:file.getId()});SpreadsheetApp.flush();
  var form=FormApp.openById(file.getId());
  form.setPublished(false);form.setTitle(title);
  form.setDescription('Controleer alle wedstrijden voor '+context.season.name+', speelronde '+job.round+'. Alles staat vooraf op Aanwezig; kies Afwezig waar nodig. Druk onderaan op Verzenden. Daarna ontvang je een bevestiging. Vraag de coach om een wijzigingslink als je later iets wilt aanpassen. Wijzigingen moet je opnieuw verzenden.');
  form.setAllowResponseEdits(true);form.setShowLinkToRespondAgain(false);form.setCollectEmail(false);
  form.setConfirmationMessage('Bedankt! Je antwoorden zijn verstuurd. Je ontvangt een bevestiging op het bij de coach bekende e-mailadres. Wil je iets aanpassen? Vraag de coach om een wijzigingslink. Verzend latere wijzigingen opnieuw.');
  // The copied theme/header remains intact. Retain matching question styles too.
  var items=form.getItems();
  var codeItems=items.filter(function(item){return item.getTitle()==='Persoonlijke code'&&item.getType()===FormApp.ItemType.TEXT;});
  if(codeItems.length!==1)throw new Error('De codevraag in de vaste opmaak is gewijzigd.');
  var codeItem=codeItems[0].asTextItem();codeItem.setRequired(true).setHelpText('Automatisch ingevuld — niet wijzigen. Deze code koppelt je antwoorden aan de juiste speler.');
  var questions=items.filter(function(item){return item.getType()===FormApp.ItemType.MULTIPLE_CHOICE;});
  while(questions.length>matches.length)form.deleteItem(questions.pop());
  while(questions.length<matches.length)questions.push(questions.length?questions[0].duplicate():form.addMultipleChoiceItem());
  questions.forEach(function(item,index){form.moveItem(item,index+1);var match=matches[index];item.asMultipleChoiceItem().setTitle(match.shortDate+' · '+match.time+' · '+match.opponent+' · '+match.venue).setChoiceValues(['Aanwezig','Afwezig']).setRequired(true);});
  var prefill=form.createResponse().withItemResponse(codeItem.createResponse('COACHMATE_CODE'));
  questions.forEach(function(item){prefill.withItemResponse(item.asMultipleChoiceItem().createResponse('Aanwezig'));});
  var params={};
  prefill.toPrefilledUrl().split('?')[1].split('&').forEach(function(part){var pair=part.split('=');var key=decodeURIComponent(pair[0]),value=decodeURIComponent((pair[1]||'').replace(/\+/g,' '));if(/^entry\.\d+$/.test(key))params[key]=value;});
  var codeKeys=Object.keys(params).filter(function(key){return params[key]==='COACHMATE_CODE';});
  if(codeKeys.length!==1||Object.keys(params).length!==matches.length+1)throw new Error('Persoonlijke links zijn niet volledig.');
  var codeEntryId=codeKeys[0].slice(6);delete params[codeKeys[0]];
  if(!Object.keys(params).every(function(key){return params[key]==='Aanwezig';}))throw new Error('Aanwezig-voorselectie is niet volledig.');
  // This newly created parent form contains no player list or submitted responses.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  form.setPublished(true);form.setAcceptingResponses(true);
  var record={teamSeasonId:job.teamSeasonId,matchId:'',round:Number(job.round),formId:file.getId(),url:form.getPublishedUrl(),codeQuestion:'',statusQuestion:'{}',codeEntryId:codeEntryId,prefillDefaults:JSON.stringify(params)};
  var invitations=coachMateRows_(book,'FormInvites');coachMateMailHeaders_(invitations);
  players.forEach(function(player){var previous=invitations.rows.filter(function(row){return row.formId===record.formId&&row.playerId===player.playerId;})[0];var code=previous?previous.code:Utilities.getUuid().replace(/-/g,'');var url=record.url+'?usp=pp_url&entry.'+codeEntryId+'='+encodeURIComponent(code);Object.keys(params).forEach(function(key){url+='&'+key+'='+encodeURIComponent(params[key]);});if(previous)coachMateWriteFields_(invitations,previous._row,{personalUrl:url});else coachMateAppend_(invitations,{formId:record.formId,playerId:player.playerId,code:code,personalUrl:url});});
  coachMateAppend_(forms,record);
  var handlers=ScriptApp.getProjectTriggers();
  if(!handlers.some(function(trigger){return trigger.getHandlerFunction()==='coachMateAvailabilitySubmitted'&&trigger.getTriggerSourceId()===record.formId;}))ScriptApp.newTrigger('coachMateAvailabilitySubmitted').forForm(form).onFormSubmit().create();
  coachMateWriteFields_(table,job._row,{status:'awaiting-mapping',completedAt:new Date().toISOString(),error:''});
}
// Backfill old invitations in small batches. This creates links, never messages.
function coachMatePrepareShortLinks_(book) {
  var tables={};['Forms','TeamSeasons','Seasons','FormInvites','Players'].forEach(function(name){tables[name]=coachMateRows_(book,name).rows;});
  var table=coachMateRows_(book,'FormInvites');coachMateMailHeaders_(table);
  var prepared=0;
  tables.FormInvites.forEach(function(invite){
    if(prepared>=6)return;
    try{
      var context=coachMateMailContext_(tables,invite.formId,invite.code),form=context.form;
      if(!/^https:\/\/docs\.google\.com\/forms\/d\/(e\/)?[a-zA-Z0-9_-]+\/viewform$/.test(String(form.url||''))||!/^\d{1,12}$/.test(String(form.codeEntryId||''))||!form.prefillDefaults)return;
      var defaults=JSON.parse(form.prefillDefaults),keys=Object.keys(defaults);
      if(!keys.length||!keys.every(function(key){return /^entry\.\d{1,12}$/.test(key)&&key!=='entry.'+form.codeEntryId&&['Aanwezig','Ja'].indexOf(defaults[key])>=0;}))return;
      var start=form.url+'?usp=pp_url&entry.'+form.codeEntryId+'='+encodeURIComponent(invite.code);
      keys.forEach(function(key){start+='&'+key+'='+encodeURIComponent(defaults[key]);});
      var edit=String(invite.editUrl||'');
      if(edit&&!(edit.indexOf(form.url+'?')===0||edit.indexOf('https://docs.google.com/forms/d/'+form.formId+'/viewform?')===0)||edit&&!/[?&]edit2=[^&]+/.test(edit))return;
      if(coachMateShortUrl_(invite.shortUrl,invite.shortUrlSource,start)&&(!edit||coachMateShortUrl_(invite.shortEditUrl,invite.shortEditUrlSource,edit)))return;
      prepared++;
      var write=function(key,value){coachMateWriteFields_(table,invite._row,Object.fromEntries([[key,value]]));};
      if(invite.personalUrl!==start){write('personalUrl',start);invite.personalUrl=start;}
      coachMateEnsureShortLinks_(FormApp.openById(form.formId),invite,write);
    }catch(error){/* Invalid/archived records cannot become invitation recipients. */}
  });
}
function coachMateSendQueuedInvitation_(book,delivery,table) {
  var context=coachMateDistributionSeason_(book,delivery.teamSeasonId);
  var form=coachMateRows_(book,'Forms').rows.filter(function(row){return row.teamSeasonId===delivery.teamSeasonId&&row.formId===delivery.formId;})[0];
  var invite=form&&coachMateRows_(book,'FormInvites').rows.filter(function(row){return row.formId===form.formId&&row.playerId===delivery.playerId;})[0];
  var player=coachMateRows_(book,'Players').rows.filter(function(row){return row.teamSeasonId===delivery.teamSeasonId&&row.playerId===delivery.playerId;})[0];
  if(!form||!invite||!player||!invite.personalUrl)throw new Error('Persoonlijke formulierkoppeling ontbreekt.');
  var email=String(player.parentEmail||'').trim();
  if(email!==delivery.recipient||!/^[^\s@<>:,;\\]+@[^\s@<>:,;\\]+\.[^\s@<>:,;\\]+$/.test(email))throw new Error('E-mailadres ontbreekt of is gewijzigd. Selecteer de speler opnieuw.');
  var previousDeliveries=coachMateRows_(book,'FormDeliveries').rows||[];
  if(previousDeliveries.some(function(row){return row.deliveryId!==delivery.deliveryId&&row.formId===delivery.formId&&row.playerId===delivery.playerId&&['processing','sent','uncertain'].indexOf(row.status)>=0;}))throw new Error('Deze speler is al uitgenodigd. Geen nieuwe startlink verstuurd.');
  var parentForm=FormApp.openById(form.formId);
  if(!parentForm.isPublished()||!parentForm.isAcceptingResponses())throw new Error('Het formulier staat niet open voor antwoorden.');
  if(invite.editUrl||invite.responseId)throw new Error('Deze ouder heeft al gereageerd. Gebruik de aparte wijzigingslink.');
  var url=invite.personalUrl;
  var base=String(form.url).split('?')[0];
  if(!/^https:\/\/docs\.google\.com\/forms\//.test(base)||!(url.indexOf(base+'?')===0||invite.editUrl&&url.indexOf('https://docs.google.com/forms/d/'+form.formId+'/viewform?')===0))throw new Error('Geen geldige persoonlijke Google-link.');
  if(invite.editUrl&&!/[?&]edit2=[^&]+/.test(url))throw new Error('Geen geldige bewerklink.');
  if(!invite.editUrl&&url.indexOf('entry.'+form.codeEntryId+'='+encodeURIComponent(invite.code))<0)throw new Error('De persoonlijke code in de link komt niet overeen.');
  coachMateInvitationMessage_(delivery.message,{player:player,form:form,team:context.team,season:context.season});
  if(MailApp.getRemainingDailyQuota()<1)throw new Error('Het dagelijkse Google-mailquotum is bereikt.');
  var inviteTable=coachMateRows_(book,'FormInvites');
  if(inviteTable.headers){coachMateMailHeaders_(inviteTable);coachMateEnsureShortLinks_(parentForm,invite,function(key,value){coachMateWriteFields_(inviteTable,invite._row,Object.fromEntries([[key,value]]));});}
  coachMateWriteFields_(table,delivery._row,{status:'processing',sentAt:new Date().toISOString(),error:''});SpreadsheetApp.flush();
  try {
    var mail=coachMateInvitationMail_({player:player,form:form,team:context.team,season:context.season,invite:invite},'',false,delivery.message);
    if(delivery.renderedMessage){
      mail.body=String(delivery.renderedMessage);
      var blocks=mail.body.split('\n\n'),html=[];
      for(var i=0;i<blocks.length;i++){
        if(i+1<blocks.length&&/^https:\/\/(forms\.gle\/|goo\.gl\/forms\/|docs\.google\.com\/forms\/)[^\s]+$/.test(blocks[i+1])){html.push('<p><a href="'+coachMateMailEscape_(blocks[i+1])+'">'+coachMateMailEscape_(blocks[i])+'</a></p>');i++;}
        else html.push('<p>'+coachMateMailEscape_(blocks[i]).replace(/\n/g,'<br>')+'</p>');
      }
      mail.htmlBody=html.join('');
    }
    MailApp.sendEmail(Object.assign({to:email},mail));
    coachMateWriteFields_(table,delivery._row,{status:'sent',sentAt:new Date().toISOString(),error:''});
  } catch(error) {coachMateWriteFields_(table,delivery._row,{status:'uncertain',error:'Verzending niet bevestigd. Controleer de uitgaande mail voordat je opnieuw verstuurt.'});}
}
function coachMateProcessDistribution() {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return;
  try {
    var book=SpreadsheetApp.openById(COACHMATE_AVAILABILITY_BOOK);
    coachMateDistributionHeartbeat_(book);
    coachMatePrepareShortLinks_(book);
    var jobs=coachMateDistributionTable_(book,'FormJobs',COACHMATE_JOB_HEADERS);
    jobs.rows.filter(function(job){return job.type==='prepare'&&job.status==='queued';}).slice(0,1).forEach(function(job){
      coachMateWriteFields_(jobs,job._row,{status:'processing',completedAt:new Date().toISOString(),error:''});
      try{coachMatePrepareRound_(book,job,jobs);}catch(error){coachMateWriteFields_(jobs,job._row,{status:'failed',error:'Formulier voorbereiden mislukt: '+String(error.message||error).slice(0,250)});}
    });
    jobs.rows.filter(function(job){return job.type==='prepare'&&job.status==='processing'&&Date.now()-Date.parse(job.completedAt)>120000;}).forEach(function(job){coachMateWriteFields_(jobs,job._row,{status:'failed',error:'Voorbereiding onderbroken. Kies Opnieuw voorbereiden.'});});
    var table=coachMateDistributionTable_(book,'FormDeliveries',COACHMATE_DELIVERY_HEADERS);
    table.rows.filter(function(row){return row.channel==='email'&&row.status==='queued';}).slice(0,20).forEach(function(row){
      try{coachMateSendQueuedInvitation_(book,row,table);}catch(error){coachMateWriteFields_(table,row._row,{status:'failed',error:'Niet verstuurd: '+String(error.message||error).slice(0,250)});}
    });
    table.rows.filter(function(row){return row.status==='processing'&&Date.now()-Date.parse(row.sentAt)>120000;}).forEach(function(row){coachMateWriteFields_(table,row._row,{status:'uncertain',error:'Verzending onderbroken. Controleer de uitgaande mail.'});});
  } finally {lock.releaseLock();}
}
