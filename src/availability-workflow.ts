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
