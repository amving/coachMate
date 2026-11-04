// Name blocks share vertical gestures with MobileScroll. A clear horizontal
// gesture claims a swap; the dedicated handle still supports every direction.
export function rosterGesture(dx:number,dy:number):'pending'|'scroll'|'swap'{
 if(Math.max(Math.abs(dx),Math.abs(dy))<=8)return 'pending';
 return Math.abs(dx)>Math.abs(dy)?'swap':'scroll';
}

export function rosterDragPosition(pointer:{x:number;y:number},root:{left:number;top:number},scale:number,grab:{x:number;y:number}){
 return {left:(pointer.x-root.left)/scale-grab.x,top:(pointer.y-root.top)/scale-grab.y};
}

// Touch implicitly captures the element under the finger. A transfer from its
// text/icon child to our button is not a cancelled gesture.
export function rosterCaptureLost(activePointer:number|null,pointer:number,targetIsOwner:boolean,ownerHasCapture:boolean){
 return activePointer===pointer&&targetIsOwner&&!ownerHasCapture;
}
