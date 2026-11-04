// The workbook is the source for season/team membership. App-owned tabs are written atomically.
export const schema = {
  Seasons: ['seasonId', 'name', 'archived'],
  TeamSeasons: ['teamSeasonId', 'seasonId', 'teamName', 'periods', 'liveMatchId', 'clubId', 'clubName'],
  Players: ['teamSeasonId', 'playerId', 'number', 'name', 'shortName', 'parent', 'position', 'parentEmail', 'parentPhone', 'substitutionProfile', 'parentName'],
  Matches: ['teamSeasonId', 'matchId', 'pool', 'date', 'shortDate', 'time', 'opponent', 'venue', 'Stand', 'Doelpuntenmakers', 'Keepers', 'afwezig', 'availabilityRound'],
  State: ['teamSeasonId', 'revision', 'part', 'json'],
  Availability: ['teamSeasonId', 'seasonId', 'round', 'matchId', 'playerId', 'status'],
  MatchStats: ['teamSeasonId', 'seasonId', 'matchId', 'playerId', 'present', 'minutes', 'keeperMinutes', 'goals', 'minutesKnown', 'keeperMinutesKnown'],
  Forms: ['teamSeasonId', 'matchId', 'round', 'formId', 'url', 'codeQuestion', 'statusQuestion', 'codeEntryId', 'prefillDefaults'],
  FormInvites: ['formId', 'playerId', 'code', 'personalUrl', 'editUrl', 'responseId', 'submittedAt', 'mailSentAt', 'shortUrl', 'shortUrlSource', 'shortEditUrl', 'shortEditUrlSource'],
  FormResponses: ['formId', 'responseId', 'updatedAt', 'result', 'teamSeasonId', 'playerId', 'playerName', 'round', 'appsScriptResponseId'],
  FormJobs: ['jobId', 'teamSeasonId', 'round', 'type', 'status', 'templateFormId', 'formId', 'createdAt', 'completedAt', 'error'],
  FormDeliveries: ['deliveryId', 'batchId', 'teamSeasonId', 'formId', 'playerId', 'channel', 'recipient', 'status', 'createdAt', 'sentAt', 'error', 'message', 'renderedMessage'],
};
export const seed = {
  Seasons: [['2026-2027', '2026/2027', false]],
  TeamSeasons: [['hfc-edo-jo10-2-2026-2027', '2026-2027', 'JO10-2', 4, '', 'hfc-edo', 'HFC Edo']],
};
