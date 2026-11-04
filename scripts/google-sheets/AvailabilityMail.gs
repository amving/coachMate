// Separate Apps Script project. Install once with coachMateInstallAvailabilityMail.
// No emails during installation; only subsequent, complete form submissions.
var COACHMATE_AVAILABILITY_BOOK = '1nmvI_t5GP6WR1LhBwYjeUVXcnXV-QY-InxjJASwStlQ';

function coachMateRows_(book, name) {
  var sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('Tabblad ontbreekt: ' + name);
  var values = sheet.getDataRange().getValues(), headers = values.shift();
  return {sheet: sheet, headers: headers, rows: values.map(function(row, index) {
    var result = {_row: index + 2};
    headers.forEach(function(key, col) { result[key] = row[col]; });
    return result;
  })};
}

function coachMateMailContext_(tables, formId, code) {
  var forms = tables.Forms.filter(function(row) { return row.formId === formId; });
  if (forms.length !== 1) throw new Error('Formulierkoppeling ontbreekt of is dubbel.');
  var form = forms[0];
  var teams = tables.TeamSeasons.filter(function(row) { return row.teamSeasonId === form.teamSeasonId; });
  if (teams.length !== 1) throw new Error('Teamseizoen ontbreekt of is dubbel.');
  var team = teams[0];
  var season = tables.Seasons.filter(function(row) { return row.seasonId === team.seasonId; })[0];
  if (!season || season.archived === true || String(season.archived).toLowerCase() === 'true') throw new Error('Gearchiveerd seizoen.');
  var invites = tables.FormInvites.filter(function(row) { return row.formId === formId && row.code === code; });
  if (invites.length !== 1) throw new Error('Spelerscode ontbreekt of is dubbel.');
  var invite = invites[0];
  var players = tables.Players.filter(function(row) { return row.teamSeasonId === form.teamSeasonId && row.playerId === invite.playerId; });
  if (players.length !== 1) throw new Error('Speler ontbreekt of is dubbel.');
  return {form: form, team: team, season: season, invite: invite, player: players[0]};
}

function coachMateMailEscape_(value) {
  return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function coachMateShortUrl_(value, source, target) {
  return target&&source===target&&/^https:\/\/(forms\.gle\/[a-zA-Z0-9_-]+|goo\.gl\/forms\/[a-zA-Z0-9_-]+)$/.test(String(value||''))?String(value):'';
}
function coachMateEnsureShortLinks_(parentForm, invite, write) {
  if(typeof parentForm.shortenFormUrl!=='function')return;
  [['personalUrl','shortUrl','shortUrlSource'],['editUrl','shortEditUrl','shortEditUrlSource']].forEach(function(keys){
    var target=String(invite[keys[0]]||'');
    if(!/^https:\/\/docs\.google\.com\/forms\/d\/(e\/)?[a-zA-Z0-9_-]+\/viewform\?/.test(target)||coachMateShortUrl_(invite[keys[1]],invite[keys[2]],target))return;
    try {
      // Shorten the complete PERSONAL URL, never the bare form URL.
      var short=String(parentForm.shortenFormUrl(target)).replace(/^http:\/\/goo\.gl\//,'https://goo.gl/');
      if(!coachMateShortUrl_(short,target,target))return;
      write(keys[1],short);write(keys[2],target);invite[keys[1]]=short;invite[keys[2]]=target;
    }catch(error){/* Keep working canonical links; never fabricate a short link. */}
  });
}
function coachMateInvitationMessage_(value, context) {
  if(value===undefined||value==='')return '';
  if(typeof value!=='string'||value.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error('Ongeldige uitnodigingstekst.');
  var player=context.player,parent=String(player.parentName||player.parent||'').trim().split(/\s+/)[0]||'ouder/verzorger';
  var values={speler:player.name,shortName:player.shortName||player.name,parentName:parent,ouder:parent,team:(context.team.clubName?context.team.clubName+' · ':'')+context.team.teamName,seizoen:context.season.name,speelronde:String(context.form.round),wedstrijden:String(context.count||(context.form.matchId?1:Object.keys(JSON.parse(context.form.statusQuestion||'{}')).length)||1)};
  return value.replace(/\r\n?/g,'\n').trim().replace(/\{(speler|shortName|parentName|ouder|team|seizoen|speelronde|wedstrijden)\}/g,function(_,key){return values[key];});
}
function coachMateInvitationMail_(context, editUrl, confirmed, message) {
  var player=context.player,form=context.form;
  var firstName=String(player.shortName||player.name||'').trim().split(/\s+/)[0];
  var parent=String(player.parentName||player.parent||'').trim().split(/\s+/)[0]||'ouder/verzorger';
  var subject=context.team.teamName+' | Speelronde '+form.round+' | Beschikbaarheid '+firstName;
  var intro=confirmed?'De beschikbaarheid van '+(player.shortName||player.name)+' voor speelronde '+form.round+' is ontvangen.':editUrl?coachMateInvitationMessage_('Wil je de beschikbaarheid van {shortName} voor speelronde {speelronde} aanpassen?',context):coachMateInvitationMessage_(message||'Wil je de beschikbaarheid van {shortName} voor speelronde {speelronde} doorgeven?',context);
  var text='Hi '+parent+',\n\n'+intro,html='<p>'+coachMateMailEscape_('Hi '+parent+',')+'</p><p>'+coachMateMailEscape_(intro).replace(/\n/g,'<br>')+'</p>';
  if(!confirmed){
    var start=String(context.invite.personalUrl||'');
    if(!/^https:\/\/docs\.google\.com\/forms\//.test(start))throw new Error('Persoonlijke invullink ontbreekt.');
    var label=editUrl?'Pas beschikbaarheid aan via deze link':'Geef beschikbaarheid op via deze link';
    var url=editUrl?coachMateShortUrl_(context.invite.shortEditUrl,context.invite.shortEditUrlSource,editUrl)||editUrl:coachMateShortUrl_(context.invite.shortUrl,context.invite.shortUrlSource,start)||start;
    text+='\n\n'+label+'\n\n'+url;
    html+='<p><a href="'+coachMateMailEscape_(url)+'">'+label+'</a></p>';
    if(editUrl){text+='\n\nVerzend de wijzigingen opnieuw via het formulier.';html+='<p>Verzend de wijzigingen opnieuw via het formulier.</p>';}
  }
  return {subject:subject,body:text+'\n\nBedankt!',htmlBody:html+'<p>Bedankt!</p>'};
}
// Updates help text only; question titles, IDs, codes and responses remain intact.
function coachMateClarifyAvailabilityCodes() {
  var book=SpreadsheetApp.openById(COACHMATE_AVAILABILITY_BOOK);
  var teams=coachMateRows_(book,'TeamSeasons').rows, seasons=coachMateRows_(book,'Seasons').rows;
  coachMateRows_(book,'Forms').rows.forEach(function(record){
    var team=teams.filter(function(row){return row.teamSeasonId===record.teamSeasonId;})[0];
    var season=team&&seasons.filter(function(row){return row.seasonId===team.seasonId;})[0];
    if(!season||String(season.archived).toLowerCase()!=='false')return;
    var parentForm=FormApp.openById(record.formId);
    parentForm.setDescription('Speelronde '+record.round+' · seizoen '+season.name+'\nGeef de beschikbaarheid voor '+(record.matchId?'deze wedstrijd':'alle wedstrijden in deze speelronde')+' door. De persoonlijke code is automatisch ingevuld: niet wijzigen. Druk onderaan op Verzenden. Je ontvangt daarna een bevestiging. Vraag de coach om een wijzigingslink als je later iets wilt aanpassen. Verzend wijzigingen opnieuw.');
    var items=parentForm.getItems().filter(function(item){return item.getTitle()==='Persoonlijke code'&&item.getType()===FormApp.ItemType.TEXT;});
    if(items.length!==1)throw new Error('De persoonlijke codevraag ontbreekt of is dubbel.');
    items[0].asTextItem().setHelpText('Automatisch ingevuld — niet wijzigen. Deze code koppelt je antwoorden aan de juiste speler.');
  });
}

function coachMateMailHeaders_(table) {
  ['personalUrl','editUrl','responseId','submittedAt','mailSentAt','shortUrl','shortUrlSource','shortEditUrl','shortEditUrlSource'].forEach(function(key) {
    if (table.headers.indexOf(key) < 0) {
      table.headers.push(key);
      table.sheet.getRange(1, table.headers.length).setValue(key);
    }
  });
}

function coachMateInstallAvailabilityMail() {
  var book = SpreadsheetApp.openById(COACHMATE_AVAILABILITY_BOOK);
  var invites = coachMateRows_(book, 'FormInvites');
  coachMateMailHeaders_(invites);
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('availabilityMailEnabledAt')) properties.setProperty('availabilityMailEnabledAt', new Date().toISOString());
  coachMateRegisterAvailabilityForms();
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'coachMateRegisterAvailabilityForms'; });
  if (!exists) ScriptApp.newTrigger('coachMateRegisterAvailabilityForms').timeBased().everyMinutes(15).create();
}

// Registers new round Forms too; does not read responses or send mail.
function coachMateRegisterAvailabilityForms() {
  var book = SpreadsheetApp.openById(COACHMATE_AVAILABILITY_BOOK);
  var teams = coachMateRows_(book, 'TeamSeasons').rows;
  var seasons = coachMateRows_(book, 'Seasons').rows;
  var forms = coachMateRows_(book, 'Forms').rows.filter(function(form) {
    var team = teams.filter(function(row) { return row.teamSeasonId === form.teamSeasonId; })[0];
    return team && seasons.some(function(row) { return row.seasonId === team.seasonId && String(row.archived).toLowerCase() === 'false'; });
  });
  var existing = ScriptApp.getProjectTriggers().filter(function(trigger) { return trigger.getHandlerFunction() === 'coachMateAvailabilitySubmitted'; }).map(function(trigger) { return trigger.getTriggerSourceId(); });
  forms.forEach(function(form) {
    if (!form.formId || existing.indexOf(form.formId) >= 0) return;
    FormApp.openById(form.formId).setAllowResponseEdits(true);
    ScriptApp.newTrigger('coachMateAvailabilitySubmitted').forForm(form.formId).onFormSubmit().create();
    existing.push(form.formId);
    // Catch a first submission made before the 15-minute registration check.
    var enabledAt = PropertiesService.getScriptProperties().getProperty('availabilityMailEnabledAt');
    if (enabledAt) {
      var source = FormApp.openById(form.formId);
      source.getResponses(new Date(enabledAt)).forEach(function(response) {
        coachMateAvailabilitySubmitted({source: source, response: response});
      });
    }
  });
}

function coachMateAvailabilitySubmitted(event) {
  if (!event || !event.response || !event.source) throw new Error('Alleen uitvoeren via een echte formulierinzending.');
  var lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    var book = SpreadsheetApp.openById(COACHMATE_AVAILABILITY_BOOK);
    var tables = {};
    ['Forms','TeamSeasons','Seasons','FormInvites','Players'].forEach(function(name) { tables[name] = coachMateRows_(book, name).rows; });
    var responses = event.response.getItemResponses();
    var codes = responses.filter(function(item) { return item.getItem().getTitle() === 'Persoonlijke code'; });
    if (codes.length !== 1) throw new Error('Persoonlijke codevraag ontbreekt of is dubbel.');
    var context = coachMateMailContext_(tables, event.source.getId(), String(codes[0].getResponse()).trim());
    var matches = context.form.matchId ? [context.form.matchId] : Object.keys(JSON.parse(context.form.statusQuestion));
    var choices = responses.filter(function(item) { return item !== codes[0]; });
    if (choices.length !== matches.length || !choices.every(function(item) { return ['Aanwezig','Afwezig','Ja','Nee'].indexOf(String(item.getResponse())) >= 0; })) throw new Error('Onvolledige inzending; geen mail verzonden.');
    var table = coachMateRows_(book, 'FormInvites');
    coachMateMailHeaders_(table);
    var write = function(key, value) { table.sheet.getRange(context.invite._row, table.headers.indexOf(key) + 1).setValue(value); };
    var editUrl = event.response.getEditResponseUrl();
    if (!/^https:\/\/docs\.google\.com\/forms\//.test(editUrl)) throw new Error('Geen geldige Google-bewerklink.');
    var submitted = event.response.getTimestamp().toISOString();
    if (context.invite.submittedAt && Date.parse(context.invite.submittedAt) > Date.parse(submitted)) return;
    if (context.invite.responseId !== event.response.getId()) write('mailSentAt', '');
    write('editUrl', editUrl);
    write('responseId', event.response.getId());
    write('submittedAt', submitted);
    SpreadsheetApp.flush();
    // One confirmation per player's first submission. Retries do not intentionally resend.
    if (context.invite.mailSentAt && context.invite.responseId === event.response.getId()) return;
    var email = String(context.player.parentEmail || '').trim();
    if (!/^[^\s@<>:,;\\]+@[^\s@<>:,;\\]+\.[^\s@<>:,;\\]+$/.test(email)) throw new Error('Vul één geldig parentEmail bij deze speler in. Bewerklink is wel opgeslagen.');
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Google-mailquotum bereikt. Bewerklink is wel opgeslagen.');
    context.invite.editUrl=editUrl;
    coachMateEnsureShortLinks_(event.source,context.invite,write);
    MailApp.sendEmail(Object.assign({to:email},coachMateInvitationMail_(context,editUrl,true)));
    write('mailSentAt', new Date().toISOString());
  } finally { lock.releaseLock(); }
}
