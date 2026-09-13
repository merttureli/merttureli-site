export function easeInOut(t){t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);}
export function fitDistance(size,aspect,fov=36,margin=1.35){
  const vertical=Math.tan(fov*Math.PI/360),horizontal=vertical*Math.max(.1,aspect);
  return Math.max(.008,Math.max(size[1]/(2*vertical),size[0]/(2*horizontal))*margin+size[2]*1.2);
}
export function opacityFor(part,selected,{shell=true,inside=false,mode='solid'}={}){
  if(part.referenceOnly&&part.id!==selected)return 0;
  if(part.id===selected)return 1;
  if(!shell&&part.exterior)return 0;
  if(selected!==null)return part.exterior?.025:.055;
  if(inside&&part.exterior)return mode==='wire'?.15:.07;
  return 1;
}
