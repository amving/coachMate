import type { FieldSize } from './coach-state.ts';
import type { FieldPosition } from './substitution/types.ts';

export type Formation={id:string;fieldSize:FieldSize;lines:number[]};
const presets:Record<FieldSize,number[][]>={6:[[2,2,1],[2,1,2]],8:[[3,3,1],[2,3,2],[3,2,2]],11:[[4,3,3],[4,4,2],[3,4,3],[4,2,3,1]]};
export function validateFormation(lines:unknown,size:number):asserts lines is number[]{
  if(![6,8,11].includes(size)||!Array.isArray(lines)||lines.length<2||lines.length>5||!lines.every(n=>Number.isInteger(n)&&n>=1&&n<=5)||lines.reduce((a,b)=>a+b,0)!==size-1)throw new Error(`De linies moeten samen ${size-1} veldspelers bevatten, plus 1 keeper.`);
}
const defaultFormations=():Formation[]=>Object.entries(presets).flatMap(([size,rows])=>rows.map(lines=>({id:`default-${size}-${lines.join('-')}`,fieldSize:Number(size) as FieldSize,lines:[...lines]})));
export function formationCatalog(team:{formations?:Formation[];formationCatalog?:Formation[]}={}):Formation[]{return structuredClone(team.formationCatalog??[...defaultFormations(),...(team.formations??[])]);}
export function formationsFor(size:FieldSize,custom:Formation[]=[],catalog?:Formation[]):Formation[]{return formationCatalog({formations:custom,formationCatalog:catalog}).filter(f=>f.fieldSize===size);}
export function formationsForTeam(team:{fieldSize?:FieldSize;formations?:Formation[];formationCatalog?:Formation[]}):Formation[]{return formationsFor(team.fieldSize??6,team.formations,team.formationCatalog);}
export function formationFitsTeam(lines:unknown,team:{fieldSize?:FieldSize}):lines is number[]{
  try{validateFormation(lines,team.fieldSize??6);return true;}catch{return false;}
}
export function validateFormationCatalog(value:unknown):asserts value is Formation[]{
  if(!Array.isArray(value)||value.length>64)throw new Error('Bewaar maximaal 64 formaties.');
  const ids=new Set<string>(),patterns=new Set<string>(),defaults=defaultFormations();
  for(const f of value){
    if(!f||typeof f.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(f.id)||ids.has(f.id)||f.id.startsWith('default-')&&!defaults.some(d=>d.id===f.id&&d.fieldSize===f.fieldSize))throw new Error('Ongeldige of dubbele formatie.');
    validateFormation(f.lines,f.fieldSize);const pattern=`${f.fieldSize}:${f.lines.join('-')}`;
    if(patterns.has(pattern))throw new Error('Deze formatie bestaat al.');ids.add(f.id);patterns.add(pattern);
  }
}
export function validateFormations(value:unknown):asserts value is Formation[]{
  if(!Array.isArray(value)||value.length>32)throw new Error('Bewaar maximaal 32 eigen formaties.');
  const ids=new Set<string>(),patterns=new Set<string>();
  for(const f of value){if(!f||typeof f.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(f.id)||f.id.startsWith('default-')||ids.has(f.id))throw new Error('Ongeldige of dubbele formatie.');validateFormation(f.lines,f.fieldSize);const pattern=`${f.fieldSize}:${f.lines.join('-')}`;if(patterns.has(pattern)||presets[f.fieldSize as FieldSize].some(p=>p.join('-')===f.lines.join('-')))throw new Error('Deze formatie bestaat al.');ids.add(f.id);patterns.add(pattern);}
}
export function formationRoles(lines:number[]):FieldPosition[]{return lines.flatMap((n,i)=>Array.from({length:n},()=>i===0?'V':i===lines.length-1?'A':'M'));}
export function positionsForFormation(lines:number[],field:string[]):Record<string,FieldPosition>{return Object.fromEntries(formationRoles(lines).flatMap((role,i)=>field[i+1]?[[field[i+1],role]]:[]));}
export function suggestFormation(size:FieldSize,field:string[],keeper:string,positions:Record<string,FieldPosition>):number[]{
  const counts=(['V','M','A'] as const).map(role=>field.filter(id=>id!==keeper&&positions[id]===role).length);
  return counts.every(n=>n>0&&n<=5)&&counts.reduce((a,b)=>a+b,0)===size-1?counts:[...presets[size][0]];
}
// Preserve starters and known roles where possible; no quality scores are inferred.
export function arrangeFormation(lines:number[],field:string[],keeper:string,positions:Record<string,FieldPosition>):string[]{
  const remaining=[...new Set(field.filter(id=>id&&id!==keeper))],roles=formationRoles(lines),assigned=roles.map(()=> '');
  roles.forEach((role,i)=>{const at=remaining.findIndex(id=>positions[id]===role);if(at>=0)assigned[i]=remaining.splice(at,1)[0];});
  return [keeper,...assigned.map(id=>id||remaining.shift()||'')];
}
export function validatePreparedFormation(prep:{formation?:number[];startingField?:string[];startingPositions?:Record<string,FieldPosition>;startingKeeperId:string}){
  if(prep.formation===undefined)return;
  if(!prep.startingField)throw new Error('Startopstelling ontbreekt bij formatie.');
  validateFormation(prep.formation,prep.startingField.length);
  if(prep.startingField[0]!==prep.startingKeeperId)throw new Error('De startkeeper hoort op de keeperplek.');
  const expected=positionsForFormation(prep.formation,prep.startingField);
  if(Object.keys(expected).some(id=>prep.startingPositions?.[id]!==expected[id]))throw new Error('Startposities passen niet bij de formatie.');
}
