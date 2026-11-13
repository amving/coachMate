import {isProcessed,processedMatchIds,seasonGoalRows,resultPlayerGoals,parseScoreEvents,scoreEventsText,validateResultOnly,type ResultOnlyMatch} from './result-only';
import {invitationProgress,invitationMatches,type InvitationFilter} from './invitation-progress';
import {newPreparationDraft,readPreparationDraft,keeperScheduleValid,startingLineupValid,startingLineupIssue,preparationPlanCurrent,calculatePreparation,type PreparationDraft} from './preparation-flow';
import {mergeRoundRows,sameRoundRows,roundDateValue,preparationComplete} from './availability-workflow';
import {arrangeFormation,formationCatalog,formationsForTeam,formationFitsTeam,formationRoles,positionsForFormation,suggestFormation,validateFormationCatalog,validateFormation,validateFormations,type Formation} from './formations';
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, } from "react";
import {createPortal} from 'react-dom';
import {rosterGesture,rosterDragPosition,rosterCaptureLost} from './roster-gesture';
import { CalendarIcon, PersonIcon, ActivityLogIcon, BarChartIcon, CheckCircledIcon, ChevronRightIcon, ClockIcon, Cross1Icon, DashboardIcon, GearIcon, ChevronLeftIcon, PauseIcon, PlayIcon, PlusIcon, ReloadIcon, TargetIcon, DragHandleDots2Icon, ResetIcon, ChevronDownIcon, ArrowRightIcon, InfoCircledIcon, MagnifyingGlassIcon, LockClosedIcon, Share2Icon, Pencil1Icon, TrashIcon, CheckIcon } from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";
import { BottomSheet, FlowStack, useFlow, type FlowScreen, useScreenPortal, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard, useKeyboardInsets, useMobileDevice } from "./mobile";
import { realDevice } from "./real-device";
import { fullStatsFromRound, goalsOnlyMatch, individualStatsRows, teamMatchMinutes, unknownMatchDurationCount, currentRound, recordedMatchResult, scoreInVenueOrder, settleLive, liveMatchRows, STORAGE_KEY as BASE_STORAGE_KEY, demoCatalog, createInitialState, coachReducer, matchRows, parseState, validateRows, statsMinuteLimit, periodLabel, totalGoals, type CoachState, type Action, type Tab, type Availability, type MatchStat, type Periods, type FieldSize, type Match, type Player } from "./coach-state";

import { parentEmailValid, invitationText, invitationParts, defaultInvitationMessage, normalizeInvitationMessage, type InvitationInput, parentPhoneNumber, whatsappInviteUrl } from "./invitations";
import { personalFormUrl, safeShortFormUrl, PREFILL_MARKER } from "./form-links";
import { matchShareText } from "./match-share";
import { localActionTypes } from "./action-batch";
import { journalKey, readJournal, readDraft, previewJournalRecovery, archiveConfirmedJournal, rebuildJournal, storeRebuiltJournal, recoveryStorage, type LocalJournal } from "./local-cache";
import { adviceContext, adviceEpoch, adviceFor, explainAdvice, generateAdvice, nextAdvice } from './substitution/recommendations';
import { defaultPolicy, normalizePolicy } from './substitution/policy';
import type { SubstitutionPolicy } from './substitution/policy';
import type { PlayerProfile } from './substitution/types';
import type { Scenario, FieldPosition } from './substitution/types';
import { planOverview, rotationDetails, rotationInstructions, suggestMatchKeepers, startingPositions, type Cadence } from './substitution/preparation';

// Development-only design state, isolated from both Google and the user's local demo.
const designQuery=new URLSearchParams(window.location.search);
const assistantDemo=import.meta.env.DEV&&designQuery.get('design')==='assistant';
const designMode=import.meta.env.DEV&&(designQuery.get("design")==="ios"||assistantDemo);
const STORAGE_KEY=designMode?`${BASE_STORAGE_KEY}:${assistantDemo?'assistant-preview':'ios-preview'}:${designQuery.get("venue")??"away"}:${designQuery.get("case")??"default"}`:BASE_STORAGE_KEY;
function designState():CoachState {
  if(assistantDemo){const c=demoCatalog();c.teamSeasonId='demo-assistant-2026';c.teamName='JO10-2 · demo';c.players=[...c.players,{id:'p11',number:11,name:'Sam de Jong',shortName:'Sam',parent:'',position:'M'}].map((p,i)=>({...p,substitutionProfile:{goalkeeperEligible:i<3}}));const s=createInitialState(),fieldSize=s.team.fieldSize??6;s.catalog=c;s.team={periods:4,fieldSize,fullStatsFromRound:2};s.stats=[];s.availability=Object.fromEntries(c.matches.map(m=>[m.id,Object.fromEntries(c.players.map(p=>[p.id,'available' as const]))]));s.live={...s.live,periods:4,field:c.players.slice(0,fieldSize).map(p=>p.id),played:Object.fromEntries(c.players.map(p=>[p.id,{milliseconds:0,keeperMilliseconds:0}]))};return s;}
  const state=createInitialState();const catalog=demoCatalog();
  catalog.teamSeasonId="design-edo-2026-2027";catalog.teamName="JO10-2";catalog.clubId="hfc-edo";catalog.clubName="HFC Edo";
  catalog.matches=catalog.matches.map(m=>m.id===catalog.liveMatchId?{...m,date:"2026-10-16",shortDate:"16 okt",time:"18:30",venue:designQuery.get("venue")==="home"?"Thuis":"Uit"}:m);
  const field=["p01","p02","p04","p03","p05","p09"];
  state.catalog=catalog;state.team={periods:4,fieldSize:6,fullStatsFromRound:2};
  state.availability[catalog.liveMatchId]=Object.fromEntries(catalog.players.map(p=>[p.id,["p07","p10"].includes(p.id)?"unavailable":"available"]));
  state.live={...state.live,periods:4,period:1,elapsedMs:504000,periodTimes:{"4:1":504000},runningSince:Date.now(),field,keeperId:"p01",played:Object.fromEntries(catalog.players.map(p=>[p.id,{milliseconds:field.includes(p.id)?504000:0,keeperMilliseconds:p.id==="p01"?504000:0}])),goals:[{playerId:"p04",ownGoal:false,minute:7,sequence:2,scoreFor:1,scoreAgainst:1}],awayGoals:[{playerId:null,ownGoal:false,minute:3,sequence:1,scoreFor:0,scoreAgainst:1},{playerId:null,ownGoal:false,minute:8,sequence:3,scoreFor:1,scoreAgainst:2}]};
  return state;
}

const clock = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, "0")}:${Math.floor(ms / 1000 % 60).toString().padStart(2, "0")}`;
const statusLabels: Record<Availability, string> = { available: "Beschikbaar", unavailable: "Afwezig", pending: "Geen antwoord" };
type AvailabilityForm = {formId:string; url?:string; matchId:string; round:number; codeEntryId?:string; prefillDefaults?:string; statusQuestion?:string};
type FormInvite={formId:string;playerId:string;code:string;personalUrl?:string;editUrl?:string;submittedAt?:string;responseId?:string;shortUrl?:string;shortUrlSource?:string;shortEditUrl?:string;shortEditUrlSource?:string};
type FormJob={jobId:string;round:number;status:string;error?:string};
type FormDelivery={deliveryId:string;batchId:string;formId:string;playerId:string;channel?:string;status:string;error?:string;sentAt?:string};
type FormStatus = {formId:string; url:string; published:boolean|null; accepting:boolean|null; issues:string[]; matchCount:number; codeEntryId?:string; prefillDefaults?:string; statusQuestion?:string};
const validParentEmail=(email:string|undefined)=>Boolean(email&&email.length<=254&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)&&!/[\r\n\\:]/.test(email));
const Store = createContext<{ state: CoachState; hasPendingSave: boolean; persistence: React.ReactNode; save: (actions: Action[]) => Promise<boolean>; send: (action: Action) => Promise<boolean>; notify: (message: string) => void; navigate: (tab: Tab, matchId?: string) => void; focusMatch: string | null; statsVisible: boolean; statsBack: { action: () => void } | null; setStatsBack: (back: { action: () => void } | null) => void; draftScope: string; settings: () => void; remote: boolean; busy: boolean; refreshForms: (round: number) => Promise<boolean>; formLinks: AvailabilityForm[]; invites: FormInvite[]; formJobs:FormJob[]; deliveries:FormDelivery[]; mailReady:boolean; refreshDistribution:()=>Promise<void>; reloadRoundData:()=>Promise<CoachState|null>; prepareRound:(round:number)=>Promise<boolean>; sendInvitations:(formId:string,playerIds:string[],batchId:string,message?:string,channel?:'email'|'whatsapp')=>Promise<boolean>; checkForm: (formId:string) => Promise<FormStatus>; saveFormLink: (formId:string,template:string)=>Promise<boolean>; createForm: (round: number) => void } | null>(null);
function useCoach() { const context = useContext(Store); if (!context) throw new Error("CoachMate ontbreekt"); const catalog = context.state.catalog ?? demoCatalog(); return { ...context, ...catalog, LIVE_MATCH_ID: catalog.liveMatchId, name: (id: string | null) => catalog.players.find(p => p.id === id)?.shortName ?? "Speler" }; }
function matchDate(match: Match) {
  const months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const dutch = match.date.toLowerCase().match(/^(\d{1,2}) (\w+) (\d{4})$/);
  if (dutch && months.includes(dutch[2])) return new Date(+dutch[3], months.indexOf(dutch[2]), +dutch[1], ...match.time.split(":").map(Number) as [number, number]).getTime();
  const iso = match.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const numeric = (match.date || match.shortDate).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/) ?? match.shortDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return iso ? new Date(+iso[1], +iso[2]-1, +iso[3], ...match.time.split(":").map(Number) as [number, number]).getTime() : numeric ? new Date(+numeric[3],+numeric[2]-1,+numeric[1],...match.time.split(":").map(Number) as [number,number]).getTime() : Infinity;
}
function DateTile({match}:{match:Match}) {
  const time=matchDate(match),date=Number.isFinite(time)?new Date(time):null;
  return <span className="date-tile" aria-label={date?date.toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'}):match.shortDate}>{date?<><strong>{date.getDate()}</strong><small>{date.toLocaleDateString('nl-NL',{month:'short'}).replace('.','')} {date.getFullYear()}</small></>:<strong>{match.shortDate}</strong>}</span>;
}

const orderedMatches = (matches: Match[]) => [...matches].sort((a, b) => matchDate(a) - matchDate(b));
function counts(state: CoachState, matchId: string) {
  const values = Object.values(state.availability[matchId]);
  return { available: values.filter(v => v === "available").length, pending: values.filter(v => v === "pending").length, unavailable: values.filter(v => v === "unavailable").length };
}
function Header({ title, eyebrow, onBack }: { title: string; eyebrow: string; onBack?: () => void }) {
  const { settings, statsBack, statsVisible } = useCoach();
  const { device } = useMobileDevice();
  return <header className="app-header" style={{ paddingTop: realDevice ? "calc(env(safe-area-inset-top, 0px) + 8px)" : device.geometry.safeArea.top + 8 }}>{onBack && <button type="button" className="icon-button" aria-label="Terug naar app" onClick={onBack}><ChevronLeftIcon /></button>}{!onBack && statsVisible && statsBack && <button type="button" className="header-back" aria-label="Terug" onClick={statsBack.action}><ChevronLeftIcon /></button>}<div className="page-title"><span>{eyebrow}</span><strong>{title}</strong></div>{onBack ? <GearIcon className="settings-header-icon" aria-hidden="true" /> : <button type="button" className="icon-button settings-trigger" aria-label="Instellingen openen" onClick={settings}><GearIcon /></button>}</header>;
}
function FootballIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m12 7 4.7 3.4-1.8 5.5H9.1l-1.8-5.5L12 7Z M12 3v4 M3.5 9l3.8 1.4 M6.8 19l2.3-3.1 M17.2 19l-2.3-3.1 M20.5 9l-3.8 1.4" /></svg>; }
function PlayerBallIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="4" r="2"/><path d="m7 9 3-2 4 3 3 1 M10 7l-1 6 4 3 1 5 M9 13l-3 4-3 1 M7 9l-3 3"/><circle cx="19" cy="19" r="3"/></svg>; }
function Fold({title, children, defaultOpen=false, className=""}: {title:string; children:React.ReactNode; defaultOpen?:boolean; className?:string}) { return <details className={`fold-section ${className}`} open={defaultOpen || undefined}><summary><h2>{title}</h2><ChevronRightIcon /></summary><div className="fold-body">{children}</div></details>; }
function AppNav({ tab, onChange }: { tab: Tab | null; onChange: (tab: Tab) => void }) {
  const { bottomInset } = useKeyboardInsets();
  const navInset=realDevice?"env(safe-area-inset-bottom, 0px)":`${bottomInset}px`;
  const items = [{ id: "dashboard", label: "Overzicht", icon: <DashboardIcon /> }, { id: "live", label: "Live", icon: <PlayerBallIcon /> }, { id: "availability", label: "Beschikbaarheid", icon: <CalendarIcon /> }, { id: "stats", label: "Statistieken", icon: <BarChartIcon /> }] as const;
  return <nav className="bottom-nav" aria-label="Hoofdnavigatie" style={{ bottom:navInset,"--nav-bottom-inset":navInset } as React.CSSProperties}>{items.map(item => <button type="button" key={item.id} className={`nav-item ${tab === item.id ? "is-active" : ""}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => onChange(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>;
}
function ScreenTabs<T extends string>({id,label,value,onChange,items}:{id:string;label:string;value:T;onChange:(value:T)=>void;items:readonly {id:T;label:string;count?:number}[]}) {
  return <div className="segmented screen-tabs" role="tablist" aria-label={label}>{items.map((item,i)=><button type="button" key={item.id} role="tab" id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={value===item.id} tabIndex={value===item.id?0:-1} className={value===item.id?"selected":""} onClick={()=>onChange(item.id)} onKeyDown={event=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?items.length-1:(i+(event.key==="ArrowRight"?1:-1)+items.length)%items.length;onChange(items[next].id);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}}>{item.label}{item.count!==undefined&&<span>{item.count}</span>}</button>)}</div>;
}
function GroupLink({title,subtitle,icon,onClick,label,disabled=false,buttonRef,className=""}:{title:string;subtitle?:string;icon?:React.ReactNode;onClick:()=>void;label?:string;disabled?:boolean;buttonRef?:React.RefObject<HTMLButtonElement|null>;className?:string}) {
  return <button type="button" className={`group-link ${className}`} aria-label={label} disabled={disabled} onClick={onClick} ref={buttonRef}>{icon&&<span className="group-link-icon">{icon}</span>}<span className="group-link-copy"><strong>{title}</strong>{subtitle&&<small>{subtitle}</small>}</span><ChevronRightIcon /></button>;
}
function ResponseSummary({available,unavailable,pending,className=""}:{available:number;unavailable:number;pending:number;className?:string}) {
  return <dl className={`response-summary ${className}`}><div className="available avail"><dt>Aanwezig</dt><dd>{available}</dd></div><div className="unavailable"><dt>Afwezig</dt><dd>{unavailable}</dd></div><div className="pending"><dt>Onbekend</dt><dd>{pending}</dd></div></dl>;
}
function AttendanceEditor({match, flat=false,onContinue,preparing=false}:{match:Match; flat?:boolean;onContinue?:(statuses:Record<string,Availability>)=>void;preparing?:boolean}) {
  const {state,send,busy,archived,players,draftScope,notify}=useCoach();
  const key=`coachmate:attendance-draft:${draftScope}:${match.id}`;
  const [draft,setDraft]=useState<Record<string,Availability>>(()=>{try{const saved=JSON.parse(readDraft(key)??"{}");return Object.fromEntries(Object.entries(saved).filter(([id,v])=>players.some(p=>p.id===id)&&["available","unavailable","pending"].includes(v as string))) as Record<string,Availability>;}catch{return {};}});
  const [error,setError]=useState(""),[saving,setSaving]=useState(false),[editorOpen,setEditorOpen]=useState(false);
  const editorTrigger=useRef<HTMLButtonElement>(null),applying=useRef(false);
  useSheetReturnFocus(editorOpen,editorTrigger);
  useEffect(()=>{try{if(Object.keys(draft).length)localStorage.setItem(key,JSON.stringify(draft));else {localStorage.removeItem(key);sessionStorage.removeItem(key);}}catch{setError("Concept blijft in dit venster; bewaren na herladen lukt niet.");}},[draft,key]);
  const base=state.availability[match.id]??{};
  const changes=Object.fromEntries(Object.entries(draft).filter(([id,v])=>players.some(p=>p.id===id)&&base[id]!==v));
  const count=Object.keys(changes).length;
  const value=(id:string)=>draft[id]??base[id];
  const statusCount=(status:Availability)=>players.filter(p=>value(p.id)===status).length;
  const apply=async()=>{
    if(onContinue){onContinue(Object.fromEntries(players.map(p=>[p.id,value(p.id)])));return;}
    if(applying.current||!count||busy||archived)return;
    applying.current=true;setSaving(true);setError("");
    try{if(await send({type:"availability-batch",matchId:match.id,changes,now:Date.now()})){setDraft({});notify("Aanwezigheid verwerkt");}else setError("Opslaan niet bevestigd. Je wijzigingen blijven klaarstaan. Probeer opnieuw.");}
    catch{setError("Opslaan niet bevestigd. Je wijzigingen blijven klaarstaan. Probeer opnieuw.");}
    finally{applying.current=false;setSaving(false);}
  };
  const body=<><ResponseSummary available={statusCount("available")} unavailable={statusCount("unavailable")} pending={statusCount("pending")} />{!onContinue&&<p className="editor-instruction">Pas spelers aan en verwerk je wijzigingen in één keer.</p>}<div className="attendance-player-list">{players.map(p=><label className="attendance-player" key={p.id} data-status={value(p.id)}><span className="player-number">{p.number}</span><strong>{p.shortName}</strong><select aria-label={`Beschikbaarheid ${p.shortName}`} disabled={busy||saving||archived} value={value(p.id)} onChange={e=>{setError("");setDraft(current=>({...current,[p.id]:e.target.value as Availability}));}}><option value="available">Aanwezig</option><option value="unavailable">Afwezig</option><option value="pending">Onbekend</option></select></label>)}</div>{!onContinue&&<details className="editor-explanation"><summary>Over deze correcties <InfoCircledIcon /></summary><p>Je wijzigingen blijven lokaal tot je ze verwerkt. Coachcorrecties gaan voor formulierantwoorden. De spelersgroep bij Live wordt één keer bijgewerkt; gespeelde minuten blijven bewaard.</p></details>}<div className="editor-confirmation">{error&&<p className="editor-error" role="alert">{error}</p>}{(!onContinue||statusCount("pending")>0)&&<p className="editor-save-status" role="status">{onContinue?"Bevestig de onbekende spelers.":count?`${count} ${count===1?"wijziging":"wijzigingen"} nog niet verwerkt.`:"Geen wijzigingen om te verwerken."}</p>}<div className="attendance-save-actions">{count>0&&<button type="button" className="secondary-button" disabled={busy||saving} onClick={()=>{setDraft({});setError("");}}>Annuleren</button>}<button type="button" className="primary-button" disabled={(onContinue?(statusCount('pending')>0||statusCount('available')<(state.team.fieldSize??6)):!count)||busy||saving||preparing||archived} onClick={apply}>{onContinue?(preparing?"Berekenen…":"Bevestigen en verder"):saving?"Verwerken…":"Wijzigingen verwerken"}</button></div></div></>;
  return flat?<section className="attendance-editor">{body}</section>:<><GroupLink className="attendance-trigger" title="Aanwezigheid aanpassen" subtitle={count?`${count} wijzigingen klaar om te verwerken`:`${counts(state,match.id).available} aanwezig · ${counts(state,match.id).pending} onbekend`} icon={<PersonIcon />} buttonRef={editorTrigger} onClick={()=>setEditorOpen(true)} /><BottomSheet open={editorOpen} onOpenChange={setEditorOpen} title="Aanwezigheid aanpassen" description={`${match.opponent} · ${match.shortDate} · ${match.time} · ${match.venue}`} snap={0.86}><section className="attendance-editor">{body}</section></BottomSheet></>;
}
type StartPlanDraft = PreparationDraft;
function StartingRotation({plan,periods,present}:{plan:Scenario;periods:number;present:Player[]}) {
  const {name}=useCoach(),details=rotationDetails(plan,present.map(p=>p.id),periods),benchCount=present.length-plan.intervals[0].field.length;
  const names=(ids:string[])=>ids.map(name).join(' · ')||'Niemand';
  const {within,between}=rotationInstructions(plan,periods),quarter=periods===4;
  const list=(numbers:number[])=>numbers.length===1?String(numbers[0]):`${numbers.slice(0,-1).join(', ')} en ${numbers.at(-1)}`;
  const amount=(count:number,keeperChange:boolean)=><span className="rotation-amount">{count?`${count} erin · ${count} eruit`:keeperChange?'Alleen keeperwissel':'Geen wissel'}{keeperChange&&count>0&&<small>Ook keeperwissel</small>}</span>;
  return <><p className="rotation-occupancy">{plan.intervals[0].field.length} in het veld · {benchCount} op de bank. De aantallen hieronder zijn spelers die wisselen.</p><div className="rotation-instructions" aria-label={quarter?'Tijdens de kwarten':'Tijdens de helften'}>{within.map(group=><div className="rotation-group" key={group.periods.join('-')}><h4>{group.periods.length===periods?(quarter?'Binnen elk kwart':'Binnen elke helft'):`${quarter?'Kwart':'Helft'} ${list(group.periods)}`}</h4>{group.moments.length?group.moments.map(m=><p className="rotation-row" key={m.afterMs}><span>Na {(m.afterMs/60000).toLocaleString('nl-NL',{maximumFractionDigits:2})} min</span>{amount(m.count,m.keeperChange)}</p>):<p className="rotation-row">Geen wissels tijdens {quarter?'het kwart':'de helft'}</p>}</div>)}</div><div className="rotation-instructions" aria-label={quarter?'Tussen de kwarten':'In de rust'}><h4>{quarter?'Tussen de kwarten':'In de rust'}</h4>{between.map(group=><p className="rotation-row" key={group.periods.join('-')}><span>{quarter?`Na kwart ${list(group.periods)}`:'Na helft 1'}</span>{amount(group.count,group.keeperChange)}</p>)}</div><details className="rotation-players"><summary>Wie wisselt en wie blijft op de bank?<ChevronDownIcon/></summary><div className="rotation-player-moments">{details.map(m=><section key={m.atMs} className="rotation-player-moment"><h4>{m.afterMs===0?`Na ${quarter?'kwart':'helft'} ${m.period-1}`:`${quarter?'Kwart':'Helft'} ${m.period} · na ${(m.afterMs/60000).toLocaleString('nl-NL')} min`}</h4><dl><div><dt>Erin</dt><dd>{names(m.incoming)}</dd></div><div><dt>Eruit</dt><dd>{names(m.outgoing)}</dd></div><div className={m.staysBench.length?'has-staying-player':''}><dt>Blijft op de bank</dt><dd>{names(m.staysBench)}</dd></div>{m.keeperChange&&<div><dt>Keeper</dt><dd>{name(m.keeperId)}</dd></div>}</dl><p>{m.field.length} in het veld · {m.bench.length} op de bank</p></section>)}</div></details><p className="rotation-hint">Een kleinere wissel laat de genoemde bankspeler(s) zitten. Het plan verdeelt de minuten over de hele wedstrijd.</p><p className="rotation-hint">Tijden vanaf het begin van {quarter?'elk kwart':'elke helft'}. Wissel bij stil spel.</p></>;
}
function FormationPitch({editor,onEdit,disabled,present}:{editor:StartPlanDraft;onEdit:(d:StartPlanDraft)=>void;disabled:boolean;present:Player[]}) {
  const {state,name}=useCoach(),[active,setActive]=useState<number|null>(null),keyboard=useKeyboard();
  const keeper=editor.slots[0],size=state.team.fieldSize??6;
  const choices=formationsForTeam(state.team),savedFormation=formationFitsTeam(editor.formation,state.team)?editor.formation:undefined,suggested=suggestFormation(size,editor.field,keeper,editor.positions);
  const formation=savedFormation??choices.find(f=>f.lines.join('-')===suggested.join('-'))?.lines??choices[0]?.lines??suggested;
  const field=savedFormation?editor.field:arrangeFormation(formation,editor.field,keeper,editor.positions);
  const pattern=formation.join('-'),roles=formationRoles(formation);
  const listed=choices.some(f=>f.lines.join('-')===pattern);
  const labels={V:'Verdediging',M:'Middenveld',A:'Spits'};
  function update(lines:number[],next:string[]){onEdit({...editor,formation:[...lines],field:next,positions:positionsForFormation(lines,next),manualLineup:true,dirty:true});}
  function assign(id:string){if(active===null)return;const next=[...field],other=id?next.indexOf(id):-1;if(other===0)return;if(other>0&&other!==active)next[other]=next[active];next[active]=id;update(formation,next);setActive(null);keyboard.hide();}
  let offset=1;
  const rows=formation.map((count,line)=>{const row={line,start:offset,role:line===0?'V':line===formation.length-1?'A':'M',count};offset+=count;return row;}).reverse();
  return <div className="formation-lineup"><label className="formation-choice">Formatie<select aria-label="Formatie" disabled={disabled||!choices.length} value={listed?pattern:''} onChange={e=>{const lines=e.target.value.split('-').map(Number);setActive(null);update(lines,arrangeFormation(lines,field,keeper,positionsForFormation(formation,field)));}}>{!listed&&<option value="" disabled>Bewaarde opstelling · {pattern}</option>}{choices.map(f=><option key={f.id} value={f.lines.join('-')}>{f.lines.join('-')}</option>)}</select></label><p className="summary-note">Teamseizoen: {size-1} veldspelers + keeper.</p>{!choices.length&&<p className="summary-note">Geen varianten voor {size} spelers. Voeg een variant toe via Instellingen.</p>}
    <div className="lineup-pitch" aria-label={`Veldopstelling ${pattern}`}><div className="pitch-markings" aria-hidden="true"><i/><b/></div>{rows.map(row=><div className="pitch-line" key={row.line} data-role={row.role} role="group" aria-label={`${labels[row.role as FieldPosition]}${formation.length>3?` · linie ${row.line+1}`:''}`} style={{gridTemplateColumns:`repeat(${row.count},minmax(0,1fr))`}}>{Array.from({length:row.count},(_,column)=>{const index=row.start+column,id=field[index]??'',player=present.find(p=>p.id===id);return <button key={index} type="button" className="pitch-slot" data-player-id={id} data-slot={index} aria-label={`${labels[row.role as FieldPosition]} ${column+1}: ${id?name(id):'Lege plek'}`} aria-pressed={active===index} disabled={disabled} onClick={()=>{keyboard.hide();setActive(active===index?null:index);}}><span className="pitch-shirt">{player?.number??'+'}</span><span className="pitch-name">{player?.shortName??'Kies speler'}</span></button>;})}</div>)}<div className="pitch-line pitch-keeper"><div className="pitch-slot"><span className="pitch-shirt">{present.find(p=>p.id===keeper)?.number??'K'}</span><span className="pitch-name">{keeper?name(keeper):'Keeper kiezen'}</span><small>Keeper</small></div></div></div>
    {active!==null&&<div className="pitch-assignment"><label className="form-label">{labels[roles[active-1]]} · {field[active]?name(field[active]):'Lege plek'}<select autoFocus aria-label="Speler op deze plek" value={field[active]??''} disabled={disabled} onChange={e=>assign(e.target.value)}><option value="">Lege plek</option>{present.filter(p=>p.id!==keeper).map(p=><option key={p.id} value={p.id}>{p.shortName}{!field.includes(p.id)?' · bank':''}</option>)}</select></label><button type="button" className="text-button" onClick={()=>{setActive(null);keyboard.hide();}}>Gereed</button></div>}
    <p className="pitch-help">Tik een speler aan om te wisselen van plek of met de bank.</p><div className="lineup-bench" aria-label={field.filter(Boolean).length===size?"Startbank":"Nog te plaatsen"}><span>{field.filter(Boolean).length===size?"Bank":"Nog te plaatsen"}</span>{present.filter(p=>!field.includes(p.id)).map(p=><span className="lineup-bench-player" key={p.id}>{p.shortName}</span>)}</div>
  </div>;
}
function StartingPlan({plan,confirmed=false,presentIds}:{plan:Scenario|null;confirmed?:boolean;presentIds?:string[]}) {
  const {players,state}=useCoach();
  if(!plan)return <p className="summary-note">Het wisseladvies verschijnt na de berekening.</p>;
  const present=players.filter(p=>presentIds?presentIds.includes(p.id):state.availability[plan.matchId]?.[p.id]==='available'),field=plan.intervals[0].field;
  return <div className="starting-plan"><section className="preparation-summary"><h3>{confirmed?'Start op de bank':'Voorgestelde startbank'}</h3><p className="starting-bench">{present.filter(p=>!field.includes(p.id)).map(p=>p.shortName).join(' · ')||'Iedereen start in het veld'}</p><div className="start-rhythm" aria-label="Wisseladvies">{plan.intervals.length>1?<StartingRotation plan={plan} periods={state.team.periods} present={present}/>:<p>Geen wissels nodig.</p>}</div></section><p className="summary-note">Max. afwijking streeftijd: {(plan.fairnessErrorMs/60000).toLocaleString('nl-NL',{maximumFractionDigits:1})} min. {confirmed?'':'Je bepaalt de definitieve startopstelling in de volgende stap.'}</p></div>;
}
type PreparationStep='squad'|'keepers'|'advice'|'lineup';
const preparationSteps:PreparationStep[]=['squad','keepers','advice','lineup'];
const preparationTitles:Record<PreparationStep,string>={squad:'Spelersgroep',keepers:'Keepers',advice:'Wisseladvies',lineup:'Startopstelling'};
type PreparationView={match:Match;close:()=>void;draft:StartPlanDraft;plan:Scenario|null;busy:boolean;dirty:boolean;error:string;onEdit:(draft:StartPlanDraft)=>void;calculate:()=>Promise<boolean>;confirmPlayers:(statuses:Record<string,Availability>)=>Promise<void>;accept:()=>Promise<void>};
const PreparationViewContext=createContext<PreparationView|null>(null);
function usePreparation(){const view=useContext(PreparationViewContext);if(!view)throw new Error('Wedstrijdvoorbereiding ontbreekt');return view;}
function PreparationHeader({kind}:{kind:PreparationStep}){
  const view=usePreparation(),flow=useFlow(),title=useRef<HTMLHeadingElement>(null),index=preparationSteps.indexOf(kind);
  useEffect(()=>{title.current?.focus({preventScroll:true});},[kind]);
  return <div className="preparation-header"><div className="preparation-toolbar"><button type="button" className="icon-button" aria-label={index===0?'Terug naar overzicht':`Terug naar ${preparationTitles[preparationSteps[index-1]]}`} onClick={()=>index===0?view.close():flow.canGoBack?flow.pop():flow.replace(preparationScreens[preparationSteps[index-1]])}><ChevronLeftIcon/></button><Dialog.Title asChild><h1 ref={title} tabIndex={-1}>{preparationTitles[kind]}</h1></Dialog.Title><span className="preparation-counter" aria-label={`Stap ${index+1} van 4`}>{index+1}/4</span><button type="button" className="icon-button" aria-label="Sluiten" onClick={view.close}><Cross1Icon/></button></div><p>{view.match.opponent} · {view.match.shortDate} · {view.match.time}</p></div>;
}
function PreparationKeepers(){
 const {draft,onEdit,busy}=usePreparation(),{state,players}=useCoach(),present=players.filter(p=>draft.statuses[p.id]==='available');
 const suggestions=suggestMatchKeepers(state,draft.matchId,present.map(p=>p.id));
 const minutes=(value:number)=>value.toLocaleString('nl-NL',{maximumFractionDigits:1});
 function choose(index:number,id:string){const slots=[...draft.slots];slots[index]=id;const field=[...draft.field];if(index===0){const other=field.indexOf(id);if(other>0)field[other]=field[0];field[0]=id;}onEdit({...draft,slots,field,positions:Object.fromEntries(Object.entries(draft.positions).filter(([pid])=>field.includes(pid)&&pid!==slots[0])),dirty:true,keepersConfirmed:false});}
 return <section className="keeper-period-editor"><p className="preparation-intro">Kies voor {state.team.periods===4?'alle vier de kwarten':'beide helften'} een keeper. Dezelfde speler mag meerdere keren keepen.</p><div className="keeper-period-list">{draft.slots.map((id,i)=><label className="keeper-period-row" key={i}><span><strong>{state.team.periods===4?'Kwart':'Helft'} {i+1}</strong><small>{minutes(50/state.team.periods)} minuten</small></span><select aria-label={`Keeper ${state.team.periods===4?'kwart':'helft'} ${i+1}`} disabled={busy} value={id} onChange={e=>choose(i,e.target.value)}><option value="">Kies keeper</option>{id&&!present.some(p=>p.id===id)&&<option value={id} disabled>Niet aanwezig</option>}{present.map(p=><option key={p.id} value={p.id}>{p.shortName}</option>)}</select></label>)}</div><p className="summary-note">{draft.slots.filter(Boolean).length}/{state.team.periods} ingevuld · {new Set(draft.slots.filter(Boolean)).size} keepers</p>{suggestions.length>0&&<button type="button" className="text-button keeper-suggestion" disabled={busy} onClick={()=>{const slots=Array.from({length:state.team.periods},(_,i)=>suggestions[Math.min(suggestions.length-1,Math.floor(i* suggestions.length/state.team.periods))]);const field=[...draft.field],other=field.indexOf(slots[0]);if(other>0)field[other]=field[0];field[0]=slots[0];onEdit({...draft,slots,field,positions:Object.fromEntries(Object.entries(draft.positions).filter(([pid])=>field.includes(pid)&&pid!==slots[0])),dirty:true,keepersConfirmed:false});}}>Voorstel invullen: {suggestions.map(id=>present.find(p=>p.id===id)?.shortName).join(' en ')}</button>}<div className="keeper-period-totals">{[...new Set(draft.slots.filter(Boolean))].map(id=><p key={id}><strong>{present.find(p=>p.id===id)?.shortName??'Niet aanwezig'}</strong><span>{minutes(draft.slots.filter(value=>value===id).length*50/state.team.periods)} min op doel</span></p>)}</div>{draft.legacy!==undefined&&<p className="summary-note">Je eerdere keuzes zijn bewaard. Bevestig de keeper nu per {state.team.periods===4?'kwart':'helft'}.</p>}</section>;
}
function PreparationLineup(){
 const {draft,onEdit,busy}=usePreparation(),{state,players}=useCoach(),present=players.filter(p=>draft.statuses[p.id]==='available'),suggestion=draft.plan?.intervals[0];
 const usable=suggestion&&suggestion.keeperId===draft.slots[0]&&suggestion.field.length===(state.team.fieldSize??6)&&suggestion.field.every(id=>draft.statuses[id]==='available');
 return <section className="preparation-lineup-editor"><p className="preparation-intro">Kies wie {state.team.periods===4?'het eerste kwart':'de eerste helft'} begint. Neem het voorstel over of vul de veldplekken in. De keeper staat vast.</p>{usable&&<button type="button" className="secondary-button use-suggested-lineup" disabled={busy} onClick={()=>{const lines=draft.formation??formationsForTeam(state.team)[0]?.lines;if(!lines)return;const field=arrangeFormation(lines,[draft.slots[0],...suggestion.field.filter(id=>id!==draft.slots[0])],draft.slots[0],Object.fromEntries(players.filter(p=>['V','M','A'].includes(p.position)).map(p=>[p.id,p.position as FieldPosition])));onEdit({...draft,field,formation:[...lines],positions:positionsForFormation(lines,field),manualLineup:true,dirty:true});}}>Voorgestelde opstelling overnemen</button>}<FormationPitch editor={draft.manualLineup?draft:{...draft,field:[draft.slots[0],...Array((state.team.fieldSize??6)-1).fill('')],positions:{}}} onEdit={onEdit} disabled={busy} present={present}/><p className="summary-note">Je definitieve opstelling wordt meegenomen in het wisselplan. De wedstrijdklok start pas bij Live.</p></section>;
}
function PreparationPage({kind}:{kind:PreparationStep}){
 const view=usePreparation(),flow=useFlow(),{draftScope,players}=useCoach(),active=flow.current.id===kind;
 return <div className="preparation-route-layer" inert={!active} aria-hidden={!active}><MobileScroll className="preparation-scroll"><main className={`preparation-content preparation-${kind}`}>
 {kind==='squad'?<AttendanceEditor key={`${draftScope}:${view.match.id}:preparation`} match={view.match} flat preparing={view.busy} onContinue={async statuses=>{if(view.busy)return;await view.confirmPlayers(statuses);flow.push(preparationScreens.keepers);}}/>:kind==='keepers'?<PreparationKeepers/>:kind==='lineup'?<PreparationLineup/>:view.busy?<div className="preparation-calculating" role="status"><ReloadIcon/><h2>Wisselplan berekenen</h2><p>Met de bevestigde spelersgroep en jouw keeperkeuzes.</p></div>:view.plan?<StartingPlan plan={view.plan} presentIds={players.filter(p=>view.draft.statuses[p.id]==='available').map(p=>p.id)}/>:<p className="preparation-intro">{view.dirty?'De keuzes zijn gewijzigd. Bereken het advies opnieuw.':'Het advies verschijnt na de berekening.'}</p>}
 {view.error&&<p role="alert" className="editor-error">{view.error}</p>}
 </main></MobileScroll></div>;
}
function PreparationFooter({kind}:{kind:Exclude<PreparationStep,'squad'>}){
 const view=usePreparation(),flow=useFlow(),{state}=useCoach();
 const valid=kind==='keepers'?keeperScheduleValid(state,view.draft):kind==='lineup'?startingLineupValid(state,view.draft):true;
 const issue=kind==='lineup'?startingLineupIssue(state,view.draft):null;
 const placed=view.draft.manualLineup?new Set(view.draft.field.filter(id=>id&&view.draft.statuses[id]==='available')).size:Number(Boolean(view.draft.slots[0]));
 const label=view.busy?'Berekenen…':kind==='keepers'?'Wisselplan berekenen':kind==='lineup'?'Bevestigen en naar Live':view.dirty||!view.plan?'Opnieuw berekenen':'Startopstelling invullen';
 return <div className={`preparation-footer${kind==='lineup'?' preparation-lineup-footer':''}`}>{kind==='lineup'&&<p id="preparation-lineup-status" className="lineup-completion" data-incomplete={Boolean(issue)} role="status"><strong>{placed}/{state.team.fieldSize??6} opgesteld</strong><span>{issue??'De startopstelling is compleet.'}</span></p>}<button type="button" className="primary-button" aria-describedby={kind==='lineup'?'preparation-lineup-status':undefined} disabled={view.busy||!valid} onClick={async()=>{if(kind==='keepers'){flow.push(preparationScreens.advice);await view.calculate();}else if(kind==='advice'){if(view.dirty||!view.plan)await view.calculate();else flow.push(preparationScreens.lineup);}else await view.accept();}}>{label}</button></div>;
}
function preparationScreen(kind:PreparationStep):FlowScreen{return {id:kind,headerHeight:88,header:()=> <PreparationHeader kind={kind}/>,...(kind==='squad'?{}:{footerHeight:kind==='lineup'?124:76,footer:()=> <PreparationFooter kind={kind}/>}),render:()=> <PreparationPage kind={kind}/>};}
const preparationScreens:Record<PreparationStep,FlowScreen>={squad:preparationScreen('squad'),keepers:preparationScreen('keepers'),advice:preparationScreen('advice'),lineup:preparationScreen('lineup')};
function MatchPreparation({match,label='Spelersgroep en wisselplan',overview=false}:{match:Match;label?:string;overview?:boolean}) {
 const {state,players,send,busy,archived,draftScope,navigate,LIVE_MATCH_ID}=useCoach(),key=`coachmate:start-plan-draft:${draftScope}:${match.id}`;
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const [draft,setDraft]=useState<StartPlanDraft>(()=>readPreparationDraft(readDraft(key),state,match.id)??newPreparationDraft(state,match.id));
 const [loadedKey,setLoadedKey]=useState(key);
 const trigger=useRef<HTMLButtonElement>(null),applying=useRef(false);useSheetReturnFocus(open,trigger);
 const {screenRef}=useScreenPortal(),{device}=useMobileDevice(),{bottomInset}=useKeyboardInsets(),keyboard=useKeyboard();
 useEffect(()=>{if(loadedKey===key)return;keyboard.hide();setOpen(false);setError('');setDraft(readPreparationDraft(readDraft(key),state,match.id)??newPreparationDraft(state,match.id));setLoadedKey(key);},[key,loadedKey]);
 useEffect(()=>{if(loadedKey===key&&draft.teamSeasonId===(state.catalog??demoCatalog()).teamSeasonId&&draft.matchId===match.id)try{localStorage.setItem(key,JSON.stringify(draft));}catch{setError('Concept blijft in dit venster; bewaren na herladen lukt niet.');}},[draft,key,loadedKey]);
 const planCurrent=preparationPlanCurrent(state,draft),session=state.assistant?.[match.id];
 const underway=state.live.elapsedMs>0||state.live.runningSince!==null||state.live.goals.length>0||state.live.awayGoals.length>0||state.live.swaps.length>0;
 const confirmed=!underway&&LIVE_MATCH_ID===match.id&&Boolean(state.live.preparation?.keeperSchedule&&state.live.preparation.startingField)&&session?.status==='accepted'&&session.context===adviceContext(state)&&!draft.dirty;
 async function calculate(final=false){
  if(applying.current||busy||archived)return false;applying.current=true;setWorking(true);setError('');keyboard.hide();
  try{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const result=calculatePreparation(state,draft,{id:crypto.randomUUID(),eventId:crypto.randomUUID(),now:Date.now()},final);
   if(final&&!await send(result.action)){setError('Bevestigen is niet gelukt. Je keuzes blijven als concept bewaard. Probeer opnieuw.');return false;}
   setDraft(result.draft);
   try{localStorage.setItem(key,JSON.stringify(result.draft));}catch{setError('Concept bewaren na herladen lukt niet.');}
   if(final){try{localStorage.removeItem(`coachmate:attendance-draft:${draftScope}:${match.id}`);sessionStorage.removeItem(`coachmate:attendance-draft:${draftScope}:${match.id}`);}catch{}keyboard.hide();setOpen(false);navigate('live');}
   return true;
  }catch(err){setError(err instanceof Error?err.message:'Geen geldig wisselplan. Je keuzes blijven bewaard.');return false;}finally{applying.current=false;setWorking(false);}
 }
 async function confirmPlayers(statuses:Record<string,Availability>){const same=players.every(p=>draft.statuses[p.id]===statuses[p.id]),slots=draft.slots.map(id=>statuses[id]==='available'?id:'');setError('');setDraft({...draft,statuses,slots,field:draft.field.map((id,i)=>i===0?slots[0]:statuses[id]==='available'?id:''),keepersConfirmed:same&&draft.keepersConfirmed,dirty:draft.dirty||!same});}
 const close=()=>{keyboard.hide();setOpen(false);};
 const view:PreparationView={match,close,draft,plan:planCurrent?draft.plan!:null,busy:busy||working,dirty:!planCurrent,error,onEdit:next=>{setError('');setDraft(next);},calculate:()=>calculate(),confirmPlayers,accept:async()=>{await calculate(true);}};
 return <>{overview&&<div className="preparation-overview-status">{confirmed?<><p className="advice-label">Bevestigde startbank</p><p className="starting-bench">{players.filter(p=>state.availability[match.id]?.[p.id]==='available'&&!state.live.field.includes(p.id)).map(p=>p.shortName).join(' · ')||'Iedereen start'}</p><p className="summary-note">Opstelling en keepers voor deze wedstrijd bevestigd.</p></>:<p className="summary-note">{underway&&match.id===LIVE_MATCH_ID?'Bekijk het actuele wisseladvies bij Live.':draft.keepersConfirmed||draft.manualLineup?'Voorbereiding als concept bewaard. Bevestig de definitieve opstelling om naar Live te gaan.':'Bevestig de spelersgroep en kies de keeper per '+(state.team.periods===4?'kwart':'helft')+'. Daarna berekenen we het wisseladvies.'}</p>}</div>}<button ref={trigger} type="button" className="primary-button overview-live-action" disabled={busy||archived||loadedKey!==key} onClick={()=>{setError('');if((LIVE_MATCH_ID===match.id&&underway)||(LIVE_MATCH_ID!==match.id&&state.live.phase!=='Einde')){navigate('live');return;}keyboard.hide();setOpen(true);}}><PlayerBallIcon/>{LIVE_MATCH_ID===match.id&&underway?'Naar live wedstrijd':LIVE_MATCH_ID!==match.id&&state.live.phase!=='Einde'?'Open actieve wedstrijd':label}<ChevronRightIcon/></button>
 <Dialog.Root open={open&&loadedKey===key} onOpenChange={next=>{keyboard.hide();setOpen(next);}}><Dialog.Portal container={screenRef.current??undefined}><Dialog.Content className="preparation-page" data-real={realDevice?'true':'false'} aria-describedby={undefined} style={{bottom:!realDevice&&device.platform==='android'?device.geometry.safeArea.bottom:0,'--preparation-bottom-inset':realDevice?'env(safe-area-inset-bottom,0px)':`${bottomInset}px`} as React.CSSProperties} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerCancel={e=>e.stopPropagation()} onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus({preventScroll:true});}}><PreparationViewContext value={view}><FlowStack initial={preparationScreens.squad}/></PreparationViewContext></Dialog.Content></Dialog.Portal></Dialog.Root></>;
}
function Dashboard() {
  const { state, navigate, players, matches, teamName, LIVE_MATCH_ID } = useCoach();
  const [schedule,setSchedule]=useState<"upcoming"|"overdue">("upcoming");
  const completed = processedMatchIds(state);
  const unrecorded = orderedMatches(matches.filter(m => !completed.has(m.id)));
  const today = new Date().setHours(0, 0, 0, 0);
  const upcoming = unrecorded.filter(m => matchDate(m) >= today),overdue=unrecorded.filter(m=>matchDate(m)<today);
  const next = upcoming[0] ?? unrecorded.find(m=>m.id===LIVE_MATCH_ID && state.live.phase!=="Einde");
  const adviceMatch=next??matches.find(m=>m.id===LIVE_MATCH_ID&&state.live.phase!=="Einde");
  const shown=schedule==="upcoming"?upcoming:overdue;
  return <main className="screen-content dashboard-screen">
    {next?<section className="next-game-overview"><div className="overview-match-label"><p className="eyebrow">{next.id===LIVE_MATCH_ID&&state.live.elapsedMs>0&&state.live.phase!=="Einde"?"Actieve wedstrijd":"Aankomende wedstrijd"}</p><span>{next.venue}</span></div><div className="overview-match-body"><DateTile match={next}/><div><h1>{next.opponent}</h1><p>{teamName} · {next.time}</p></div></div><p className="preparation-dashboard-note">{counts(state,next.id).available} beschikbaar · {counts(state,next.id).pending} onbekend<br/>Bereid hieronder de spelersgroep en het wisselplan voor.</p></section>:<section className="next-game-overview empty-state"><CalendarIcon/><h1>Geen komende wedstrijd</h1><p>Voeg wedstrijden toe via Speelrondes beheren bij Beschikbaarheid.</p></section>}
    {adviceMatch&&<section className="swap-suggestions compact-advice" aria-label="Wisselplan"><h2>Wisselplan</h2><MatchPreparation key={adviceMatch.id} match={adviceMatch} overview/></section>}
    <section className="season-summary overview-season" aria-labelledby="season-summary-title"><div className="season-summary-heading"><h2 id="season-summary-title">Dit seizoen</h2><button type="button" className="text-button" onClick={()=>navigate("stats")}>Statistieken <ChevronRightIcon/></button></div><dl><div><dt>Wedstrijden</dt><dd data-testid="total-matches">{completed.size}</dd></div><div><dt>Wedstrijdminuten</dt><dd data-testid="total-minutes">{unknownMatchDurationCount(state)>0&&teamMatchMinutes(state)===0?"?":teamMatchMinutes(state).toLocaleString("nl-NL",{maximumFractionDigits:1})+(unknownMatchDurationCount(state)>0?"+?":"")}</dd></div><div><dt>Doelpunten</dt><dd data-testid="total-goals">{totalGoals(state)}</dd></div></dl></section>
    <section className="screen-group dashboard-schedule"><div className="screen-group-heading"><h2>Wedstrijden</h2><CalendarIcon/></div><ScreenTabs id="dashboard-matches" label="Wedstrijdenoverzicht" value={schedule} onChange={setSchedule} items={[{id:"upcoming",label:"Planning",count:upcoming.length},{id:"overdue",label:"Te verwerken",count:overdue.length}]}/><div role="tabpanel" id={`dashboard-matches-panel-${schedule}`} aria-labelledby={`dashboard-matches-tab-${schedule}`} tabIndex={0}>{shown.length?<div className="match-list">{shown.map(m=><button type="button" className="match-list-row" key={m.id} onClick={()=>schedule==="upcoming"?navigate("availability",m.id):navigate(m.id===LIVE_MATCH_ID&&state.live.phase!=="Einde"?"live":"stats",m.id)}><DateTile match={m}/><span className="match-row-copy"><strong>{m.opponent}</strong><small>{m.time} · {m.venue}</small></span>{schedule==="upcoming"?<span className="match-row-count">{counts(state,m.id).available}/{players.length}<small>aanwezig</small></span>:<span className="match-row-state">{m.id===LIVE_MATCH_ID&&state.live.phase!=="Einde"?"Live":"Invoeren"}</span>}<ChevronRightIcon/></button>)}</div>:<div className="empty-state compact"><CalendarIcon/><strong>{schedule==="upcoming"?"Geen komende wedstrijden":"Alles is verwerkt"}</strong><p>{schedule==="upcoming"?"Voeg je volgende wedstrijden toe bij Beschikbaarheid.":"Er staan geen eerdere wedstrijden meer open."}</p></div>}</div></section>
    <GroupLink title="Beschikbaarheid" subtitle="Reacties bekijken en speelrondes beheren" label="Naar beschikbaarheid" icon={<CalendarIcon/>} onClick={()=>navigate("availability")}/>
  </main>;
}

function useSheetReturnFocus(open:boolean,trigger:React.RefObject<HTMLButtonElement|null>) {
  const opened=useRef(false);
  useEffect(()=>{
    if(open){opened.current=true;return;}
    if(!opened.current||!trigger.current)return;
    opened.current=false;
    const button=trigger.current,container=button.closest('[data-phone-screen]')??document.body;
    // Wait for the sheet's animated exit before returning focus to its opener.
    const observer=new MutationObserver(restore);
    function restore(){if(!container.querySelector('[role="dialog"]')){observer.disconnect();if(button.isConnected)button.focus({preventScroll:true});}}
    observer.observe(container,{childList:true,subtree:true});restore();
    return()=>observer.disconnect();
  },[open,trigger]);
}
function PreparedMatchPlan({plan}:{plan:Scenario}){
 const {state,players,name}=useCoach(),[open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);useSheetReturnFocus(open,trigger);
 const next=planOverview(plan).moments[0],present=players.filter(p=>state.availability[plan.matchId]?.[p.id]==='available');
 return <section className="assistant-card prepared-match-plan" aria-label="Wisselassistent"><div className="assistant-heading"><h2>Wisselassistent</h2><small>Opstelling bevestigd</small></div><p>{next?`Eerste wisselmoment bij ${clock(next.startMs)} speeltijd.`:'Geen bankwissels nodig.'}</p><p className="summary-note">{state.live.preparation?.keeperSchedule?.map((id,i)=>`${state.live.periods===4?'Kwart':'Helft'} ${i+1}: ${name(id)}`).join(' · ')}</p><button ref={trigger} type="button" className="secondary-button" onClick={()=>setOpen(true)}>Gepland wisselpatroon</button><BottomSheet open={open} onOpenChange={setOpen} title="Gepland wisselpatroon" description="Met je bevestigde startopstelling en keeper per periode." snap={0.9}><div className="starting-plan prepared-pattern"><StartingRotation plan={plan} periods={state.live.periods} present={present}/></div></BottomSheet></section>;
}
function SubstitutionAssistant({ended}:{ended:boolean}) {
  const {state,send,busy,players,name,navigate,settings}=useCoach();
  const session=adviceFor(state),context=adviceContext(state);
  const [open,setOpen]=useState(false),[editing,setEditing]=useState(false),[error,setError]=useState('');
  const [selected,setSelected]=useState<string[]>([]),[keeper,setKeeper]=useState(''),[checked,setChecked]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);useSheetReturnFocus(open,trigger);
  const proposal=useMemo(()=>{if(ended||state.live.elapsedMs===0&&!state.live.preparation)return {result:null,error:''};try{return {result:generateAdvice(state,Date.now()),error:''};}catch(e){const message=(e as Error).message;return {result:null,error:message.includes('UNAVAILABLE_PLAYER')?'Nog niet iedereen in de opstelling is bevestigd aanwezig.':message.includes('GOALKEEPER')?'De huidige keeper is niet als geschikt bevestigd.':state.live.elapsedMs>=50*60000?'De reguliere speeltijd is verstreken. De werkelijke minuten worden wel bijgehouden.':'Controleer de opstelling, beschikbaarheid en persoonlijke minutenlimieten.'};}},[context,ended]);
  const current=session&&session.context===context?session:null;
  const change=current?nextAdvice(state,current):null;
  const out=change?state.live.field.filter(id=>!change.field.includes(id)):[],incoming=change?change.field.filter(id=>!state.live.field.includes(id)):[];
  const remaining=change?change.startMs-state.live.elapsedMs:0;
  const policy=state.team.substitutionPolicy??defaultPolicy();
  const reminder=Boolean(change&&remaining<=policy.reminderSeconds*1000&&current?.status!=='deferred'&&!ended);
  const epoch=adviceEpoch(state);
  async function makePlan(alternative=0){setError('');const ok=await send({type:'assistant-plan',id:crypto.randomUUID(),eventId:crypto.randomUUID(),expectedEpoch:epoch,alternative,now:Date.now()});if(ok){setChecked(false);setEditing(false);setOpen(true);}else setError('Plan niet bewaard. Controleer de aanwezigheid en probeer opnieuw.');}
  async function decide(decision:'accept'|'skip'|'defer') {if(!current)return;const ok=await send({type:'assistant-decision',id:current.plan.id,eventId:crypto.randomUUID(),expectedEpoch:epoch,decision,now:Date.now()});if(!ok)setError('Het advies is gewijzigd. Bekijk het nieuwe voorstel.');}
  const minutes=(ms:number)=>(ms/60000).toLocaleString('nl-NL',{maximumFractionDigits:1});
  const status=current?.status==='accepted'?'Geaccepteerd · nog niet uitgevoerd':current?.status==='deferred'?`Uitgesteld tot ${clock(current.deferUntilMs??0)} speeltijd`:current?.status==='skipped'?'Advies overgeslagen':'Voorstel · jij bevestigt de uitvoering';
  if(ended&&!session)return null;
  if(!ended&&state.live.elapsedMs===0&&state.live.preparation?.keeperSchedule&&current?.status==='accepted')return <PreparedMatchPlan plan={current.plan}/>;
  if(!ended&&state.live.elapsedMs===0&&!state.live.runningSince&&!state.live.goals.length&&!state.live.awayGoals.length&&!state.live.swaps.length)return <section className="assistant-card" aria-label="Wisselassistent"><div className="assistant-heading"><h2>Wisselassistent</h2><small>Lokaal berekend</small></div><p>Bevestig de spelersgroep, kies de keepers per periode en bepaal je startopstelling.</p><MatchPreparation match={(state.catalog??demoCatalog()).matches.find(m=>m.id===(state.catalog??demoCatalog()).liveMatchId)!}/></section>;
  return <section className="assistant-card" aria-label="Wisselassistent">
    <div className="assistant-heading"><h2>Wisselassistent</h2><small>Lokaal berekend</small></div>
    {!session||state.live.elapsedMs===0&&!state.live.preparation?<>{state.live.elapsedMs===0&&!state.live.preparation?<><p>Bevestig eerst de definitieve spelersgroep en kies de keepers. Daarna rekent de assistent het wisselplan uit.</p><MatchPreparation match={(state.catalog??demoCatalog()).matches.find(m=>m.id===(state.catalog??demoCatalog()).liveMatchId)!} label="Spelersgroep bevestigen"/></>:<><p>Maak een plan voor de resterende wedstrijd, inclusief keeperrotatie en eerlijke minuten.</p><button ref={trigger} type="button" className="primary-button" disabled={ended||busy||!proposal.result} onClick={()=>void makePlan()}>Wisselplan maken</button></>}</>:
      <><p className="assistant-status">{ended?'Opgeslagen adviesregistratie':status}</p>{change?<><strong className="assistant-next">{remaining>0?`Wissel bij ${clock(change.startMs)}`:'Wisselmoment bereikt'}</strong><div className="assistant-people"><span><small>Eruit</small>{out.map(name).join(', ')||'Geen bankwissel'}</span><ArrowRightIcon/><span><small>Erin</small>{incoming.map(name).join(', ')||'Positiewissel'}</span></div>{change.keeperId!==state.live.keeperId&&<p>Keeper: {name(change.keeperId)}</p>}</>:<p>{current?.status==='skipped'?'Je kunt zelf wisselen of een nieuw plan maken.':ended?'Je besluiten zijn lokaal of met de wedstrijd opgeslagen.':'Geen volgende wissel nodig, of een nieuw voorstel wordt voorbereid.'}</p>}<button ref={trigger} type="button" className="secondary-button" onClick={()=>{setOpen(true);setEditing(false);setError('');}}>Plan en uitleg bekijken</button></>}
    {reminder&&<p className="assistant-reminder" role="status" aria-live="polite">{remaining>0?`Wissel over ${Math.ceil(remaining/1000)} seconden. Bekijk wie klaar moet staan.`:'De voorgestelde wissel is aan de beurt. Registreer pas na uitvoering.'}</p>}
    {!ended&&proposal.error&&<div className="assistant-warning"><p>Plan nog niet beschikbaar. Bevestig de aanwezige spelers en controleer de opstelling en geschikte keeper.</p><p className="summary-note">{proposal.error}</p><button type="button" className="text-button" onClick={()=>navigate('availability')}>Aanwezigheid controleren</button><button type="button" className="text-button" onClick={settings}>Keeperinstellingen</button></div>}
    {error&&<p role="alert">{error}</p>}
    <BottomSheet open={open} onOpenChange={setOpen} title="Wisselplan" description="Een voorstel verandert de opstelling pas na bevestigde uitvoering." snap={0.9}>
      <div className="assistant-details">
        {session&&<><details className="live-pattern-details"><summary>Gepland wisselpatroon</summary><div className="starting-plan prepared-pattern"><StartingRotation plan={session.plan} periods={state.live.periods} present={players.filter(p=>state.availability[session.plan.matchId]?.[p.id]==='available')}/></div></details><p className="assistant-status">{status} · beleid v{session.plan.policyVersion}</p><details><summary>Opstelling en keeper controleren</summary><p>{state.live.field.map(name).join(', ')}</p><p>Keeper: <strong>{name(state.live.keeperId)}</strong></p></details>
        {change&&<div className="assistant-review"><strong>Voorgesteld bij {clock(change.startMs)} speeltijd</strong><div className="assistant-people"><span><small>Eruit</small>{out.map(name).join(', ')||'Positiewissel'}</span><ArrowRightIcon/><span><small>Erin</small>{incoming.map(name).join(', ')||'Veld'}</span></div>{change.keeperId!==state.live.keeperId&&<p>Keeper: {name(change.keeperId)}</p>}</div>}
        {state.live.elapsedMs===0&&current?.status!=='accepted'&&!ended&&<label className="assistant-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Opstelling en keeper gecontroleerd</label>}
        {!ended&&current&&change&&<>{editing?<section><h3>Volgende bezetting aanpassen</h3><p className="summary-note">Kies precies {state.team.fieldSize??6} aanwezige spelers en één geschikte keeper.</p>{players.filter(p=>state.availability[(state.catalog??demoCatalog()).liveMatchId]?.[p.id]==='available').map(p=><label className="assistant-check" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.name}</label>)}<label className="form-label">Keeper in aangepast advies<select value={keeper} onChange={e=>setKeeper(e.target.value)}>{players.filter(p=>selected.includes(p.id)&&(state.live.preparation?state.live.preparation.keeperIds.includes(p.id):(p.substitutionProfile?.goalkeeperEligible??(p.position==='K'||p.id===state.live.keeperId)))).map(p=><option key={p.id} value={p.id}>{p.shortName}</option>)}</select></label><button className="primary-button" type="button" disabled={busy||selected.length!==(state.team.fieldSize??6)||!selected.includes(keeper)} onClick={async()=>{if(await send({type:'assistant-adjust',id:current.plan.id,eventId:crypto.randomUUID(),expectedEpoch:epoch,field:selected,keeperId:keeper,now:Date.now()})){setEditing(false);setChecked(false);setError('');}else setError('Deze aanpassing is niet geldig of het advies is gewijzigd. Controleer spelers, keeper en minutenlimieten.');}}>Aangepast voorstel bewaren</button><button className="text-button" type="button" onClick={()=>setEditing(false)}>Annuleren</button></section>:
          <><div className="assistant-actions"><button type="button" className="primary-button" disabled={busy||current.status==='accepted'||state.live.elapsedMs===0&&!checked} onClick={()=>void decide('accept')}>Advies accepteren</button><button type="button" className="secondary-button" onClick={()=>{setSelected([...change.field]);setKeeper(change.keeperId);setEditing(true);}}>Aanpassen</button></div><div className="assistant-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>void decide('defer')}>2 min uitstellen</button><button type="button" className="text-button" disabled={busy} onClick={()=>void decide('skip')}>Overslaan</button></div><button type="button" className="primary-button" disabled={busy||current.status!=='accepted'||Boolean(current.deferUntilMs&&state.live.elapsedMs<current.deferUntilMs)} onClick={async()=>{if(await send({type:'assistant-execute',id:current.plan.id,eventId:crypto.randomUUID(),expectedEpoch:epoch,now:Date.now()})){setOpen(false);setChecked(false);}else setError('Uitvoering niet geregistreerd. Het advies is gewijzigd of past niet meer; bekijk het nieuwe voorstel.');}}>Wissel als uitgevoerd registreren</button><p className="summary-note">Gebruik dit pas nadat de spelers daadwerkelijk gewisseld zijn. Accepteren alleen telt geen minuten of wissel.</p></>}
        </>}
        <details><summary>Geplande wisselmomenten</summary><ol className="assistant-plan-list">{session.plan.intervals.map((s,i,array)=>{const before=i?array[i-1]:state.live;if(i===0&&s.field.every(id=>before.field.includes(id))&&s.keeperId===before.keeperId)return null;return <li key={`${s.startMs}-${i}`}><strong>{clock(s.startMs)}</strong><span>{before.field.filter(id=>!s.field.includes(id)).map(name).join(', ')||'Positiewissel'} → {s.field.filter(id=>!before.field.includes(id)).map(name).join(', ')||'Veld'}{s.keeperId!==before.keeperId&&<small>Keeper: {name(s.keeperId)}</small>}</span></li>;})}</ol></details>
        <details open><summary>Waarom deze wissel?</summary>{explainAdvice(session.plan.reasonCodes).map(text=><p key={text}>{text}</p>)}<p>Rotatie kijkt ook naar wachttijd op de bank, aaneengesloten speeltijd en eerdere wisselbeurten.</p><p className="summary-note">Eerlijkheid {Math.round(session.plan.scores.fairness*100)}% · Rotatie {Math.round(session.plan.scores.rotation*100)}% · Tactiek {session.plan.scores.tactical===null?'onbekend':`${Math.round(session.plan.scores.tactical*100)}%`}</p></details>
        <details><summary>Verwachte eindminuten</summary><div className="assistant-minutes"><div><strong>Speler</strong><strong>Totaal</strong><strong>Keeper</strong></div>{players.map(p=>{const m=session.plan.expectedEndMs[p.id];return m?<div key={p.id}><span>{p.shortName}</span><span>{minutes(m.playedMs)}</span><span>{minutes(m.keeperMs)}</span></div>:null;})}</div><p className="summary-note">Totalen zijn inclusief keeperminuten. Dit is een verwachting; alleen werkelijk gespeelde tijd telt in de registratie.</p></details>
        {!ended&&proposal.result&&<details><summary>Alternatieve plannen</summary>{proposal.result.result.scenarios.map((s,i)=><button key={s.id} type="button" className="settings-action-row" disabled={busy} onClick={()=>void makePlan(i)}>Plan {i+1} · score {Math.round(s.scores.total*100)}% · afwijking maximaal {minutes(s.fairnessErrorMs)} min</button>)}</details>}
        <details><summary>Adviesregistratie ({session.events.length})</summary>{session.events.slice(-20).reverse().map(e=><p className="summary-note" key={e.id}>{clock(e.matchMs)} · {{generated:'Voorstel berekend',accepted:'Geaccepteerd',deferred:'Uitgesteld',skipped:'Overgeslagen',adjusted:'Aangepast',executed:'Uitvoering bevestigd'}[e.kind]} · beleid v{e.policyVersion}</p>)}</details></>}
        {!ended&&<button type="button" className="secondary-button" disabled={busy||!proposal.result} onClick={()=>void makePlan()}>Opnieuw berekenen</button>}
        {error&&<p role="alert">{error}</p>}
      </div>
    </BottomSheet>
  </section>;
}

function LiveScreen() {
  const keyboard=useKeyboard();
  const { state, send, save, hasPendingSave, notify, navigate, players, matches, LIVE_MATCH_ID, name, teamName, archived, busy, persistence } = useCoach();
  const match = matches.find(m => m.id === LIVE_MATCH_ID);
  const live = state.live;
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalReceipt,setGoalReceipt]=useState<{text:string;side:"ours"|"theirs";count:number;checkSquad:boolean;matchId:string}|null>(null);
  useEffect(()=>{if(!goalReceipt||goalReceipt.checkSquad)return;const timer=setTimeout(()=>setGoalReceipt(null),8000);return()=>clearTimeout(timer);},[goalReceipt]);
  const [goalSide, setGoalSide] = useState<"ours"|"theirs">("ours");
  const [timingOpen, setTimingOpen] = useState(false);
  const timingTrigger=useRef<HTMLButtonElement>(null),goalTrigger=useRef<HTMLButtonElement>(null);
  useSheetReturnFocus(timingOpen,timingTrigger);useSheetReturnFocus(goalOpen,goalTrigger);
  const [finishOpen, setFinishOpen] = useState(false);
  const [shareOpen,setShareOpen]=useState(false);
  const [finishError,setFinishError]=useState('');
    const [keeperOpen, setKeeperOpen] = useState(false);
  const ended = archived || live.phase === "Einde";
  const [pickMatch, setPickMatch] = useState("");
  const candidates = orderedMatches(matches.filter(m => !isProcessed(state,m.id) && m.id !== LIVE_MATCH_ID));
  const picker = <section className="match-picker"><h2>Wedstrijd voorbereiden</h2><label className="form-label">Kies een wedstrijd<select aria-label="Live wedstrijd kiezen" value={pickMatch} onChange={e => setPickMatch(e.target.value)}><option value="">Kies een wedstrijd</option>{candidates.map(m => <option key={m.id} value={m.id}>{m.shortDate} · {m.opponent} · {m.venue}</option>)}</select></label><button type="button" className="primary-button" disabled={!pickMatch || busy || archived || !players.length} onClick={async () => { if (await send({ type: "prepare-match", matchId: pickMatch })) setPickMatch(""); }}>Deze wedstrijd voorbereiden</button></section>;
  const field = players.filter(p => live.field.includes(p.id));
  const bench = players.filter(p => !live.field.includes(p.id) && state.availability[LIVE_MATCH_ID]?.[p.id] !== "unavailable");
  if (!match || !players.length) return <main className="screen-content"><h1>Nog geen wedstrijd klaar</h1><p>{players.length ? "Kies hieronder welke wedstrijd je wilt bijhouden." : "Voeg eerst spelers toe aan je teambron."}</p>{picker}</main>;
  const previewRows = liveMatchRows(state);
  const score = scoreInVenueOrder(match,live.goals.length,live.awayGoals.length);
  const home = match.venue === "Thuis";
  const currentPeriodMs=live.periodTimes?.[`${live.periods}:${live.period}`];
  const attributedMs=Object.values(live.periodTimes??{}).reduce((total,ms)=>total+ms,0);
  const currentPeriodTime=currentPeriodMs===undefined?(live.elapsedMs===attributedMs?"00:00":"—"):clock(currentPeriodMs);
  const ourName=state.catalog?.clubName||teamName;
  const homeName = home ? ourName : match.opponent;
  const awayName = home ? match.opponent : ourName;
  const finish = async () => {setFinishError('');try{if(await(live.phase==="Einde"?save([]):send({type:"finish",now:Date.now()}))){setFinishOpen(false);setShareOpen(true);notify("Wedstrijd verwerkt in de statistieken");}else setFinishError("Verwerken is niet bevestigd. Je wedstrijdgegevens zijn lokaal bewaard. Sluit dit venster en gebruik Opnieuw bij je concept om de opslag te herstellen.");}catch{setFinishError("Verwerken is niet gelukt. Je lokale gegevens blijven bewaard. Probeer opnieuw.");}};
  const shareText=matchShareText(match,state.catalog?.clubName?`${ourName} ${teamName}`:teamName,live.goals,live.awayGoals,id=>players.find(p=>p.id===id)?.shortName??"Speler onbekend");
  const processed=!hasPendingSave&&live.phase==="Einde"&&state.stats.some(r=>r.matchId===match.id);
  const goalAction=(side:"ours"|"theirs")=><div className={`goal-action-column ${side}`} data-side={side}><button type="button" className={`goal-action ${side==="ours"?"home":"away"}`} ref={side===goalSide?goalTrigger:undefined} aria-label={side==="ours"?"Goal voor Speler of eigen doelpunt":"Tegengoal Tegenstander of eigen doelpunt"} disabled={busy||(side==="theirs"&&live.awayGoals.length>=99)} onClick={()=>{setGoalSide(side);setGoalOpen(true);}}><FootballIcon /><strong>{side==="ours"?"Goal":"Tegengoal"}</strong></button><button type="button" className="undo-button" aria-label={side==="ours"?"Laatste goal terug":"Tegengoal terugnemen"} disabled={busy||!(side==="ours"?live.goals.length:live.awayGoals.length)} onClick={()=>send(side==="ours"?{type:"undo-goal"}:{type:"away-goal",delta:-1})}><ResetIcon /></button></div>;
  return <main className="screen-content live-screen-v2">
    <section className="live-score-card" aria-labelledby="live-score-title"><h2 id="live-score-title" className="score-card-title">{ended ? "Eindstand" : `${match.shortDate} · ${match.time}`}</h2><div className="live-score-row"><div className="score-team"><span className="team-emblem"><img src={`/assets/coachmate/${home?"opponent":"blue"}-football-badge.png`} alt="" draggable={false} /></span><strong>{homeName}</strong><small>{home?`${teamName} · Thuis`:"Thuis"}</small></div><div className="live-score"><strong data-testid="score">{score[0]} <i>–</i> {score[1]}</strong><button type="button" className="score-time-trigger" ref={timingTrigger} aria-label="Bekijk wedstrijdtijden" aria-describedby="live-time-description" aria-haspopup="dialog" onClick={()=>setTimingOpen(true)}><span className="score-period">{ended?"Eindstand":periodLabel(live)} · </span><span data-testid="match-clock">{currentPeriodTime}</span><ChevronDownIcon /><span className="sr-only" id="live-time-description">{periodLabel(live)} · {currentPeriodTime} gespeeld</span></button></div><div className="score-team"><span className="team-emblem"><img src={`/assets/coachmate/${home?"blue":"opponent"}-football-badge.png`} alt="" draggable={false} /></span><strong>{awayName}</strong><small>{home?"Uit":`${teamName} · Uit`}</small></div></div></section>
    {ended ? <section className="local-note"><strong>Wedstrijd afgesloten.</strong> De cijfers staan bij Statistieken en kunnen daar worden gecorrigeerd.<button type="button" className="text-button" onClick={() => navigate("stats")}>Bekijk statistieken →</button></section> : null}
    {processed&&<button type="button" className="secondary-button match-share-action" onClick={()=>setShareOpen(true)}><Share2Icon aria-hidden="true"/>Deel eindstand via WhatsApp</button>}
    {ended && !archived && picker}
    {!ended&&<div className="match-action-toolbar"><section className="goal-action-row" aria-label="Doelpunten en wedstrijdklok">{goalAction(home?"ours":"theirs")}
    <section className="match-start-row" aria-label="Wedstrijd starten en stoppen"><span className="phase-badge" data-testid="match-phase"><i />{live.phase === "Rust" ? `${live.period+1}e ${live.periods===2 ? "helft" : "kwart"} · Rust` : periodLabel(live)}</span><button type="button" className="primary-button" disabled={ended || (!live.field.length && live.elapsedMs<120*60000)} onClick={async()=>{
      if(live.phase==="Rust") await send({type:"phase",now:Date.now()});
      else if(live.elapsedMs>=120*60000){if(live.period===live.periods)setFinishOpen(true);else await send({type:"phase",now:Date.now()});}
      else if(live.runningSince===null) await send({type:"toggle-clock",now:Date.now()});
      else if(live.period===live.periods){if(await send({type:"toggle-clock",now:Date.now()}))setFinishOpen(true);}
      else await send({type:"phase",now:Date.now()});
    }}>{live.runningSince===null && live.elapsedMs<120*60000 ? <PlayIcon /> : live.period===live.periods ? <CheckCircledIcon /> : <PauseIcon />}{ended ? "Einde" : live.runningSince===null && live.elapsedMs<120*60000 ? "Start" : live.period===live.periods ? "Affluiten" : "Rust"}</button></section>
    {goalAction(home?"theirs":"ours")}</section></div>}

    <SubstitutionAssistant ended={ended}/>
    <SubstitutionRoster ended={ended} onKeeper={()=>setKeeperOpen(true)} />
    {persistence}
    <MatchHistory home={home} />
    <BottomSheet open={timingOpen} onOpenChange={setTimingOpen} title="Wedstrijdtijden" description={`${match.opponent} · ${live.periods===2?"2 helften":"4 kwarten"}`} snap={0.68}><div className="timing-details"><section className="match-controls compact-match-data" aria-label="Wedstrijdbediening"><div className="period-times">{Array.from({length: live.periods}, (_, i) => <span className={live.period===i+1 ? "current-period" : ""} key={i}>{i + 1}e {live.periods === 2 ? "helft" : "kwart"}<strong>{live.periodTimes?.[`${live.periods}:${i + 1}`] === undefined ? (live.elapsedMs === 0 || i + 1 > live.period ? "00:00" : "?") : clock(live.periodTimes[`${live.periods}:${i + 1}`])}</strong></span>)}</div><dl className="match-time-totals"><div><dt>Speeltijd</dt><dd>{clock(live.elapsedMs)}</dd></div><div><dt>Rusttijd</dt><dd>{live.breakMs === undefined ? "—" : clock(live.breakMs)}</dd></div><div><dt>Totale tijd</dt><dd>{live.breakMs === undefined && live.elapsedMs>0 ? "—" : clock(live.elapsedMs+(live.breakMs??0))}</dd></div></dl>{live.elapsedMs > Object.entries(live.periodTimes ?? {}).filter(([key]) => key.startsWith(`${live.periods}:`)).reduce((sum, [,ms]) => sum + ms, 0) && <small className="period-time-note">Eerdere tijd zonder periode-indeling: {clock(live.elapsedMs - Object.entries(live.periodTimes ?? {}).filter(([key]) => key.startsWith(`${live.periods}:`)).reduce((sum, [,ms]) => sum + ms, 0))}</small>}</section><p className="timing-footnote">Rusttijd telt niet mee voor de speelminuten.</p></div></BottomSheet>
    {!ended&&<button type="button" className="primary-button end-match-button" disabled={busy} onClick={() => setFinishOpen(true)}><CheckCircledIcon /> Wedstrijddata verwerken</button>}
    <BottomSheet open={keeperOpen} onOpenChange={setKeeperOpen} title="Keeper wijzigen" description="Kies een speler uit het veld als keeper."><div className="goal-player-grid">{field.map(p=><button type="button" className="goal-player" key={p.id} onClick={async()=>{if(await send({type:"keeper",playerId:p.id,now:Date.now()}))setKeeperOpen(false);}}>{p.shortName}</button>)}</div><button type="button" className="secondary-button" onClick={()=>{setKeeperOpen(false);document.querySelector<HTMLElement>(".substitution-fallback summary")?.click();}}>Keeper wisselen met de bank</button></BottomSheet>
    <GoalEntrySheet open={goalOpen} side={goalSide} onOpenChange={setGoalOpen} onRegistered={(text,side,count,checkSquad)=>setGoalReceipt({text,side,count,checkSquad,matchId:match.id})}/>
    {goalReceipt&&goalReceipt.matchId===match.id&&<GoalReceipt><strong>{goalReceipt.text}</strong><div>{live.phase!=='Einde'&&(goalReceipt.side==='ours'?live.goals:live.awayGoals).length===goalReceipt.count&&<button type="button" className="text-button" disabled={busy} onClick={async()=>{if(await send(goalReceipt.side==='ours'?{type:'undo-goal'}:{type:'away-goal',delta:-1}))setGoalReceipt(null);}}>Ongedaan maken</button>}{goalReceipt.checkSquad&&<button type="button" className="text-button" onClick={()=>{keyboard.hide();document.querySelector('.substitution-section')?.scrollIntoView({block:'start',behavior:'smooth'});setGoalReceipt(null);}}>Opstelling controleren</button>}<button type="button" className="text-button" aria-label="Goalbevestiging sluiten" onClick={()=>setGoalReceipt(null)}>Sluiten</button></div></GoalReceipt>}
    <BottomSheet open={shareOpen&&processed} onOpenChange={setShareOpen} title="Wedstrijd verwerkt" description="Deel de eindstand en doelpunten via WhatsApp."><div className="match-share-content"><pre>{shareText}</pre><a className="primary-button" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">Open in WhatsApp</a><p className="summary-note">Kies in WhatsApp de ontvanger en verstuur het bericht zelf.</p></div></BottomSheet>
    <BottomSheet open={finishOpen} onOpenChange={setFinishOpen} title="Wedstrijd afsluiten?" description={`${homeName} · ${awayName} · ${match.shortDate}`} snap={0.85}><div className="finish-summary"><div className="finish-score"><strong>{score.join("–")}</strong><span>{goalsOnlyMatch(state,match.id)?"Speelronde 1 · 50 wedstrijdminuten":`${clock(live.elapsedMs)} gespeeld · ${previewRows.filter(r => r.present).length} aanwezig`}</span></div><div className={`finish-table ${goalsOnlyMatch(state,match.id)?"is-goals-only":""}`}><div className="finish-table-head"><span>Speler</span>{!goalsOnlyMatch(state,match.id)&&<><span>Min.</span><span>Keeper</span></>}<span>Goals</span></div>{previewRows.map(r => <div key={r.playerId}><strong>{name(r.playerId)}</strong>{!goalsOnlyMatch(state,match.id)&&<><span>{r.present ? r.minutes : "Afw."}</span><span>{r.keeperMinutes}</span></>}<span>{r.goals}</span></div>)}</div><p className="summary-note">Eigen doelpunten tegenstander: {live.goals.filter(g => g.ownGoal).length}. {live.goals.some(g=>!g.ownGoal&&g.playerId===null)&&`${live.goals.filter(g=>!g.ownGoal&&g.playerId===null).length} doelpunt(en) zonder bekende maker tellen alleen mee in de teamscore. `} {goalsOnlyMatch(state,match.id)?"Alleen spelersdoelpunten en 50 wedstrijdminuten tellen mee. De overige cijfers tellen vanaf speelronde 2.":"Minuten worden afgerond op hele minuten."}</p>{finishError&&<p className="editor-error" role="alert">{finishError}</p>}<button type="button" className="primary-button" disabled={busy} onClick={finish}>{busy ? "Verwerken…" : "Afsluiten en verwerken"}</button></div></BottomSheet>
  </main>;
}
function GoalReceipt({children}:{children:React.ReactNode}){
  const {screenRef}=useScreenPortal(),{bottomInset}=useKeyboardInsets();
  return screenRef.current?createPortal(<div className="goal-receipt" role="status" style={{bottom:`calc(var(--coach-nav-height,64px) + ${realDevice?'env(safe-area-inset-bottom,0px)':`${bottomInset}px`} + 8px)`}}>{children}</div>,screenRef.current):null;
}
function GoalEntrySheet({open,side,onOpenChange,onRegistered}:{open:boolean;side:"ours"|"theirs";onOpenChange:(open:boolean)=>void;onRegistered:(text:string,side:"ours"|"theirs",count:number,checkSquad:boolean)=>void}) {
  const {state,players,name,teamName,matches,LIVE_MATCH_ID,send,busy,archived}=useCoach();
  const [ownGoal,setOwnGoal]=useState(false),[selected,setSelected]=useState(""),[others,setOthers]=useState(false),[minute,setMinute]=useState(0);
  const [saving,setSaving]=useState(false),[error,setError]=useState(""),[savedScore,setSavedScore]=useState<string|null>(null);
  const submitting=useRef(false);
  useEffect(()=>{if(open){submitting.current=false;setSaving(false);setOwnGoal(false);setSelected("");setOthers(false);setError("");setSavedScore(null);setMinute(Math.floor(settleLive(state.live,Date.now()).elapsedMs/60000));}},[open,side,LIVE_MATCH_ID]);
  const match=matches.find(m=>m.id===LIVE_MATCH_ID);
  if(!match)return null;
  const ours=side==="ours",needsPlayer=ours!==ownGoal,unknown=selected==='unknown'&&ours&&!ownGoal;
  const club=state.catalog?.clubName||teamName;
  const field=players.filter(p=>state.live.field.includes(p.id)),otherPlayers=players.filter(p=>!state.live.field.includes(p.id));
  const validPlayer=unknown||players.some(p=>p.id===selected),offField=needsPlayer&&!unknown&&validPlayer&&!state.live.field.includes(selected);
  const unavailable=busy||saving||archived||state.live.phase==="Einde";
  const score=savedScore??scoreInVenueOrder(match,state.live.goals.length+(ours?1:0),state.live.awayGoals.length+(ours?0:1)).join('–');
  const scorer=needsPlayer?(unknown?'Maker onbekend':name(selected)):ours?'Eigen doelpunt tegenstander':'Tegenstander';
  const submit=async()=>{
    if(!open||submitting.current||unavailable||(needsPlayer&&!validPlayer))return;
    submitting.current=true;setSavedScore(score);setSaving(true);setError("");let recorded=false;
    try{
      const now=Date.now();
      const saved=await send(ours?{type:'goal',playerId:ownGoal||unknown?null:selected,ownGoal,unknownScorer:unknown,allowOffField:offField,minute,now}:{type:'away-goal',delta:1,...(ownGoal?{ownGoalPlayerId:selected}:{}),allowOffField:offField,minute,now});
      if(saved){recorded=true;onOpenChange(false);onRegistered(`${score} · ${scorer}${ownGoal&&needsPlayer?' (e.d.)':''} · ${minute}′`,side,(ours?state.live.goals:state.live.awayGoals).length+1,offField);}
      else setError('Niet bevestigd. Je keuze blijft staan. Probeer opnieuw.');
    }catch{setError('Niet bevestigd. Je keuze blijft staan. Probeer opnieuw.');}
    finally{if(!recorded){submitting.current=false;setSavedScore(null);}setSaving(false);}
  };
  const select=(id:string)=>{setSelected(id);setError('');};
  return <BottomSheet open={open} onOpenChange={next=>{if(!submitting.current)onOpenChange(next);}} title={ours?`Goal voor ${club}`:'Tegengoal'} snap={!ours&&!ownGoal?0.43:0.78}>
    <div className={`scoring-entry scoring-quick ${ours?'ours':'theirs'}`}>
      <p className="quick-score">Nieuwe stand <strong>{score}</strong><span>{minute}′</span></p>
      {needsPlayer&&<>
        {others?<><button type="button" className="text-button" disabled={saving} onClick={()=>{setOthers(false);setSelected('');}}>Terug naar veldspelers</button><h3 className="scoring-prompt">Andere wedstrijdspeler</h3></>:null}
        <div className="scorer-grid" role="group" aria-label={others?'Andere wedstrijdspelers':'Kies een speler'}>{(others?otherPlayers:field).map(p=><button type="button" className={`scorer-option ${selected===p.id?'is-selected':''}`} key={p.id} aria-label={`Kies ${p.shortName}`} aria-pressed={selected===p.id} disabled={unavailable||(!ownGoal&&state.live.goals.filter(g=>g.playerId===p.id).length>=99)} onClick={()=>select(p.id)}><span className="player-number">{p.number}</span><span className="scorer-name"><strong>{p.shortName}</strong>{others?<small>{state.availability[LIVE_MATCH_ID]?.[p.id]==='unavailable'?'Als afwezig geregistreerd':'Op de bank volgens de app'}</small>:p.id===state.live.keeperId?<small>Keeper</small>:null}</span></button>)}</div>
        {!others&&<button type="button" className="text-button scoring-secondary" disabled={saving} onClick={()=>setOthers(true)}>{ours&&!ownGoal?'Andere speler / onbekend':'Andere speler'}</button>}
        {others&&ours&&!ownGoal&&<button type="button" className={`secondary-button ${unknown?'is-selected':''}`} aria-pressed={unknown} disabled={saving} onClick={()=>select('unknown')}>Doelpuntenmaker nog onbekend</button>}
        {offField&&<p className="scoring-exception" role="status">{name(selected)} staat volgens de app {state.availability[LIVE_MATCH_ID]?.[selected]==='unavailable'?'als afwezig geregistreerd':'op de bank'}. Je kunt dit doelpunt registreren; de opstelling en bijgehouden minuten blijven ongewijzigd.</p>}
      </>}
      {!needsPlayer&&<p className="quick-goal-note">{ours?'Eigen doelpunt tegenstander. Geen goal bij een eigen speler.':`Doelpunt voor ${match.opponent}.`}</p>}
      {ownGoal&&needsPlayer&&<p className="scoring-own-note">Eigen doelpunt voor de tegenstander; telt niet bij de goals van deze speler.</p>}
      <button type="button" className="text-button scoring-secondary" disabled={saving} onClick={()=>{setOwnGoal(!ownGoal);setSelected('');setOthers(false);setError('');}}>{ownGoal?'Terug naar gewoon doelpunt':ours?'Eigen doelpunt tegenstander':'Eigen doelpunt van ons team'}</button>
      <div className="scoring-confirmation">{error&&<p className="scoring-error" role="alert">{error}</p>}<button type="button" className="primary-button scoring-confirm" disabled={unavailable||(needsPlayer&&!validPlayer)||(ours&&ownGoal&&state.live.goals.filter(g=>g.ownGoal).length>=99)} onClick={submit}>{saving?'Registreren…':needsPlayer&&!validPlayer?'Kies een speler':`Registreer · ${needsPlayer?scorer+' · ':''}${score}`}</button></div>
    </div>
  </BottomSheet>;
}

function MatchHistory({home}:{home:boolean}) {
  const {state,name,teamName,archived}=useCoach();
  const [edit,setEdit]=useState<{side:"ours"|"theirs";index:number}|null>(null);
  const [tab,setTab]=useState<"goals"|"swaps">("goals");
  const club=state.catalog?.clubName||teamName,live=state.live;
  const tabs=[{id:"goals",label:"Doelpunten",count:live.goals.length+live.awayGoals.length},{id:"swaps",label:"Wissels",count:live.swaps.length}] as const;
  return <Fold title="Wedstrijdverloop" className="match-history" defaultOpen><div role="tablist" aria-label="Wedstrijdverloop" className="history-tabs segmented">{tabs.map((item,i)=><button type="button" role="tab" id={`history-tab-${item.id}`} aria-controls={`history-panel-${item.id}`} aria-selected={tab===item.id} tabIndex={tab===item.id?0:-1} key={item.id} className={tab===item.id?"selected":""} onClick={()=>setTab(item.id)} onKeyDown={event=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();const next=tabs[event.key==="Home"?0:event.key==="End"?1:1-i];setTab(next.id);document.getElementById(`history-tab-${next.id}`)?.focus();}}}>{item.label}<span>{item.count}</span></button>)}</div>
    <div role="tabpanel" id="history-panel-goals" aria-labelledby="history-tab-goals" hidden={tab!=="goals"} tabIndex={0}><div className="goal-history-columns">{(home?["for","against"] as const:["against","for"] as const).map(side=><div className={`history-team ${side==="for"?"ours":"theirs"}`} key={side} data-side={side}><h3><span>{side==="for"?"Goal":"Tegengoal"}</span><small>{side==="for"?club:"Tegenstander"}</small></h3><ol data-testid={side==="for"?"goals-for":"goals-against"}>{(side==="for"?live.goals:live.awayGoals).map((g,i)=><li className="goal-event" key={g.sequence??i}><div className="event-meta"><span>{g.minute===null?"?′":`${g.minute}′`}</span><FootballIcon /><strong>{g.scoreFor===undefined?"—":home?`${g.scoreFor}–${g.scoreAgainst??0}`:`${g.scoreAgainst??0}–${g.scoreFor}`}</strong></div><strong className="event-player">{g.ownGoal?side==="for"?"Eigen doelpunt tegenstander":name(g.playerId):side==="for"?(g.playerId?name(g.playerId):"Maker onbekend"):"Tegenstander"}</strong>{g.ownGoal&&<small className="event-caption">Eigen doelpunt</small>}{g.minute===null&&<small className="event-caption">Tijd onbekend</small>}{g.scoreFor===undefined&&<small className="event-caption">Stand onbekend</small>}{!archived&&<button type="button" className="text-button goal-edit" aria-label={`Pas ${side==="for"?"goal":"tegengoal"} ${i+1} aan`} onClick={()=>setEdit({side:side==="for"?"ours":"theirs",index:i})}>Aanpassen</button>}</li>)}</ol>{!(side==="for"?live.goals:live.awayGoals).length&&<p className="history-empty">Nog geen doelpunten</p>}</div>)}</div></div>
    <div role="tabpanel" id="history-panel-swaps" aria-labelledby="history-tab-swaps" hidden={tab!=="swaps"} tabIndex={0}>{live.swaps.length?<ol className="swap-timeline">{live.swaps.map((swap,i)=><li key={i}><span className="swap-minute">{swap.minute}′</span><div className="swap-person"><small>Naar de bank</small><strong>{name(swap.out)}</strong></div><ArrowRightIcon /><div className="swap-person incoming"><small>In het veld</small><strong>{name(swap.in)}</strong></div></li>)}</ol>:<div className="history-empty-state"><ReloadIcon /><strong>Nog geen wissels</strong><p>Sleep een speler tussen veld en bank. Je wissels verschijnen hier.</p></div>}</div>
    {edit&&<GoalCorrection side={edit.side} index={edit.index} onClose={()=>setEdit(null)}/>}
  </Fold>;
}

function GoalCorrection({side,index,onClose}:{side:"ours"|"theirs";index:number;onClose:()=>void}){
  const {state,players,LIVE_MATCH_ID,send,busy,archived}=useCoach(),keyboard=useKeyboard();
  const event=(side==='ours'?state.live.goals:state.live.awayGoals)[index];
  const [original]=useState(()=>event?JSON.stringify(event):''),[matchId]=useState(LIVE_MATCH_ID);
  const [player,setPlayer]=useState(event?.playerId??''),[minute,setMinute]=useState(event?.minute===null?'':String(event?.minute??0)),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const personal=event&&(side==='ours'?!event.ownGoal:event.ownGoal),limit=Math.floor(state.live.elapsedMs/60000);
  const valid=minute===''||/^\d+$/.test(minute)&&Number(minute)<=limit;
  const save=async()=>{if(!event||!valid||busy||saving||archived)return;keyboard.hide();setSaving(true);setError('');try{if(await send({type:'edit-goal',side,index,expected:original,matchId,playerId:personal?player||null:null,minute:minute===''?null:Number(minute)}))onClose();else setError('Doelpunt gewijzigd of opslaan niet bevestigd. Sluit en open opnieuw om de actuele gegevens te controleren.');}catch{setError('Opslaan niet bevestigd. Je invoer blijft staan.');}finally{setSaving(false);}};
  return <BottomSheet open onOpenChange={next=>{if(!next&&!saving)onClose();}} title="Doelpunt aanpassen" snap={0.62}><div className="goal-correction">{personal&&<label className="form-label">Doelpuntenmaker<select aria-label="Doelpuntenmaker aanpassen" disabled={saving} value={player} onChange={e=>setPlayer(e.target.value)}>{!event.ownGoal&&<option value="">Nog onbekend</option>}{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<label className="form-label">Speelminuut<KeyboardInput aria-label="Speelminuut aanpassen" type="number" min={0} max={limit} step={1} value={minute} disabled={saving} onChange={e=>setMinute(e.target.value)}/></label><p className="summary-note">Leeg betekent tijd onbekend. Stand, opstelling, wissels en speelminuten veranderen niet.</p>{!valid&&<p role="alert">Kies een hele minuut tussen 0 en {limit}.</p>}{error&&<p role="alert">{error}</p>}<button type="button" className="primary-button" disabled={!event||!valid||busy||saving||archived} onClick={()=>void save()}>{saving?'Opslaan…':'Correctie opslaan'}</button></div></BottomSheet>;
}

type RosterDrag = { id:string; target:string; pointerId:number; x:number; y:number; moved:boolean; startX:number; startY:number; grabX:number; grabY:number; width:number; height:number };
function SubstitutionRoster({ended,onKeeper}:{ended:boolean;onKeeper:()=>void}) {
  const {state,players,LIVE_MATCH_ID,name,send,busy}=useCoach();
  const root=useRef<HTMLDivElement>(null), dragging=useRef<RosterDrag|null>(null);
  const nameGesture=useRef<{id:string;pointerId:number;x:number;y:number}|null>(null),suppressNameClick=useRef(false);
  const [drag,setDrag]=useState<RosterDrag|null>(null), [message,setMessage]=useState("");
  const [out,setOut]=useState(""),[incoming,setIncoming]=useState(""),[keySource,setKeySource]=useState("");
  const field=players.filter(p=>state.live.field.includes(p.id));
  const bench=players.filter(p=>!state.live.field.includes(p.id)&&state.availability[LIVE_MATCH_ID]?.[p.id]!=="unavailable");
  const disabled=ended||busy;
  const opposite=(a:string,b:string)=>a!==b && field.some(p=>p.id===a)!==field.some(p=>p.id===b) && [...field,...bench].some(p=>p.id===b);
  const cancel=()=>{nameGesture.current=null;dragging.current=null;setDrag(null);setKeySource("");};
  useEffect(()=>{const stop=(e:KeyboardEvent)=>{if(e.key==="Escape"){cancel();setMessage("Wissel geannuleerd.");}};window.addEventListener("keydown",stop);window.addEventListener("blur",cancel);return()=>{window.removeEventListener("keydown",stop);window.removeEventListener("blur",cancel);};},[]);
  useEffect(()=>{if(disabled)cancel();},[disabled]);
  const findTarget=(x:number,y:number,id:string)=>{
    const hit=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-roster-id]");
    const target=hit?.dataset.rosterId??"";
    return hit&&root.current?.contains(hit)&&opposite(id,target)?target:"";
  };
  // Handles claim immediately; name blocks claim only horizontal movement.
  const start=(e:React.PointerEvent<HTMLButtonElement>,id:string,fromMove=false,origin?:{x:number;y:number})=>{
    if(disabled||e.isPrimary===false||!fromMove&&e.pointerType==='mouse'&&e.button!==0)return;
    const row=e.currentTarget.closest<HTMLElement>('[data-roster-id]'),bounds=row?.getBoundingClientRect();
    if(!row||!bounds||!row.offsetWidth)return;
    const scale=bounds.width/row.offsetWidth,press=origin??{x:e.clientX,y:e.clientY};
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    const next={id,target:"",pointerId:e.pointerId,x:e.clientX,y:e.clientY,startX:press.x,startY:press.y,moved:false,grabX:(press.x-bounds.left)/scale,grabY:(press.y-bounds.top)/scale,width:row.offsetWidth,height:row.offsetHeight};
    dragging.current=next;setDrag(next);setMessage(`Sleep ${name(id)} naar een speler ${field.some(p=>p.id===id)?"op de bank":"in het veld"}.`);
    return next;
  };
  const move=(e:React.PointerEvent<HTMLButtonElement>)=>{
    const current=dragging.current;if(!current||current.pointerId!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();
    const next={...current,x:e.clientX,y:e.clientY,moved:current.moved||Math.hypot(e.clientX-current.startX,e.clientY-current.startY)>6,target:findTarget(e.clientX,e.clientY,current.id)};
    dragging.current=next;setDrag(next);
  };
  const exchange=async(a:string,b:string)=>{
    if(disabled||!opposite(a,b))return;
    const outId=state.live.field.includes(a)?a:b, inId=outId===a?b:a;
    if(await send({type:"swap",out:outId,in:inId,now:Date.now()})){
      setMessage(`${name(inId)} in het veld, ${name(outId)} naar de bank. Lokaal bewaard.`);setOut("");setIncoming("");
    }else setMessage("Wissel niet uitgevoerd. Controleer de melding en probeer opnieuw.");
  };
  const finish=(e:React.PointerEvent<HTMLButtonElement>,bubble=false)=>{
    const current=dragging.current;if(!current||current.pointerId!==e.pointerId)return;
    e.preventDefault();if(!bubble)e.stopPropagation();const target=findTarget(e.clientX,e.clientY,current.id);
    cancel();if(current.moved&&target)void exchange(current.id,target);else setMessage("Wissel geannuleerd. Laat los op een speler aan de andere kant.");
  };
  const nameDown=(e:React.PointerEvent<HTMLButtonElement>,id:string)=>{
    if(disabled||e.isPrimary===false||e.pointerType==='mouse'&&e.button!==0)return;
    suppressNameClick.current=false;
    nameGesture.current={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY};
  };
  const captureLost=(e:React.PointerEvent<HTMLButtonElement>)=>{
    const pointer=dragging.current?.pointerId??nameGesture.current?.pointerId??null;
    if(rosterCaptureLost(pointer,e.pointerId,e.target===e.currentTarget,e.currentTarget.hasPointerCapture(e.pointerId))){cancel();setMessage('Wissel geannuleerd.');}
  };
  const nameMove=(e:React.PointerEvent<HTMLButtonElement>)=>{
    if(dragging.current){move(e);return;}
    const candidate=nameGesture.current;if(!candidate||candidate.pointerId!==e.pointerId)return;
    const intent=rosterGesture(e.clientX-candidate.x,e.clientY-candidate.y);
    if(intent==='pending')return;
    nameGesture.current=null;
    if(intent==='scroll')return;
    suppressNameClick.current=true;const started=start(e,candidate.id,true,candidate);
    if(started){dragging.current={...started,moved:true};setDrag(dragging.current);}
  };
  // Keep the opposite column reachable for larger 8/11-player squads.
  useEffect(()=>{
    if(!drag)return;let frame=0,edgeSince=0,edgeDirection=0,lastFrame=0;
    const tick=(now:number)=>{const d=dragging.current,scroll=root.current?.closest<HTMLElement>(".mobile-scroll");if(d&&scroll){const box=scroll.getBoundingClientRect();const inside=d.moved&&d.x>=box.left&&d.x<=box.right&&d.y>=box.top&&d.y<=box.bottom;const direction=inside?(d.y<box.top+24?-1:d.y>box.bottom-24?1:0):0;if(direction!==edgeDirection){edgeDirection=direction;edgeSince=now;}if(direction&&now-edgeSince>=250){scroll.scrollTop+=direction*Math.min(12,Math.max(0,now-lastFrame)*.2);const next={...d,target:findTarget(d.x,d.y,d.id)};dragging.current=next;setDrag(next);}}lastFrame=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[Boolean(drag)]);
  const keyboardPick=(id:string)=>{if(!keySource){setKeySource(id);setMessage(`${name(id)} geselecteerd. Kies een speler aan de andere kant, of druk Escape.`);}else if(opposite(keySource,id)){void exchange(keySource,id);setKeySource("");}else {setKeySource(id);setMessage(`${name(id)} geselecteerd.`);}};
  const playerRow=(id:string)=>{
    const player=players.find(p=>p.id===id)!,keeper=id===state.live.keeperId;
    const target=drag?.target===id,eligible=Boolean((drag?.moved||keySource)&&opposite(drag?.id??keySource,id));
    return <div key={id} className={`roster-player ${target?"drop-target":""} ${eligible?"drop-eligible":""} ${drag?.moved&&drag.id===id?"is-dragging":""}`} data-roster-id={id}>
      <button type="button" className="roster-player-main" aria-label={keeper?`Keeper wijzigen: ${name(id)}`:name(id)} aria-describedby="substitution-help" disabled={disabled} onPointerDown={e=>nameDown(e,id)} onPointerMove={nameMove} onPointerUp={e=>{nameGesture.current=null;if(dragging.current)finish(e,true);}} onPointerCancel={()=>cancel()} onLostPointerCapture={captureLost} onClick={e=>{if(suppressNameClick.current&&e.detail!==0){e.preventDefault();e.stopPropagation();return;}if(keySource)keyboardPick(id);else if(keeper)onKeeper();else {setOut(field.some(p=>p.id===id)?id:"");setIncoming(bench.some(p=>p.id===id)?id:"");document.querySelector<HTMLDetailsElement>(".substitution-fallback")?.setAttribute("open","");}}}>
        <span className="player-number">{player.number}</span><span className="roster-player-name"><strong>{name(id)}</strong>{keeper&&<small>Keeper</small>}</span><small className="player-minutes">{Math.floor(state.live.played[id].milliseconds/60000)}<span> min</span></small>
      </button>
      <button type="button" className="player-drag-handle" aria-label={`Sleep ${name(id)}`} aria-describedby="substitution-help" aria-pressed={keySource===id} disabled={disabled} data-scroll-drag="ignore" onPointerDown={e=>start(e,id)} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{cancel();setMessage("Wissel geannuleerd.");}} onLostPointerCapture={captureLost} onClick={e=>{e.stopPropagation();if(e.detail===0)keyboardPick(id);}}><DragHandleDots2Icon /></button>
      {target&&<span className="drop-preview">{name(drag!.id)} ↔ {name(id)}<small>Laat los om te wisselen</small></span>}
    </div>;
  };
  const rect=root.current?.getBoundingClientRect(),scale=rect&&root.current?rect.width/root.current.offsetWidth:1;
  const controls=<div className="roster-hints"><p id="substitution-help" className="summary-note">{ended?"Opstelling bij afsluiten.":"Sleep het naamblok zijwaarts naar een speler aan de andere kant. Omhoog of omlaag vegen scrolt de lijst. Via de stippen kun je in elke richting slepen."}</p><p className="substitution-status" role="status" aria-live="polite">{message}</p>
    {!ended&&<details className="substitution-fallback"><summary>Wisselen zonder slepen</summary><div className="fallback-fields"><label className="form-label">Uit het veld<select aria-label="Speler uit het veld" value={out} onChange={e=>setOut(e.target.value)}><option value="">Kies een speler</option>{field.map(p=><option key={p.id} value={p.id}>{p.shortName}</option>)}</select></label><label className="form-label">Van de bank<select aria-label="Speler van de bank" value={incoming} onChange={e=>setIncoming(e.target.value)}><option value="">Kies een speler</option>{bench.map(p=><option key={p.id} value={p.id}>{p.shortName}</option>)}</select></label><button type="button" className="secondary-button" disabled={disabled||!out||!incoming} onClick={()=>void exchange(out,incoming)}>Spelers wisselen</button></div></details>}
    <p className="summary-note absent-list">Afwezig: {players.filter(p=>state.availability[LIVE_MATCH_ID]?.[p.id]==="unavailable").map(p=>p.shortName).join(", ")||"niemand"}</p></div>;
  return <section className="substitution-section" aria-label="Opstelling en wissels"><div className="roster-columns" ref={root}>
    <div className="field-roster"><h2>In het veld <span>· {field.length}</span></h2><h3>Keeper</h3>{field.filter(p=>p.id===state.live.keeperId).map(p=>playerRow(p.id))}<h3>Veldspelers</h3>{field.filter(p=>p.id!==state.live.keeperId).map(p=>playerRow(p.id))}</div>
    <div className="bench-roster"><h2>Bank <span>· {bench.length}</span></h2>{bench.map(p=>playerRow(p.id))}{!bench.length&&<p className="summary-note">Geen wisselspelers beschikbaar.</p>}{controls}</div>
    {drag?.moved&&rect&&<div className="dragged-player roster-drag-preview" aria-hidden="true" style={{...rosterDragPosition(drag,rect,scale,{x:drag.grabX,y:drag.grabY}),width:drag.width,height:drag.height,transformOrigin:`${drag.grabX}px ${drag.grabY}px`}}><span className="roster-drag-preview-main"><span className="player-number">{players.find(p=>p.id===drag.id)?.number}</span><span className="roster-player-name"><strong>{name(drag.id)}</strong>{drag.id===state.live.keeperId&&<small>Keeper</small>}</span><small className="player-minutes">{Math.floor(state.live.played[drag.id].milliseconds/60000)} min</small></span><span className="roster-drag-preview-handle"><DragHandleDots2Icon /></span></div>}
  </div>
  </section>;
}

function emptyRoundMatch(round:number):Match{return {id:crypto.randomUUID(),pool:'',date:'',shortDate:'',time:'09:30',opponent:'',venue:'Thuis',availabilityRound:round};}
function RoundEditor({ round, newRound, onSaved, onNext, initialRows, value, onRowsChange, submitLabel, readOnly=false, working=false, lockedIds=[] }: { round: number; newRound: boolean; onSaved: () => void; onNext?:(rows:Match[])=>void; initialRows?:Match[]; value?:Match[]; onRowsChange?:(rows:Match[])=>void; submitLabel?:string; readOnly?:boolean; working?:boolean; lockedIds?:string[] }) {
  const {send, busy, notify, draftScope} = useCoach();
  const keyboard=useKeyboard();
  const key=`coachmate:round-draft:${draftScope}:${round}`;
  const blank=():Match=>({id:crypto.randomUUID(),pool:"",date:"",shortDate:"",time:"09:30",opponent:"",venue:"Thuis",availabilityRound:round});
  const [localRows,setLocalRows]=useState<Match[]>(()=>{try {const saved=JSON.parse(readDraft(key)??"null"); if(Array.isArray(saved)&&saved.length&&saved.every(m=>m?.availabilityRound===round&&typeof m.id==='string')) return saved;}catch{} return initialRows?.length?initialRows:[blank()];});
  const rows=value??localRows;
  const setRows=(next:Match[]|((rows:Match[])=>Match[]))=>{const result=typeof next==='function'?next(rows):next;setLocalRows(result);onRowsChange?.(result);};
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(rows));}catch{}},[rows,key]);
  const update=(id:string,changes:Partial<Match>)=>setRows(previous=>previous.map(m=>m.id===id?{...m,...changes}:m));
  const collapseKey=`${key}:collapsed`;
  const [collapsed,setCollapsed]=useState<string[]>(()=>{try{const raw=readDraft(collapseKey);if(!raw&&onRowsChange)return rows.filter(m=>lockedIds.includes(m.id)).map(m=>m.id);const ids=JSON.parse(raw??'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];}catch{return [];}});
  useEffect(()=>{try{localStorage.setItem(collapseKey,JSON.stringify(collapsed));}catch{}},[collapseKey,collapsed]);
  const complete=(m:Match)=>Boolean(m.opponent.trim()&&roundDateValue(m.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time));
  const title=(m:Match,i:number)=>{const normalized=roundDateValue(m.date),date=normalized?new Date(normalized+'T12:00:00'):null;return [m.opponent.trim()||`Wedstrijd ${i+1}`,date&&!Number.isNaN(date.getTime())?date.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}).replace('.',''):''].filter(Boolean).join(' – ');};
  function fold(id:string){keyboard.hide();setCollapsed(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]);}

  const save=async()=>{
    if(!rows.length||rows.some(m=>!complete(m))){keyboard.hide();setCollapsed(ids=>ids.filter(id=>!rows.some(m=>m.id===id&&!complete(m))));setError("Vul voor iedere wedstrijd een tegenstander, datum en tijd in.");return;}
    keyboard.hide();setSaving(true);setError("");
    const matches=rows.map(m=>readOnly?m:({...m,date:roundDateValue(m.date),opponent:m.opponent.trim(),shortDate:new Date(roundDateValue(m.date)+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'}).replace('.','')}));
    if(onNext){onNext(matches);setSaving(false);return;}
    try {if(await send({type:newRound?'new-round':'add-matches',matches})){localStorage.removeItem(key);sessionStorage.removeItem(key);notify(`Ronde ${round}: ${matches.length} wedstrijden toegevoegd`);onSaved();}else setError("Opslaan mislukt. Je wedstrijden blijven als concept bewaard.");}catch{setError("Opslaan mislukt. Je wedstrijden blijven als concept bewaard.");}finally{setSaving(false);}
  };
  return <div className="round-editor">{!onRowsChange&&<p>Voer de wedstrijden voor speelronde {round} in. Eerdere wedstrijden en antwoorden blijven behouden.</p>}{rows.map((m,i)=><section className="team-settings round-match-editor" key={m.id}><div className="section-heading"><h3><button type="button" className="round-match-toggle" aria-expanded={!collapsed.includes(m.id)} aria-controls={`round-match-${m.id}`} onClick={()=>fold(m.id)}><span>{title(m,i)}</span><ChevronDownIcon aria-hidden="true"/></button></h3>{!readOnly&&rows.length>1&&!lockedIds.includes(m.id)&&<button type="button" className="text-button" disabled={working} aria-label={`Wedstrijd ${i+1} verwijderen`} onClick={()=>{keyboard.hide();setRows(rows.filter(row=>row.id!==m.id));}}>Verwijderen</button>}</div><fieldset className="round-match-fields" disabled={readOnly||working||busy} id={`round-match-${m.id}`} hidden={collapsed.includes(m.id)}><label className="form-label">Tegenstander<KeyboardInput aria-label={`Tegenstander ${i+1}`} value={m.opponent} maxLength={200} onChange={e=>update(m.id,{opponent:e.target.value})}/></label><label className="form-label">Datum<KeyboardInput aria-label={`Datum ${i+1}`} type="date" value={roundDateValue(m.date)} onChange={e=>update(m.id,{date:e.target.value})}/></label><label className="form-label">Tijd<KeyboardInput aria-label={`Tijd ${i+1}`} type="time" value={m.time} onChange={e=>update(m.id,{time:e.target.value})}/></label><label className="form-label">Thuis of uit<select aria-label={`Thuis of uit ${i+1}`} value={m.venue} onChange={e=>update(m.id,{venue:e.target.value as Match['venue']})}><option>Thuis</option><option>Uit</option></select></label><button type="button" className="text-button round-match-done" disabled={!complete(m)||busy||saving} onClick={()=>fold(m.id)}>Gereed</button></fieldset></section>)}{!readOnly&&<button type="button" className="secondary-button" disabled={busy||saving||working||rows.length>=30} onClick={()=>{keyboard.hide();setCollapsed(ids=>[...new Set([...ids,...rows.filter(complete).map(m=>m.id)])]);setRows([...rows,blank()]);}}><PlusIcon/> Nog een wedstrijd</button>}{error&&<p role="alert">{error}</p>}<button type="button" className="primary-button" disabled={busy||saving||working} onClick={()=>void save()}>{working?'Voorbereiden…':saving?'Opslaan…':submitLabel??(onNext?'Verder naar spelers':newRound?'Speelronde en wedstrijden opslaan':'Wedstrijden opslaan')}</button><p className="summary-note">{onRowsChange?'Uitnodigingen verstuur je daarna apart via Uitnodigingen bekijken.':onNext?'Lokaal concept. Er wordt nog niets opgeslagen in Google of verstuurd.':'Je kunt daarna de spelers kiezen en persoonlijke uitnodigingen voorbereiden.'}</p></div>;
}

function useInvitationMessage(formId:string){
  const {draftScope}=useCoach(),key=`coachmate:invitation-message:${draftScope}:${formId}`;
  const [message,setMessage]=useState(()=>{try{return normalizeInvitationMessage(readDraft(key)??defaultInvitationMessage)||defaultInvitationMessage;}catch{return defaultInvitationMessage;}});
  const [error,setError]=useState('');
  useEffect(()=>{try{localStorage.setItem(key,message);setError('');}catch{setError('Je bericht kan niet op dit apparaat worden bewaard.');}},[key,message]);
  return {message,setMessage:(value:string)=>{try{normalizeInvitationMessage(value);setMessage(value);setError('');}catch{setError('Gebruik maximaal 2000 tekens zonder besturingstekens.');}},error};
}
function InvitationPreview({input,channel,editor}:{input:InvitationInput;channel:string;editor?:{value:string;onChange:(value:string)=>void;disabled?:boolean;error?:string}}){
  const keyboard=useKeyboard(),parts=invitationParts(input);
  const link=channel==='email'?<a href={parts.url} target="_blank" rel="noreferrer">{parts.label}</a>:<p>{parts.label}<br/><span>{parts.url||'Persoonlijke link per speler'}</span></p>;
  return <section className="invitation-message-editor" aria-label="Uitnodigingsbericht"><div className="invitation-message-heading"><h4>{input.editing?'Wijzigingsbericht':'Uitnodigingstekst'}</h4>{editor&&<button type="button" className="text-button" disabled={editor.disabled} onClick={()=>{keyboard.hide();editor.onChange(defaultInvitationMessage);}}>Standaardtekst herstellen</button>}</div><div className="invitation-message-preview">{editor?<><p>{parts.intro.split('\n\n')[0]}</p><KeyboardTextarea aria-label="Uitnodigingstekst" value={editor.value} maxLength={2000} rows={3} disabled={editor.disabled} onChange={e=>editor.onChange(e.target.value)} onBlur={()=>keyboard.hide()}/></>:<p>{parts.intro}</p>}{link}{parts.instructions&&<p>{parts.instructions}</p>}<p>{parts.footer}</p></div>{editor?.error&&<p role="alert">{editor.error}</p>}</section>;
}
function DemoRoundInvitations({round,...options}:{round:number}&InvitationOptions){
  const store=useContext(Store)!,{players,draftScope}=useCoach();
  const key=`coachmate:demo-deliveries:${draftScope}:${round}`,formId=`demo-round-${round}`;
  const [deliveries,setDeliveries]=useState<FormDelivery[]>(()=>{try{return JSON.parse(readDraft(key)??'[]');}catch{return [];}});
  const form:AvailabilityForm={formId,round,matchId:'',url:'https://docs.google.com/forms/d/e/coachmate-demo/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}'};
  const invites=players.map(p=>({formId,playerId:p.id,code:`demo-${p.id}`,personalUrl:`${form.url}?entry.123=demo-${p.id}`}));
  const catalog={...(store.state.catalog??demoCatalog()),players:players.map(p=>({...p,parentEmail:`${p.id}@example.invalid`,parentName:p.parentName||p.parent||'Demo-ouder'}))};
  return <Store value={{...store,state:{...store.state,catalog},invites,deliveries,mailReady:true,refreshDistribution:async()=>{},checkForm:async()=>({...form,url:form.url!,published:true,accepting:true,issues:[],matchCount:store.state.catalog?.matches.filter(m=>m.availabilityRound===round).length??0}),sendInvitations:async(id,ids,batchId,_message,channel='email')=>{const next=[...deliveries,...ids.filter(playerId=>!deliveries.some(d=>d.batchId===batchId&&d.playerId===playerId)).map(playerId=>({formId:id,playerId,batchId,deliveryId:`${batchId}-${playerId}`,channel,status:'sent'}))];try{localStorage.setItem(key,JSON.stringify(next));setDeliveries(next);return true;}catch{return false;}}}}><p className="summary-note">Lokale demo · verzendingen worden alleen op dit apparaat nagebootst.</p><AvailabilityFormFlow form={form} {...options}/></Store>;
}
type InvitationOptions={initialChannel?:string;initialSelection?:string[];reviewOnly?:boolean;onRequested?:()=>void;onRecover?:()=>void;onChoicesChange?:(channel:string,ids:string[])=>void};
type WhatsAppDraft={playerId:string;name:string;phone?:string;message:string;batchId:string};
function AvailabilityFormFlow({form,initialChannel="email",initialSelection,reviewOnly=false,onRequested,onRecover,onChoicesChange}:{form:AvailabilityForm}&InvitationOptions) {
  const {players,matches,invites,seasonName,teamName,clubName,checkForm,sendInvitations,refreshDistribution,deliveries,mailReady,busy,archived,draftScope}=useCoach();
  const keyboard=useKeyboard(),custom=useInvitationMessage(form.formId);
  const pendingKey=`coachmate:invitation-batch:${draftScope}:${form.formId}`;
  const [pending,setPending]=useState<{id:string;playerIds:string[];message?:string}|null>(()=>{try{const v=JSON.parse(readDraft(pendingKey)??'null');if(v?.message!==undefined)normalizeInvitationMessage(v.message);return v&&typeof v.id==='string'&&Array.isArray(v.playerIds)?v:null;}catch{return null;}});
  const waKey=`coachmate:whatsapp-queue:${draftScope}:${form.formId}`;
  const [waSaved]=useState(()=>{try{return JSON.parse(readDraft(waKey)??'null');}catch{return null;}});
  const [drafts,setDrafts]=useState<WhatsAppDraft[]>(()=>Array.isArray(waSaved?.drafts)?waSaved.drafts.filter((d:WhatsAppDraft)=>players.some(p=>p.id===d.playerId)&&typeof d.message==='string'&&typeof d.batchId==='string'):[]);
  const [opened,setOpened]=useState<string[]>(Array.isArray(waSaved?.opened)?waSaved.opened:[]);
  const [attested,setAttested]=useState<WhatsAppDraft[]>(Array.isArray(waSaved?.attested)?waSaved.attested:[]);
  const [confirmed,setConfirmed]=useState<string[]>(Array.isArray(waSaved?.confirmed)?waSaved.confirmed:[]);
  const channelKey=`coachmate:invitation-channel:${draftScope}:${form.formId}`;
  const [channel,setChannel]=useState(()=>{try{const saved=readDraft(channelKey);return saved==='email'||saved==='whatsapp'?saved:initialChannel;}catch{return initialChannel;}}),[list,setList]=useState<InvitationFilter>('all'),[composing,setComposing]=useState(false),[recipient,setRecipient]=useState<string|null>(null);
  useEffect(()=>{try{localStorage.setItem(channelKey,channel);}catch{}},[channelKey,channel]);
  const rows=deliveries.filter(d=>d.formId===form.formId);
  const inviteFor=(id:string)=>invites.find(i=>i.formId===form.formId&&i.playerId===id);
  const deliveryFor=(id:string)=>[...rows].reverse().find(d=>d.playerId===id&&['queued','processing','sent','uncertain'].includes(d.status))??[...rows].reverse().find(d=>d.playerId===id);
  const progress=(id:string)=>invitationProgress({submitted:Boolean(inviteFor(id)?.submittedAt||inviteFor(id)?.responseId||inviteFor(id)?.editUrl),delivery:deliveryFor(id),confirmed:confirmed.includes(id),attested:attested.some(d=>d.playerId===id),opened:opened.includes(id)});
  const wasInvited=(id:string)=>progress(id).blocked;
  const remaining=players.filter(p=>!wasInvited(p.id)),sent=players.filter(p=>wasInvited(p.id));
  const eligible=(p:Player,c=channel)=>!wasInvited(p.id)&&Boolean(inviteFor(p.id))&&(c==='whatsapp'||parentEmailValid(p.parentEmail));
  const available=players.filter(p=>eligible(p));
  const selectionKey=`coachmate:invitation:${draftScope}:${form.formId}:${channel}`;
  const [selected,setSelected]=useState<string[]>(()=>{try{const saved=JSON.parse(readDraft(selectionKey)??'null');return pending?.playerIds??initialSelection??(Array.isArray(saved)?saved:Array.isArray(waSaved?.queue)?waSaved.queue:available.map(p=>p.id));}catch{return available.map(p=>p.id);}});
  const [status,setStatus]=useState<FormStatus|null>(null),[error,setError]=useState(''),[sending,setSending]=useState(false),[editingPlayer,setEditingPlayer]=useState<string|null>(null);
  const picked=available.filter(p=>selected.includes(p.id));
  const waiting=rows.some(d=>['queued','processing'].includes(d.status));
  const count=matches.filter(m=>form.matchId?m.id===form.matchId:m.availabilityRound===Number(form.round)).length;
  const ready=status?.published===true&&status.accepting===true&&!status.issues.length&&Boolean(form.prefillDefaults??status.prefillDefaults);
  useEffect(()=>{onChoicesChange?.(channel,selected);},[channel,selected]);
  useEffect(()=>{try{localStorage.setItem(selectionKey,JSON.stringify(selected));}catch{setError('De selectie kan niet op dit apparaat worden bewaard.');}},[selectionKey,selected]);
  useEffect(()=>{try{localStorage.setItem(waKey,JSON.stringify({drafts,opened,confirmed,attested,legacy:waSaved?.legacy??(waSaved?.queue?.length?waSaved:null)}));}catch{setError('De WhatsApp-concepten kunnen niet op dit apparaat worden bewaard. Houd dit scherm open.');}},[waKey,drafts,opened,confirmed,attested]);
  async function verify(){setError('');try{setStatus(await checkForm(form.formId));}catch{setError('Het formulier kon niet worden gecontroleerd. Probeer opnieuw.');}}
  useEffect(()=>{let active=true;void checkForm(form.formId).then(result=>{if(active)setStatus(result);}).catch(()=>{if(active)setError('Het formulier kon niet worden gecontroleerd.');});return()=>{active=false;};},[form.formId,form.statusQuestion]);
  useEffect(()=>{if(pending&&deliveries.some(d=>d.batchId===pending.id)){localStorage.removeItem(pendingKey);setPending(null);setComposing(false);onRequested?.();}},[deliveries,pending,pendingKey]);
  useEffect(()=>{if(!waiting&&!pending)return;const timer=setInterval(()=>{void refreshDistribution().catch(()=>setError('De status is tijdelijk niet bereikbaar. Er wordt niets opnieuw verstuurd.'));},5000);return()=>clearInterval(timer);},[waiting,Boolean(pending)]);
  function inputFor(player:Player,editing=false):InvitationInput {
    const invite=inviteFor(player.id),start=invite?.personalUrl||personalFormUrl(status?.url??form.url??'',status?.codeEntryId??form.codeEntryId,invite?.code??'',status?.prefillDefaults??form.prefillDefaults);
    const long=editing?invite?.editUrl??'':start;
    const short=editing?safeShortFormUrl(invite?.shortEditUrl,invite?.shortEditUrlSource,long):safeShortFormUrl(invite?.shortUrl,invite?.shortUrlSource,long);
    return {playerName:player.name,shortName:player.shortName,parentName:player.parentName||player.parent,teamName:`${clubName?clubName+' · ':''}${teamName}`,seasonName,round:Number(form.round),count,url:short||long,editing,message:pending?.message??custom.message};
  }
  function choose(ids:string[]){keyboard.hide();setSelected(ids);setDrafts([]);setOpened([]);setError('');}
  async function sendSelected(){
    if(!ready||!mailReady||!picked.length||sending||busy||archived)return;
    const batch=pending??{id:crypto.randomUUID(),playerIds:picked.map(p=>p.id),message:custom.message};
    try{localStorage.setItem(pendingKey,JSON.stringify(batch));}catch{setError('De verzendactie kan niet veilig worden bewaard. Er is niets verstuurd.');return;}
    keyboard.hide();setPending(batch);setSending(true);setError('');
    try{if(await sendInvitations(form.formId,batch.playerIds,batch.id,batch.message)){onRequested?.();setComposing(false);setList('all');}else setError('Verzending niet bevestigd. De bewaarde selectie en tekst blijven behouden. Controleer eerst de status.');}finally{setSending(false);}
  }
  function prepareWhatsApp(){
    keyboard.hide();const next=picked.map(p=>({playerId:p.id,name:p.name,phone:p.parentPhone,message:invitationText(inputFor(p)),batchId:crypto.randomUUID()}));
    try{localStorage.setItem(waKey,JSON.stringify({drafts:next,opened:[],confirmed,attested,legacy:waSaved?.legacy??(waSaved?.queue?.length?waSaved:null)}));setDrafts(next);setOpened([]);setError('');onRequested?.();}catch{setError('De berichten kunnen niet veilig worden bewaard. Er is niets klaargezet.');}
  }
  async function confirmWhatsApp(draft:WhatsAppDraft){
    if(sending||busy||archived)return;keyboard.hide();setError('');
    const attempts=attested.some(d=>d.playerId===draft.playerId)?attested:[...attested,draft];
    try{localStorage.setItem(waKey,JSON.stringify({drafts,opened,confirmed,attested:attempts,legacy:waSaved?.legacy}));setAttested(attempts);}catch{setError('De bevestiging kan niet veilig op dit apparaat worden bewaard. Probeer opnieuw.');return;}
    setSending(true);
    try{if(await sendInvitations(form.formId,[draft.playerId],draft.batchId,undefined,'whatsapp')){const next=[...new Set([...confirmed,draft.playerId])];localStorage.setItem(waKey,JSON.stringify({drafts,opened,confirmed:next,attested:attempts,legacy:waSaved?.legacy}));setConfirmed(next);onRequested?.();}else setError('Je hebt dit bericht verstuurd. De registratie is nog niet opgeslagen; probeer dezelfde bevestiging opnieuw.');}catch{setError('Je bevestiging is lokaal bewaard. Registratie opnieuw proberen zodra er verbinding is.');}finally{setSending(false);}
  }
  function confirmationFor(player:Player){return attested.find(d=>d.playerId===player.id)??drafts.find(d=>d.playerId===player.id)??{playerId:player.id,name:player.name,phone:player.parentPhone,message:'',batchId:crypto.randomUUID()};}
  useEffect(()=>{const resume=()=>{if(document.visibilityState==='hidden')return;const id=opened.find(id=>!progress(id).sent&&!attested.some(d=>d.playerId===id));if(id){keyboard.hide();setRecipient(id);setComposing(false);}};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);return()=>{window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};},[opened,confirmed,attested,deliveries]);
  const editing=players.find(p=>p.id===editingPlayer),chosen=picked[0];
  const labels:Record<string,string>={queued:'In wachtrij',processing:'Wordt verstuurd',sent:'Verstuurd',failed:'Niet verstuurd',uncertain:'Controle nodig'};
  if(editing){const input=inputFor(editing,true),message=invitationText(input);return <div className="invitation-flow"><button type="button" className="text-button" onClick={()=>setEditingPlayer(null)}><ChevronLeftIcon/>Terug naar spelers</button><h3>{editing.name}</h3><InvitationPreview input={input} channel="whatsapp"/><a className="primary-button" href={whatsappInviteUrl(editing.parentPhone,message)} target="_blank" rel="noreferrer">Wijzigingslink via WhatsApp nasturen</a>{parentPhoneNumber(editing.parentPhone)&&<a className="secondary-button" href={whatsappInviteUrl(editing.parentPhone,message,true)} target="_blank" rel="noreferrer">Open wijzigingsbericht in WhatsApp Web</a>}<p className="summary-note">Dit opent een bericht. Je verstuurt het zelf; de bestaande antwoorden blijven in het formulier staan.</p></div>;}
  return <div className="invitation-flow">
    {!reviewOnly&&!composing&&<>
      {recipient?(()=>{const player=players.find(p=>p.id===recipient);if(!player)return null;const item=progress(player.id),invite=inviteFor(player.id);return <section className="invitation-player-detail"><button type="button" className="text-button" onClick={()=>{keyboard.hide();setRecipient(null);}}>Terug naar spelers</button><h3>{player.name}</h3><p>{item.invitation}</p><p>{item.answer}</p>{deliveryFor(player.id)?.error&&<p role="alert">{deliveryFor(player.id)?.error}</p>}{item.needsConfirmation&&!archived&&<><p>Heb je de uitnodiging aan {player.shortName} al via WhatsApp verstuurd?</p><button type="button" className="primary-button" disabled={sending||busy} onClick={()=>void confirmWhatsApp(confirmationFor(player))}>{attested.some(d=>d.playerId===player.id)?'Registratie opnieuw proberen':'Ja, verstuurd via WhatsApp'}</button><button type="button" className="text-button" onClick={()=>{setOpened(ids=>ids.filter(id=>id!==player.id));setRecipient(null);}}>Nog niet / terug</button></>}{invite?.editUrl&&<button type="button" className="secondary-button" disabled={archived} onClick={()=>{keyboard.hide();setEditingPlayer(player.id);}}>Wijzigingslink nasturen</button>}{!invite?.editUrl&&<p className="summary-note">Een wijzigingslink is beschikbaar na de eerste inzending.</p>}</section>;})():<>
      {remaining.length>0&&<button type="button" className="primary-button" disabled={archived} onClick={()=>{keyboard.hide();setComposing(true);}}>Spelers uitnodigen · {remaining.length}</button>}<label className="form-label">Spelers bekijken<select aria-label="Uitnodigingen filteren" value={list} onChange={e=>setList(e.target.value as InvitationFilter)}><option value="all">Alle spelers ({players.length})</option><option value="invite">Uitnodigen ({remaining.length})</option><option value="waiting">Wacht op antwoord ({players.filter(p=>progress(p.id).waiting).length})</option><option value="answered">Gereageerd ({players.filter(p=>progress(p.id).answered).length})</option></select></label>
      <div className="invitation-recipients invitation-overview">{players.filter(p=>invitationMatches(list,progress(p.id))).map(player=>{const item=progress(player.id);return <button type="button" className="invitation-overview-row" key={player.id} onClick={()=>{keyboard.hide();setRecipient(player.id);}}><span><strong>{player.name}</strong><small>{item.invitation}</small><small>{item.answer}</small></span><ChevronRightIcon/></button>;})}</div>
      {!players.some(p=>invitationMatches(list,progress(p.id)))&&<p className="summary-note">Geen spelers in dit overzicht.</p>}
      
      {drafts.some(d=>!progress(d.playerId).sent)&&<button type="button" className="secondary-button" onClick={()=>{setChannel('whatsapp');setComposing(true);}}>WhatsApp-berichten hervatten</button>}
      </>}
    </>}
    {!reviewOnly&&composing&&<><button type="button" className="text-button" onClick={()=>{keyboard.hide();setComposing(false);}}>Terug naar uitnodigingen</button><ScreenTabs id={`invite-channel-${form.formId}`} label="Versturen via" value={channel} onChange={next=>{if(pending||waiting||next===channel)return;setChannel(next);if(next==='whatsapp'&&drafts.length)setSelected(drafts.map(d=>d.playerId));else choose(players.filter(p=>eligible(p,next)).map(p=>p.id));}} items={[{id:'email',label:'E-mail'},{id:'whatsapp',label:'WhatsApp'}]}/>
    {!drafts.length&&<><div className="invitation-selection-head"><h4>Spelers <span>{picked.length} van {available.length} geselecteerd</span></h4><button type="button" className="text-button" disabled={sending||busy||waiting||Boolean(pending)} onClick={()=>choose(picked.length===available.length?[]:available.map(p=>p.id))}>{picked.length===available.length?'Selectie wissen':'Selecteer alle spelers'}</button></div><div className="invitation-recipients">{remaining.map(player=><label className="invitation-recipient" key={player.id}><input type="checkbox" aria-label={`Uitnodiging voor ${player.name}`} checked={selected.includes(player.id)&&eligible(player)} disabled={!eligible(player)||sending||busy||waiting||Boolean(pending)} onChange={e=>choose(e.target.checked?[...selected,player.id]:selected.filter(id=>id!==player.id))}/><span><strong>{player.name}</strong><small>{!inviteFor(player.id)?'Persoonlijke link ontbreekt':channel==='email'?parentEmailValid(player.parentEmail)?player.parentEmail:'E-mailadres ontbreekt of ongeldig':parentPhoneNumber(player.parentPhone)?player.parentPhone:'Kies de ouder in WhatsApp'}</small></span></label>)}</div></>}
    </>}
    {reviewOnly&&<section className="invitation-review"><h3>{picked.length} ontvangers · {channel==='email'?'E-mail':'WhatsApp'}</h3><p>{picked.map(p=>p.shortName).join(' · ')}</p></section>}
    {(reviewOnly||composing)&&<>{chosen&&!drafts.length&&<><InvitationPreview input={inputFor(chosen)} channel={channel} editor={{value:pending?.message??custom.message,onChange:custom.setMessage,error:custom.error,disabled:sending||busy||waiting||Boolean(pending)}}/><p className="summary-note">Voornaam ouder, speler en ronde worden automatisch ingevuld. In je tekst kun je {'{parentName}'}, {'{shortName}'} en {'{speelronde}'} gebruiken.</p></>}
    {status&&!ready&&<p className="invitation-notice" role="alert">Het formulier is nog niet klaar voor ouders.{onRecover&&<button type="button" className="text-button" onClick={onRecover}>Naar instellingen</button>}</p>}{!status&&<button type="button" className="text-button" onClick={()=>void verify()}>Formulier opnieuw controleren</button>}
    {channel==='email'&&<>{!mailReady&&<p className="invitation-notice">De verzendkoppeling moet eenmalig worden geactiveerd via Instellingen.</p>}<button type="button" className="primary-button" disabled={!ready||!mailReady||!picked.length||sending||busy||archived||waiting} onClick={()=>void sendSelected()}>{sending?'Klaarzetten…':waiting?'Berichten worden verstuurd…':pending?'Controleer en hervat verzendactie':`Verstuur ${picked.length} ${picked.length===1?'persoonlijke e-mail':'persoonlijke e-mails'}`}</button></>}
    {channel==='whatsapp'&&<>{!drafts.length?<><p className="summary-note">Alle persoonlijke berichten worden samen op dit apparaat klaargezet. Open daarna ieder gesprek in WhatsApp of WhatsApp Web en verstuur het zelf. CoachMate kan geen drafts rechtstreeks in WhatsApp opslaan.</p><button type="button" className="primary-button" disabled={!ready||!picked.length||archived} onClick={prepareWhatsApp}>Zet {picked.length} WhatsApp-berichten klaar</button></>:<section className="whatsapp-drafts" aria-label="Klaargezette WhatsApp-berichten"><h3>Persoonlijke WhatsApp-berichten</h3>{drafts.map((d,index)=>{const sent=progress(d.playerId).sent;return <details className="whatsapp-draft" key={d.batchId} open={index===0||undefined}><summary><span>{d.name}<small>{sent?'Verstuurd':opened.includes(d.playerId)?'Verzending nog bevestigen':'Klaar om te versturen'}</small></span><ChevronDownIcon/></summary>{sent?<p>Deze speler is uitgenodigd. Gebruik voor aanpassingen de aparte wijzigingslink.</p>:<><p className="whatsapp-message">{d.message}</p><a className="primary-button" href={whatsappInviteUrl(d.phone,d.message)} target="_blank" rel="noreferrer" onClick={()=>setOpened(ids=>[...new Set([...ids,d.playerId])])}>Open persoonlijk bericht in WhatsApp</a>{parentPhoneNumber(d.phone)&&<a className="secondary-button" href={whatsappInviteUrl(d.phone,d.message,true)} target="_blank" rel="noreferrer" onClick={()=>setOpened(ids=>[...new Set([...ids,d.playerId])])}>Open in WhatsApp Web</a>}<button type="button" className="secondary-button" disabled={!opened.includes(d.playerId)||sending||busy||archived} onClick={()=>void confirmWhatsApp(d)}>Ik heb dit bericht verstuurd</button></>}</details>;})}<button type="button" className="text-button" onClick={()=>{setDrafts([]);setOpened([]);}}>Selectie of tekst aanpassen</button></section>}</>}
    </>}
    {rows.length>0&&<section className="invitation-delivery-summary" aria-label="Verzendstatus"><p>{rows.filter(r=>r.status==='sent').length} bevestigd verstuurd · {rows.filter(r=>['queued','processing'].includes(r.status)).length} in behandeling</p><button type="button" className="text-button" disabled={busy} onClick={()=>{void refreshDistribution().catch(()=>setError('Verzendstatus ophalen mislukt.'));}}>Verzendstatus bijwerken</button></section>}
    {rows.some(r=>r.status==='uncertain')&&<p role="alert">Van een bericht is de verzending onzeker. Controleer dit voordat je opnieuw verstuurt.</p>}{error&&<p role="alert">{error}</p>}
  </div>;
}

function AdvancedAvailabilityForm({form}:{form:AvailabilityForm}) {
  const {checkForm,saveFormLink,refreshForms,invites,players,matches,seasonName,teamName,clubName,busy,archived,draftScope,deliveries}=useCoach();
  const custom=useInvitationMessage(form.formId);
  const templateKey=`coachmate:form-link:${draftScope}:${form.formId}`;
  const [template,setTemplate]=useState(()=>readDraft(templateKey)??"");
  const [editingLink,setEditingLink]=useState(false);
  useEffect(()=>{try{if(template)localStorage.setItem(templateKey,template);else localStorage.removeItem(templateKey);}catch{}},[template,templateKey]);
  const [status,setStatus]=useState<FormStatus|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState(""),[copied,setCopied]=useState(""),[legacyChecked,setLegacyChecked]=useState(false);
  const count=matches.filter(match=>form.matchId?match.id===form.matchId:match.availabilityRound===Number(form.round)).length;
  const ready=status?.published===true&&status.accepting===true&&!status.issues.length&&Boolean(status.url);
  const canShare=ready||Boolean(legacyChecked&&status?.published===null&&!status.issues.length&&status.url);
  const codes=invites.filter(invite=>invite.formId===form.formId&&players.some(player=>player.id===invite.playerId));
  async function verify(){setChecking(true);setError("");setStatus(null);setLegacyChecked(false);try{setStatus(await checkForm(form.formId));}catch{setError("Controleren lukt niet. Controleer de Google-verbinding en probeer opnieuw.");}finally{setChecking(false);}}
  const personalLink=(code:string)=>(status?.prefillDefaults??form.prefillDefaults)?personalFormUrl(status?.url??form.url??"",status?.codeEntryId??form.codeEntryId,code,status?.prefillDefaults??form.prefillDefaults):"";
  async function saveTemplate(){setError("");if(await saveFormLink(form.formId,template)){setTemplate("");setEditingLink(false);await verify();}else setError("Opslaan niet bevestigd. Je link blijft als concept bewaard.");}
  function invitation(playerId:string,code:string,editing=false){
    const row=codes.find(i=>i.playerId===playerId),player=players.find(p=>p.id===playerId),long=editing?row?.editUrl??'':personalLink(code);
    return invitationText({playerName:player?.name??'',shortName:player?.shortName,parentName:player?.parentName||player?.parent,teamName:(clubName?clubName+' · ':'')+teamName,seasonName,round:Number(form.round),count,message:custom.message,url:(editing?safeShortFormUrl(row?.shortEditUrl,row?.shortEditUrlSource,long):safeShortFormUrl(row?.shortUrl,row?.shortUrlSource,long))||long,editing});
  }
  async function copyInvite(playerId:string,code:string){
    if(!canShare||!status||!personalLink(code))return;
    try{await navigator.clipboard.writeText(invitation(playerId,code));setCopied(playerId);}
    catch{setError("Kopiëren lukt hier niet. Kopieer de ouderlink en persoonlijke code hieronder.");}
  }
  return <div className="form-flow">
    <ol className="form-flow-steps">
      <li><strong>Controleer en publiceer</strong><p>{count} wedstrijden in dit formulier. Behoud de wedstrijdvragen en persoonlijke code. Gebruik Aanwezig/Afwezig; oudere Ja/Nee-formulieren blijven werken. Zet in Instellingen → Antwoorden het bewerken van reacties aan. Publiceer in Google Forms en controleer of ouders met de link mogen reageren.</p><a className="settings-action-row" href={`https://docs.google.com/forms/d/${encodeURIComponent(form.formId)}/edit`} target="_blank" rel="noreferrer">Formulier controleren en publiceren <ChevronRightIcon/></a><button type="button" className="text-button" disabled={checking||busy} onClick={()=>void verify()}><ReloadIcon/>{checking?"Publicatie controleren…":"Publicatie controleren"}</button>
        {status&&<div className={`form-check-result ${ready?"is-ready":""}`} role="status"><strong>{ready?"Klaar voor ouders":status.issues.length?"Formulier controleren":status.published===null?"Publicatie handmatig controleren":status.published?"Reacties staan uit":"Nog niet gepubliceerd"}</strong>{status.issues.map(issue=><p key={issue}>{issue}</p>)}{!ready&&!status.issues.length&&<p>{status.published===null?"Dit oudere formulier geeft geen publicatiestatus door. Controleer de ouderlink in Google Forms.":"Open Google Forms, publiceer het formulier en zet het ontvangen van reacties aan. Controleer daarna opnieuw."}</p>}</div>}
      </li>
      <li><strong>Deel persoonlijk met ouders</strong><p>Elke speler krijgt een eigen startlink met de code al ingevuld. De spelerslijst staat niet op het formulier. Alle wedstrijden staan vooraf op Aanwezig. Ouders controleren de keuzes en versturen alles samen met Verzenden.</p>{status?.url&&!status.issues.length&&(ready||status.published===null)&&<a className="text-button" href={status.url} target="_blank" rel="noreferrer">Ouderformulier openen <ChevronRightIcon/></a>}
        {status?.published===null&&!status.issues.length&&status.url&&<label className="form-legacy-check"><input type="checkbox" checked={legacyChecked} onChange={e=>setLegacyChecked(e.target.checked)}/>Ik heb de ouderlink in Google Forms gecontroleerd</label>}{canShare&&(editingLink||!(status?.prefillDefaults??form.prefillDefaults))&&!archived&&<div className="form-link-setup"><h4>Eenmalig persoonlijke links instellen</h4><p>Open in Google Forms Meer → Formulier vooraf invullen. Vul Persoonlijke code in met <code>{PREFILL_MARKER}</code>, kies bij iedere wedstrijd Aanwezig en kies Link ophalen. Plak die link hieronder. Dit verstuurt geen antwoord.</p><label className="form-label">Google-link voor persoonlijke codes<KeyboardInput aria-label="Google-link voor persoonlijke codes" value={template} maxLength={3000} onChange={e=>setTemplate(e.target.value)} placeholder="https://docs.google.com/forms/…"/></label><button type="button" className="secondary-button" disabled={busy||!template} onClick={()=>void saveTemplate()}>Persoonlijke links opslaan</button></div>}{canShare&&!editingLink&&(status?.prefillDefaults??form.prefillDefaults)&&!archived&&<button type="button" className="text-button" onClick={()=>setEditingLink(true)}>Persoonlijke links bijwerken</button>}{canShare?<details className="form-invitations"><summary>Persoonlijke links en {codes.length} spelers <ChevronDownIcon/></summary><p className="form-parent-link"><a href={status!.url} target="_blank" rel="noreferrer">{status!.url}</a></p>{codes.map(invite=>{const player=players.find(player=>player.id===invite.playerId)!;const contacted=Boolean(invite.editUrl||invite.submittedAt||deliveries.some(d=>d.formId===form.formId&&d.playerId===invite.playerId&&['queued','processing','sent','uncertain'].includes(d.status)));return <div className="form-invite" key={invite.playerId}><strong>{player.name}</strong>{player.parentEmail&&<span className="form-parent-email">{player.parentEmail}</span>}<code>{invite.code}</code>{contacted&&<p className="summary-note">Al uitgenodigd. Gebruik voor aanpassingen de aparte wijzigingslink.</p>}{invite.editUrl&&<button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(invitation(invite.playerId,invite.code,true));setCopied(invite.playerId);}catch{setError("Kopiëren lukt niet.");}}}>Kopieer wijzigingsbericht</button>}{!contacted&&personalLink(invite.code)&&<a className="text-button" href={personalLink(invite.code)} target="_blank" rel="noreferrer">Persoonlijk formulier openen <ChevronRightIcon/></a>}<button type="button" disabled={contacted||!personalLink(invite.code)} className="text-button" onClick={()=>void copyInvite(invite.playerId,invite.code)}>{copied===invite.playerId?"Gekopieerd":"Kopieer uitnodiging"}</button>{!contacted&&validParentEmail(player.parentEmail)&&personalLink(invite.code)?<a className="text-button" href={`mailto:${encodeURIComponent(player.parentEmail!)}?subject=${encodeURIComponent(`Beschikbaarheid ${player.shortName} · speelronde ${form.round}`)}&body=${encodeURIComponent(invitation(invite.playerId,invite.code))}`}>E-mail opstellen <ChevronRightIcon/></a>:<span className="summary-note">{player.parentEmail?"Controleer parentEmail in de Sheet.":"Vul parentEmail in de Sheet in om een e-mail op te stellen."}</span>}</div>;})}{players.length>codes.length&&<p role="alert">Voor {players.length-codes.length} spelers ontbreekt een persoonlijke code. Vraag beschikbaarheid voor hen handmatig uit.</p>}</details>:<p className="summary-note">Controleer eerst de publicatie. Daarna verschijnen hier de ouderlink en persoonlijke codes.</p>}
      </li>
      <li><strong>Haal antwoorden op</strong><p>Alleen met Verzenden ingediende antwoorden worden opgehaald; ingevulde concepten tellen niet mee. Ouders wijzigen hun bestaande inzending via Je antwoord bewerken en moeten opnieuw verzenden. Je eigen correcties en afgesloten wedstrijden blijven behouden. Handmatig aanpassen wordt pas bewaard met Wijzigingen verwerken.</p><button type="button" className="secondary-button" disabled={busy||archived||Boolean(status?.issues.length)} onClick={()=>refreshForms(Number(form.round))}><ReloadIcon/>Reacties ophalen</button></li>
    </ol>{error&&<p className="form-flow-error" role="alert">{error}</p>}
  </div>;
}

function RoundInvitations({round,form,...options}:{round:number;form:AvailabilityForm|undefined}&InvitationOptions) {
  const {formJobs,prepareRound,refreshDistribution,mailReady,remote,busy,archived}=useCoach();
  const job=formJobs.find(job=>Number(job.round)===round);
  const working=Boolean(job&&['queued','processing','awaiting-mapping'].includes(job.status));
  useEffect(()=>{if(remote&&!form)void refreshDistribution().catch(()=>{});},[round,Boolean(form)]);
  useEffect(()=>{if(!working)return;const timer=setInterval(()=>{void refreshDistribution().catch(()=>{});},5000);return()=>clearInterval(timer);},[working]);
  if(form)return <AvailabilityFormFlow key={form.formId} form={form} {...options}/>;
  return <div className="invitation-flow"><h3>{working?'Formulier wordt klaargemaakt':'Formulier voor deze speelronde'}</h3><p className="summary-note">De vaste clubopmaak wordt gebruikt. Wedstrijden, persoonlijke links en publicatie worden automatisch geregeld.</p>{working?<p className="invitation-notice" role="status">Even geduld. Je kunt dit scherm sluiten; het voorbereiden gaat door.</p>:<><button type="button" className="primary-button" disabled={!remote||!mailReady||busy||archived} onClick={()=>void prepareRound(round)}>{job?.status==='failed'?'Opnieuw voorbereiden':`Formulier voor speelronde ${round} maken`}</button>{!mailReady&&<p className="invitation-notice">De koppeling voor de vaste opmaak en verzending moet eenmalig worden geactiveerd.</p>}{job?.error&&<p role="alert">{job.error}</p>}{options.onRecover&&(!mailReady||job?.error)&&<button type="button" className="text-button" onClick={options.onRecover}>Naar instellingen</button>}</>}</div>;
}

function AvailabilityFormManager({form}:{form:AvailabilityForm}) {
  const {checkForm,archived}=useCoach();
  const [status,setStatus]=useState<FormStatus|null>(null),[error,setError]=useState('');
  async function verify(){setError('');try{setStatus(await checkForm(form.formId));}catch{setError('Formulierstatus niet bereikbaar. Probeer opnieuw.');}}
  useEffect(()=>{void verify();},[form.formId]);
  const ready=status?.published===true&&status.accepting===true&&!status.issues.length;
  return <div className="availability-form-manager"><div className="form-settings-status"><h3>{status?ready?'Open voor antwoorden':'Aandacht nodig':'Status controleren…'}</h3><p>Dit formulier hoort bij speelronde {form.round}. Persoonlijke links en antwoorden blijven behouden.</p></div>{error&&<p role="alert">{error}</p>}{status?.issues.map(issue=><p key={issue} role="alert">{issue}</p>)}{form.url&&<a className="settings-action-row" href={form.url} target="_blank" rel="noreferrer">Formulier bekijken<ChevronRightIcon/></a>}{!archived&&<a className="settings-action-row" href={`https://docs.google.com/forms/d/${encodeURIComponent(form.formId)}/edit`} target="_blank" rel="noreferrer">Bewerken in Google Forms<ChevronRightIcon/></a>}<button type="button" className="settings-action-row" onClick={()=>void verify()}><ReloadIcon/>Status opnieuw controleren</button><details className="invitation-advanced"><summary>Geavanceerde koppeling<ChevronDownIcon/></summary><AdvancedAvailabilityForm form={form}/></details></div>;
}

function RoundFormSettings() {
  const {state,matches,formLinks}=useCoach();
  const [round,setRound]=useState(currentRound(state));
  const rounds=Array.from(new Set([currentRound(state),...matches.map(m=>m.availabilityRound)])).sort((a,b)=>b-a);
  const forms=formLinks.filter(f=>Number(f.round)===round);
  return <div><label className="form-label">Speelronde<select aria-label="Formulier voor speelronde" value={round} onChange={e=>setRound(Number(e.target.value))}>{rounds.map(r=><option key={r} value={r}>Speelronde {r}</option>)}</select></label>{forms.length?forms.map(f=><AvailabilityFormManager key={f.formId} form={f}/>):<RoundInvitations round={round} form={undefined}/>}</div>;
}

type RoundPreparationDraft={version?:2;round:number;step:1|2;rows:Match[];baseRows?:Match[];playerIds:string[];channel:string;requested?:boolean};
const AvailabilityRouteContext=createContext<{title:string;subtitle:string;counter?:string;back:()=>void;close:()=>void;body:React.ReactNode}|null>(null);
function AvailabilityRouteHeader(){const view=useContext(AvailabilityRouteContext)!;return <div className="preparation-header"><div className="preparation-toolbar"><button type="button" className="icon-button" aria-label="Terug" onClick={view.back}><ChevronLeftIcon/></button><Dialog.Title asChild><h1>{view.title}</h1></Dialog.Title>{view.counter&&<span className="preparation-counter">{view.counter}</span>}<button type="button" className="icon-button" aria-label="Sluiten" onClick={view.close}><Cross1Icon/></button></div><p>{view.subtitle}</p></div>;}
function AvailabilityRouteBody(){const view=useContext(AvailabilityRouteContext)!;return <div className="preparation-route-layer"><MobileScroll className="preparation-scroll"><main className="availability-route-content">{view.body}</main></MobileScroll></div>;}
const availabilityRoute:FlowScreen={id:'availability-route',headerHeight:88,header:()=> <AvailabilityRouteHeader/>,render:()=> <AvailabilityRouteBody/>};
// Isolate drag start/release from the underlying scroller, but let pointer moves
// reach PhoneFrame so its custom cursor continues to track the mouse.
function AvailabilityPage({open,onClose,onBack,title,subtitle,counter,children}:{open:boolean;onClose:()=>void;onBack?:()=>void;title:string;subtitle:string;counter?:string;children:React.ReactNode}){
  const {screenRef}=useScreenPortal(),{device}=useMobileDevice(),keyboard=useKeyboard(),{bottomInset}=useKeyboardInsets();
  const close=()=>{keyboard.hide();onClose();};
  return <Dialog.Root open={open} onOpenChange={next=>{if(!next)close();}}><Dialog.Portal container={screenRef.current??undefined}><Dialog.Content aria-describedby={undefined} className="preparation-page availability-page" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onPointerCancel={event=>event.stopPropagation()} data-real={realDevice?'true':'false'} style={{bottom:!realDevice&&device.platform==='android'?device.geometry.safeArea.bottom:0,'--preparation-bottom-inset':realDevice?'env(safe-area-inset-bottom,0px)':`${bottomInset}px`} as React.CSSProperties}><AvailabilityRouteContext value={{title,subtitle,counter,close,back:()=>{keyboard.hide();(onBack??onClose)();},body:children}}><FlowStack initial={availabilityRoute}/></AvailabilityRouteContext></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
function RoundPreparation({draft,onChange,onRequested,onDone,onDiscard,onSettings}:{draft:RoundPreparationDraft;onChange:(next:RoundPreparationDraft)=>void;onRequested:()=>void;onDone:()=>void;onDiscard:()=>void;onSettings:()=>void}) {
  const {matches,players,invites,send,prepareRound,formLinks,formJobs,refreshDistribution,reloadRoundData,checkForm,remote,busy,archived,draftScope:useScope}=useCoach();
  const [error,setError]=useState(''),[saving,setSaving]=useState(false),[discard,setDiscard]=useState(false),[waiting,setWaiting]=useState(false),[ready,setReady]=useState(false),[sourceRows,setSourceRows]=useState<Match[]|null>(null),[sourceMessage,setSourceMessage]=useState('');
  const form=formLinks.find(f=>!f.matchId&&Number(f.round)===draft.round),fresh=matches.filter(m=>m.availabilityRound===draft.round);
  const saved=draft.rows.length>0&&sameRoundRows(draft.rows,fresh),job=formJobs.find(j=>Number(j.round)===draft.round);
  const processing=Boolean(job&&['queued','processing','awaiting-mapping'].includes(job.status));
  useEffect(()=>{if(!remote||!processing)return;void refreshDistribution().catch(()=>{});const timer=setInterval(()=>{void refreshDistribution().catch(()=>setError('Formulierstatus niet bereikbaar. Je voorbereiding blijft bewaard.'));},5000);return()=>clearInterval(timer);},[processing,remote,draft.round]);
  useEffect(()=>{let active=true;setReady(false);if(form)void checkForm(form.formId).then(status=>{if(!active)return;const valid=status.published===true&&status.accepting===true&&!status.issues.length&&Boolean(status.prefillDefaults??form.prefillDefaults)&&Boolean(status.codeEntryId??form.codeEntryId)&&players.every(p=>invites.some(i=>i.formId===form.formId&&i.playerId===p.id&&i.code));setReady(valid);if(!valid){setWaiting(false);setError(status.issues[0]??'Formulier of persoonlijke links zijn nog niet volledig. Controleer de koppeling in Instellingen.');}}).catch(()=>{if(active){setWaiting(false);setError('Formulier controleren lukt niet. Je voorbereiding blijft bewaard.');}});return()=>{active=false;};},[form?.formId,form?.prefillDefaults,job?.status,invites.length,players.length]);
  useEffect(()=>{if(waiting&&ready&&saved){setWaiting(false);onChange({...draft,step:2});}if(waiting&&job?.status==='failed'){setWaiting(false);setError(job.error??'Formulier voorbereiden mislukt. Probeer opnieuw.');}},[waiting,ready,saved,job?.status]);
  async function refresh(){setError('');const next=await reloadRoundData();if(!next){setError('Vernieuwen niet gelukt. Je invoer blijft bewaard. Sla een eventueel lokaal wedstrijdconcept eerst op.');return;}const rows=(next.catalog?.matches??[]).filter(m=>m.availabilityRound===draft.round),merged=mergeRoundRows(draft.baseRows??fresh,draft.rows,rows);if(merged.conflicts.length){setSourceRows(rows);setError('Dezelfde wedstrijden zijn ook in Sheets gewijzigd. Je invoer is behouden. Controleer de bronwijzigingen voordat je verdergaat.');return;}onChange({...draft,rows:merged.rows,baseRows:rows});setSourceMessage('Wedstrijden vernieuwd. Je eigen aanvullingen zijn behouden.');}
  async function prepare(rows:Match[]){
    if(saving||archived||processing)return;setSaving(true);setError('');
    try{
      const next=await reloadRoundData();if(!next){setError('Vernieuwen niet gelukt. Je invoer blijft bewaard. Controleer de verbinding of sla je lokale wedstrijdconcept eerst op.');return;}
      const latest=(next.catalog?.matches??[]).filter(m=>m.availabilityRound===draft.round),merged=mergeRoundRows(draft.baseRows??fresh,rows,latest);
      if(merged.conflicts.length){onChange({...draft,rows});setSourceRows(latest);setError('Dezelfde wedstrijden zijn ook in Sheets gewijzigd. Je invoer is behouden; controleer eerst de bronwijzigingen.');return;}
      const candidate={...draft,rows:merged.rows,baseRows:latest};onChange(candidate);
      if(form&&!sameRoundRows(merged.rows,latest)){setError('Deze ronde heeft al een formulier. Bestaande vragen en antwoorden worden niet gewijzigd. Controleer de verschillen via formulierbeheer.');return;}
      if(!sameRoundRows(merged.rows,latest)&&!await send({type:'save-round-matches',round:draft.round,matches:merged.rows})){setError('Opslaan niet bevestigd. Je invoer blijft bewaard. Controleer de bron en probeer opnieuw.');return;}
      if(!remote){onChange({...candidate,step:2});return;}
      if(ready){onChange({...candidate,step:2});return;}
      if(form){const status=await checkForm(form.formId);if(status.published===true&&status.accepting===true&&!status.issues.length&&Boolean(status.prefillDefaults??form.prefillDefaults)&&Boolean(status.codeEntryId??form.codeEntryId)&&players.every(p=>invites.some(i=>i.formId===form.formId&&i.playerId===p.id&&i.code))){onChange({...candidate,step:2});return;}setError(status.issues[0]??'Het bestaande formulier is nog niet klaar voor ouders. Controleer de koppeling in Instellingen.');return;}
      if(!await prepareRound(draft.round)){setError('Wedstrijden opgeslagen. Formulier voorbereiden niet bevestigd; probeer opnieuw.');return;}
      setWaiting(true);await refreshDistribution();
    }catch{setError('Voorbereiden niet bevestigd. Je invoer blijft bewaard; er zijn geen uitnodigingen verstuurd.');}
    finally{setSaving(false);}
  }
  return <div className="round-preparation two-step-preparation">
    {draft.step===1?<>
      {form&&!saved&&<section className="invitation-notice"><p>Deze ronde heeft al een formulier. Je bewaarde concept wijkt af van de opgeslagen wedstrijden. Er wordt niets opnieuw verstuurd.</p><button type="button" className="secondary-button" onClick={()=>{try{localStorage.setItem(`coachmate:round-draft:${useScope}:${draft.round}:before-reconcile`,JSON.stringify(draft));onChange({...draft,rows:fresh,baseRows:fresh,step:1});setError('');}catch{setError('Je concept kan niet veilig als reservekopie worden bewaard.');}}}>Opgeslagen wedstrijden gebruiken</button></section>}
      <div className="round-preparation-tools"><span>{draft.rows.length||fresh.length} wedstrijden</span><button type="button" className="text-button" disabled={busy||saving||processing} onClick={()=>void refresh()}><ReloadIcon/>Wedstrijden vernieuwen</button></div>
      {sourceMessage&&<p className="summary-note" role="status">{sourceMessage}</p>}
      {sourceRows&&<section className="source-conflict"><strong>Bronwijzigingen</strong>{sourceRows.map(row=><p key={row.id}>{row.opponent} · {row.shortDate} · {row.time}</p>)}<button type="button" className="secondary-button" onClick={()=>{onChange({...draft,baseRows:sourceRows,rows:[...sourceRows,...draft.rows.filter(m=>!(draft.baseRows??fresh).some(old=>old.id===m.id)&&!sourceRows.some(old=>old.id===m.id))]});setSourceRows(null);setError('');}}>Sheetwijzigingen gebruiken</button></section>}
      <RoundEditor key={draft.round} round={draft.round} newRound initialRows={draft.rows} value={draft.rows} onRowsChange={rows=>onChange({...draft,rows})} onSaved={()=>{}} onNext={rows=>void prepare(rows)} lockedIds={fresh.map(m=>m.id)} readOnly={Boolean(form)} working={saving||processing||waiting} submitLabel={ready?'Voorbereiding afronden':'Opslaan en formulier voorbereiden'}/>
      {(saving||processing||waiting)&&<p className="summary-note" role="status">{saving?'Wedstrijden controleren en opslaan…':processing?'Formulier en persoonlijke links worden klaargemaakt…':'Formulier controleren…'}</p>}
      {job?.status==='failed'&&<p role="alert">{job.error}</p>}
    </>:<>
      <p className="round-invite-context">{draft.rows.length} wedstrijden</p>
      {form?.url&&<a className="text-button" href={form.url} target="_blank" rel="noreferrer">Formulier bekijken<ChevronRightIcon/></a>}
      {remote&&form?<RoundInvitations round={draft.round} form={form} initialChannel={draft.channel} initialSelection={draft.playerIds} onChoicesChange={(channel,playerIds)=>onChange({...draft,channel,playerIds})} onRecover={onSettings} onRequested={()=>{onChange({...draft,requested:true});onRequested();}}/>:remote?<p role="status">Formulier wordt gecontroleerd. Ga terug naar Wedstrijden om het voorbereiden te hervatten.</p>:<DemoRoundInvitations round={draft.round} initialChannel={draft.channel} initialSelection={draft.playerIds} onChoicesChange={(channel,playerIds)=>onChange({...draft,channel,playerIds})}/>}
      <button type="button" className="text-button" onClick={onDone}>{draft.requested?'Naar actieve ronde':'Voorbereiding sluiten'}</button>
    </>}
    {error&&<p role="alert">{error}</p>}
    {error&&remote&&form&&<button type="button" className="text-button" onClick={onSettings}>Formulierkoppeling controleren</button>}
    {!draft.requested&&(discard?<section className="invitation-notice"><p>Deze lokale voorbereiding verwijderen? De actieve uitvraag blijft behouden.</p><button type="button" className="secondary-button" onClick={onDiscard}>Concept definitief verwijderen</button><button type="button" className="text-button" onClick={()=>setDiscard(false)}>Concept behouden</button></section>:<button type="button" className="text-button" disabled={busy||saving||processing} onClick={()=>setDiscard(true)}>Concept verwijderen</button>)}
  </div>;
}

function AvailabilityScreen({managementOnly=false}:{managementOnly?:boolean}) {
  const {state,players,matches,seasonName,remote,prepareRound,formLinks,busy,archived,focusMatch,draftScope,navigate,invites,deliveries,refreshForms,refreshDistribution,reloadRoundData,checkForm,settings}=useCoach();
  const keyboard=useKeyboard();
  const [roundHistoryOpen,setRoundHistoryOpen]=useState(false),[browsing,setBrowsing]=useState(false);
  const [detail,setDetail]=useState<string|null>(focusMatch),[editingResponse,setEditingResponse]=useState(false);
  useEffect(()=>setEditingResponse(false),[detail]);
  const [importMessage,setImportMessage]=useState('');
  const [formProblem,setFormProblem]=useState('');
  const [distributionKnown,setDistributionKnown]=useState(false),[distributionError,setDistributionError]=useState('');
  useEffect(()=>{if(remote)void refreshDistribution().then(()=>{setDistributionKnown(true);setDistributionError('');}).catch(()=>setDistributionError('De uitvraagstatus is niet bereikbaar. Eerdere gegevens blijven behouden.'));},[remote]);
  useEffect(()=>{if(focusMatch)setDetail(focusMatch);},[focusMatch]);
  const [manageOpen,setManageOpen]=useState(false),[roundOpen,setRoundOpen]=useState(false),[adding,setAdding]=useState(false);
  const [inviteOpen,setInviteOpen]=useState(false);
  const detailTrigger=useRef<HTMLButtonElement>(null),manageTrigger=useRef<HTMLButtonElement>(null);
  useSheetReturnFocus(detail!==null,detailTrigger);useSheetReturnFocus(manageOpen||roundOpen,manageTrigger);
  const activeKey=`coachmate:active-request:${draftScope}`;
  const preparationKey=`coachmate:round-preparation:${draftScope}`;
  const [activeRound,setActiveRound]=useState(()=>{const saved=Number(readDraft(activeKey));const remembered=saved>0&&matches.some(m=>m.availabilityRound===saved)?saved:0;const requested=formLinks.filter(f=>invites.some(i=>i.formId===f.formId&&i.submittedAt)||deliveries.some(d=>d.formId===f.formId)).map(f=>Number(f.round));return requested.length?Math.max(remembered,...requested):remembered||Math.min(...matches.map(m=>m.availabilityRound),currentRound(state));});
  const [selectedRound,setSelectedRound]=useState(activeRound),[historyRound,setHistoryRound]=useState<number|null>(null);
  useEffect(()=>{const started=formLinks.filter(f=>invites.some(i=>i.formId===f.formId&&i.submittedAt)||deliveries.some(d=>d.formId===f.formId)).map(f=>Number(f.round)),latest=started.length?Math.max(...started):0;if(latest>activeRound){setActiveRound(latest);if(!browsing)setSelectedRound(latest);}},[formLinks,invites,deliveries,activeRound,browsing]);
  const [preparation,setPreparation]=useState<RoundPreparationDraft|null>(()=>{try{const d=JSON.parse(readDraft(preparationKey)??'null');return d&&Number.isInteger(d.round)&&d.round>0&&[1,2,3].includes(d.step)&&Array.isArray(d.rows)&&d.rows.every((m:Match)=>m.availabilityRound===d.round&&typeof m.id==='string')&&Array.isArray(d.playerIds)&&d.playerIds.every((id:unknown)=>typeof id==='string')&&['email','whatsapp'].includes(d.channel)?{...d,version:2,step:1,rows:d.rows.length?d.rows:[emptyRoundMatch(d.round)],baseRows:d.baseRows??matches.filter(m=>m.availabilityRound===d.round)}:null;}catch{return null;}});
  const [preparationOpen,setPreparationOpen]=useState(false),[draftError,setDraftError]=useState('');
  const preparationTrigger=useRef<HTMLButtonElement>(null);
  useSheetReturnFocus(preparationOpen,preparationTrigger);
  useEffect(()=>{try{localStorage.setItem(activeKey,String(activeRound));}catch{setDraftError('De actieve ronde kan niet op dit apparaat worden onthouden.');}},[activeKey,activeRound]);
  useEffect(()=>{try{if(preparation)localStorage.setItem(preparationKey,JSON.stringify(preparation));else{localStorage.removeItem(preparationKey);sessionStorage.removeItem(preparationKey);}setDraftError('');}catch{setDraftError('Je voorbereiding blijft in dit venster bewaard, maar opslaan op dit apparaat lukt niet.');}},[preparationKey,preparation]);
  async function openPreparation(round?:number){
    keyboard.hide();setDraftError('');const next=await reloadRoundData();if(!next){setDraftError('Wedstrijden vernieuwen lukt niet. Je concept blijft bewaard. Controleer de verbinding of sla je lokale wedstrijdconcept eerst op.');return;}
    const source=next.catalog?.matches??matches;
    if(!preparation||round!==undefined&&preparation.round!==round){
      if(preparation){setDraftError(`Er staat al een voorbereiding voor speelronde ${preparation.round}. Rond die eerst af of verwijder het concept.`);return;}
      const requested=new Set(formLinks.filter(f=>invites.some(i=>i.formId===f.formId&&i.submittedAt)||deliveries.some(d=>d.formId===f.formId)).map(f=>Number(f.round)));
      const candidates=[...new Set(source.filter(m=>!isProcessed(next,m.id)).map(m=>m.availabilityRound))].filter(n=>!requested.has(n)&&(n>activeRound||remote&&n===activeRound&&!formLinks.some(f=>Number(f.round)===n))).sort((a,b)=>a-b);
      const target=round??candidates[0]??currentRound(next)+1,rows=source.filter(m=>m.availabilityRound===target);
      const local=readDraft(`coachmate:round-draft:${draftScope}:${target}`);let restored:Match[]=rows.length?rows:[emptyRoundMatch(target)];try{const value=JSON.parse(local??'null');if(Array.isArray(value)&&value.length&&value.every((m:Match)=>m.availabilityRound===target&&typeof m.id==='string'))restored=value;}catch{}
      setPreparation({version:2,round:target,step:1,rows:restored,baseRows:rows,playerIds:players.map(p=>p.id),channel:'email'});
    }else{
      const fresh=source.filter(m=>m.availabilityRound===preparation.round),merged=mergeRoundRows(preparation.baseRows??fresh,preparation.rows,fresh);
      if(!merged.conflicts.length)setPreparation({...preparation,rows:merged.rows,baseRows:fresh});
    }
    setPreparationOpen(true);
  }
  function finishPreparation(draft:RoundPreparationDraft,showInvites=false){
    try{localStorage.setItem(`${preparationKey}:completed:${draft.round}:${Date.now()}`,JSON.stringify(draft));localStorage.removeItem(preparationKey);sessionStorage.removeItem(preparationKey);for(const suffix of ['',':collapsed']){localStorage.removeItem(`coachmate:round-draft:${draftScope}:${draft.round}${suffix}`);sessionStorage.removeItem(`coachmate:round-draft:${draftScope}:${draft.round}${suffix}`);}}catch{setDraftError('De afgeronde voorbereiding kan niet veilig worden bewaard. Je concept blijft behouden.');return;}
    setPreparation(null);setPreparationOpen(false);if(showInvites||draft.round>=activeRound)setSelectedRound(draft.round);setActiveRound(current=>Math.max(current,draft.round));if(showInvites)setInviteOpen(true);
  }
  useEffect(()=>{
    if(!remote||!distributionKnown||!preparation||preparationOpen)return;
    const draft=preparation,form=formLinks.find(f=>!f.matchId&&Number(f.round)===draft.round),fresh=matches.filter(m=>m.availabilityRound===draft.round);
    if(!form||!sameRoundRows(draft.rows,fresh))return;
    const started=invites.some(i=>i.formId===form.formId&&(i.submittedAt||i.responseId))||deliveries.some(d=>d.formId===form.formId&&['queued','processing','sent','uncertain'].includes(d.status));
    if(preparationComplete(draft.rows,fresh,{published:null,accepting:null,issues:[]},false,started)){finishPreparation(draft);return;}
    let active=true;void checkForm(form.formId).then(status=>{if(active&&preparationComplete(draft.rows,fresh,{...status,codeEntryId:status.codeEntryId??form.codeEntryId,prefillDefaults:status.prefillDefaults??form.prefillDefaults},players.every(p=>invites.some(i=>i.formId===form.formId&&i.playerId===p.id&&i.code))))finishPreparation(draft);}).catch(()=>{});
    return()=>{active=false;};
  },[remote,distributionKnown,preparation,preparationOpen,formLinks,invites,deliveries,matches]);
  function closeHistory(){setDetail(null);setRoundHistoryOpen(false);setBrowsing(false);setSelectedRound(activeRound);setImportMessage('');}


  const selected=matches.find(m=>m.id===detail),values=historyRound===null?state.availability:state.rounds[historyRound]??state.availability;
  const historical=archived||browsing||Boolean(selected&&isProcessed(state,selected.id));
  const roundForm=formLinks.find(f=>!f.matchId&&Number(f.round)===selectedRound);
  const roundMatches=matches.filter(m=>m.availabilityRound===selectedRound);
  useEffect(()=>{
    let active=true;setFormProblem('');
    if(!remote||managementOnly)return;
    if(!roundForm){setFormProblem('Voor deze speelronde is nog geen formulier gemaakt.');return;}
    void checkForm(roundForm.formId).then(result=>{if(!active)return;const ready=result.published===true&&result.accepting===true&&!result.issues.length&&Boolean(roundForm.prefillDefaults??result.prefillDefaults);if(!ready)setFormProblem(result.issues[0]??'Het formulier is nog niet geopend voor antwoorden of de persoonlijke links zijn nog niet ingesteld.');}).catch(()=>{if(active)setFormProblem('De formulierstatus kon niet worden gecontroleerd. Controleer de Google-verbinding.');});
    return()=>{active=false;};
  },[roundForm?.formId,roundForm?.prefillDefaults,remote,managementOnly]);

  const today=new Date().setHours(0,0,0,0);
  const isPast=(m:Match)=>isProcessed(state,m.id)||matchDate(m)<today;
  const shown=orderedMatches(roundMatches.filter(m=>!isPast(m)));
  const past=orderedMatches(roundMatches.filter(isPast));
  const roundForms=formLinks.filter(f=>Number(f.round)===selectedRound);
  const received=new Set(invites.filter(i=>roundForms.some(f=>f.formId===i.formId)&&i.submittedAt&&players.some(p=>p.id===i.playerId)).map(i=>i.playerId)).size;
  const latestDeliveries=new Map<string,FormDelivery>();
  for(const row of deliveries)if(roundForms.some(f=>f.formId===row.formId)&&players.some(p=>p.id===row.playerId))latestDeliveries.set(row.playerId,row);
  const deliveryCount=(statuses:string[])=>[...latestDeliveries.values()].filter(row=>statuses.includes(row.status)).length;
  const lastImport=readDraft(`coachmate:last-import:${draftScope}:${selectedRound}`);
  async function updateResponses(){setImportMessage('');try{const ok=await refreshForms(selectedRound);if(ok){setDistributionKnown(true);setDistributionError('');}setImportMessage(ok?'Reacties bijgewerkt. Coachcorrecties blijven behouden.':'Bijwerken niet gelukt. Je bestaande reacties zijn behouden.');}catch{setImportMessage('Geen verbinding. Je bestaande reacties zijn behouden.');}}
  function matchItem(m:Match,closed=false){const count=counts(state,m.id);return <article className="availability-match compact-availability-match" key={m.id}><button type="button" className="availability-match-button" aria-label={`Bekijk reacties ${m.opponent}`} onClick={event=>{detailTrigger.current=event.currentTarget;setHistoryRound(null);setDetail(m.id);}}><DateTile match={m}/><span className="availability-match-copy"><strong>{m.opponent}</strong><small>{m.time} · {m.venue}{closed?(isProcessed(state,m.id)?' · Afgesloten':' · Nog niet verwerkt'):''}</small><span className="availability-inline-counts"><span>{count.available} aanwezig</span><span>{count.unavailable} afwezig</span><span>{count.pending} onbekend</span></span></span><ChevronRightIcon/></button></article>;}
  const selectedValues:Record<string,Availability>=selected?(values[selected.id]??state.availability[selected.id]??{}):{};
  const provenance=(state as CoachState & {formUpdates?:Record<string,{manual?:boolean;time?:string}>}).formUpdates??{};
  const selectedCounts={available:Object.values(selectedValues).filter(v=>v==="available").length,unavailable:Object.values(selectedValues).filter(v=>v==="unavailable").length,pending:Object.values(selectedValues).filter(v=>v==="pending").length};
  const Layout=managementOnly?"div":"main";
  return <Layout className={managementOnly?"round-settings-content":"screen-content availability-screen"}>
    {!managementOnly&&<>
    <section className="round-response-summary quiet-round-summary" aria-label="Reacties speelronde">
      <div className="active-round-heading active-round-context"><span className="eyebrow">Lopende speelronde</span><div className="round-title-row"><h2>Speelronde {activeRound}</h2><button type="button" className="round-refresh" aria-label="Reacties bijwerken" title="Reacties bijwerken" disabled={archived||busy||!roundMatches.length} onClick={()=>remote?void updateResponses():setImportMessage('Lokale demo: er worden geen Google-reacties opgehaald.')}><ReloadIcon/></button></div>{roundMatches.length>0&&<p>{orderedMatches(roundMatches)[0].shortDate} – {orderedMatches(roundMatches).at(-1)?.shortDate} · {roundMatches.length} wedstrijden</p>}</div>
      {remote?<><p className="response-total"><strong>{distributionKnown?`${received} van ${players.length}`:'…'}</strong><span>gereageerd</span></p>{distributionKnown&&deliveryCount(['failed','uncertain'])>0&&<button type="button" className="text-button request-attention" onClick={()=>setInviteOpen(true)}>{deliveryCount(['failed','uncertain'])} uitnodigingen controleren<ChevronRightIcon/></button>}</>:<p className="response-total"><strong>{players.length} spelers</strong><span>Lokale voorbeeldgegevens</span></p>}
      {lastImport&&<p className="import-timestamp">Bijgewerkt: {new Date(lastImport).toLocaleString('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p>}
      <button type="button" className="primary-button" disabled={busy||!roundMatches.length} onClick={()=>remote&&!roundForm?void openPreparation(activeRound):setInviteOpen(true)}>Uitnodigingen bekijken<ChevronRightIcon/></button>
      {remote&&formProblem&&<p role="status" className="summary-note">{formProblem} <button type="button" className="text-button" onClick={settings}>Formulierinstellingen</button></p>}{distributionError&&<p role="alert">{distributionError}</p>}{importMessage&&<p role="status" className="availability-import-message">{importMessage}</p>}
    </section>
    <section className="availability-list" aria-label="Reacties per wedstrijd"><div className="section-heading"><h2>Per wedstrijd</h2></div>{!roundMatches.length&&<p className="summary-note">Nog geen wedstrijden. Bereid je eerste ronde voor.</p>}{orderedMatches(roundMatches).map(m=>matchItem(m))}</section>
    <nav className="availability-next-actions" aria-label="Andere uitvragen"><button type="button" ref={preparationTrigger} className="new-round-entry" disabled={busy||archived} onClick={()=>void openPreparation()}><PlusIcon/><span><strong>{preparation?`Speelronde ${preparation.round} afmaken`:'Nieuwe speelronde'}</strong>{preparation&&<small>Wedstrijden en formulier voorbereiden</small>}</span><ChevronRightIcon/></button><button type="button" className="text-button earlier-rounds" onClick={()=>{keyboard.hide();setRoundHistoryOpen(true);}}>Eerdere speelrondes<ChevronRightIcon/></button></nav>{draftError&&<p role="alert">{draftError}</p>}

    </>}
    {managementOnly&&<><label className="form-label">Speelronde<select aria-label="Speelronde beheren" value={selectedRound} onChange={e=>setSelectedRound(Number(e.target.value))}>{Array.from(new Set([currentRound(state),...matches.map(m=>m.availabilityRound)])).sort((a,b)=>b-a).map(round=><option key={round} value={round}>Speelronde {round}</option>)}</select></label><p className="small-muted">{roundMatches.length} wedstrijden · seizoen {seasonName}</p><div className="round-settings-matches">{orderedMatches(roundMatches).map(m=><div key={m.id}><strong>{m.opponent}</strong><span>{m.shortDate} · {m.time} · {m.venue}</span></div>)}</div><button type="button" className="settings-action-row" ref={manageTrigger} disabled={busy||archived} onClick={()=>{setAdding(false);setRoundOpen(true);}}><PlusIcon/>Nieuwe speelronde</button>{!archived&&!roundForm&&selectedRound===currentRound(state)&&<button type="button" className="settings-action-row" disabled={busy} onClick={()=>{setAdding(true);setRoundOpen(true);}}><PlusIcon/>Wedstrijden toevoegen</button>}</>}
    <BottomSheet open={detail!==null&&!browsing} onOpenChange={open=>{if(!open)setDetail(null);}} title="Beschikbaarheid" description={selected?`${selected.opponent} · ${selected.shortDate} · ${selected.time} · ${selected.venue}`:undefined} snap={0.86}>
      {(historical||historyRound!==null)&&<div className="read-only-note"><LockClosedIcon/><span>{historyRound!==null?"Eerdere antwoorden · alleen lezen":"Historische reacties · alleen lezen"}</span></div>}
      {selected&&!historical&&historyRound===null&&editingResponse&&<AttendanceEditor key={`${draftScope}:${selected.id}`} match={selected} flat/>}
      {selected&&(!editingResponse||historical||historyRound!==null)&&<><ResponseSummary {...selectedCounts}/><div className="read-response-list">{players.map(p=><div className="response-row" key={p.id}><span className="player-number">{p.number}</span><strong>{p.shortName}</strong><span className="response-source">{provenance[`${selected.id}/${p.id}`]?.manual?"Coachcorrectie":provenance[`${selected.id}/${p.id}`]?"Formulier":""}</span><span className={`read-status ${selectedValues[p.id]}`}>{statusLabels[selectedValues[p.id]]}</span></div>)}</div>{!historical&&historyRound===null&&<button type="button" className="secondary-button" onClick={()=>setEditingResponse(true)}>Aanpassen</button>}{historical&&<GroupLink title="Wedstrijdcijfers bekijken" subtitle="Werkelijke aanwezigheid staat bij de statistieken" icon={<BarChartIcon/>} onClick={()=>{setDetail(null);navigate("stats",selected.id);}}/>}</>}
      {state.rounds.length>0&&<details className="previous-responses editor-explanation"><summary>Eerdere antwoorden bekijken <ChevronDownIcon/></summary><p>Bekijk eerdere antwoorden zonder deze wedstrijd te veranderen. Coachcorrecties blijven behouden.</p><label className="form-label">Antwoorden bekijken<select aria-label="Beschikbaarheidsronde" value={historyRound??"current"} onChange={e=>setHistoryRound(e.target.value==="current"?null:Number(e.target.value))}><option value="current">Actuele antwoorden</option>{state.rounds.map((snapshot,i)=>snapshot[selected?.id??""]?<option key={i} value={i}>Eerdere antwoorden · ronde {i+1} · alleen lezen</option>:null)}</select></label></details>}
    </BottomSheet>
    <AvailabilityPage open={inviteOpen} onClose={()=>setInviteOpen(false)} title="Uitnodigingen" subtitle={`Speelronde ${selectedRound} · ${roundMatches.length} wedstrijden`}>
      {remote?<><RoundInvitations round={selectedRound} form={roundForm} onRecover={()=>{setInviteOpen(false);settings();}}/></>:<DemoRoundInvitations round={selectedRound}/>}
    </AvailabilityPage>
    <AvailabilityPage open={roundHistoryOpen} onClose={closeHistory} onBack={detail?()=>setDetail(null):browsing?()=>{setBrowsing(false);setSelectedRound(activeRound);}:closeHistory} title={detail?selected?.opponent??'Beschikbaarheid':browsing?`Speelronde ${selectedRound}`:'Eerdere speelrondes'} subtitle={browsing?'Antwoorden bekijken · alleen lezen':seasonName}>
      {browsing&&selected?<><ResponseSummary {...selectedCounts}/><div className="read-response-list">{players.map(p=><div className="response-row" key={p.id}><span className="player-number">{p.number}</span><strong>{p.shortName}</strong><span className={`read-status ${selectedValues[p.id]}`}>{statusLabels[selectedValues[p.id]]}</span></div>)}</div></>:browsing?<section className="availability-list">{orderedMatches(roundMatches).map(m=>matchItem(m,true))}</section>:<div className="earlier-round-list">{[...new Set(matches.map(m=>m.availabilityRound))].filter(n=>n<activeRound).sort((a,b)=>b-a).map(n=><button type="button" className="settings-action-row" key={n} onClick={()=>{setSelectedRound(n);setBrowsing(true);}}>Speelronde {n}<span>{matches.filter(m=>m.availabilityRound===n).length} wedstrijden</span><ChevronRightIcon/></button>)}{!matches.some(m=>m.availabilityRound<activeRound)&&<p className="summary-note">Er zijn nog geen eerdere speelrondes.</p>}</div>}
    </AvailabilityPage>
    <AvailabilityPage open={preparationOpen} onClose={()=>setPreparationOpen(false)} onBack={preparation?.step===2?()=>setPreparation({...preparation,step:1}):()=>setPreparationOpen(false)} title="Speelronde voorbereiden" subtitle={`Speelronde ${preparation?.round??''}`}>
      {preparation&&<RoundPreparation draft={preparation} onChange={next=>{if(next.step===2)finishPreparation(next,true);else setPreparation(next);}} onSettings={()=>{setPreparationOpen(false);settings();}} onDiscard={()=>{for(const suffix of ['',':collapsed']){localStorage.removeItem(`coachmate:round-draft:${draftScope}:${preparation.round}${suffix}`);sessionStorage.removeItem(`coachmate:round-draft:${draftScope}:${preparation.round}${suffix}`);}setPreparation(null);setPreparationOpen(false);}} onRequested={()=>{setActiveRound(preparation.round);setSelectedRound(preparation.round);}} onDone={()=>{setPreparationOpen(false);if(preparation.requested){setPreparation(null);localStorage.removeItem(`coachmate:round-draft:${draftScope}:${preparation.round}`);setSelectedRound(preparation.round);}}}/>}
    </AvailabilityPage>
    <BottomSheet open={manageOpen||roundOpen} onOpenChange={open=>{if(!open){setManageOpen(false);setRoundOpen(false);}}} title={roundOpen?adding?`Wedstrijden · speelronde ${currentRound(state)}`:`Nieuwe speelronde ${currentRound(state)+1}`:"Speelrondes beheren"} description={roundOpen?"Wedstrijden en reacties blijven bij hun eigen speelronde.":`Seizoen ${seasonName} · speelronde ${selectedRound}`} snap={0.86}>
      {roundOpen?<><RoundEditor key={`${adding}:${currentRound(state)}`} round={currentRound(state)+(adding?0:1)} newRound={!adding} onSaved={()=>{setSelectedRound(currentRound(state)+(adding?0:1));setRoundOpen(false);setManageOpen(false);setInviteOpen(true);if(remote)void prepareRound(currentRound(state)+(adding?0:1));}}/></>:<div className="round-management-content"><div className="management-context"><CalendarIcon/><div><strong>Speelronde {selectedRound}</strong><span>{roundMatches.length} wedstrijden · {players.length} spelers</span></div></div><p className="editor-instruction">Iedere speelronde heeft eigen wedstrijden en één beschikbaarheidsformulier.</p><div className="management-actions"><button type="button" className="primary-button" disabled={busy||archived} onClick={()=>{setAdding(false);setRoundOpen(true);}}><PlusIcon/>Nieuwe speelronde</button>{!archived&&!roundForm&&selectedRound===currentRound(state)&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>{setAdding(true);setRoundOpen(true);}}><PlusIcon/>Wedstrijden toevoegen</button>}</div><section className="management-form"><GroupLink title="Beschikbaarheid uitvragen" subtitle="E-mail of persoonlijke WhatsApp-berichten" icon={<PersonIcon/>} onClick={()=>{setManageOpen(false);setInviteOpen(true);}}/></section><p className="management-footnote">Eerdere speelrondes en coachcorrecties blijven bewaard.</p></div>}
    </BottomSheet>
  </Layout>;
}

function ResultOnlyEntry({matchId,onMatchChange,onClose,onDraftChange,onSaved}:{matchId:string;onMatchChange:(id:string)=>void;onClose:()=>void;onDraftChange:(id:string)=>void;onSaved:(id:string)=>void}) {
  const {state,save,hasPendingSave,busy,archived,draftScope,matches,LIVE_MATCH_ID,notify}=useCoach();
  const keyboard=useKeyboard(),catalog=state.catalog??demoCatalog(),stored=state.resultOnly?.[matchId];
  const match=matches.find(m=>m.id===matchId)!;
  const key=`coachmate:result-draft:${draftScope}:${matchId}`;
  const [draft,setDraft]=useState(()=>{
    try{const value=JSON.parse(readDraft(key)??'null');if(value&&['for','against','text'].every(k=>typeof value[k]==='string')&&(value.expected===null||typeof value.expected==='string'))return value as {for:string;against:string;text:string;expected:string|null};}catch{}
    return {for:stored?String(stored.goalsFor):'',against:stored?String(stored.goalsAgainst):'',text:stored?scoreEventsText(stored,catalog,match.venue):'',expected:stored?JSON.stringify(stored):null};
  });
  const [error,setError]=useState('');
  const update=(patch:Partial<typeof draft>)=>{const next={...draft,...patch};setDraft(next);setError('');onDraftChange(matchId);try{localStorage.setItem(key,JSON.stringify(next));}catch{setError('Lokaal bewaren lukt niet. Houd dit scherm open; je invoer blijft hier behouden.');}};
  const eligible=matches.filter(m=>m.id!==LIVE_MATCH_ID&&!state.stats.some(r=>r.matchId===m.id)&&!state.matchResults?.[m.id]&&!state.liveArchive?.[m.id]);
  async function persist(){
    keyboard.hide();setError('');
    try{
      if(!/^\d{1,2}$/.test(draft.for)||!/^\d{1,2}$/.test(draft.against))throw new Error('Vul beide eindscores in (0–99).');
      const result:ResultOnlyMatch={goalsFor:Number(draft.for),goalsAgainst:Number(draft.against),events:parseScoreEvents(draft.text,catalog,match.venue)};
      if(!validateResultOnly(result,catalog))throw new Error('Controleer de oplopende tussenstanden, doelpuntenmakers en eindstand. De laatste tussenstand moet gelijk zijn aan de eindstand.');
      const retry=hasPendingSave&&JSON.stringify(state.resultOnly?.[matchId])===JSON.stringify(result);
      if(!await save(retry?[]:[{type:'save-result',matchId,result,expected:draft.expected}]))throw new Error('Opslaan niet bevestigd. Je concept blijft bewaard. Controleer bij een conflict eerst de actuele registratie.');
      localStorage.removeItem(key);sessionStorage.removeItem(key);onSaved(matchId);onClose();notify('Uitslag en scoreverloop opgeslagen');
    }catch(e){setError((e as Error).message);}
  }
  const ourScore=<label className="form-label">{catalog.clubName??catalog.teamName}<KeyboardInput aria-label="Eindstand eigen team" inputMode="numeric" value={draft.for} disabled={archived||busy} onChange={e=>update({for:e.target.value})}/></label>;
  const theirScore=<label className="form-label">{match.opponent}<KeyboardInput aria-label="Eindstand tegenstander" inputMode="numeric" value={draft.against} disabled={archived||busy} onChange={e=>update({against:e.target.value})}/></label>;
  return <main className="screen-content stats-screen result-only-entry"><section className="entry-header"><div><h1>Uitslag en scoreverloop</h1><p className="muted">{match.opponent} · {match.date} · {match.venue}</p></div></section>
    <section className="match-select-card"><label className="form-label">Wedstrijd<select aria-label="Wedstrijd voor uitslag" value={matchId} disabled={busy} onChange={e=>{keyboard.hide();onMatchChange(e.target.value);}}>{eligible.map(m=><option key={m.id} value={m.id}>{m.shortDate} · {m.opponent}</option>)}</select></label><p className="summary-note">Alleen gespeeld, eindstand en scoreverloop. Aanwezigheid, wedstrijdduur, speelminuten en keepergegevens blijven onbekend. Beschikbaarheid blijft behouden.</p></section>
    <section className="match-select-card"><h2>Eindstand</h2><div className="result-score-inputs">{match.venue==='Thuis'?ourScore:theirScore}<span>–</span>{match.venue==='Thuis'?theirScore:ourScore}</div><p className="summary-note">Eindstand en scoreverloop: de thuisploeg eerst ({match.venue==='Thuis'?catalog.teamName:match.opponent}).</p></section>
    <section className="match-select-card"><label className="form-label">Scoreverloop<KeyboardTextarea aria-label="Chronologisch scoreverloop" rows={10} disabled={archived||busy} value={draft.text} placeholder={`${match.venue==='Thuis'?'0-1':'1-0'}\n1-1 ${catalog.players[0]?.shortName??'speler'}\n${match.venue==='Thuis'?'2-1':'1-2'} ${catalog.players[1]?.shortName??'speler'}`} onChange={e=>update({text:e.target.value})}/></label><p className="summary-note">Eén tussenstand per regel, met de speler achter onze goal. Een bekend beginpunt zoals 0-3 mag. Een minuut is optioneel: 1-3 {catalog.players[0]?.shortName} '12. Gebruik (e.d.) voor een eigen doelpunt. Leeg laten bewaart alleen de uitslag.</p></section>
    {error&&<p role="alert" className="storage-warning">{error}</p>}<p className="entry-local-status"><CheckCircledIcon/>Concept op dit apparaat · alleen Opslaan verwerkt deze wedstrijd.</p>{archived?<p className="read-only-note"><LockClosedIcon/>Archief · alleen lezen</p>:<div className="entry-save-footer"><button type="button" className="primary-button" disabled={busy} onClick={()=>void persist()}>{busy?'Opslaan…':'Opslaan'}</button></div>}<button type="button" className="text-button" onClick={()=>{keyboard.hide();onClose();}}>Terug · concept bewaren</button>
  </main>;
}

type StatsRanking="minutes"|"keeper"|"goals"|"attendance";
const statsRankingLabels:Record<StatsRanking,string>={minutes:"Speelminuten",keeper:"Keeperminuten",goals:"Doelpunten",attendance:"Aanwezigheid"};
function StatsScreen({homeRequest}:{homeRequest:number}) {
  const { state, send, notify, players, matches, LIVE_MATCH_ID, name, seasonName, busy, archived, focusMatch, draftScope, statsVisible, setStatsBack } = useCoach();
  const [editing, setEditing] = useState(Boolean(focusMatch));
  const [resultEntry,setResultEntry]=useState(false);
  const [resultDraftIds,setResultDraftIds]=useState(()=>matches.filter(m=>readDraft(`coachmate:result-draft:${draftScope}:${m.id}`)).map(m=>m.id));
  const [selectedMatchId, setSelectedMatchId] = useState(focusMatch ?? matches.find(m => m.id !== LIVE_MATCH_ID)?.id ?? LIVE_MATCH_ID);
  // Drafts are scoped by match, so changing the selector never copies another match's figures.
  const draftKey = `coachmate:draft:${draftScope}`;
  const [restored] = useState(() => { try { const stored = JSON.parse(readDraft(draftKey) ?? "{}"); const rows = Object.fromEntries(Object.entries(stored.rows ?? {}).filter(([id, rows]) => Array.isArray(rows) && validateRows(rows as MatchStat[], id, state.catalog))); return { rows: rows as Record<string, MatchStat[]>, goals: Object.fromEntries(Object.entries(stored.goals ?? {}).filter(([id, n]) => matches.some(m => m.id === id) && Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 99)) as Record<string, number> }; } catch { return { rows: {}, goals: {} }; } });
  const [drafts, setDrafts] = useState<Record<string, MatchStat[]>>(restored.rows);
  const [ownGoalDrafts, setOwnGoalDrafts] = useState<Record<string, number>>(restored.goals);
  const [saveError, setSaveError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify({ rows: drafts, goals: ownGoalDrafts })); setDraftError(""); } catch { setDraftError("Concept blijft in dit venster bewaard, maar kan niet worden hersteld na herladen."); } }, [drafts, ownGoalDrafts, draftKey]);
  useEffect(() => { if (focusMatch) { setSelectedMatchId(focusMatch); setProfileEditReturn(null); setEditing(true); } }, [focusMatch]);
  const draftIds = Array.from(new Set([...Object.keys(drafts), ...Object.keys(ownGoalDrafts),...resultDraftIds]));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [ranking, setRanking] = useState<StatsRanking>("goals");
  const [statsView,setStatsView]=useState<"ranking"|"players">("ranking");
  const [playerDetailId,setPlayerDetailId]=useState<string|null>(null),[notesOpen,setNotesOpen]=useState(false),[entryInfoOpen,setEntryInfoOpen]=useState(false);
  const [profilePickerOpen,setProfilePickerOpen]=useState(false),[profileQuery,setProfileQuery]=useState("");
  const [profileMatchId,setProfileMatchId]=useState<string|null>(null);
  const [profileEditReturn,setProfileEditReturn]=useState<{playerId:string;matchId:string}|null>(null);
  const profileContent=useRef<HTMLDivElement>(null);
  const playerTrigger=useRef<HTMLButtonElement>(null),notesTrigger=useRef<HTMLButtonElement>(null),entryInfoTrigger=useRef<HTMLButtonElement>(null);
  useSheetReturnFocus(playerDetailId!==null,playerTrigger);useSheetReturnFocus(notesOpen,notesTrigger);useSheetReturnFocus(entryInfoOpen,entryInfoTrigger);
  const keyboard = useKeyboard();
  const previousHomeRequest=useRef(homeRequest);
  useEffect(()=>{
    if(previousHomeRequest.current===homeRequest)return;
    previousHomeRequest.current=homeRequest;
    keyboard.hide();
    // Returning to the tab root changes navigation only; keep every match draft.
    setEditing(false);setResultEntry(false);setHistoryOpen(false);setDiscardOpen(false);
    setPlayerDetailId(null);setProfilePickerOpen(false);setProfileMatchId(null);setProfileEditReturn(null);setNotesOpen(false);setEntryInfoOpen(false);
    const scroll=document.querySelector<HTMLElement>(".app-screen .mobile-scroll");
    scroll?.scrollTo({top:0});
    // Browser focus can scroll the clipped phone screen as well as its content.
    scroll?.closest<HTMLElement>("[data-phone-screen]")?.scrollTo({top:0});
  },[homeRequest,keyboard]);
  const [expandedPlayer, setExpandedPlayer] = useState(players[0]?.id ?? "");
  const editable = matches.filter(m => m.id !== LIVE_MATCH_ID || state.live.phase === "Einde");
  const draft = drafts[selectedMatchId] ?? matchRows(state, selectedMatchId);
  const minuteLimit = statsMinuteLimit(state, selectedMatchId);
  const goalsOnly=goalsOnlyMatch(state,selectedMatchId),coverageRound=fullStatsFromRound(state);
  const fullRows=useMemo(()=>individualStatsRows(state),[state.stats,state.catalog,state.team.fullStatsFromRound]);
  const fullCompleted=new Set(fullRows.map(row=>row.matchId));
  const goalRows=useMemo(()=>seasonGoalRows(state,players),[state.stats,state.resultOnly,players]);
  const opponentOwnGoals = ownGoalDrafts[selectedMatchId] ?? state.opponentOwnGoals[selectedMatchId] ?? 0;
  const completed = processedMatchIds(state);
  const returnFromEntry=()=>{
    keyboard.hide();setDiscardOpen(false);setEditing(false);setResultEntry(false);
    if(profileEditReturn){setHistoryOpen(false);setPlayerDetailId(profileEditReturn.playerId);setProfileMatchId(profileEditReturn.matchId);setProfilePickerOpen(false);setProfileEditReturn(null);}
    else setHistoryOpen(true);
  };
  useEffect(()=>{
    if(!editing&&playerDetailId&&!playerTrigger.current?.isConnected)playerTrigger.current=document.querySelector<HTMLButtonElement>(`[data-stats-player-id="${playerDetailId}"]`);
  },[editing,playerDetailId,statsView]);
  useEffect(()=>{
    if(!playerDetailId)return;
    keyboard.hide();profileContent.current?.closest<HTMLElement>(".sheet-content")?.scrollTo({top:0});
    profileContent.current?.querySelector<HTMLElement>("[data-profile-focus]")?.focus({preventScroll:true});
    profileContent.current?.closest<HTMLElement>("[data-phone-screen]")?.scrollTo({top:0});
  },[profilePickerOpen,profileMatchId]);
  useEffect(() => {
    setStatsBack(statsVisible && (editing || historyOpen) ? {action: () => {
      keyboard.hide();
      if (editing) { if (drafts[selectedMatchId] || selectedMatchId in ownGoalDrafts) setDiscardOpen(true); else returnFromEntry(); }
      else setHistoryOpen(false);
    }} : null);
    return () => setStatsBack(null);
  }, [statsVisible, editing, historyOpen, drafts, ownGoalDrafts, selectedMatchId, setStatsBack, keyboard, profileEditReturn]);
  useEffect(() => { keyboard.hide(); document.querySelector<HTMLElement>(".app-screen .mobile-scroll")?.scrollTo({top:0}); }, [editing, historyOpen]);
  const rankings=useMemo(()=>{
    const build=(metric:StatsRanking)=>{
      const sorted=players.map(player=>{const rows=fullRows.filter(row=>row.playerId===player.id),goals=goalRows.filter(row=>row.playerId===player.id);return {player,hasData:metric==='goals'?goals.length>0:rows.length>0,value:metric==='goals'?goals.reduce((sum,r)=>sum+r.goals,0):metric==='attendance'?new Set(rows.filter(row=>row.present).map(row=>row.matchId)).size:rows.reduce((sum,row)=>sum+(metric==='keeper'?row.keeperMinutes:row.minutes),0),unknown:metric==='goals'?!goals.length:!rows.length||(metric==='minutes'||metric==='keeper')&&rows.some(row=>metric==='minutes'?row.minutesKnown===false:row.keeperMinutesKnown===false)};}).sort((a,b)=>Number(a.unknown)-Number(b.unknown)||b.value-a.value||a.player.shortName.localeCompare(b.player.shortName));
      return sorted.map(row=>({...row,position:row.unknown?null:sorted.findIndex(other=>!other.unknown&&other.value===row.value)+1,shared:!row.unknown&&sorted.filter(other=>!other.unknown&&other.value===row.value).length>1}));
    };
    return {minutes:build("minutes"),keeper:build("keeper"),goals:build("goals"),attendance:build("attendance")};
  },[state.stats,goalRows,fullRows,players]);
  const totals = useMemo(() => players.map(player => { const rows = fullRows.filter(r => r.playerId === player.id); return { player, present: rows.filter(r => r.present).length, hasData:rows.length>0, minutes: !rows.length?"—":rows.some(r=>r.minutesKnown===false) ? "?" : rows.reduce((s, r) => s + r.minutes, 0).toLocaleString("nl-NL"), keeper: !rows.length?"—":`${rows.reduce((s, r) => s + (r.keeperMinutesKnown===false?0:r.keeperMinutes), 0).toLocaleString("nl-NL")}${rows.some(r=>r.keeperMinutesKnown===false) ? "+?" : ""}`, goals: goalRows.filter(r=>r.playerId===player.id).reduce((s, r) => s + r.goals, 0) }; }), [state.stats,goalRows,fullRows,players]);
  const update = (id: string, patch: Partial<MatchStat>) => setDrafts(current => ({ ...current, [selectedMatchId]: (current[selectedMatchId] ?? matchRows(state, selectedMatchId)).map(r => {
    if (r.playerId !== id) return r;
    const next = { ...r, ...patch, ...(goalsOnly&&patch.goals!==undefined&&patch.goals>0?{present:true}:{}) };
    if (!next.present) return { ...next, minutes: 0, keeperMinutes: 0, goals: 0, minutesKnown: true, keeperMinutesKnown: true };
    return { ...next, keeperMinutes: next.minutesKnown === false ? next.keeperMinutes : Math.min(next.keeperMinutes, next.minutes) };
  }) }));
  const save = async () => {
    if (document.querySelector('.stats-screen [aria-invalid="true"]')) { setSaveError("Controleer de gemarkeerde getallen voordat je opslaat."); return; }
    if (!validateRows(draft, selectedMatchId, state.catalog) || draft.some(row => row.minutes > minuteLimit)) { setSaveError("Controleer minuten, aanwezigheid en goals"); return; }
    setSaveError("");
    if (!await send({ type: "save-stats", matchId: selectedMatchId, rows: draft, opponentOwnGoals })) { setSaveError("Opslaan niet bevestigd. Je concept is behouden. Vernieuw de bron en probeer opnieuw."); return; }
    setDrafts(current => { const next = { ...current }; delete next[selectedMatchId]; return next; });
    setOwnGoalDrafts(current => { const next = { ...current }; delete next[selectedMatchId]; return next; });
    returnFromEntry(); notify("Statistieken bijgewerkt; dashboard herberekend");
  };
  if(editing&&(resultEntry||state.resultOnly?.[selectedMatchId]))return <ResultOnlyEntry key={selectedMatchId} matchId={selectedMatchId} onMatchChange={setSelectedMatchId} onClose={returnFromEntry} onDraftChange={id=>setResultDraftIds(ids=>ids.includes(id)?ids:[...ids,id])} onSaved={id=>setResultDraftIds(ids=>ids.filter(x=>x!==id))}/>;
  if (editing) return <main className="screen-content stats-screen"><section className="entry-header"><div><h1>Wedstrijdhistorie</h1><p className="muted">{archived ? "Wedstrijdcijfers bekijken" : completed.has(selectedMatchId) ? "Wedstrijdcijfers corrigeren" : "Wedstrijdcijfers invoeren"}</p></div></section><section className="match-select-card"><label className="form-label">Wedstrijd<select aria-label="Wedstrijd voor statistieken" value={selectedMatchId} onChange={e => setSelectedMatchId(e.target.value)}>{editable.map(m => <option key={m.id} value={m.id}>{m.shortDate} · {m.opponent}</option>)}</select></label><div className="entry-context-line"><span>{goalsOnly?"Alleen doelpunten · 50 wedstrijdminuten":minuteLimit===50?"50 min · 4 × 12,5 min":"Werkelijke live speeltijd"}</span><button type="button" ref={entryInfoTrigger} onClick={()=>setEntryInfoOpen(true)} aria-label="Uitleg wedstrijdcijfers"><InfoCircledIcon/>Uitleg</button></div></section>{!completed.has(selectedMatchId)&&<button type="button" className="secondary-button" onClick={()=>{keyboard.hide();setResultEntry(true);}}>Alleen uitslag en scoreverloop</button>}{saveError && <p role="alert" className="storage-warning">{saveError}</p>}{draftError && <p role="alert">{draftError}</p>}<section className="entry-table">{draft.map(row => <div className="entry-row player-entry-card" key={row.playerId} data-testid={`entry-${row.playerId}`}><button type="button" className="entry-player player-details-toggle" aria-expanded={expandedPlayer === row.playerId} onClick={() => setExpandedPlayer(expandedPlayer === row.playerId ? "" : row.playerId)}><strong>{name(row.playerId)}</strong><small>{!goalsOnly&&`${row.minutesKnown === false ? "?" : row.minutes} min · `}{row.goals} goals</small><ChevronRightIcon /></button>{!goalsOnly&&<button type="button" className={`presence-toggle ${row.present ? "is-present" : ""}`} aria-label={`${name(row.playerId)} aanwezig`} aria-pressed={row.present} disabled={archived} onClick={() => update(row.playerId, { present: !row.present })}>{row.present?<CheckCircledIcon/>:<Cross1Icon/>}</button>}<div className="player-entry-fields" hidden={expandedPlayer !== row.playerId}>{!goalsOnly&&<><div className="entry-field"><span>Speelminuten</span><Stepper label={`${name(row.playerId)} minuten`} value={row.minutes} unknown={row.minutesKnown === false} max={minuteLimit} step={0.5} disabled={!row.present || archived} onUnknown={() => update(row.playerId, { minutes: 0, minutesKnown: false })} onChange={minutes => update(row.playerId, { minutes: Math.max(minutes, row.keeperMinutes), minutesKnown: true })} /></div><div className="entry-field"><span>Keeperminuten</span><Stepper label={`${name(row.playerId)} keeperminuten`} value={row.keeperMinutes} unknown={row.keeperMinutesKnown === false} max={row.minutesKnown === false ? minuteLimit : row.minutes} step={0.5} disabled={!row.present || archived} onUnknown={() => update(row.playerId, { keeperMinutes: 0, keeperMinutesKnown: false })} onChange={keeperMinutes => update(row.playerId, { keeperMinutes, keeperMinutesKnown: true })} /></div></>}<div className="entry-field"><span>Doelpunten</span><Stepper label={`${name(row.playerId)} goals`} value={row.goals} max={99} disabled={(!goalsOnly&&!row.present) || archived} onChange={goals => update(row.playerId, { goals })} /></div></div></div>)}</section><section className="opponent-own-goals"><strong>Eigen doelpunten tegenstander</strong><Stepper label="Eigen doelpunten tegenstander" value={opponentOwnGoals} max={99} disabled={archived} onChange={value => setOwnGoalDrafts(current => ({ ...current, [selectedMatchId]: value }))} /><small>Tellen bij het teamtotaal, niet bij een speler.</small></section><p className="entry-local-status"><CheckCircledIcon/>Concept op dit apparaat · alleen Opslaan verwerkt je cijfers.</p><div className="entry-save-footer"><button type="button" className="primary-button save-button" disabled={busy || archived} onClick={save}>{busy ? "Opslaan…" : "Opslaan"}</button></div><BottomSheet open={entryInfoOpen} onOpenChange={setEntryInfoOpen} title="Wedstrijdcijfers" description={goalsOnly?"Alleen de doelpunten per speler":"Vul de werkelijke aanwezigheid en minuten in"}><div className="statistics-notes">{goalsOnly?<section><h3>Speelronde 1</h3><p>Voer alleen doelpunten in. Elke verwerkte wedstrijd telt voor 50 wedstrijdminuten. Aanwezigheid, speel- en keeperminuten tellen pas vanaf speelronde {coverageRound} mee.</p></section>:<><section><h3>Speel- en keeperminuten</h3><p>Speelminuten zijn inclusief keeperminuten. Invoer per halve minuut, maximaal {minuteLimit} minuten. Met de snelkeuzes vul je kwartwedstrijden in.</p></section><section><h3>Onbekend of afwezig</h3><p>Laat minuten onbekend als je ze niet weet. Afwezig zet alle cijfers van die speler op nul.</p></section></>}<section><h3>Bewaren en verwerken</h3><p>Je concept blijft bewaard bij een tabwissel of herladen. Opslaan verwerkt alleen de geselecteerde wedstrijd.</p></section></div></BottomSheet><BottomSheet open={discardOpen} onOpenChange={setDiscardOpen} title="Concept bewaren?" description="Je cijfers zijn nog niet opgeslagen."><div className="sheet-actions"><button type="button" className="primary-button" onClick={() => { returnFromEntry(); }}>Concept bewaren en terug</button><button type="button" className="secondary-button" onClick={() => { setDrafts(current => { const next = { ...current }; delete next[selectedMatchId]; return next; }); setOwnGoalDrafts(current => { const next = { ...current }; delete next[selectedMatchId]; return next; }); returnFromEntry(); }}>Dit concept verwerpen</button></div></BottomSheet></main>;
  const standings=rankings[ranking];
  const knownKeeper = fullRows.reduce((sum,r)=>sum+(r.keeperMinutesKnown===false?0:r.keeperMinutes),0);
  const newMatch = editable.find(m => !completed.has(m.id));
  if (historyOpen) return <main className="screen-content stats-screen history-screen"><section className="entry-header"><div><h1>Wedstrijdhistorie</h1><p className="muted">Bekijk, voer in en corrigeer wedstrijdcijfers.</p></div></section>{draftIds.length>0&&<section className="draft-list"><h2>Bewaarde concepten</h2>{draftIds.map(id=><button type="button" className="history-row" key={id} onClick={()=>{keyboard.hide();setSelectedMatchId(id);setResultEntry(resultDraftIds.includes(id));setEditing(true);}}><span><strong>{matches.find(m=>m.id===id)?.opponent}</strong><small>Concept hervatten</small></span><ChevronRightIcon/></button>)}</section>}<section className="history-entry-action"><button type="button" className="primary-button" disabled={archived||!newMatch} onClick={()=>{keyboard.hide();if(newMatch){setSelectedMatchId(newMatch.id);setEditing(true);}}}><PlusIcon/>Wedstrijd invoeren</button><p className="summary-note">{archived?"Dit seizoen is alleen-lezen.":newMatch?"Voer cijfers in voor een wedstrijd die nog niet is verwerkt.":"Alle wedstrijden zijn verwerkt. Een actieve wedstrijd verwerk je via Live."}</p></section><section className="history-match-list"><h2>Geregistreerde wedstrijden</h2><label className="history-search-field"><MagnifyingGlassIcon/><KeyboardInput className="history-search" aria-label="Wedstrijdhistorie zoeken" placeholder="Tegenstander of datum" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)}/>{historyQuery&&<button type="button" aria-label="Zoekopdracht wissen" onClick={()=>setHistoryQuery("")}><Cross1Icon/></button>}</label><div className="history-grouped-list">{!matches.some(m=>completed.has(m.id)&&`${m.opponent} ${m.date} ${m.shortDate}`.toLowerCase().includes(historyQuery.toLowerCase()))&&<div className="empty-state compact"><MagnifyingGlassIcon/><strong>Geen wedstrijden gevonden</strong><p>Probeer een andere tegenstander of datum.</p></div>}{orderedMatches(matches.filter(m=>completed.has(m.id)&&`${m.opponent} ${m.date} ${m.shortDate}`.toLowerCase().includes(historyQuery.toLowerCase()))).reverse().map(m=><button type="button" className="history-row" key={m.id} onClick={()=>{keyboard.hide();setSelectedMatchId(m.id);setEditing(true);}}><DateTile match={m}/><span className="history-match-copy"><strong>{m.opponent}</strong><small>{m.time} · {m.venue}</small></span>{(()=>{const result=recordedMatchResult(state,m.id);return result&&<b>{scoreInVenueOrder(m,result.goalsFor,result.goalsAgainst).join("–")}</b>;})()}<ChevronRightIcon/></button>)}</div></section></main>;
  const profile=totals.find(row=>row.player.id===playerDetailId);
  const profileOrder=statsView==="ranking"?standings.map(row=>row.player):players;
  const profileIndex=profileOrder.findIndex(player=>player.id===playerDetailId);
  const switchProfile=(id:string)=>{if(!players.some(player=>player.id===id))return;keyboard.hide();setPlayerDetailId(id);setProfilePickerOpen(false);setProfileQuery("");setProfileMatchId(current=>current&&(state.stats.some(row=>row.matchId===current&&row.playerId===id)||Boolean(state.resultOnly?.[current]?.events.length))?current:null);profileContent.current?.closest<HTMLElement>(".sheet-content")?.scrollTo({top:0});};
  const profileMatch=matches.find(match=>match.id===profileMatchId);
  const resultProfile=profileMatchId?state.resultOnly?.[profileMatchId]:undefined;
  const profileMatchRow=state.stats.find(row=>row.matchId===profileMatchId&&row.playerId===playerDetailId)??(resultProfile&&playerDetailId?{goals:resultPlayerGoals(resultProfile,playerDetailId),minutes:0,keeperMinutes:0,minutesKnown:false,keeperMinutesKnown:false,present:null}:undefined);
  const matchArchive=profileMatchId?state.liveArchive?.[profileMatchId]:undefined;
  const profileMatchResult=profileMatchId?recordedMatchResult(state,profileMatchId):null;
  const profileMetrics=profile?[{key:"minutes",title:"Speelminuten",value:profile.minutes},{key:"goals",title:"Doelpunten",value:profile.goals},{key:"keeper",title:"Keeperminuten",value:profile.keeper},{key:"attendance",title:"Aanwezig",value:profile.hasData?`${profile.present}/${fullCompleted.size}`:"—"} ] as const:[];
  const profileToolbar=<div className="profile-switcher" role="group" aria-label="Speler wisselen"><button type="button" aria-label="Vorige speler" disabled={profileOrder.length<2} onClick={()=>switchProfile(profileOrder[(profileIndex-1+profileOrder.length)%profileOrder.length].id)}><ChevronLeftIcon/></button><button type="button" className="profile-picker-trigger" aria-label="Speler kiezen" aria-expanded={profilePickerOpen} disabled={profileOrder.length<2} onClick={()=>{keyboard.hide();setProfileQuery("");setProfilePickerOpen(true);}}><PersonIcon/><span>Speler kiezen</span><ChevronDownIcon/></button><button type="button" aria-label="Volgende speler" disabled={profileOrder.length<2} onClick={()=>switchProfile(profileOrder[(profileIndex+1)%profileOrder.length].id)}><ChevronRightIcon/></button></div>;
  const openPlayer=(id:string,trigger:HTMLButtonElement)=>{keyboard.hide();playerTrigger.current=trigger;setProfileMatchId(null);setProfilePickerOpen(false);setProfileQuery("");setProfileEditReturn(null);setPlayerDetailId(id);};
  return <main className="screen-content stats-screen">
    <section className="season-summary cumulative-summary" aria-label="Cumulatieve statistieken"><div className="season-summary-heading"><h2>Seizoen {seasonName}</h2><span className="summary-match-count" aria-label={`${completed.size} geregistreerde wedstrijden`}><strong>{completed.size}</strong> wedstrijden</span></div><dl><div><dt>Wedstrijden</dt><dd>{completed.size}</dd></div><div><dt>Doelpunten</dt><dd>{totalGoals(state)}</dd></div><div><dt>Wedstrijdminuten</dt><dd data-testid="season-match-minutes">{unknownMatchDurationCount(state)>0&&teamMatchMinutes(state)===0?"?":teamMatchMinutes(state).toLocaleString("nl-NL",{maximumFractionDigits:1})+(unknownMatchDurationCount(state)>0?"+?":"")}</dd></div><div><dt>Keeperminuten</dt><dd>{fullRows.length?knownKeeper.toLocaleString("nl-NL"):"—"}{fullRows.some(r=>r.keeperMinutesKnown===false)?"+?":""}</dd></div></dl>{coverageRound>1&&<p className="summary-note statistics-coverage">Speelronde 1: doelpunten en 50 wedstrijdminuten per wedstrijd. Aanwezigheid, speel- en keeperminuten vanaf speelronde {coverageRound}.</p>}{(unknownMatchDurationCount(state)>0||fullRows.some(r=>r.minutesKnown===false||r.keeperMinutesKnown===false))&&<p className="summary-note">Bij ? of +? ontbreken nog minuten.</p>}</section>
    <Fold title="Teamstatistieken" className="team-statistics" defaultOpen><ScreenTabs id="statistics" label="Teamstatistieken" value={statsView} onChange={setStatsView} items={[{id:"ranking",label:"Ranglijsten"},{id:"players",label:"Spelers",count:players.length}]}/><div role="tabpanel" id={`statistics-panel-${statsView}`} aria-labelledby={`statistics-tab-${statsView}`} tabIndex={0}>
      {statsView==="ranking"?<><label className="form-label ranking-select">Rangschik op<select aria-label="Rangschik op" value={ranking} onChange={e=>setRanking(e.target.value as typeof ranking)}><option value="goals">Doelpunten</option><option value="minutes">Speelminuten</option><option value="keeper">Keeperminuten</option><option value="attendance">Aanwezigheid</option></select></label>{completed.size?<ol className="ranking-list interactive-ranking">{standings.map(row=><li key={row.player.id}><button type="button" aria-label={`Statistieken ${row.player.shortName}`} data-stats-player-id={row.player.id} onClick={event=>openPlayer(row.player.id,event.currentTarget)}><span className="rank-number" aria-label={row.position?`${row.shared?"Gedeelde plaats":"Plaats"} ${row.position}`:"Geen rangpositie"}>{row.position??"–"}</span><strong>{row.player.shortName}</strong><span className="rank-value" aria-label={ranking==="attendance"&&row.hasData?`${row.value} van ${fullCompleted.size} wedstrijden aanwezig`:undefined}>{row.hasData?row.value.toLocaleString("nl-NL"):"—"}{ranking==="attendance"&&row.hasData&&<span className="rank-out-of"> van {fullCompleted.size}</span>}{row.unknown&&row.hasData?"+?":""}<small>{ranking==="attendance"?"wedstrijden":ranking==="goals"?"goals":"min"}</small></span><ChevronRightIcon/></button></li>)}</ol>:<div className="empty-state compact"><BarChartIcon/><strong>Nog geen wedstrijdcijfers</strong><p>Verwerkte wedstrijden verschijnen in deze ranglijsten.</p></div>}</>:<div className="statistics-player-list">{totals.map(row=><button type="button" className="statistics-player" key={row.player.id} aria-label={`Statistieken ${row.player.shortName}`} data-stats-player-id={row.player.id} onClick={event=>openPlayer(row.player.id,event.currentTarget)}><span className="player-number">{row.player.number}</span><span className="statistics-player-copy"><strong>{row.player.shortName}</strong><small>{row.minutes} min · {row.keeper} keeper</small></span><span className="rank-value">{row.goals}<small>goals</small></span><ChevronRightIcon/></button>)}</div>}
    </div></Fold>
    <GroupLink title="Wedstrijdhistorie" subtitle="Bekijk, voer in en corrigeer wedstrijdcijfers" label="Bekijk en corrigeer historische wedstrijdgegevens" icon={<CalendarIcon/>} onClick={()=>{keyboard.hide();setHistoryOpen(true);}}/>
    <GroupLink className="statistics-notes-link" title="Notities" subtitle="Uitleg bij de statistieken" icon={<InfoCircledIcon/>} buttonRef={notesTrigger} onClick={()=>setNotesOpen(true)}/>
    <BottomSheet open={playerDetailId!==null} onOpenChange={open=>{if(!open){setPlayerDetailId(null);setProfilePickerOpen(false);setProfileMatchId(null);}}} title={profilePickerOpen?"Speler kiezen":profile?.player.name??"Speler"} description={profilePickerOpen?`${players.length} spelers · ${seasonName}`:profileMatch?"Wedstrijdstatistieken":`Seizoen ${seasonName}`} snap={0.86}>{profile&&<div className="player-profile" ref={profileContent}>
      {profilePickerOpen?<div className="profile-player-picker"><button type="button" data-profile-focus className="sheet-back-link" onClick={()=>{keyboard.hide();setProfilePickerOpen(false);}}><ChevronLeftIcon/>Terug naar statistieken</button><label className="history-search-field"><MagnifyingGlassIcon/><KeyboardInput aria-label="Speler zoeken" className="history-search" placeholder="Zoek op naam" value={profileQuery} onChange={event=>setProfileQuery(event.target.value)}/>{profileQuery&&<button type="button" aria-label="Spelerzoekopdracht wissen" onClick={()=>setProfileQuery("")}><Cross1Icon/></button>}</label><div className="profile-picker-list">{profileOrder.filter(player=>`${player.name} ${player.shortName}`.toLowerCase().includes(profileQuery.trim().toLowerCase())).map(player=><button type="button" className="profile-player-option" key={player.id} aria-label={`Bekijk ${player.name}`} aria-pressed={player.id===profile.player.id} onClick={()=>switchProfile(player.id)}><span><strong>{player.name}</strong>{player.id===profile.player.id&&<small>Huidige speler</small>}</span>{player.id===profile.player.id?<CheckCircledIcon/>:<ChevronRightIcon/>}</button>)}</div>{!profileOrder.some(player=>`${player.name} ${player.shortName}`.toLowerCase().includes(profileQuery.trim().toLowerCase()))&&<p className="history-empty">Geen spelers gevonden.</p>}</div>:profileMatch&&profileMatchRow?<div className="player-match-detail"><button type="button" data-profile-focus className="sheet-back-link" onClick={()=>setProfileMatchId(null)}><ChevronLeftIcon/>Alle wedstrijden</button>{profileToolbar}<section className="player-match-context"><DateTile match={profileMatch}/><div><h3>{profileMatch.opponent}</h3><p>{profileMatch.time} · {profileMatch.venue}</p></div>{profileMatchResult&&<strong className="player-match-score">{scoreInVenueOrder(profileMatch,profileMatchResult.goalsFor,profileMatchResult.goalsAgainst).join("–")}</strong>}</section><dl className="profile-metrics match-detail-metrics">{!goalsOnlyMatch(state,profileMatch.id)&&<div><dt>Speelminuten</dt><dd>{profileMatchRow.minutesKnown===false?"?":profileMatchRow.minutes.toLocaleString("nl-NL")}</dd></div>}<div><dt>Doelpunten</dt><dd>{profileMatchRow.goals}</dd></div>{!goalsOnlyMatch(state,profileMatch.id)&&<><div><dt>Keeperminuten</dt><dd>{profileMatchRow.keeperMinutesKnown===false?"?":profileMatchRow.keeperMinutes.toLocaleString("nl-NL")}</dd></div><div><dt>Aanwezig</dt><dd>{profileMatchRow.present===null?"Onbekend":profileMatchRow.present?"Ja":"Nee"}</dd></div></>}</dl><p className="profile-match-note">{resultProfile?"Alleen uitslag en scoreverloop geregistreerd. Aanwezigheid, wedstrijdduur, speel- en keeperminuten zijn onbekend.":goalsOnlyMatch(state,profileMatch.id)?"Deze speelronde telt alleen mee voor doelpunten en 50 wedstrijdminuten voor het team.":"Speelminuten zijn inclusief keeperminuten."}{!profileMatchResult?" De stand is niet vastgelegd.":""}{profileMatchRow.minutesKnown===false||profileMatchRow.keeperMinutesKnown===false?" ? betekent onbekend.":""}</p>{(drafts[profileMatch.id]||profileMatch.id in ownGoalDrafts)&&<p className="profile-match-draft"><InfoCircledIcon/>Er staat een concept klaar. Hier zie je de opgeslagen cijfers.</p>}{archived?<p className="read-only-note"><LockClosedIcon/>Archief · alleen lezen</p>:<button type="button" className="secondary-button profile-edit-action" onClick={()=>{keyboard.hide();setProfileEditReturn({playerId:profile.player.id,matchId:profileMatch.id});setSelectedMatchId(profileMatch.id);setExpandedPlayer(profile.player.id);setPlayerDetailId(null);setEditing(true);}}>Cijfers wijzigen<ChevronRightIcon/></button>}</div>:<>
      {profileToolbar}
      <dl className="profile-metrics">{profileMetrics.map(metric=>{const rank=rankings[metric.key].find(row=>row.player.id===profile.player.id);const position=completed.size?rank?.position:null;return <div key={metric.key} data-metric={metric.key} className={ranking===metric.key?"is-ranked-on":""}><dt>{metric.title}</dt><dd><span className="metric-value">{metric.value}</span><span className="metric-rank" aria-label={`${statsRankingLabels[metric.key]}: ${position?`${rank?.shared?"gedeelde plaats":"plaats"} ${position}`:rank?.unknown&&rank?.hasData?"minuten onvolledig":"geen rangpositie"}`}><strong>{position?`#${position}`:"—"}</strong><span>{position?rank?.shared?"gedeeld":"rang":rank?.unknown&&rank?.hasData?"onvolledig":"geen rang"}</span></span></dd></div>;})}</dl><h3>Per wedstrijd</h3>{completed.size?<div className="profile-matches">{orderedMatches(matches.filter(match=>goalRows.some(row=>row.matchId===match.id&&row.playerId===profile.player.id))).reverse().map(match=>{const row=state.stats.find(row=>row.matchId===match.id&&row.playerId===profile.player.id);const goals=goalRows.find(row=>row.matchId===match.id&&row.playerId===profile.player.id)?.goals??0;return <button type="button" className="profile-match" key={match.id} onClick={()=>{keyboard.hide();setProfileMatchId(match.id);}}><DateTile match={match}/><span><strong>{match.opponent}</strong><small>{(state.resultOnly?.[match.id]||goalsOnlyMatch(state,match.id))?`${goals} ${goals===1?"goal":"goals"} · alleen doelpunten`:row?.present?`${row.minutesKnown===false?"?":row.minutes} min · ${row.goals} ${row.goals===1?"goal":"goals"}`:"Afwezig"}</small></span><ChevronRightIcon/></button>;})}</div>:<p className="summary-note">Nog geen geregistreerde wedstrijden.</p>}<p className="profile-footnote">? betekent onbekend; +? betekent dat een deel van de minuten ontbreekt.</p></>}
    </div>}</BottomSheet>
    <BottomSheet open={notesOpen} onOpenChange={setNotesOpen} title="Notities" description="Zo lees je de statistieken"><div className="statistics-notes"><section><h3>Wedstrijdminuten</h3><p>De totale wedstrijdduur van het team, één keer per verwerkte wedstrijd. Volledige historische invoer gebruikt 50 minuten; Live bewaart de werkelijke speeltijd zonder rust. Bij alleen een uitslag blijft de wedstrijdduur onbekend.</p></section>{coverageRound>1&&<section><h3>Vanaf speelronde {coverageRound}</h3><p>Oudere speelrondes tellen alleen mee voor doelpunten en wedstrijdduur. Individuele speelminuten, keeperminuten en aanwezigheid blijven buiten de totalen en ranglijsten.</p></section>}<section><h3>Ontbrekende minuten</h3><p>? betekent onbekend. Bij +? ontbreekt een deel van de minuten. Onbekende minuten tellen niet als nul. Wedstrijden met alleen uitslag en scoreverloop tellen mee voor wedstrijden en doelpunten; aanwezigheid en minuten worden niet ingevuld en tellen niet mee in die ranglijsten.</p></section><section><h3>Eigen doelpunten</h3><p>{Object.values(state.opponentOwnGoals).reduce((sum,count)=>sum+count,0)} eigen doelpunten van tegenstanders. Deze tellen bij het teamtotaal, niet bij een speler.</p></section><section><h3>Lopende wedstrijden</h3><p>Een wedstrijd telt pas mee nadat je de wedstrijddata verwerkt. Live speel- en keeperminuten worden dan op hele minuten afgerond.</p></section></div></BottomSheet>
  </main>;
}
function Stepper({ label, value, max, step = 1, unknown = false, disabled, onChange, onUnknown }: { onUnknown?: () => void; unknown?: boolean; label: string; value: number; max: number; step?: number; disabled: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState(unknown ? "" : value.toLocaleString("nl-NL"));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(unknown ? "" : value.toLocaleString("nl-NL")); setInvalid(false); }, [value, unknown]);
  const commit = (raw: string) => { setText(raw); if (!raw.trim() && unknown) { setInvalid(false); return; } const n = Number(raw.replace(",", ".")); if (raw.trim() && Number.isFinite(n) && n >= 0 && n <= max && Math.abs(n / step - Math.round(n / step)) < 1e-8) { setInvalid(false); onChange(n); } else setInvalid(true); };
  return <div className="number-control"><div className="stepper" role="group" aria-label={label}><button type="button" aria-label={`${label} verlagen`} disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - step))}>−</button><KeyboardInput aria-label={label} aria-invalid={invalid} inputMode="decimal" value={text} placeholder={unknown ? "?" : "0"} disabled={disabled} onChange={e => { setText(e.target.value); const n = Number(e.target.value.replace(",", ".")); setInvalid(!e.target.value.trim() || !Number.isFinite(n) || n < 0 || n > max || Math.abs(n / step - Math.round(n / step)) >= 1e-8); }} onBlur={e => commit(e.target.value)} /><button type="button" aria-label={`${label} verhogen`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button></div>{onUnknown && <button type="button" className="text-button" disabled={disabled || unknown} onClick={onUnknown}>Onbekend laten</button>}{invalid && <small role="alert">0–{max}, stappen van {step.toLocaleString("nl-NL")}</small>}{step === 0.5 && <div className="minute-presets">{[0,12.5,25,37.5,50].filter(n => n <= max).map(n => <button type="button" disabled={disabled} key={n} aria-label={`${label} ${n.toLocaleString("nl-NL")}`} onClick={() => onChange(n)}>{n.toLocaleString("nl-NL")}</button>)}</div>}</div>;
}
function AssistantSettings() {
  const {state,save,busy,draftScope,players,archived}=useCoach();
  const stored=state.team.substitutionPolicy??defaultPolicy(),key=`coachmate:assistant-settings:${draftScope}`;
  const [draft,setDraft]=useState(()=>{try{const saved=JSON.parse(readDraft(key)??'null');if(saved&&saved.policy&&saved.keepers)return saved as {policy:SubstitutionPolicy;keepers:Record<string,boolean>};}catch{}return {policy:structuredClone(stored),keepers:Object.fromEntries(players.map(p=>[p.id,p.substitutionProfile?.goalkeeperEligible??(p.position==='K'||p.id===state.live.keeperId)]))};});
  const [error,setError]=useState(''),[dirty,setDirty]=useState(Boolean(readDraft(key)));
  useEffect(()=>{if(!dirty)return;try{localStorage.setItem(key,JSON.stringify(draft));}catch{setError('Lokaal bewaren lukt niet. Houd dit scherm open.');}},[draft,dirty,key]);
  const update=(patch:Partial<SubstitutionPolicy>)=>{setDraft(d=>({...d,policy:{...d.policy,...patch}}));setDirty(true);};
  const numeric=(label:string,value:number,onChange:(n:number)=>void,min:number,max:number,step=1)=><label className="form-label">{label}<KeyboardInput aria-label={label} inputMode="decimal" type="number" min={min} max={max} step={step} value={Number.isFinite(value)?Number(value.toFixed(6)):''} onChange={e=>{onChange(e.target.value===''?NaN:Number(e.target.value));}}/></label>;
  async function persist(){try{const policy=normalizePolicy(draft.policy);const profiles:Record<string,PlayerProfile>=Object.fromEntries(players.map(p=>[p.id,{...p.substitutionProfile,goalkeeperEligible:Boolean(draft.keepers[p.id])}]));if(!Object.values(profiles).some(p=>p.goalkeeperEligible))throw new Error('Kies minstens één geschikte keeper.');
    const ok=await save([{type:'set-substitution-profiles',profiles},{type:'set-substitution-policy',expectedVersion:state.team.substitutionPolicy?.version??0,policy}]);if(!ok)throw new Error('Opslaan niet bevestigd. Je lokale instellingen blijven bewaard.');localStorage.removeItem(key);sessionStorage.removeItem(key);setDraft(d=>({...d,policy}));setDirty(false);setError('');}catch(e){setError((e as Error).message);}}
  return <section className="assistant-settings"><p className="summary-note">Adviezen worden op dit apparaat berekend. Alleen jij bevestigt een uitgevoerde wissel. Instellingen gelden voor dit teamseizoen.</p><div className="assistant-settings-grid">
    {(['fairness','rotation','tactical'] as const).map((criterion,i)=>numeric(['Gewicht eerlijke speeltijd','Gewicht wisselrotatie','Gewicht tactische kwaliteit'][i],draft.policy.weights[criterion]*100,n=>update({weights:{...draft.policy.weights,[criterion]:n/100}}),0,100))}
    </div><p className="summary-note">Verhoudingen worden bij opslaan samen naar 100% omgerekend.</p>
    {numeric('Historische compensatie (%)',draft.policy.compensationFactor*100,n=>update({compensationFactor:n/100}),0,100)}
    {numeric('Historische wedstrijden',draft.policy.historyMatches,n=>update({historyMatches:n}),1,50)}
    {numeric('Maximale historische correctie (%)',draft.policy.maxHistoricalCorrection*100,n=>update({maxHistoricalCorrection:n/100}),0,100)}
    {(['preferBundled','preferPeriodTransitions','preferWholePeriodsOnBench'] as const).map((option,i)=><label className="assistant-check" key={option}><input type="checkbox" checked={draft.policy[option]} onChange={e=>update({[option]:e.target.checked})}/>{['Wissels bij voorkeur bundelen','Bij voorkeur wisselen bij periodeovergangen','Bij voorkeur hele perioden op de bank'][i]}</label>)}
    <label className="form-label">Keepersrotatie<select aria-label="Keepersrotatie" value={draft.policy.goalkeeperMode} onChange={e=>update({goalkeeperMode:e.target.value as 'ROTATING'|'FIXED'})}><option value="ROTATING">Roterende keepers</option><option value="FIXED">Voorkeur voor huidige keeper</option></select></label>
    {numeric('Herinnering vooraf (seconden)',draft.policy.reminderSeconds,n=>update({reminderSeconds:n}),0,600)}<p className="summary-note">Herinneringen verschijnen in de geopende app op basis van de bestaande wedstrijdklok.</p>
    <details><summary>Geschikte keepers</summary>{players.map(p=><label className="assistant-check" key={p.id}><input type="checkbox" checked={Boolean(draft.keepers[p.id])} onChange={e=>{setDraft(d=>({...d,keepers:{...d.keepers,[p.id]:e.target.checked}}));setDirty(true);}}/>{p.name}</label>)}<p className="summary-note">Selectie bepaalt geschiktheid voor het advies. De actuele keeper wijzig je bij de opstelling.</p></details>
    <button type="button" className="text-button" disabled={busy||archived} onClick={()=>{setDraft(d=>({...d,policy:defaultPolicy()}));setDirty(true);}}>Standaardwaarden herstellen</button>
    <p className="summary-note" role="status">{dirty?'Lokaal concept · nog niet opgeslagen':`Instellingen bewaard · beleid v${state.team.substitutionPolicy?.version??1}`}</p>
    {error&&<p role="alert">{error}</p>}<button className="primary-button" type="button" disabled={!dirty||busy||archived} onClick={()=>void persist()}>Wisselinstellingen opslaan</button>
  </section>;
}

function FormationSettings(){
  const keyboard=useKeyboard();
  const {state,save,busy,archived,draftScope}=useCoach(),key=`coachmate:formation-settings:${draftScope}`,stored=formationCatalog(state.team);
  type Draft={version:2;size:FieldSize;pattern:string;formations:Formation[];editingId?:string;editingPattern?:string};
  const initial=():Draft=>({version:2,size:state.team.fieldSize??6,pattern:'',formations:formationCatalog(state.team)});
  const [draft,setDraft]=useState<Draft>(()=>{try{const d=JSON.parse(readDraft(key)??'null');if(d&&[6,8,11].includes(d.size)&&typeof d.pattern==='string'){if(d.version===2){validateFormationCatalog(d.formations);if(d.editingId!==undefined&&(!d.formations.some((f:Formation)=>f.id===d.editingId)||typeof d.editingPattern!=='string'))throw new Error();return d;}validateFormations(d.formations);return {...d,version:2,formations:formationCatalog({formations:d.formations})};}}catch{}return initial();});
  const [error,setError]=useState('');const dirty=JSON.stringify(draft.formations)!==JSON.stringify(stored);
  useEffect(()=>{try{if(dirty||draft.pattern||draft.editingId)localStorage.setItem(key,JSON.stringify(draft));else{localStorage.removeItem(key);sessionStorage.removeItem(key);}}catch{setError('Concept bewaren lukt niet. Houd dit scherm open.');}},[draft,dirty,key]);
  function linesFrom(text:string){if(!/^\d(?:\s*-\s*\d){1,4}$/.test(text.trim()))throw new Error('Gebruik aantallen per linie, bijvoorbeeld 2-2-1.');const lines=text.split('-').map(n=>Number(n.trim()));validateFormation(lines,draft.size);return lines;}
  function add(){keyboard.hide();try{const formations=[...draft.formations,{id:crypto.randomUUID(),fieldSize:draft.size,lines:linesFrom(draft.pattern)}];validateFormationCatalog(formations);setDraft(d=>({...d,pattern:'',formations}));setError('');}catch(e){setError((e as Error).message);}}
  function finishEdit(){keyboard.hide();try{const lines=linesFrom(draft.editingPattern??''),formations=draft.formations.map(f=>f.id===draft.editingId?{...f,lines}:f);validateFormationCatalog(formations);setDraft(d=>({...d,formations,editingId:undefined,editingPattern:undefined}));setError('');}catch(e){setError((e as Error).message);}}
  return <section className="formation-settings"><p className="summary-note">Dit teamseizoen: {state.team.fieldSize??6} spelers, inclusief keeper.</p><label className="form-label">Varianten beheren voor<select aria-label="Formaties voor teamgrootte" value={draft.size} disabled={busy||archived||Boolean(draft.editingId)} onChange={e=>{keyboard.hide();setDraft(d=>({...d,size:Number(e.target.value) as FieldSize}));setError('');}}>{[6,8,11].map(n=><option key={n} value={n}>{n} spelers, inclusief keeper{n===(state.team.fieldSize??6)?' · dit team':''}</option>)}</select></label>{draft.size!==(state.team.fieldSize??6)&&<p className="summary-note">Deze varianten horen bij een ander spelersaantal. De teamgrootte wijzig je bij Team en wedstrijd.</p>}<p className="summary-note">Van verdediging naar aanval. De keeper telt niet mee in de formatie.</p><ul className="formation-settings-list">{draft.formations.filter(f=>f.fieldSize===draft.size).map(f=><li key={f.id}>{draft.editingId===f.id?<div className="formation-inline-edit"><KeyboardInput autoFocus aria-label={`Formatie ${f.lines.join('-')} aanpassen`} value={draft.editingPattern??''} maxLength={25} disabled={busy||archived} onChange={e=>{setDraft(d=>({...d,editingPattern:e.target.value}));setError('');}}/><button type="button" className="formation-icon" aria-label="Aanpassing bewaren" disabled={busy||archived} onClick={finishEdit}><CheckIcon aria-hidden="true"/></button><button type="button" className="formation-icon" aria-label="Formatieaanpassing annuleren" disabled={busy} onClick={()=>{keyboard.hide();setDraft(d=>({...d,editingId:undefined,editingPattern:undefined}));setError('');}}><Cross1Icon aria-hidden="true"/></button></div>:<><strong>{f.lines.join('-')}</strong><div className="formation-row-actions"><button type="button" className="formation-icon" aria-label={`Formatie ${f.lines.join('-')} aanpassen`} disabled={busy||archived||Boolean(draft.editingId)} onClick={()=>{keyboard.hide();setDraft(d=>({...d,editingId:f.id,editingPattern:f.lines.join('-')}));setError('');}}><Pencil1Icon aria-hidden="true"/></button><button type="button" className="formation-icon formation-delete" aria-label={`Formatie ${f.lines.join('-')} verwijderen`} disabled={busy||archived||Boolean(draft.editingId)} onClick={()=>{keyboard.hide();setDraft(d=>({...d,formations:d.formations.filter(item=>item.id!==f.id)}));setError('');}}><TrashIcon aria-hidden="true"/></button></div></>}</li>)}</ul>{!draft.formations.some(f=>f.fieldSize===draft.size)&&<p className="summary-note">Nog geen varianten voor {draft.size} spelers.</p>}<label className="form-label">Eigen formatie<KeyboardInput aria-label="Eigen formatie" value={draft.pattern} maxLength={25} placeholder={draft.size===6?'Bijv. 3-1-1':draft.size===8?'Bijv. 2-4-1':'Bijv. 3-5-2'} disabled={busy||archived||Boolean(draft.editingId)} onChange={e=>{setDraft(d=>({...d,pattern:e.target.value}));setError('');}}/></label><button type="button" className="secondary-button" disabled={!draft.pattern.trim()||busy||archived||Boolean(draft.editingId)} onClick={add}><PlusIcon/>Formatie toevoegen</button>{error&&<p role="alert" className="editor-error">{error}</p>}<p role="status" className="summary-note">{draft.editingId?'Rond de aanpassing af of annuleer.':dirty?'Lokaal concept · nog niet opgeslagen':`Varianten voor ${draft.size} spelers`}</p><button type="button" className="primary-button" disabled={!dirty||busy||archived||Boolean(draft.editingId)} onClick={async()=>{keyboard.hide();if(await save([{type:'set-formations',formations:draft.formations,replaceDefaults:true}])){setError('');setDraft(d=>({...d,pattern:''}));}else setError('Opslaan niet bevestigd. Je concept blijft bewaard.');}}>Formaties opslaan</button>{(dirty||draft.pattern||draft.editingId)&&<button type="button" className="text-button" disabled={busy} onClick={()=>{keyboard.hide();setDraft(initial());setError('');}}>Wijzigingen annuleren</button>}</section>;
}
function TeamSettings() {
  const {state,save,busy,draftScope}=useCoach();
  const key=`coachmate:team-settings:${draftScope}`;
  const [draft,setDraft]=useState<{periods:Periods;fieldSize:FieldSize}>(()=>{try {const d=JSON.parse(readDraft(key)??"null");if(d&&[2,4].includes(d.periods)&&[6,8,11].includes(d.fieldSize))return d;}catch{}return {periods:state.team.periods,fieldSize:state.team.fieldSize??6};});
  const [error,setError]=useState("");
  const changed=draft.periods!==state.team.periods||draft.fieldSize!==(state.team.fieldSize??6);
  useEffect(()=>{try {if(changed)localStorage.setItem(key,JSON.stringify(draft));else {localStorage.removeItem(key);sessionStorage.removeItem(key);}}catch {setError("Concept bewaren op dit apparaat lukt niet.");}},[draft,key,changed]);
  return <section className="team-settings"><h3 className="settings-panel-title">Wedstrijdinstellingen</h3>
    <label className="form-label">Wedstrijdindeling<select aria-label="Wedstrijdindeling" value={draft.periods} onChange={e=>setDraft(d=>({...d,periods:Number(e.target.value) as Periods}))}><option value="2">2 helften</option><option value="4">4 kwarten</option></select></label>
    <label className="form-label">Spelers op het veld<select aria-label="Spelers op het veld" value={draft.fieldSize} onChange={e=>setDraft(d=>({...d,fieldSize:Number(e.target.value) as FieldSize}))}>{[6,8,11].map(n=><option key={n} value={n}>{n} spelers, inclusief keeper</option>)}</select></label>
    {error&&<p role="alert">{error}</p>}<p className="summary-note" role="status">{changed?"Lokaal concept · nog niet opgeslagen":"Geen wijzigingen om op te slaan."}</p>
    <button type="button" className="primary-button" disabled={!changed||busy} onClick={async()=>{const now=Date.now();const actions:Action[]=[];if(draft.periods!==state.team.periods)actions.push({type:"set-periods",periods:draft.periods,now});if(draft.fieldSize!==(state.team.fieldSize??6))actions.push({type:"set-field-size",fieldSize:draft.fieldSize,now});if(await save(actions))setError("");else setError("Opslaan niet bevestigd. Je concept blijft bewaard.");}}>Teaminstellingen opslaan</button>
    {changed&&<button type="button" className="text-button" onClick={()=>{setDraft({periods:state.team.periods,fieldSize:state.team.fieldSize??6});setError("");}}>Wijzigingen annuleren</button>}
  </section>;
}
function ClubSettings({ clubName, teamName, onSave }: { clubName: string; teamName: string; onSave: (clubName: string, teamName: string) => Promise<boolean> }) {
  const {draftScope}=useCoach();
  const key=`coachmate:club-draft:${draftScope}`;
  const [restored]=useState(()=>{try{return JSON.parse(readDraft(key)??"null");}catch{return null;}});
  const [club, setClub] = useState(typeof restored?.club==="string"?restored.club:clubName);
  const [team, setTeam] = useState(typeof restored?.team==="string"?restored.team:teamName);
  const [error,setError]=useState("");
  useEffect(()=>{try{if(club!==clubName||team!==teamName)localStorage.setItem(key,JSON.stringify({club,team}));else{localStorage.removeItem(key);sessionStorage.removeItem(key);}}catch{setError("Concept bewaren op dit apparaat lukt niet.");}},[club,team,clubName,teamName,key]);
  const keyboard = useKeyboard();
  return <section className="team-settings"><h3>Club en team</h3>
    <label className="form-label">Clubnaam<KeyboardInput aria-label="Clubnaam" value={club} maxLength={200} onChange={e => setClub(e.target.value)} /></label>
    <label className="form-label">Teamnaam<KeyboardInput aria-label="Teamnaam" value={team} maxLength={200} onChange={e => setTeam(e.target.value)} /></label>
    <p>Spelers, wedstrijden en historie blijven bij dit team horen.</p>{error&&<p role="alert">{error}</p>}
    <button type="button" className="primary-button" disabled={!club.trim() || !team.trim() || (club.trim() === clubName && team.trim() === teamName)} onClick={async () => { keyboard.hide(); if(!await onSave(club.trim(), team.trim()))setError("Opslaan niet bevestigd. Je concept blijft bewaard."); }}>Club en team opslaan</button>
  </section>;
}
function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return { state: raw ? parseState(raw) : designMode?designState():createInitialState(), error: "" }; }
  catch { return { state: createInitialState(), error: "Bestaande opslag kan niet worden gelezen. Ze wordt niet overschreven. Exporteer de opslag via Instellingen voor herstel." }; }
}
function downloadBackup(contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `coachmate-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Prototype() {
  const [loaded] = useState(loadState);
  const [state, dispatch] = useReducer((current: CoachState, action: Action | { type: "replace"; state: CoachState }) => action.type === "replace" ? action.state : coachReducer(current, action), loaded.state);
  const [session, setSession] = useState<{ configured: boolean; authenticated: boolean; csrf?: string; email?: string } | null>(null);
  const [remote, setRemote] = useState(false);
  const [booting,setBooting]=useState(!designMode);
  const [sourceConflict,setSourceConflict]=useState(false);
  const [recoveryOpen,setRecoveryOpen]=useState(false);
  const [recovery,setRecovery]=useState<{state:CoachState;preview:CoachState;revision:number;sourceToken:string;distribution?:any}|null>(null);
  const [recoveryError,setRecoveryError]=useState('');
  const [headerHeight,setHeaderHeight]=useState(100);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const stateRef=useRef(state); stateRef.current=state;
  const journalRef=useRef<LocalJournal|null>(null);
  const cacheLocked=useRef(false);
  const [journal,setJournal]=useState<LocalJournal|null>(null);
  const setLocalJournal=(value:LocalJournal|null)=>{journalRef.current=value;setJournal(value);};
  const revision = useRef({ revision: 0, sourceToken: "" });
  const [teams, setTeams] = useState<{ teamSeasonId: string; seasonId: string; teamName: string; clubName?: string; clubId?: string }[]>([]);
  const [seasons, setSeasons] = useState<{ seasonId: string; name: string; archived: boolean }[]>([]);
  const [connectionError, setConnectionError] = useState("");
  const [loadFailure,setLoadFailure]=useState<{teamSeasonId:string;kind:'google-state'|'local-journal';detail:string}|null>(null);
  const [loadRecoveryOpen,setLoadRecoveryOpen]=useState(false);
  const [loadRecovery,setLoadRecovery]=useState<{draft:LocalJournal;raw:string}|null>(null);
  const [loadRecoveryError,setLoadRecoveryError]=useState('');
  const [noticeDismissed,setNoticeDismissed]=useState(false);
  useEffect(()=>setNoticeDismissed(false),[connectionError]);
  const [formLinks, setFormLinks] = useState<{ formId: string; url: string; matchId: string; round: number; codeEntryId?:string; prefillDefaults?:string }[]>([]);
  const [invites, setInvites] = useState<FormInvite[]>([]);
  const [formJobs,setFormJobs]=useState<FormJob[]>([]),[deliveries,setDeliveries]=useState<FormDelivery[]>([]),[mailReady,setMailReady]=useState(false);
  const serviceToken=useRef("");
  function applyForms(data:any){setFormLinks(data.forms);setInvites(data.invites);setFormJobs(data.jobs??[]);setDeliveries(data.deliveries??[]);setMailReady(data.mailReady===true);if(serviceToken.current&&serviceToken.current===data.serviceDataToken&&data.revision===revision.current.revision&&!journalRef.current)revision.current.sourceToken=data.sourceToken;serviceToken.current=data.serviceDataToken??"";}
  async function refreshDistribution(){if(pending.current)return;const data=await request(`/api/forms?team=${encodeURIComponent(stateRef.current.catalog!.teamSeasonId)}`);applyForms(data);const job=data.jobs?.find((job:any)=>job.status==="awaiting-mapping");if(job&&!journalRef.current)await mutate("/api/forms/finalize",{formId:job.formId});}
  const api = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_ORIGIN || (["127.0.0.1", "localhost"].includes(window.location.hostname) ? "http://127.0.0.1:4175" : window.location.origin);
  async function request(path:string,data?:unknown){
    const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(api+path,{credentials:'include',signal:controller.signal,headers:data?{'Content-Type':'application/json','X-CSRF-Token':session?.csrf??''}:{},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
      const result=await response.json();
      if(!response.ok){if(response.status===401)setSession(previous=>previous?{...previous,authenticated:false}:previous);throw Object.assign(new Error(result.error||'Verbinding mislukt'),{status:response.status});}
      return result;
    }catch(error){if((error as Error).name==='AbortError')throw new Error('De aanvraag duurde te lang. De opslag is niet bevestigd; je lokale gegevens blijven bewaard.');if(error instanceof TypeError)throw new Error('De gegevensbron is niet bereikbaar. Probeer opnieuw.');throw error;}
    finally{window.clearTimeout(timeout);}
  }
  async function checkConnection() {
    if(designMode)return;
    setBooting(true);
    try {
      const info=await request('/api/session');setSession(info);setConnectionError('');
      if(info.authenticated){
        let remembered='';try{remembered=localStorage.getItem(`coachmate:team:${info.email}`)??'';}catch{}
        const data=await request(`/api/teams?team=${encodeURIComponent(remembered)}`);setTeams(data.teams);setSeasons(data.seasons);
        const chosen=data.teams.find((t:{teamSeasonId:string})=>t.teamSeasonId===remembered)??(data.teams.length===1?data.teams[0]:null);
        if(chosen)await selectTeam(chosen.teamSeasonId,info.email,data.state?data:undefined);
      }
    }catch(error){setConnectionError((error as Error).message||'Backend niet bereikbaar of Google-bron niet toegankelijk.');}
    finally{setBooting(false);}
  }
  const connectionStarted=useRef(false);
  useEffect(()=>{if(connectionStarted.current)return;connectionStarted.current=true;void checkConnection();},[]);
  useEffect(()=>{
    const header=document.querySelector('.coach-app > .app-header');if(!header)return;
    const observer=new ResizeObserver(()=>setHeaderHeight(header.getBoundingClientRect().height));observer.observe(header);
    return()=>observer.disconnect();
  },[booting]);
  async function selectTeam(teamSeasonId:string,email=session?.email,bootstrap?:any) {
    if(pending.current)return;
    pending.current=true;setBusy(true);
    let phase:'connection'|'google-state'|'local-journal'='connection';
    try{
      const result=bootstrap??await request(`/api/state?team=${encodeURIComponent(teamSeasonId)}`);
      phase='google-state';const next=parseState(JSON.stringify(result.state));
      try{if(email)localStorage.setItem(`coachmate:team:${email}`,teamSeasonId);}catch{}
      phase='local-journal';
      const confirmed=archiveConfirmedJournal(localStorage,email??'',teamSeasonId,next);
      const cached=confirmed?null:readJournal(localStorage,email??'',teamSeasonId);
      const conflict=Boolean(cached&&(cached.revision!==result.revision||cached.sourceToken!==result.sourceToken));
      cacheLocked.current=false;setSourceConflict(conflict);setLocalJournal(cached);
      revision.current={revision:cached?.revision??result.revision,sourceToken:cached?.sourceToken??result.sourceToken};
      setRemote(true);stateRef.current=cached?.state??next;dispatch({type:'replace',state:cached?.state??next});
      setLoadFailure(null);phase='connection';
      setConnectionError(conflict?'De bron is bijgewerkt. Je lokale concept is bewaard. Vergelijk de gegevens om verder te gaan.':'');
      if(result.distribution)applyForms(result.distribution);else applyForms(await request(`/api/forms?team=${encodeURIComponent(teamSeasonId)}`));
    }catch(error){
      const detail=(error as Error).message;
      if(phase!=='connection'){
        setLoadFailure({teamSeasonId,kind:phase,detail});
        setConnectionError(phase==='local-journal'?`Je bent ingelogd. Het lokale wedstrijdconcept kan niet worden geladen: ${detail} Het origineel blijft bewaard.`:`Je bent ingelogd. De wedstrijdgegevens uit Google kunnen niet worden geladen: ${detail}`);
      }else setConnectionError(detail);
    }
    finally{pending.current=false;setBusy(false);}
  }
  function exportLoadRecovery(){
    try{
      const team=loadFailure?.teamSeasonId??stateRef.current.catalog?.teamSeasonId??'';
      downloadBackup(JSON.stringify({format:'coachmate-recovery-v1',appVersion:'v41',createdAt:new Date().toISOString(),teamSeasonId:team,failure:loadFailure,authenticated:session?.authenticated??false,standalone:window.matchMedia('(display-mode: standalone)').matches,storage:recoveryStorage(localStorage,session?.email??'',team)},null,2));
      setToast('Herstelbestand klaargezet. Bewaar dit bestand op je apparaat.');
    }catch{setLoadRecoveryError('Exporteren lukt niet. Sluit de app niet en wis geen appgegevens.');}
  }
  async function inspectLoadRecovery(){
    keyboard.hide();setNoticeDismissed(true);setLoadRecoveryOpen(true);setLoadRecovery(null);setLoadRecoveryError('');
    if(!loadFailure||loadFailure.kind!=='local-journal'||!session?.email||pending.current)return;
    pending.current=true;setBusy(true);
    try{
      const result=await request(`/api/state?team=${encodeURIComponent(loadFailure.teamSeasonId)}`),latest=parseState(JSON.stringify(result.state));
      const raw=localStorage.getItem(journalKey(session.email,loadFailure.teamSeasonId));
      if(raw===null)throw new Error('Geen lokaal wedstrijdconcept gevonden. Laad het team opnieuw.');
      const draft=rebuildJournal(localStorage,session.email,loadFailure.teamSeasonId,latest,result.revision,result.sourceToken);
      setLoadRecovery({draft,raw});
    }catch(error){setLoadRecoveryError((error as Error).message);}
    finally{pending.current=false;setBusy(false);}
  }
  function confirmLoadRecovery(){
    if(!loadRecovery||pending.current)return;
    try{
      storeRebuiltJournal(localStorage,loadRecovery.draft,loadRecovery.raw);
      setLoadRecoveryOpen(false);void selectTeam(loadRecovery.draft.teamSeasonId);
    }catch(error){setLoadRecoveryError((error as Error).message||'Het origineel kan niet veilig worden bewaard.');}
  }
  async function reviewRecovery(){
    const draft=journalRef.current;if(!draft||pending.current)return;
    keyboard.hide();setRecoveryOpen(true);setRecovery(null);setRecoveryError('');pending.current=true;setBusy(true);
    try{
      const result=await request(`/api/state?team=${encodeURIComponent(draft.teamSeasonId)}`),latest=parseState(JSON.stringify(result.state));
      if(latest.committedBatches?.includes(draft.id)){
        localStorage.removeItem(journalKey(draft.account,draft.teamSeasonId));setLocalJournal(null);revision.current={revision:result.revision,sourceToken:result.sourceToken};
        stateRef.current=latest;dispatch({type:'replace',state:latest});setSourceConflict(false);setConnectionError('');setRecoveryOpen(false);setToast('De eerdere opslag is bevestigd.');return;
      }
      setRecovery({...result,state:latest,preview:previewJournalRecovery(draft,latest)});
    }catch(error){setRecoveryError((error as Error).message);}
    finally{pending.current=false;setBusy(false);}
  }
  async function confirmRecovery(){
    const draft=journalRef.current;if(!draft||!recovery||pending.current)return;
    try{
      localStorage.setItem(`${journalKey(draft.account,draft.teamSeasonId)}:backup:${draft.id}`,JSON.stringify(draft));
      const rebased={...draft,id:crypto.randomUUID(),revision:recovery.revision,sourceToken:recovery.sourceToken,state:recovery.preview,attempted:false};
      localStorage.setItem(journalKey(draft.account,draft.teamSeasonId),JSON.stringify(rebased));setLocalJournal(rebased);
      revision.current={revision:recovery.revision,sourceToken:recovery.sourceToken};stateRef.current=rebased.state;dispatch({type:'replace',state:rebased.state});
      setSourceConflict(false);cacheLocked.current=false;setConnectionError('');setRecoveryOpen(false);await save();
    }catch{setRecoveryError('Het herstelconcept kan niet veilig worden bewaard. Het oorspronkelijke concept blijft behouden.');}
  }
  async function reloadRoundData():Promise<CoachState|null>{
    if(!remote)return stateRef.current;
    if(pending.current)return null;
    pending.current=true;setBusy(true);
    try{
      const team=stateRef.current.catalog!.teamSeasonId,result=await request(`/api/state?team=${encodeURIComponent(team)}`),next=parseState(JSON.stringify(result.state));
      if(journalRef.current){throw new Error('Je lokale wedstrijdconcept blijft bewaard. Sla het eerst op voordat je de rondegegevens vernieuwt.');}
      revision.current={revision:result.revision,sourceToken:result.sourceToken};stateRef.current=next;dispatch({type:'replace',state:next});
      if(result.distribution)applyForms(result.distribution);else applyForms(await request(`/api/forms?team=${encodeURIComponent(team)}`));setConnectionError('');return next;
    }catch(error){setConnectionError((error as Error).message);return null;}
    finally{pending.current=false;setBusy(false);}
  }
  async function mutate(path: string, data: object) {
    if (pending.current || !remote || !state.catalog) return false;
    const serviceOnly=["/api/forms/create","/api/forms/prepare","/api/forms/finalize","/api/forms/invite","/api/forms/link"].includes(path);
    if(journalRef.current && path!=="/api/action-batch"&&!serviceOnly){setConnectionError("Sla eerst het lokale wedstrijdconcept op via Tussentijds opslaan.");return false;}
    pending.current = true; setBusy(true); setConnectionError("");
    try { const result = await request(path, { ...data, ...revision.current, state: undefined, teamSeasonId: state.catalog.teamSeasonId });
      const savedState=parseState(JSON.stringify(result.state));
      revision.current = { revision: result.revision, sourceToken: result.sourceToken };
      if(path==="/api/action-batch" && journalRef.current){const old=journalRef.current;try{localStorage.removeItem(journalKey(old.account,old.teamSeasonId));}catch{}setLocalJournal(null);}
      if(!serviceOnly||!journalRef.current){stateRef.current=savedState; dispatch({ type: "replace", state:savedState });}
      if (result.teams) setTeams(result.teams);
      setToast(path.includes("import") ? `${result.imported} ${path.includes("history") ? result.imported===1?"wedstrijd":"wedstrijden" : result.imported===1?"antwoord":"antwoorden"} verwerkt${result.invalidCodes ? ` · ${result.invalidCodes} ${result.invalidCodes===1?"inzending":"inzendingen"} met ongeldige code overgeslagen` : ""}` : "Opgeslagen in Google Sheets");
      setSourceConflict(false);if(result.distribution)applyForms(result.distribution);else if(path.includes("forms")){try{applyForms(await request(`/api/forms?team=${encodeURIComponent(state.catalog.teamSeasonId)}`));}catch{setConnectionError("Opgeslagen. De verzendstatus kon nog niet worden vernieuwd.");}}
      return true;
    } catch (error) { setSourceConflict((error as Error & {status?:number}).status===409);setConnectionError((error as Error).message + " Je lokale invoer blijft bewaard."); setToast(""); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  const [activeTab, setActiveTab] = useState<Tab>(designMode?"live":"dashboard");
  const [statsHomeRequest,setStatsHomeRequest]=useState(0);
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [blocked, setBlocked] = useState(loaded.error);
  const [storageError, setStorageError] = useState("");
  const keyboard = useKeyboard();
  const { bottomInset } = useKeyboardInsets();
  const navInset=realDevice?"env(safe-area-inset-bottom, 0px)":`${bottomInset}px`;
  useEffect(() => {
    if (blocked || remote) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStorageError(""); }
    catch { setStorageError("Opslaan lukt niet. Wijzigingen staan alleen in het geheugen. Exporteer een reservekopie voordat je sluit."); }
  }, [state, blocked, remote]);
  useEffect(() => {
    const conflict = (event: StorageEvent) => { if(remote && session?.email && (event.key===null||event.key===journalKey(session.email,state.catalog!.teamSeasonId))){cacheLocked.current=true;setConnectionError("Het lokale wedstrijdconcept is in een ander venster gewijzigd. Vernieuw de gegevens om dat concept te laden.");} if (!remote && (event.key === STORAGE_KEY || event.key === null)) setBlocked("Gegevens zijn in een ander venster gewijzigd. Herlaad deze pagina om verder te werken met de laatste versie."); };
    window.addEventListener("storage", conflict); return () => window.removeEventListener("storage", conflict);
  }, [remote, session?.email, state.catalog?.teamSeasonId]);
  const running = state.live.runningSince !== null || state.live.breakSince != null;
  useEffect(() => {
    if (!running || (!remote && blocked)) return;
    const timer = window.setInterval(() => dispatch({ type: "clock", now: Date.now() }), 1000);
    return () => window.clearInterval(timer);
  }, [running, blocked, remote]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3000); return () => window.clearTimeout(timer); }, [toast]);
  const [focusMatch, setFocusMatch] = useState<string | null>(null);
  const [statsBack, setStatsBack] = useState<{action:()=>void}|null>(null);
  const openRecoverySettings=()=>{keyboard.hide();setNoticeDismissed(true);setSettingsOpen(true);window.requestAnimationFrame(()=>document.querySelector<HTMLElement>('.app-screen .mobile-scroll')?.scrollTo({top:0}));};
  const navigate = (tab: Tab, matchId?: string) => { keyboard.hide(); setSettingsOpen(false); setFocusMatch(matchId ?? null); setActiveTab(tab); };
  useEffect(() => { document.querySelector<HTMLElement>(".app-screen .mobile-scroll")?.scrollTo({ top: 0 }); }, [activeTab, settingsOpen]);
  const stage = (action:Action):boolean => {
    if(pending.current||cacheLocked.current||stateRef.current.catalog?.archived)return false;
    if(journalRef.current?.attempted){setConnectionError("Probeer eerst het opslaan van je bewaarde wedstrijdconcept opnieuw. Daarna kun je verder wijzigen.");return false;}
    const next=coachReducer(stateRef.current,action);
    if(next===stateRef.current){if(action.type==='save-result'){return JSON.stringify(next.resultOnly?.[action.matchId])===JSON.stringify(action.result);}if(action.type.startsWith("assistant-")||action.type==="set-formations"||action.type==="set-substitution-policy"||action.type==="set-substitution-profiles"){setConnectionError("Het advies of de instellingen zijn gewijzigd. Bereken opnieuw; je concept blijft bewaard.");return false;}return !["prepare-match","goal","away-goal","edit-goal"].includes(action.type);}
    const account=session?.email??"", teamSeasonId=stateRef.current.catalog!.teamSeasonId;
    const draft:LocalJournal={...(journalRef.current??{version:1,id:crypto.randomUUID(),account,teamSeasonId,revision:revision.current.revision,sourceToken:revision.current.sourceToken,actions:[]}),actions:[...(journalRef.current?.actions??[]),action],state:next};
    try{if(draft.actions.length>2000)throw new Error();localStorage.setItem(journalKey(account,teamSeasonId),JSON.stringify(draft));}catch{setConnectionError("Lokaal bewaren lukt niet. Maak ruimte vrij of exporteer je concept voordat je verdergaat.");return false;}
    setLocalJournal(draft);stateRef.current=next;dispatch({type:"replace",state:next});return true;
  };
  const save = async (actions:Action[]=[]):Promise<boolean> => {
    if(remote){
      if(cacheLocked.current)return false;
      if(journalRef.current && actions.length && actions.some(a=>!["finish","set-formations","set-substitution-policy","set-substitution-profiles"].includes(a.type))){setConnectionError("Sla eerst het lokale wedstrijdconcept op via Tussentijds opslaan.");return false;}
      for(const action of actions)if(!stage(action))return false;
      const draft=journalRef.current;if(!draft)return true;
      const attempted={...draft,attempted:true};
      try{localStorage.setItem(journalKey(draft.account,draft.teamSeasonId),JSON.stringify(attempted));}catch{setConnectionError("Lokaal bewaren lukt niet; je concept is niet verstuurd.");return false;}
      setLocalJournal(attempted);
      return mutate("/api/action-batch",{batchId:draft.id,actions:draft.actions});
    }
    if(blocked||stateRef.current.catalog?.archived)return false;
    let next=stateRef.current;for(const action of actions){const after=coachReducer(next,action);if(after===next&&action.type==='save-result'&&JSON.stringify(after.resultOnly?.[action.matchId])!==JSON.stringify(action.result))return false;if(after===next&&(action.type.startsWith("assistant-")||action.type==="set-formations"||action.type==="set-substitution-policy"||action.type==="set-substitution-profiles"))return false;next=after;}
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{setStorageError("Opslaan mislukt. Je concept blijft behouden.");return false;}
    stateRef.current=next;dispatch({type:"replace",state:next});return true;
  };
  const send = async (action: Action): Promise<boolean> => { if (session?.authenticated && !remote) { setSettingsOpen(true); return false; } if (remote) {if(action.type==="finish")return save([action]);if(localActionTypes.has(action.type))return stage(action);return mutate("/api/action", { action });} if (blocked || state.catalog?.archived) { setToast("Deze gegevens kunnen niet worden gewijzigd"); return false; } const next = coachReducer(stateRef.current, (action.type === "availability" || action.type === "availability-batch") ? {...action, now:Date.now()} : action); if ((["prepare-match", "new-round", "add-matches", "save-round-matches", "goal", "away-goal", "edit-goal"].includes(action.type)||action.type.startsWith("assistant-")) && next === stateRef.current) { setToast("Sluit de actieve wedstrijd eerst af."); return false; } try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { setStorageError("Opslaan mislukt; je invoer blijft in het geheugen. Maak ruimte vrij en probeer opnieuw."); if (action.type.startsWith("assistant-")||["save-stats", "finish", "availability-batch", "new-round", "add-matches", "save-round-matches"].includes(action.type)) return false; dispatch({ type: "replace", state: next }); return true; } stateRef.current=next;dispatch({ type: "replace", state: next }); return true; };
  const titles: Record<Tab, string> = { dashboard: "Overzicht", live: "Live wedstrijd", availability: "Beschikbaarheid", stats: "Statistieken" };
  const catalog = state.catalog ?? demoCatalog();
  const needsTeam = Boolean(session?.authenticated && !remote);
  const assistantAttempt=useRef('');
  const assistantContext=adviceContext(state),assistant=adviceFor(state);
  const deferredReady=Boolean(assistant&& !['skipped','executed'].includes(assistant.status)&&state.live.elapsedMs>=(assistant.deferUntilMs??Infinity));
  const plannedChange=assistant?nextAdvice(state,assistant):null;
  const missedMoment=Boolean(assistant&&['proposed','accepted'].includes(assistant.status)&&assistant.deferUntilMs===undefined&&plannedChange&&state.live.elapsedMs-plannedChange.startMs>60000);
  useEffect(()=>{
    if(!assistant||busy||needsTeam||catalog.archived||state.live.phase==='Einde'||state.live.elapsedMs===0&&!state.live.preparation)return;
    if(assistant.context===assistantContext&&!deferredReady&&!missedMoment)return;
    const key=`${assistantContext}:${deferredReady}:${missedMoment}:${assistant.plan.id}`;
    if(assistantAttempt.current===key)return;
    assistantAttempt.current=key;
    try {generateAdvice(state,Date.now());} catch {return;}
    void send({type:'assistant-plan',id:crypto.randomUUID(),eventId:crypto.randomUUID(),expectedEpoch:adviceEpoch(state),now:Date.now()});
  },[assistantContext,deferredReady,missedMoment,busy,needsTeam,assistant?.plan.id]);
  const settingsPage = <main className="screen-content settings-screen" aria-label="Instellingen"><p className="settings-intro">Beheer je account, team en gegevens.</p><div className="settings-content"><section className="settings-account"><div className="settings-account-heading"><span className="settings-account-mark"><GearIcon /></span><div><h2>Account en gegevensbron</h2><span className="settings-source-label">{remote ? "Google Sheets" : session?.authenticated ? "Google-team niet geladen" : "Lokale demo"}</span></div></div><p>{session?.authenticated ? `Ingelogd als ${session.email}` : session?.configured ? "Log in om je eigen team te openen." : "Google is nog niet beschikbaar. Controleer de verbinding."}</p>{!session?.authenticated ? <><div className="settings-account-actions"><button type="button" className="primary-button" disabled={!session?.configured} onClick={() => { window.location.href = api + "/auth/login"; }}>Inloggen met Google</button><button type="button" className="text-button" aria-label="Verbinding controleren" onClick={() => { void checkConnection(); }}>Controleren</button></div></> : <><label className="form-label">Seizoen en team<select aria-label="Seizoen en team" disabled={busy} value={remote ? catalog.teamSeasonId : ""} onChange={e => { if (e.target.value) void selectTeam(e.target.value); }}><option value="">Kies een teamseizoen</option>{seasons.map(season => <optgroup key={season.seasonId} label={`${season.name}${season.archived ? " · archief" : ""}`}>{teams.filter(t => t.seasonId === season.seasonId).map(team => <option key={team.teamSeasonId} value={team.teamSeasonId}>{team.clubName ? `${team.clubName} · ` : ""}{team.teamName}</option>)}</optgroup>)}</select></label>{remote && <button type="button" className="secondary-button" disabled={busy} onClick={() => { void selectTeam(catalog.teamSeasonId); }}>Gegevens vernieuwen</button>}<button type="button" className="text-button" disabled={busy} onClick={async () => { try { await request("/api/logout", {}); window.location.reload(); } catch { setConnectionError("Uitloggen mislukt. Probeer opnieuw."); } }}>Uitloggen</button></>}{connectionError && <p role="alert">{connectionError}</p>}{loadFailure&&<div className="settings-account-actions"><button type="button" className="primary-button" disabled={busy} onClick={()=>void inspectLoadRecovery()}>Herstel bekijken</button><button type="button" className="secondary-button" onClick={exportLoadRecovery}>Herstelbestand exporteren</button></div>}{busy && <p role="status">Google-gegevens worden verwerkt…</p>}</section><div hidden={needsTeam}><details className="settings-group"><summary><div><strong>Team en wedstrijd</strong><span>{catalog.teamName} · {state.team.periods === 2 ? "2 helften" : "4 kwarten"}</span></div><ChevronRightIcon /></summary><div className="settings-panel" inert={busy || needsTeam || (remote && catalog.archived)}><TeamSettings key={`${remote?session?.email:"demo"}:${catalog.teamSeasonId}`} /></div></details><details className="settings-group"><summary><div><strong>Opstellingsvarianten</strong><span>Formaties voor 6, 8 en 11 spelers</span></div><ChevronRightIcon/></summary><div className="settings-panel" inert={busy||needsTeam||catalog.archived}><FormationSettings key={`${remote?session?.email:"demo"}:${catalog.teamSeasonId}`}/></div></details><details className="settings-group"><summary><div><strong>AI-wisselassistent</strong><span>Speelminuten, rotatie en keepers</span></div><ChevronRightIcon/></summary><div className="settings-panel" inert={busy||needsTeam||catalog.archived}><AssistantSettings key={`${remote?session?.email:"demo"}:${catalog.teamSeasonId}`}/></div></details>{remote && <details className="settings-group"><summary><div><strong>Club en team</strong><span>{catalog.clubName || "Clubnaam instellen"} · {catalog.teamName}</span></div><ChevronRightIcon /></summary><div className="settings-panel" inert={busy || needsTeam || catalog.archived}><ClubSettings key={`${catalog.teamSeasonId}-${catalog.clubName}-${catalog.teamName}`} clubName={catalog.clubName ?? ""} teamName={catalog.teamName} onSave={(clubName, teamName) => mutate("/api/club", { clubName, teamName })} /></div></details>}<details className="settings-group"><summary><div><strong>Speelrondes</strong><span>Rondes en wedstrijden beheren</span></div><ChevronRightIcon/></summary><div className="settings-panel"><AvailabilityScreen managementOnly/></div></details>{remote&&<details className="settings-group"><summary><div><strong>Beschikbaarheidsformulier</strong><span>Voorbeeld, opmaak en Google-koppeling</span></div><ChevronRightIcon/></summary><div className="settings-panel"><RoundFormSettings/></div></details>}<details className="settings-group"><summary><div><strong>Gegevens beheren</strong><span>Reservekopie{remote ? " en historische import" : " van deze demo"}</span></div><ChevronRightIcon /></summary><div className="settings-panel">{remote && <button type="button" className="secondary-button" disabled={busy || catalog.archived || needsTeam} onClick={() => { void mutate("/api/history/import", {}); }}>Historische wedstrijden importeren</button>}<p>{remote ? "De Google Sheet bewaart de gegevens per teamseizoen. Maak daarnaast regelmatig een reservekopie." : "Maak regelmatig een export. Het wissen van browsergegevens verwijdert de lokale demo."}</p><button type="button" className="primary-button" onClick={() => { try { const raw = blocked ? localStorage.getItem(STORAGE_KEY) : null; downloadBackup(raw ?? JSON.stringify(state, null, 2)); } catch { setToast("Export van de bestaande opslag is niet beschikbaar"); } }}>Reservekopie exporteren</button>{blocked && <button type="button" className="secondary-button" onClick={() => window.location.reload()}>Opnieuw laden</button>}<p className="muted">{remote ? "Deel de bron uitsluitend met bevoegde coaches." : "Gebruik de lokale demo alleen met voorbeeldgegevens."}</p></div></details></div></div></main>;
  useEffect(() => { if (!settingsOpen) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") { keyboard.hide(); setSettingsOpen(false); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [settingsOpen, keyboard]);
  const [conceptOptions,setConceptOptions]=useState(false);
  const retrySave=()=>{if(sourceConflict)void reviewRecovery();else void save();};
  const persistence=<section className="local-save-bar" aria-label={journal?'Lokaal wedstrijdconcept':'Opslagstatus'}>{journal?.attempted?<InfoCircledIcon/>:<CheckCircledIcon/>}<span role="status">{journal?(journal.attempted?'Opslaan niet bevestigd':'Lokaal bewaard'):remote?'Alles opgeslagen':'Lokaal bewaard'}{journal&&<small className="sr-only"> · {journal.actions.length} {journal.actions.length===1?'wijziging':'wijzigingen'}</small>}</span>{journal&&<><button type="button" className="text-button" aria-label={journal.attempted?'Opnieuw opslaan':'Tussentijds opslaan'} disabled={busy} onClick={retrySave}>{journal.attempted?'Opnieuw':'Opslaan'}</button><button type="button" className="text-button" aria-label="Conceptopties" onClick={()=>{keyboard.hide();setConceptOptions(true);}}>Meer</button></>}</section>;
  return <Store value={{ state, hasPendingSave:Boolean(journal), send, save, persistence, remote, busy, formLinks, invites, formJobs, deliveries, mailReady, refreshDistribution, reloadRoundData, prepareRound:round=>mutate("/api/forms/prepare",{round}), sendInvitations:(formId,playerIds,batchId,message,channel)=>mutate("/api/forms/invite",{formId,playerIds,batchId,message,channel}), checkForm: formId => request(`/api/forms/status?team=${encodeURIComponent(catalog.teamSeasonId)}&form=${encodeURIComponent(formId)}`), saveFormLink:(formId,template)=>mutate("/api/forms/link",{formId,template}), focusMatch, statsBack, setStatsBack, statsVisible: activeTab === "stats" && !settingsOpen && !needsTeam, draftScope: `${remote ? session?.email : "demo"}:${catalog.teamSeasonId}`, refreshForms: async round => { await refreshDistribution(); const ok=await mutate("/api/forms/import", {round}); if(ok){try{localStorage.setItem(`coachmate:last-import:${session?.email}:${catalog.teamSeasonId}:${round}`,new Date().toISOString());}catch{}} return ok; }, createForm: round => { void mutate("/api/forms/create", { round }); }, notify: message => { setToast(message); }, navigate, settings: () => { keyboard.hide(); setSettingsOpen(true); } }}><div className="coach-app" style={{"--coach-nav-inset":navInset,"--coach-header-height":`${headerHeight}px`} as React.CSSProperties} data-source={remote ? "google" : "demo"}>{booting?<div className="launch-screen" role="status"><span className="ios-spinner"/><strong>CoachMate</strong><span>Je team wordt geladen…</span></div>:<><Header title={settingsOpen ? "Instellingen" : titles[activeTab]} onBack={settingsOpen ? () => { keyboard.hide(); setSettingsOpen(false); } : undefined} eyebrow={needsTeam?"Google-team niet geladen":`${catalog.clubName ? catalog.clubName + " · " : ""}${catalog.teamName} · ${catalog.seasonName}`} /><div className="app-notices">{!noticeDismissed && ((!remote && (blocked || storageError)) || connectionError) ? <div className="storage-warning" role="alert"><button type="button" className="notice-close" aria-label="Melding sluiten" onClick={()=>setNoticeDismissed(true)}><Cross1Icon/></button>{[!remote && (blocked || storageError), connectionError === "Failed to fetch" ? "Geen verbinding met de gegevensbron. Je gebruikt momenteel de lokale demo." : connectionError].filter(Boolean).join(" ")}<button type="button" disabled={busy} onClick={() => {if(loadFailure)void inspectLoadRecovery();else if(journalRef.current)retrySave();else if(remote)void selectTeam(catalog.teamSeasonId);else void checkConnection();}}>Opnieuw proberen</button><button type="button" onClick={openRecoverySettings}>Instellingen</button></div> : null}{busy&&!booting&&<p className="sync-status" role="status"><span className="ios-spinner"/>Gegevens worden verwerkt…</p>}</div>{catalog.archived && <p className="archive-banner">Archief · alleen lezen</p>}<MobileScroll key={`${remote ? session?.email : "demo"}:${catalog.teamSeasonId}`} className="app-screen"><div className="app-shell">{remote&&journal&&(activeTab!=="live"||settingsOpen)&&persistence}{settingsOpen && settingsPage}<div hidden={settingsOpen}>{needsTeam ? <main className="screen-content"><h1>{busy ? "Team laden…" : loadFailure ? "Team laden geblokkeerd" : "Kies je team"}</h1><p>{loadFailure?"Je Google-account is ingelogd. Je wedstrijdgegevens konden niet worden geladen. Bewaar het herstelbestand voordat je verdergaat.":"Open je Google-team om wedstrijden en statistieken te gebruiken."}</p>{loadFailure?<div className="sheet-actions"><button type="button" className="primary-button" disabled={busy} onClick={()=>void inspectLoadRecovery()}>Herstel bekijken</button><button type="button" className="secondary-button" onClick={exportLoadRecovery}>Herstelbestand exporteren</button></div>:<button type="button" className="primary-button" onClick={openRecoverySettings}>Team kiezen</button>}</main> : activeTab === "dashboard" ? <Dashboard /> : activeTab === "live" ? <LiveScreen /> : activeTab === "availability" ? <AvailabilityScreen /> : null}<div hidden={activeTab !== "stats" || needsTeam}><StatsScreen key={`${remote ? session?.email : "demo"}:${catalog.teamSeasonId}`} homeRequest={statsHomeRequest} /></div></div></div></MobileScroll><AppNav tab={settingsOpen ? null : activeTab} onChange={tab=>{if(tab==="stats"&&activeTab==="stats"&&!settingsOpen&&!needsTeam)setStatsHomeRequest(request=>request+1);navigate(tab);}} />{toast ? <div className="toast" role="status" style={{ bottom:`calc(var(--coach-nav-height) + ${navInset} + 8px)` }}><CheckCircledIcon />{toast}</div> : null}</>}
      <BottomSheet open={loadRecoveryOpen} onOpenChange={setLoadRecoveryOpen} title="Team laden herstellen" description="Je oorspronkelijke wedstrijdconcept blijft op dit apparaat bewaard.">
        <p>{loadFailure?.kind==='local-journal'?"De controle van Google-gegevens is geslaagd. Het lokale concept kon niet worden gelezen. We controleren of je oorspronkelijke acties veilig opnieuw kunnen worden opgebouwd.":"De Google-wedstrijdgegevens konden niet worden gelezen. Opnieuw inloggen verandert die gegevens niet."}</p>
        <button type="button" className="secondary-button" onClick={exportLoadRecovery}>Herstelbestand exporteren</button>
        {busy&&<p role="status">Concept controleren…</p>}
        {loadFailure&&<details><summary>Technische oorzaak</summary><p>{loadFailure.detail}</p></details>}
        {loadRecoveryError&&<p role="alert">{loadRecoveryError}</p>}
        {loadRecovery&&<section className="recovery-comparison"><h3>Gecontroleerd herstelvoorstel</h3><p>{loadRecovery.draft.actions.length} oorspronkelijke acties · {Math.round(loadRecovery.draft.state.live.elapsedMs/60000)} gespeelde minuten · {loadRecovery.draft.state.live.goals.length} doelpunten voor · {loadRecovery.draft.state.live.awayGoals.length} tegen</p><p>We bewaren eerst het originele bestand en herstellen daarna het lokale concept. Dit verstuurt nog geen wedstrijdgegevens.</p><button type="button" className="primary-button" disabled={busy} onClick={confirmLoadRecovery}>Concept herstellen</button></section>}
        <button type="button" className="text-button" disabled={busy} onClick={()=>{setLoadRecoveryOpen(false);if(loadFailure)void selectTeam(loadFailure.teamSeasonId);else void checkConnection();}}>Opnieuw team laden</button>
      </BottomSheet>
      <BottomSheet open={conceptOptions} onOpenChange={setConceptOptions} title="Lokaal wedstrijdconcept"><p>Je wijzigingen blijven op dit apparaat tot de opslag bevestigd is.</p><button type="button" className="secondary-button" onClick={()=>downloadBackup(JSON.stringify(journalRef.current,null,2))}>Concept exporteren</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setConceptOptions(false);void reviewRecovery();}}>Vergelijken met Google</button><button type="button" className="text-button" disabled={busy} onClick={()=>{if(window.confirm('Dit verwijdert het lokale concept. Exporteer het eerst als je de wijzigingen wilt bewaren.')){const d=journalRef.current;if(d){localStorage.removeItem(journalKey(d.account,d.teamSeasonId));setLocalJournal(null);void selectTeam(d.teamSeasonId);}setConceptOptions(false);}}}>Lokaal concept verwerpen</button></BottomSheet>
      <BottomSheet open={recoveryOpen} onOpenChange={setRecoveryOpen} title="Opslag herstellen"><p>Vergelijk de actuele bron met je lokale wedstrijdconcept. De oorspronkelijke export blijft op dit apparaat bewaard.</p>{busy&&<p role="status">Actuele gegevens ophalen…</p>}{recoveryError&&<p role="alert" className="editor-error">{recoveryError}</p>}{recovery&&<><div className="recovery-comparison">{[{label:'Actueel in Google',value:recovery.state},{label:'Na toepassen concept',value:recovery.preview}].map(item=><section key={item.label}><h3>{item.label}</h3><strong>{item.value.live.goals.length} – {item.value.live.awayGoals.length}</strong><p>{item.value.live.swaps.length} wissels · {Math.round(item.value.live.elapsedMs/60000)} min.</p></section>)}</div><p>{journal?.actions.length} lokale wijzigingen worden met hun oorspronkelijke tijdstippen toegepast. Controleer ook de opstelling en cijfers na het herstellen.</p><button type="button" className="primary-button" disabled={busy} onClick={()=>void confirmRecovery()}>Concept toepassen en opslaan</button></>}<button type="button" className="secondary-button" onClick={()=>downloadBackup(JSON.stringify(journalRef.current,null,2))}>Concept exporteren</button></BottomSheet>
    </div></Store>;
}














