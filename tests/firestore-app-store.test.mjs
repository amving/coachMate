import test from 'node:test';
import assert from 'node:assert/strict';
import {FirestoreAppStore,appStoreFromEnvironment} from '../server/firestore-app-store.mjs';
import {HttpError} from '../server/sheets.mjs';
import {ParentStore,parentAppTransport} from '../server/parent-store.mjs';
import {seed,schema} from '../server/schema.mjs';

function memory(){
  const docs=new Map();
  const root='projects/demo-fixture/databases/(default)/documents';
  let version=0;
  const request=async(path,input)=>{
    if(path!==':commit')return structuredClone(docs.get(root+path)??null);
    for(const write of input.writes){
      if(!write.currentDocument)continue;
      const previous=docs.get(write.update.name),expected=write.currentDocument;
      if(expected.exists===false&&previous||expected.updateTime&&previous?.updateTime!==expected.updateTime)throw new HttpError(409,'Conflict');
    }
    for(const write of input.writes){
      if(write.delete)docs.delete(write.delete);
      else docs.set(write.update.name,{...structuredClone(write.update),updateTime:String(++version)});
    }
    return {};
  };
  return new FirestoreAppStore({root,request});
}
const rows=(name,values)=>values.map(value=>Object.fromEntries(schema[name].map((column,i)=>[column,value[i]])));

test('Firestore-appdatabase bewaart snapshots en weigert verouderde wijzigingen',async()=>{
  const store=memory(),team=rows('TeamSeasons',seed.TeamSeasons);
  await store.seed({Seasons:rows('Seasons',seed.Seasons),TeamSeasons:team});
  const [one,two]=await Promise.all([store.read(),store.read()]);
  await store.write(one,{TeamSeasons:[{...team[0],teamName:'Eerste wijziging'}],State:[{json:'a'}]});
  await assert.rejects(store.write(two,{TeamSeasons:[{...team[0],teamName:'Verouderd'}],State:[{json:'b'}]}),{status:409});
  await assert.rejects(store.seed({Seasons:rows('Seasons',seed.Seasons),TeamSeasons:team}),{status:409});
  const saved=await store.read();
  assert.equal(saved.tables.TeamSeasons[0].teamName,'Eerste wijziging');
  assert.deepEqual(saved.tables.State,[{json:'a'}]);
});

test('opnieuw lezen van rollen gebruikt de stabiele identiteit en productie gebruikt Sheets',async()=>{
  const store=memory();
  await store.seedCoachAccess('google:both',{teams:['team-a']});
  assert.deepEqual(await store.getCoachAccess('google:both'),{admin:false,teams:['team-a']});
  assert.equal(await store.getCoachAccess('email:both'),null);
  await store.seedCoachAccess('google:both',{teams:[]});
  assert.deepEqual(await store.getCoachAccess('google:both'),{admin:false,teams:[]});
  assert.equal(appStoreFromEnvironment({NODE_ENV:'production'}),null);
  assert.throws(()=>appStoreFromEnvironment({NODE_ENV:'production',COACHMATE_APP_STORE:'firestore'}),/lokale pilot/);
});

test('gedeelde Live en officiële wedstrijdcijfers worden samen opgeslagen',async()=>{
  const store=memory();
  const drafts=new ParentStore(parentAppTransport(store.connection),'demo-fixture');
  await store.seed({Seasons:rows('Seasons',seed.Seasons),TeamSeasons:rows('TeamSeasons',seed.TeamSeasons)});
  await drafts.commit([{collection:'Live',id:'wedstrijd',data:{status:'review'}}]);
  const review=await drafts.get('Live','wedstrijd');
  const snapshot=await store.read();
  await drafts.commit([{collection:'Live',id:review.id,version:review.version,data:{status:'review',late:'goal'}}]);
  const approve=version=>store.write(snapshot,{State:[{json:'officiële wedstrijd'}]},drafts.writes([
    {collection:'Live',id:review.id,version,data:{status:'processed'}},
  ]));
  await assert.rejects(approve(review.version),{status:409});
  assert.deepEqual((await store.read()).tables.State,[]);
  const fresh=await drafts.get('Live','wedstrijd');
  assert.equal(fresh.data.status,'review');
  await approve(fresh.version);
  assert.equal((await drafts.get('Live','wedstrijd')).data.status,'processed');
  assert.deepEqual((await store.read()).tables.State,[{json:'officiële wedstrijd'}]);
});
