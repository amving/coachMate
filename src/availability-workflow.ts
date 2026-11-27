import type {Match} from './coach-state.ts';

const fields=['id','availabilityRound','opponent','date','shortDate','time','venue','pool'] as const;
export const sameRoundMatch=(a:Match,b:Match)=>Boolean(a&&b&&fields.every(key=>(a[key]??'')===(b[key]??'')));
export const sameRoundRows=(a:Match[],b:Match[])=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every(row=>b.some(other=>sameRoundMatch(row,other)));

// A verified form or a shared request proves preparation has finished.
// Neither permits discarding unsaved match edits: saved matches must agree.
export function preparationComplete(local:Match[],fresh:Match[],form:{published:boolean|null;accepting:boolean|null;issues:string[];codeEntryId?:string;prefillDefaults?:string}|null,allPersonalCodes:boolean,sharedRequestStarted=false){
 return Boolean(local.length&&sameRoundRows(local,fresh)&&form&&(sharedRequestStarted||form.published===true&&form.accepting===true&&!form.issues.length&&form.codeEntryId&&form.prefillDefaults&&allPersonalCodes));
}

export function roundDateValue(value:unknown):string{
  if(typeof value!=='string')return '';
  const months=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value),numeric=/^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(value),named=/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/.exec(value.toLowerCase().trim());
  const parts=iso?[+iso[1],+iso[2],+iso[3]]:numeric?[+numeric[3],+numeric[2],+numeric[1]]:named&&months.includes(named[2])?[+named[3],months.indexOf(named[2])+1,+named[1]]:null;
  if(!parts)return '';
  const [year,month,day]=parts,date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:'';
}

const dutchMatchClock = new Intl.DateTimeFormat('en-GB', {
  timeZone:'Europe/Amsterdam', year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', hourCycle:'h23',
});

export function availabilitySchedule(matches:Match[],processed:ReadonlySet<string>,now:number) {
  const parts=Object.fromEntries(dutchMatchClock.formatToParts(now).map(({type,value})=>[type,value]));
  const currentMinute=`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  const upcoming:{match:Match;start:string}[]=[],past:{match:Match;start:string}[]=[];
  for(const match of matches){
    const date=roundDateValue(match.date.trim().replace(/^(\d{4}-\d{2}-\d{2})T.*$/,'$1').replaceAll('/','-'))||
      roundDateValue(match.shortDate.trim().replaceAll('/','-'));
    const time=/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(match.time.trim());
    const start=date?`${date} ${time?time[1].padStart(2,'0')+':'+time[2]:'24:00'}`:'';
    const group=processed.has(match.id)||(start&&start<=currentMinute)?past:upcoming;
    group.push({match,start});
  }
  return {
    upcoming:upcoming.sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999')).map(row=>row.match),
    past:past.sort((a,b)=>b.start.localeCompare(a.start)).map(row=>row.match),
  };
}

// Refresh source rows without discarding local additions or silently resolving concurrent edits.
export function mergeRoundRows(base:Match[],local:Match[],fresh:Match[]){
  const conflicts:string[]=[],rows:Match[]=[];
  for(const row of fresh){
    const before=base.find(m=>m.id===row.id),draft=local.find(m=>m.id===row.id);
    if(draft&&before&&!sameRoundMatch(draft,before)){
      if(!sameRoundMatch(row,before)&&!sameRoundMatch(row,draft))conflicts.push(row.id);
      rows.push(draft);
    }else if(draft&&!before&&!sameRoundMatch(row,draft)){conflicts.push(row.id);rows.push(draft);}
    else rows.push(row);
  }
  for(const row of local.filter(m=>!fresh.some(n=>n.id===m.id))){
    const before=base.find(m=>m.id===row.id);
    if(!before)rows.push(row);
    else if(!sameRoundMatch(row,before)){conflicts.push(row.id);rows.push(row);}
  }
  return {rows,conflicts};
}
