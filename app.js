import {DGN_UI_SPEC as S} from "./dgn-ui-spec.js";
const $=s=>document.querySelector(s);
const state={page:1,language:'zh',dose:.12,total:.018,cps:.7,cpm:42,battery:82,cellular:true,bluetooth:true,gps:true,sound:true,host:'normal',probe:'offline',probeModel:'',selected:0,listFirst:0,trend:Array.from({length:60},(_,i)=>Math.round(8+3*Math.sin(i/5)+Math.random()*2)),now:new Date()};

function render(){
  state.now=new Date();
  const canvas=$('#lcd');
  let source=null;
  try{source=window.DGNProductionUI.render(canvas,state,S).resourceSource;$('#renderMode').textContent='Production bitmap';$('#renderMode').className='ok';}
  catch(error){console.error(error);$('#renderMode').textContent='资源未生成';$('#renderMode').className='bad';}
  $('#doseOut').textContent=`${state.dose.toFixed(2)} µSv/h`;
  $('#batteryOut').textContent=`${state.battery}%`;
  $('#baseline').textContent=`DGN_01 main @ ${S.source.commit.slice(0,8)}`;
  $('#resourceInfo').textContent=source?`lv_font_conv ${source.lvFontConv} · Noto ${source.notoSha256.slice(0,8)} · 4bpp`:'Production resource missing';
  $('#stateDump').textContent=JSON.stringify({page:state.page,language:state.language,dose:state.dose,battery:state.battery,probe:state.probe,source:S.source.commit.slice(0,8)},null,2);
}
function move(d){
  if(state.page===0){state.selected=Math.max(0,Math.min(15,state.selected+d));if(state.selected<state.listFirst)state.listFirst=state.selected;if(state.selected>=state.listFirst+6)state.listFirst=state.selected-5;}
  else state.page=(state.page+d+3)%3;
  render();
}
function ok(){
  if(state.page===0){
    if(state.selected===15)state.page=1;
    else if(state.selected===4){state.language=state.language==='zh'?'en':'zh';$('#language').value=state.language;}
    else if(state.selected===0)state.sound=!state.sound;
  }
  render();
}
document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>b.dataset.key==='ok'?ok():move(b.dataset.key==='left'?-1:1));
window.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft')state.page=(state.page+2)%3;
  else if(e.key==='ArrowRight')state.page=(state.page+1)%3;
  else if(e.key==='ArrowUp')move(-1);
  else if(e.key==='ArrowDown')move(1);
  else if(e.key==='Enter')ok();
  else if(e.key==='Escape')state.page=1;
  else return;
  e.preventDefault();render();
});
$('#language').onchange=e=>{state.language=e.target.value;render()};
$('#dose').oninput=e=>{state.dose=Number(e.target.value)/100;state.cps=state.dose*5.8;state.cpm=Math.round(state.cps*60);render()};
$('#battery').oninput=e=>{state.battery=+e.target.value;render()};
for(const id of['cellular','bluetooth','gps','sound'])$(`#${id}`).onchange=e=>{state[id]=e.target.checked;render()};
$('#scenario').onchange=e=>{state.host='normal';state.probe='offline';state.probeModel='';if(e.target.value==='alarm'){state.host='alarm';state.dose=2.4}else if(e.target.value==='fault')state.host='fault';else if(e.target.value==='probe'){state.probe='normal';state.probeModel='BN-GM01';state.dose=.38}render()};
$('#copySpec').onclick=async()=>{await navigator.clipboard.writeText(JSON.stringify(S,null,2));$('#copySpec').textContent='已复制'};
setInterval(()=>{state.now=new Date();if(state.page===2){state.trend.push(Math.max(0,Math.round(state.dose*100+(Math.random()-.5)*8)));state.trend.shift();}render()},1000);
render();
