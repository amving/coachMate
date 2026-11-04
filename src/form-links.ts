/** Google owns the entry ID; capture it from its prefilled-link tool, never derive it from a question ID. */
export const PREFILL_MARKER = "COACHMATE_CODE";
/** Only use a Google-generated short link while its saved target is still exact. */
export function safeShortFormUrl(value:string|undefined,source:string|undefined,target:string):string {
  if(!target||source!==target)return '';
  try{const url=new URL(value??'');return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&((url.hostname==='forms.gle'&&/^\/[a-zA-Z0-9_-]+$/.test(url.pathname))||(url.hostname==='goo.gl'&&/^\/forms\/[a-zA-Z0-9_-]+$/.test(url.pathname)))?url.href:'';}catch{return '';}
}
export function safeEditResponseUrl(base:string,value:string|undefined,formId:string):string {
  try{const url=new URL(value??''),source=new URL(base);return url.protocol==='https:'&&url.hostname==='docs.google.com'&&!url.username&&!url.password&&(url.pathname===source.pathname||url.pathname===`/forms/d/${formId}/viewform`)&&Boolean(url.searchParams.get('edit2'))?url.href:'';}catch{return '';}
}
function respondentUrl(value: string): URL | null {
  try {
    const url=new URL(value);
    return url.protocol==="https:" && url.hostname==="docs.google.com" && !url.username && !url.password && /^\/forms\/d\/(?:e\/)?[a-zA-Z0-9_-]+\/viewform$/.test(url.pathname) ? url : null;
  } catch { return null; }
}
export function personalFormUrl(base:string,entryId:string|number|undefined,code:string,defaults:string=""):string {
  const url=respondentUrl(base);
  if(!url||!/^\d{1,12}$/.test(String(entryId??""))||!code)return "";
  url.search="";url.hash="";
  url.searchParams.set("usp","pp_url");url.searchParams.set(`entry.${entryId}`,code);
  try { const values=JSON.parse(defaults||"{}"); for(const [key,value] of Object.entries(values)) if(/^entry\.\d{1,12}$/.test(key)&&key!==`entry.${entryId}`&&(value==="Aanwezig"||value==="Ja"))url.searchParams.set(key,value); } catch { return ""; }
  return url.href;
}
export function codeEntryFromTemplate(template:string,base:string):string {
  const url=respondentUrl(template), expected=respondentUrl(base);
  if(!url||!expected||url.origin!==expected.origin||url.pathname!==expected.pathname||url.hash)throw new Error("Gebruik de vooraf ingevulde link van dit ouderformulier.");
  const entries=[...url.searchParams.entries()].filter(([key])=>key!=="usp");
  if(entries.length!==1||!/^entry\.\d{1,12}$/.test(entries[0][0])||entries[0][1]!==PREFILL_MARKER)throw new Error(`Vul alleen de persoonlijke code vooraf in met ${PREFILL_MARKER}. Laat alle wedstrijden leeg.`);
  return entries[0][0].slice(6);
}

export function availabilityDefaultsFromTemplate(template:string,base:string,count:number):string {
  const url=respondentUrl(template),expected=respondentUrl(base);
  if(!url||!expected||url.origin!==expected.origin||url.pathname!==expected.pathname||url.hash)throw new Error("Gebruik de vooraf ingevulde link van dit ouderformulier.");
  const entries=[...url.searchParams.entries()].filter(([key])=>key!=="usp");
  const codes=entries.filter(([,value])=>value===PREFILL_MARKER);
  const defaults=entries.filter(([,value])=>value!==PREFILL_MARKER);
  if(codes.length!==1||!entries.every(([key])=>/^entry\.\d{1,12}$/.test(key))||new Set(entries.map(([key])=>key)).size!==entries.length||defaults.length!==count||!defaults.every(([,value])=>value==="Aanwezig"||value==="Ja"))throw new Error(`Vul de code in met ${PREFILL_MARKER} en kies voor alle ${count} wedstrijden Aanwezig.`);
  return JSON.stringify(Object.fromEntries(defaults));
}
