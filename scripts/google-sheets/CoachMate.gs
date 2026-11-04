/** @OnlyCurrentDoc */
// Bound to the CoachMate source workbook. No external services or credentials.
function onOpen() {
  coachMateSetup();
}

function coachMateSetup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const teams = book.getSheetByName('TeamSeasons');
  const seasons = book.getSheetByName('Seasons');
  if (!teams || !seasons) return;
  const list = values => SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  const source = range => SpreadsheetApp.newDataValidation().requireValueInRange(range, true).setAllowInvalid(false).build();
  const column = (sheet, col) => sheet.getRange(2, col, sheet.getMaxRows() - 1, 1);
  column(teams, 2).setDataValidation(source(column(seasons, 1)));
  column(teams, 4).setDataValidation(list(['2', '4']));
  column(seasons, 3).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build());
  ['Matches', 'Players'].forEach(name => {
    const sheet = book.getSheetByName(name);
    if (!sheet) return;
    column(sheet, 1).setDataValidation(source(column(teams, 1)));
    sheet.getRange(1, 2).setNote('Automatisch en eenmalig gevuld bij invoer. Niet wijzigen of kopiëren naar een andere regel. Sorteer altijd de volledige tabel.');
    column(sheet, 2).setNumberFormat('@');
  });
  const matches = book.getSheetByName('Matches');
  column(matches, 8).setDataValidation(list(['Thuis', 'Uit']));
  column(matches, 4).setNumberFormat('yyyy-mm-dd');
  column(matches, 6).setNumberFormat('hh:mm');
  matches.getRange(1, 5).setNote('Wordt bij het wijzigen van date automatisch afgeleid, bijvoorbeeld 12 sep.');
  const players = book.getSheetByName('Players');
  column(players, 3).setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=OR(C2="",AND(ISNUMBER(C2),C2=INT(C2),C2>=0,C2<=99))').setAllowInvalid(false).build());
  coachMateLiveChoices(book);
  teams.getRange(1, 5).setNote('Alleen een matchId van dit team. Sluit een lopende wedstrijd eerst af. De app controleert deze relatie.');
  ['State', 'Availability', 'MatchStats', 'Forms', 'FormInvites', 'FormResponses'].forEach(name => {
    book.getSheetByName(name).getRange(1, 1).setNote('CoachMate beheert dit tabblad. Handmatige wijzigingen kunnen historie of koppelingen beschadigen.');
  });
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  if (!['Matches', 'Players', 'TeamSeasons', 'Seasons'].includes(name)) return;
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return;
  try {
    if (name === 'TeamSeasons' || name === 'Seasons') { coachMateSetup(); return; }
    const book = e.source;
    const teams = book.getSheetByName('TeamSeasons');
    const validTeams = new Set(teams.getRange(2, 1, Math.max(1, teams.getLastRow() - 1), 1).getValues().flat().filter(String));
    const start = Math.max(2, e.range.getRow());
    const end = e.range.getLastRow();
    if (end < start) return;
    const width = name === 'Matches' ? 8 : 7;
    const rows = sheet.getRange(start, 1, end - start + 1, width).getValues();
    rows.forEach((row, index) => {
      const r = start + index;
      if (!validTeams.has(row[0])) return;
      if (!row[1]) {
        sheet.getRange(r, 2).setValue((name === 'Matches' ? 'm-' : 'p-') + Utilities.getUuid());
      }
      if (name === 'Matches' && e.range.getColumn() <= 4 && e.range.getLastColumn() >= 4) {
        const short = coachMateShortDate(row[3], book.getSpreadsheetTimeZone());
        if (short !== null) sheet.getRange(r, 5).setValue(short);
      }
    });
    // Restore validations on inserted/pasted rows without changing their data.
    const rule = SpreadsheetApp.newDataValidation().requireValueInRange(teams.getRange(2, 1, teams.getMaxRows()-1, 1), true).setAllowInvalid(false).build();
    sheet.getRange(start, 1, end-start+1, 1).setDataValidation(rule);
    if (name === 'Matches') sheet.getRange(start, 8, end-start+1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Thuis','Uit'],true).setAllowInvalid(false).build());
    if (name === 'Matches') coachMateLiveChoices(book);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function coachMateShortDate(value, timezone) {
  if (value === '') return '';
  let day, month;
  if (value instanceof Date && !isNaN(value.getTime())) {
    day = Number(Utilities.formatDate(value, timezone, 'd'));
    month = Number(Utilities.formatDate(value, timezone, 'M'));
  } else {
    const text = String(value).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const nl = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
    if (!iso && !nl) return null;
    day = Number(iso ? iso[3] : nl[1]); month = Number(iso ? iso[2] : nl[2]);
    const year = Number(iso ? iso[1] : nl[3]);
    const date = new Date(Date.UTC(year, month-1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month-1 || date.getUTCDate() !== day) return null;
  }
  return day + ' ' + ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][month-1];
}


function coachMateLiveChoices(book) {
  const teams = book.getSheetByName('TeamSeasons');
  const matches = book.getSheetByName('Matches');
  const values = matches.getRange(2, 1, Math.max(1, matches.getLastRow()-1), 2).getValues();
  const ids = teams.getRange(2, 1, Math.max(1, teams.getLastRow()-1), 1).getValues();
  ids.forEach((row, i) => {
    if (!row[0]) return;
    const options = values.filter(m => m[0] === row[0] && m[1]).map(m => String(m[1]));
    const builder = SpreadsheetApp.newDataValidation().setAllowInvalid(false);
    if (options.length) builder.requireValueInList([...new Set(options)], true);
    else builder.requireFormulaSatisfied('=E' + (i+2) + '=""');
    teams.getRange(i+2, 5).setDataValidation(builder.build());
  });
}
