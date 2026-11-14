const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('admin/app.js','utf8').replace(/^import .*;\n/gm,'').replace(/load\(\);\s*$/,'');
const calls=[],stored={},history=[];const ctx={console,URLSearchParams,location:{search:'?s=STAFFTEST',pathname:'/admin/',hash:'#/scores'},history:{replaceState:(...x)=>history.push(x)},store:{get:(k,d)=>stored[k]??d,set:(k,v)=>stored[k]=v},t:k=>k,getLang:()=> 'bm',setLang(){},onLang(){},addStrings(){},setInterval(){},setTimeout(){},clearTimeout(){},window:{addEventListener(){}},document:{getElementById:()=>({})},apiGet(){},apiPost:async(action,body)=>{calls.push({action,body});return body}};
vm.createContext(ctx);vm.runInContext(source,ctx);
vm.runInContext(`data={participants:[{pid:'A-001',category:'A',childName:'Child <test>',age:8,guardianName:'Parent',guardianPhone:'6012',school:'School',source:'form',checkedIn:false,status:'active'}],config:{}};`,ctx);
assert.equal(vm.runInContext('tab()',ctx),'participants');assert.equal(stored['fsb.staffToken'],'STAFFTEST');assert(history[0][2].includes('?mode=staff'));assert(!history[0][2].includes('STAFFTEST'));
const html=vm.runInContext('partRows()',ctx);assert(html.includes('data-part-edit="A-001"'));assert(html.includes('mode=staff&ids=A-001'));assert(html.includes('Child &lt;test&gt;'));assert(!html.includes('data-cat='));assert(!html.includes('data-st='));
(async()=>{await vm.runInContext("postRegistration({pid:'A-001',childName:'Corrected'})",ctx);assert.equal(calls[0].action,'staffParticipantUpsert');assert.equal(calls[0].body.s,'STAFFTEST');assert(!('k'in calls[0].body));assert.equal(calls[0].body.pid,'A-001');console.log('PASS: restricted desk selection, separate credentials, token removed from URL, edit and QR links, no category/status controls.');})().catch(e=>{console.error(e);process.exit(1)});
// The same handler must ignore a second submit while the first request is pending.
let pending,submitted=0;
ctx.testAct=()=>{submitted++;return new Promise(resolve=>{pending=resolve})};
const nodes={};function element(value=''){return {value,dataset:{},disabled:false,querySelectorAll:()=>[],querySelector:()=>button}}const button=element();
for(const id of ['#pbody','#srch','#notIn','#wf','#wn','#wa','#wg','#wp'])nodes[id]=element();nodes['#wa'].value='8';nodes['#wn'].value='Walk-in';
ctx.document.querySelector=s=>nodes[s]||null;ctx.document.querySelectorAll=()=>[];
vm.runInContext('act=testAct; bindParticipants()',ctx);
(async()=>{const f=nodes['#wf'],ev={preventDefault(){}};const first=f.onsubmit(ev);await f.onsubmit(ev);assert.equal(submitted,1);assert.equal(button.disabled,true);pending(null);await first;assert.equal(button.disabled,false);assert.equal(f.dataset.saving,'false');const retry=f.onsubmit(ev);assert.equal(submitted,2);pending(null);await retry;console.log('PASS: rapid double-submit sends once; button and retry recover after completion.');})().catch(e=>{console.error(e);process.exitCode=1});
