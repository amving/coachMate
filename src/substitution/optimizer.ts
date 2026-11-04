import { defaultPolicy, normalizePolicy, type SubstitutionPolicy } from './policy.ts';
import { calculateTargets } from './targets.ts';
import { chooseKeeper } from './goalkeepers.ts';
import { rotationPriority } from './rotation.ts';
import { projectMinutes, RULES_VERSION, sameLineup, validateMatchState, validatePlan, rotationPoints } from './rules.ts';
import type { Issue, MatchState, Occupancy, OptimizerPlayer, Scenario } from './types.ts';

export const SEARCH_LIMITS = { candidates:12, repairs:256, intervals:600, results:5 } as const;
const idOrder=(a:{id:string},b:{id:string})=>a.id.localeCompare(b.id);
function compact(intervals:Occupancy[]) {
  const out:Occupancy[]=[];
  for(const s of intervals) {
    const last=out.at(-1);
    if(last&&last.endMs===s.startMs&&sameLineup(last,s))last.endMs=s.endMs;
    else out.push({...s,field:[...s.field].sort()});
  }
  return out;
}
const quality=(p:OptimizerPlayer,keeper:boolean):number|null=>keeper?p.goalkeeperQuality:p.position===null?null:p.positionQualities[p.position]??null;

function build(state:MatchState,targets:Record<string,number>,policy:SubstitutionPolicy,step:number,variant:number): Occupancy[] | null {
  const end=state.rules.durationMs;
  const used=Object.fromEntries(state.players.map(p=>[p.id,p.playedMs]));
  const keeper=Object.fromEntries(state.players.map(p=>[p.id,p.keeperMs]));
  const bench=Object.fromEntries(state.players.map(p=>[p.id,p.consecutiveBenchMs??0]));
  const continuous=Object.fromEntries(state.players.map(p=>[p.id,p.consecutivePlayMs??0]));
  const turns=Object.fromEntries(state.players.map(p=>[p.id,p.substitutionCount]));
  const fixed=state.rules.rotationIntervalMs!==undefined;
  const points=new Set(fixed?rotationPoints(state):[end,...state.rules.periodBoundariesMs,...state.players.flatMap(p=>[p.availableFromMs,p.availableUntilMs])]);
  if(!fixed)for(let t=step;t<end;t+=step)points.add(t);
  const boundaries=[...points].filter(t=>t>state.clock.matchMs&&t<=end).sort((a,b)=>a-b);
  let start=state.clock.matchMs,current={field:state.field,keeperId:state.keeperId};
  const plan:Occupancy[]=[];
  while(start<end&&plan.length<SEARCH_LIMITS.intervals) {
    let stop=boundaries.find(t=>t>start)??end;
    let eligible=state.players.filter(p=>p.available&&p.availableFromMs<=start&&p.availableUntilMs>=stop&&p.maxTotalMs>used[p.id]);
    // A residual personal limit can split a search interval; it is never rounded away.
    if(!fixed)for(const p of eligible)if(p.maxTotalMs-used[p.id]<stop-start)stop=Math.min(stop,start+p.maxTotalMs-used[p.id]);
    eligible=eligible.filter(p=>p.maxTotalMs-used[p.id]>=stop-start);
    if(eligible.length<state.rules.fieldSize)return null;
    const boundary=state.rules.periodBoundariesMs.includes(start);
    const keeperId=chooseKeeper(state,eligible,current.keeperId,keeper,policy,boundary,start);
    if(!keeperId)return null;
    const urgency=(p:OptimizerPlayer)=>{
      const opportunity=Math.max(1,Math.min(end,p.availableUntilMs)-start);
      return (targets[p.id]-used[p.id])/opportunity;
    };
    const rotation=(p:OptimizerPlayer)=>rotationPriority(bench[p.id],continuous[p.id],turns[p.id],end);
    const sorted=eligible.filter(p=>p.id!==keeperId).sort((a,b)=>{
      const delta=urgency(b)-urgency(a);
      if(Math.abs(delta)>.015)return delta;
      const r=rotation(b)-rotation(a);
      const t=(quality(b,false)??0)-(quality(a,false)??0);
      const preference=variant===2?t*policy.weights.tactical:r*policy.weights.rotation;
      return preference || delta || (variant===1?b.id.localeCompare(a.id):idOrder(a,b));
    });
    let field=[keeperId,...sorted.slice(0,state.rules.fieldSize-1).map(p=>p.id)];
    // Honor the supplied starting lineup on the first interval when possible.
    if(start===state.clock.matchMs&&variant!==1&&current.field.every(id=>eligible.some(p=>p.id===id))&&current.field.includes(keeperId))field=[...current.field];
    if(start===0&&state.rules.startingField){if(!state.rules.startingField.every(id=>eligible.some(p=>p.id===id))||!state.rules.startingField.includes(keeperId))return null;field=[...state.rules.startingField];}
    const d=stop-start;
    for(const p of state.players) {
      const was=current.field.includes(p.id),inside=field.includes(p.id);
      if(was!==inside)turns[p.id]++;
      if(inside){used[p.id]+=d;continuous[p.id]=(was?continuous[p.id]:0)+d;bench[p.id]=0;}else{bench[p.id]=(was?0:bench[p.id])+d;continuous[p.id]=0;}
    }
    keeper[keeperId]+=d;
    plan.push({startMs:start,endMs:stop,field,keeperId});
    current={field,keeperId};start=stop;
  }
  return start===end?compact(plan):null;
}

// Exchange only real occupancy slices. Each exchange strictly reduces L1 target error.
// This repairs coarse, calm plans without enumerating subsets of the roster.
function repair(state:MatchState,input:Occupancy[],targets:Record<string,number>):Occupancy[] {
  let plan=compact(input);
  const byId=new Map(state.players.map(p=>[p.id,p]));
  for(let iteration=0;iteration<SEARCH_LIMITS.repairs;iteration++) {
    const totals=projectMinutes(state,plan);
    const donors=state.players.filter(p=>totals[p.id].playedMs>targets[p.id]).sort((a,b)=>(totals[b.id].playedMs-targets[b.id])-(totals[a.id].playedMs-targets[a.id])||idOrder(a,b));
    const receivers=state.players.filter(p=>p.available&&totals[p.id].playedMs<targets[p.id]).sort((a,b)=>(targets[b.id]-totals[b.id].playedMs)-(targets[a.id]-totals[a.id].playedMs)||idOrder(a,b));
    let changed=false;
    outer:for(const receiver of receivers)for(const donor of donors) {
      // Prefer an existing period edge; late intervals preserve more of the starting plan.
      const order=plan.map((s,i)=>({s,i})).sort((a,b)=>Number(state.rules.periodBoundariesMs.includes(b.s.endMs))-Number(state.rules.periodBoundariesMs.includes(a.s.endMs))||b.s.endMs-a.s.endMs);
      for(const {s,i} of order) {
        if(!s.field.includes(donor.id)||s.field.includes(receiver.id)||state.rules.keeperSchedule&&s.keeperId===donor.id)continue;
        const from=Math.max(s.startMs,receiver.availableFromMs),to=Math.min(s.endMs,receiver.availableUntilMs);
        const fixed=state.rules.rotationIntervalMs!==undefined;
        const amount=fixed?to-from:Math.min(to-from,totals[donor.id].playedMs-targets[donor.id],targets[receiver.id]-totals[receiver.id].playedMs,receiver.maxTotalMs-totals[receiver.id].playedMs);
        if(fixed&&(from!==s.startMs||to!==s.endMs||s.keeperId===donor.id||totals[receiver.id].playedMs+amount>receiver.maxTotalMs))continue;
        if(fixed){const a=totals[donor.id].playedMs-targets[donor.id],b=targets[receiver.id]-totals[receiver.id].playedMs;if(Math.abs(a-amount)+Math.abs(b-amount)>=a+b)continue;}
        if(amount<=0)continue;
        const field=s.field.map(id=>id===donor.id?receiver.id:id);
        const keeperId=s.keeperId!==donor.id?s.keeperId:receiver.goalkeeperEligible?receiver.id:field.find(id=>byId.get(id)!.goalkeeperEligible);
        if(!keeperId)continue;
        const cut=to-amount;
        if(cut===0&&state.rules.startingKeeperId&&keeperId!==state.rules.startingKeeperId)continue;
        if(cut===0&&state.rules.startingField&&!state.rules.startingField.every(id=>field.includes(id)))continue;
        const replacement:Occupancy[]=[];
        if(s.startMs<cut)replacement.push({...s,endMs:cut});
        replacement.push({startMs:cut,endMs:to,field,keeperId});
        if(to<s.endMs)replacement.push({...s,startMs:to});
        plan.splice(i,1,...replacement);plan=compact(plan);changed=true;break outer;
      }
    }
    if(!changed)break;
  }
  return plan;
}

export function scorePlan(state:MatchState,plan:Occupancy[],targets:Record<string,number>,policy:SubstitutionPolicy) {
  const totals=projectMinutes(state,plan),duration=state.rules.durationMs;
  const error=state.players.reduce((max,p)=>Math.max(max,Math.abs(totals[p.id].playedMs-targets[p.id])),0);
  let rotationCost=0,rotationSamples=0,tacticalSum=0,tacticalDuration=0,moments=0,changes=0,periodMoments=0,wholeBench=0;
  const bench=Object.fromEntries(state.players.map(p=>[p.id,p.consecutiveBenchMs??0]));
  const continuous=Object.fromEntries(state.players.map(p=>[p.id,p.consecutivePlayMs??0]));
  const turns=Object.fromEntries(state.players.map(p=>[p.id,p.substitutionCount]));
  let previous={field:state.field,keeperId:state.keeperId};
  for(const s of plan) {
    const d=s.endMs-s.startMs;
    const incoming=s.field.filter(id=>!previous.field.includes(id));
    const outgoing=previous.field.filter(id=>!s.field.includes(id));
    if(!sameLineup(previous,s)){moments++;changes+=Math.max(incoming.length,Number(previous.keeperId!==s.keeperId));if(state.rules.periodBoundariesMs.includes(s.startMs))periodMoments++;}
    for(const id of incoming) {
      const waiting=state.players.filter(p=>p.available&&!previous.field.includes(p.id)&&p.availableFromMs<=s.startMs&&p.availableUntilMs>s.startMs&&totals[p.id].playedMs>p.playedMs);
      const best=Math.max(0,...waiting.map(p=>bench[p.id]-turns[p.id]*30000));
      rotationCost+=Math.max(0,best-(bench[id]-turns[id]*30000))/Math.max(1,duration);rotationSamples++;
      const previousBoundary=Math.max(0,...state.rules.periodBoundariesMs.filter(t=>t<s.startMs));
      if(state.rules.periodBoundariesMs.includes(s.startMs)&&bench[id]>=s.startMs-previousBoundary)wholeBench++;
    }
    for(const id of outgoing){rotationCost+=Math.max(0,Math.max(...s.field.map(other=>continuous[other]))-continuous[id])/Math.max(1,duration);rotationSamples++;}
    for(const p of state.players) {
      const inside=s.field.includes(p.id),was=previous.field.includes(p.id);
      if(inside!==was)turns[p.id]++;
      if(inside){continuous[p.id]=(was?continuous[p.id]:0)+d;bench[p.id]=0;const q=quality(p,p.id===s.keeperId);if(q!==null){tacticalSum+=q*d;tacticalDuration+=d;}}
      else{bench[p.id]=(was?0:bench[p.id])+d;continuous[p.id]=0;}
    }
    previous=s;
  }
  const fairness=Math.max(0,1-error/Math.max(1,duration));
  const rotation=Math.max(0,1-rotationCost/Math.max(1,rotationSamples));
  const tactical=tacticalDuration>0?tacticalSum/tacticalDuration:null;
  const calm=((policy.preferBundled?(1/(1+moments)+changes/Math.max(1,moments*state.rules.fieldSize)):0)
    +(policy.preferPeriodTransitions?periodMoments/Math.max(1,moments):0)+(policy.preferWholePeriodsOnBench?wholeBench/Math.max(1,changes):0))/4;
  // Missing tactical data redistributes its weight; it is not an invented quality.
  const activeWeight=policy.weights.fairness+policy.weights.rotation+(tactical===null?0:policy.weights.tactical);
  const total=activeWeight>0?(fairness*policy.weights.fairness+rotation*policy.weights.rotation+(tactical??0)*policy.weights.tactical)/activeWeight:fairness;
  return {totals,error,scores:{fairness,rotation,tactical,calm,total}};
}

export function optimizeSubstitutions(state:MatchState,input:SubstitutionPolicy=defaultPolicy()):{scenarios:Scenario[];issues:Issue[];search:{generated:number;valid:number;limits:typeof SEARCH_LIMITS}} {
  const policy=normalizePolicy(input);
  const result=validateMatchState(state);
  const search={generated:0,valid:0,limits:SEARCH_LIMITS};
  if(!result.valid)return {scenarios:[],issues:result.issues,search};
  if(state.archived||state.phase==='Einde'||state.clock.matchMs>=state.rules.durationMs)return {scenarios:[],issues:[{code:'NO_REMAINING_PLAY',detail:'Geen plan voor een afgesloten, gearchiveerde of reeds verstreken reguliere wedstrijd.'}],search};
  let targets:ReturnType<typeof calculateTargets>;
  try{targets=calculateTargets(state,policy);}catch{return {scenarios:[],issues:[{code:'INFEASIBLE_MINUTE_BUDGET',detail:'Beschikbaarheid, keepereisen en persoonlijke limieten laten het minutenbudget niet toe.'}],search};}
  const periods=state.rules.periodBoundariesMs;
  const periodLength=periods[0];
  const steps=state.rules.rotationIntervalMs!==undefined?[state.rules.rotationIntervalMs]:[...new Set([periodLength,Math.floor(periodLength/2),150000,30000])].filter(step=>step>0);
  const scenarios:Scenario[]=[];const seen=new Set<string>();
  for(const step of steps)for(let variant=0;variant<3;variant++) {
    search.generated++;
    const draft=build(state,targets.targetsMs,policy,step,variant);
    if(!draft)continue;
    const intervals=repair(state,draft,targets.targetsMs);
    if(!validatePlan(state,intervals).valid)continue;
    const key=JSON.stringify(intervals);
    if(seen.has(key))continue;seen.add(key);search.valid++;
    const scored=scorePlan(state,intervals,targets.targetsMs,policy);
    const reasonCodes=['HYBRID_C','FULL_REMAINING_HORIZON','KEEPER_COUNTS_AS_PLAY',...state.warnings];
    if(state.players.filter(p=>p.available&&p.goalkeeperEligible).length===1)reasonCodes.push('SINGLE_ELIGIBLE_KEEPER');
    if(scored.scores.tactical===null)reasonCodes.push('NO_TACTICAL_QUALITY_DATA');
    if(policy.compensationFactor>0&&state.players.some(p=>p.history.some(h=>h.playedMs!==null&&h.targetMs!==null)))reasonCodes.push('BOUNDED_HISTORICAL_COMPENSATION');
    if(state.rules.rotationIntervalMs!==undefined)reasonCodes.push('COACH_ROTATION_INTERVAL');
    if(state.rules.startingField)reasonCodes.push('COACH_STARTING_LINEUP');
    if(state.rules.rotationIntervalMs===undefined&&intervals.some((s,i)=>i>0&&!periods.includes(s.startMs)))reasonCodes.push('MID_PERIOD_FAIRNESS_REPAIR');
    scenarios.push({id:`scenario-${search.generated}`,matchId:state.matchId,teamSeasonId:state.teamSeasonId,stateVersion:state.stateVersion,rulesVersion:RULES_VERSION,policyVersion:policy.version,
      intervals,targetsMs:targets.targetsMs,expectedEndMs:scored.totals,scores:scored.scores,fairnessErrorMs:scored.error,reasonCodes});
  }
  if(!scenarios.length)return {scenarios:[],issues:[{code:'SEARCH_EXHAUSTED',detail:'Geen geldig plan gevonden binnen de zoeklimieten; dit bewijst geen wiskundige onhaalbaarheid.'}],search};
  const bestError=Math.min(...scenarios.map(s=>s.fairnessErrorMs));
  // Independent fairness gate: even a 100% quality policy cannot buy persistent unfairness.
  const ranked=scenarios.filter(s=>s.fairnessErrorMs<=bestError+policy.fairnessToleranceMs).sort((a,b)=>{
    const band=Math.floor(b.scores.total*100)-Math.floor(a.scores.total*100);
    return band || b.scores.calm-a.scores.calm || b.scores.total-a.scores.total || a.fairnessErrorMs-b.fairnessErrorMs || a.id.localeCompare(b.id);
  }).slice(0,SEARCH_LIMITS.results);
  return {scenarios:ranked,issues:[],search};
}
