import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterGesture,rosterDragPosition,rosterCaptureLost} from '../src/roster-gesture.ts';
test('name-block gestures separate tap slop, horizontal swaps and vertical scrolling',()=>{
 for(const [x,y] of [[0,0],[8,0],[0,-8],[5,5]])assert.equal(rosterGesture(x,y),'pending');
 for(const [x,y] of [[9,0],[-20,4],[40,-25],[-100,-60]])assert.equal(rosterGesture(x,y),'swap');
 for(const [x,y] of [[0,9],[3,-20],[20,40],[-20,-20]])assert.equal(rosterGesture(x,y),'scroll');
});
test('touch capture transfers from a child do not cancel a name-block drag',()=>{
 assert.equal(rosterCaptureLost(7,7,false,false),false);
 assert.equal(rosterCaptureLost(7,7,false,true),false);
 assert.equal(rosterCaptureLost(7,7,true,true),false);
 assert.equal(rosterCaptureLost(7,7,true,false),true);
 assert.equal(rosterCaptureLost(7,8,true,false),false);
 assert.equal(rosterCaptureLost(null,7,true,false),false);
});
test('the preview keeps the original grab point without upward jumps or edge clamping',()=>{
 for(const scale of [1,.7,1.25]){
  const root={left:200,top:100},row={left:330,top:460},grab={x:40,y:30};
  const pointer={x:row.left+grab.x*scale,y:row.top+grab.y*scale};
  const initial=rosterDragPosition(pointer,root,scale,grab);
  assert.equal(initial.left,(row.left-root.left)/scale);assert.equal(initial.top,(row.top-root.top)/scale);
  const moved=rosterDragPosition({x:pointer.x+21*scale,y:pointer.y-5*scale},root,scale,grab);
  assert.ok(Math.abs(moved.left-initial.left-21)<1e-10);assert.ok(Math.abs(moved.top-initial.top+5)<1e-10);
 }
 assert.deepEqual(rosterDragPosition({x:5,y:10},{left:20,top:30},1,{x:40,y:20}),{left:-55,top:-40});
});
