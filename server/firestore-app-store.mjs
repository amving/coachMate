import {fingerprint, HttpError} from './sheets.mjs';
import {schema} from './schema.mjs';
import {sourceProblem} from './source-validation.mjs';

const tablesList=Object.keys(schema);
const maxChunk=200_000;
const key=(table,index)=>table+'-'+index;
const head='coachmateApp/head';
const conflict=()=>new HttpError(409,'De gegevens zijn gewijzigd. Vernieuw ze voordat je opnieuw opslaat.');

export function appEmulator({host,project}) {
  if(!/^127\.0\.0\.1:[1-9]\d{0,4}$/.test(host??'')||!/^demo-[a-z][a-z0-9-]{3,50}$/.test(project??'')){
    throw new Error('De Firestore-appdatabase vereist een lokale emulator en een demo-project.');
  }
  const root='projects/'+project+'/databases/(default)/documents';
  const origin='http://'+host+'/v1/'+root;
  const request=async (path,input)=>{
    const response=await fetch(origin+path,{
      headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
      ...(input===undefined?{}:{method:'POST',body:JSON.stringify(input)}),redirect:'error',signal:AbortSignal.timeout(15_000),
    });
    if(response.status===404&&input===undefined)return null;
    if(!response.ok){
      const error=(await response.json().catch(()=>null))?.error?.status;
      if(response.status===409||['ABORTED','ALREADY_EXISTS','FAILED_PRECONDITION'].includes(error))throw conflict();
      throw new HttpError(503,'De Firestore-appdatabase is niet beschikbaar.');
    }
    return response.json();
  };
  return {root,request};
}

function chunks(rows) {
  const chunks=[];
  let current=[], bytes=2;
  for(const row of rows){
    const width=Buffer.byteLength(JSON.stringify(row))+1;
    if(width>maxChunk)throw new HttpError(422,'Een rij is te groot voor de Firestore-appdatabase.');
    if(bytes+width>maxChunk){chunks.push(current);current=[];bytes=2;}
    current.push(row);bytes+=width;
  }
  if(current.length)chunks.push(current);
  return chunks;
}

export class FirestoreAppStore {
  constructor(connection){this.connection=connection;}
  async read(){
    const {request}=this.connection;
    for(let retry=0;retry<3;retry++){
      const version=await request('/'+head);
      if(!version)throw new HttpError(503,'De Firestore-appdatabase is nog niet ingericht.');
      const manifest=JSON.parse(version.fields.manifest.stringValue);
      const tables=Object.fromEntries(await Promise.all(tablesList.map(async table=>{
        const documents=await Promise.all(Array.from({length:manifest.tables[table].length},(_,index)=>
          request('/coachmateApp/'+key(table,index))));
        const parts=documents.map(doc=>doc?JSON.parse(doc.fields.rows.stringValue):null);
        return [table,parts];
      })));
      const confirmed=await request('/'+head);
      if(version.updateTime!==confirmed?.updateTime)continue;
      for(const table of tablesList){
        if(tables[table].some((part,index)=>!part||fingerprint(part)!==manifest.tables[table][index])){
          throw new HttpError(503,'De Firestore-appdatabase bevat een onvolledige versie.');
        }
        tables[table]=tables[table].flat();
      }
      return {tables,tableHeaders:manifest.tableHeaders,manifest,version:version.updateTime};
    }
    throw conflict();
  }
  async seed(tables,tableHeaders={}){
    const complete=Object.fromEntries(tablesList.map(table=>[table,tables[table]??[]]));
    const problem=sourceProblem(complete);
    if(problem)throw new HttpError(422,problem);
    return this.write({manifest:{tables:{},tableHeaders}},complete);
  }
  async write(snapshot,replacements){
    const {root,request}=this.connection;
    const manifest=structuredClone(snapshot.manifest);
    const writes=[];
    for(const [table,rows] of Object.entries(replacements)){
      if(!tablesList.includes(table)||!Array.isArray(rows))throw new HttpError(422,'Ongeldig Firestore-tabblad.');
      const old=manifest.tables[table]??[], parts=chunks(rows);
      const hashes=parts.map(fingerprint);
      for(const [index,part] of parts.entries()){
        if(hashes[index]===old[index])continue;
        writes.push({update:{name:root+'/coachmateApp/'+key(table,index),fields:{rows:{stringValue:JSON.stringify(part)}}}});
      }
      for(let index=parts.length;index<old.length;index++)writes.push({delete:root+'/coachmateApp/'+key(table,index)});
      manifest.tables[table]=hashes;
    }
    if(snapshot.version&&!writes.length)return;
    writes.push({update:{name:root+'/'+head,fields:{manifest:{stringValue:JSON.stringify(manifest)}}},
      currentDocument:snapshot.version?{updateTime:snapshot.version}:{exists:false}});
    const commit={writes};
    if(writes.length>450||Buffer.byteLength(JSON.stringify(commit))>8_000_000){
      throw new HttpError(422,'Deze wijziging is te groot voor één veilige Firestore-opslag.');
    }
    await request(':commit',commit);
  }
  async getCoachAccess(uid){
    if(typeof uid!=='string'||!uid)return null;
    const doc=await this.connection.request('/coachmateAccess/'+fingerprint(uid));
    if(!doc)return null;
    const access=JSON.parse(doc.fields.roles.stringValue);
    return {admin:access.admin===true,teams:Array.isArray(access.teams)?access.teams.filter(team=>typeof team==='string'):[]};
  }
  async seedCoachAccess(uid,{admin=false,teams=[]}){
    if(typeof uid!=='string'||!uid||!Array.isArray(teams)||!teams.every(team=>typeof team==='string'&&team)){
      throw new HttpError(422,'Ongeldige coachtoewijzing.');
    }
    const name=this.connection.root+'/coachmateAccess/'+fingerprint(uid);
    await this.connection.request(':commit',{writes:[{update:{name,fields:{roles:{stringValue:JSON.stringify({admin:admin===true,teams:[...new Set(teams)]})}}}}]});
  }
}

export function appStoreFromEnvironment(env){
  if(!env.COACHMATE_APP_STORE||env.COACHMATE_APP_STORE==='sheets')return null;
  if(env.COACHMATE_APP_STORE!=='firestore'||env.NODE_ENV==='production'){
    throw new Error('De Firestore-appdatabase is alleen beschikbaar in de lokale pilot.');
  }
  return new FirestoreAppStore(appEmulator({host:env.FIRESTORE_EMULATOR_HOST,project:env.COACHMATE_APP_FIRESTORE_PROJECT}));
}
