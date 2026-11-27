import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiSwapAdvisor } from '../server/gemini-swaps.mjs';

const options=[
  {id:1,minuteGap:1.1,rotation:90,swaps:2,keepsKeeper:false},
  {id:2,minuteGap:0.7,rotation:80,swaps:1,keepsKeeper:true},
];
const response=(option,reason,finishReason='STOP')=>({data:{candidates:[{
  finishReason,content:{parts:[{text:JSON.stringify({option,reason})}]},
}]}});
const advisor=request=>createGeminiSwapAdvisor('coachmate-test',{getClient:async()=>({request})});

test('Gemini receives only anonymous candidate metrics and returns a known option and reason',async()=>{
  const choose=advisor(async request=>{
    assert.equal(new URL(request.url).host,'aiplatform.eu.rep.googleapis.com');
    assert.deepEqual(JSON.parse(request.data.contents[0].parts[0].text),options);
    assert.deepEqual(request.data.generationConfig.responseSchema.properties.option.enum,['1','2']);
    assert.match(request.data.systemInstruction.parts[0].text,/Kies uitsluitend uit de aangeleverde/);
    return response('2','keeper');
  });
  assert.deepEqual(await choose([{...options[0],playerName:'PRIVATE_NAME',playerId:'PRIVATE_ID',prompt:'PRIVATE_PROMPT'},options[1]]),
    {option:2,reason:'keeper'});
});

test('unknown choices, invalid reasons, malformed input and model failure fall back',async()=>{
  assert.equal(await advisor(async()=>response('3','minutes'))(options),null);
  assert.equal(await advisor(async()=>response('1','keeper'))(options),null);
  assert.equal(await advisor(async()=>response('2','minutes','MAX_TOKENS'))(options),null);
  assert.equal(await advisor(async()=>{throw new Error('offline');})(options),null);
  let calls=0;
  const choose=advisor(async()=>{calls++;return response('1','minutes');});
  assert.equal(await choose([{...options[0],minuteGap:'1.1'},options[1]]),null);
  assert.equal(await choose([options[0],options[0]]),null);
  assert.equal(calls,0);
});
