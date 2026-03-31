import { useState, useEffect, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";

/* ════════════════════════════════════════════════════════
   ALGORITHMS
════════════════════════════════════════════════════════ */
function runFIFO(nf,ref){
  let q=[],faults=0,steps=[];
  for(let i=0;i<ref.length;i++){
    const p=ref[i];
    if(q.includes(p)){steps.push({page:p,frames:[...q,...Array(nf-q.length).fill(null)],hit:true,fault:false,evicted:null});}
    else{faults++;let ev=null;if(q.length<nf)q.push(p);else{ev=q.shift();q.push(p);}steps.push({page:p,frames:[...q,...Array(nf-q.length).fill(null)],hit:false,fault:true,evicted:ev});}
  }
  return{steps,faults};
}
function runLRU(nf,ref){
  let mem=[],faults=0,steps=[];
  for(let i=0;i<ref.length;i++){
    const p=ref[i];
    if(mem.includes(p)){mem=[...mem.filter(x=>x!==p),p];steps.push({page:p,frames:[...mem,...Array(nf-mem.length).fill(null)],hit:true,fault:false,evicted:null});}
    else{faults++;let ev=null;if(mem.length>=nf)ev=mem.shift();mem.push(p);steps.push({page:p,frames:[...mem,...Array(nf-mem.length).fill(null)],hit:false,fault:true,evicted:ev});}
  }
  return{steps,faults};
}
function runOptimal(nf,ref){
  let mem=[],faults=0,steps=[];
  for(let i=0;i<ref.length;i++){
    const p=ref[i];
    if(mem.includes(p)){steps.push({page:p,frames:[...mem,...Array(nf-mem.length).fill(null)],hit:true,fault:false,evicted:null});}
    else{
      faults++;let ev=null;
      if(mem.length<nf)mem.push(p);
      else{let fi=-1,ri=0;for(let j=0;j<mem.length;j++){const nx=ref.indexOf(mem[j],i+1);if(nx===-1){ri=j;break;}if(nx>fi){fi=nx;ri=j;}}ev=mem[ri];mem[ri]=p;}
      steps.push({page:p,frames:[...mem,...Array(nf-mem.length).fill(null)],hit:false,fault:true,evicted:ev});
    }
  }
  return{steps,faults};
}
function runClock(nf,ref){
  let mem=Array(nf).fill(null),rb=Array(nf).fill(0),ptr=0,faults=0,steps=[];
  for(let i=0;i<ref.length;i++){
    const p=ref[i],idx=mem.indexOf(p);
    if(idx!==-1){rb[idx]=1;steps.push({page:p,frames:[...mem],hit:true,fault:false,evicted:null});}
    else{
      faults++;while(rb[ptr]===1){rb[ptr]=0;ptr=(ptr+1)%nf;}
      const ev=mem[ptr];mem[ptr]=p;rb[ptr]=1;
      steps.push({page:p,frames:[...mem],hit:false,fault:true,evicted:ev});
      ptr=(ptr+1)%nf;
    }
  }
  return{steps,faults};
}
function runWorkingSet(nf,ref,w=3){
  let faults=0,steps=[];
  for(let i=0;i<ref.length;i++){
    const p=ref[i];
    const win=new Set(ref.slice(Math.max(0,i-w+1),i+1));
    const arr=[...win].slice(0,nf);
    const hit=i>0&&ref.slice(Math.max(0,i-w),i).includes(p);
    if(!hit)faults++;
    steps.push({page:p,frames:[...arr,...Array(Math.max(0,nf-arr.length)).fill(null)],hit,fault:!hit,evicted:null});
  }
  return{steps,faults};
}
function runPFF(nf,ref,thr=2){
  let mem=[],faults=0,lastFault=0,steps=[];
  for(let i=0;i<ref.length;i++){
    const p=ref[i];
    if(mem.includes(p)){steps.push({page:p,frames:[...mem,...Array(nf-mem.length).fill(null)],hit:true,fault:false,evicted:null});}
    else{
      faults++;
      if(i-lastFault>thr&&mem.length>1)mem=mem.filter(x=>ref.slice(Math.max(0,i-thr),i).includes(x));
      lastFault=i;
      if(!mem.includes(p)){if(mem.length>=nf)mem.shift();mem.push(p);}
      steps.push({page:p,frames:[...mem,...Array(nf-mem.length).fill(null)],hit:false,fault:true,evicted:null});
    }
  }
  return{steps,faults};
}

const ALGOS={
  FIFO:      {id:"FIFO",      label:"FIFO",       full:"First In, First Out",   type:"Classic", run:runFIFO,      desc:"Evicts the page that arrived earliest in memory.",      complexity:"O(n)",   color:"#3b82f6"},
  LRU:       {id:"LRU",       label:"LRU",        full:"Least Recently Used",   type:"Classic", run:runLRU,       desc:"Evicts the page unused for the longest time.",          complexity:"O(n)",   color:"#6366f1"},
  Optimal:   {id:"Optimal",   label:"OPT",        full:"Optimal Algorithm",     type:"Classic", run:runOptimal,   desc:"Evicts farthest future page. Theoretical benchmark.",   complexity:"O(n²)", color:"#8b5cf6"},
  Clock:     {id:"Clock",     label:"Clock",      full:"Clock / Second Chance", type:"Classic", run:runClock,     desc:"Circular buffer giving pages a second chance.",         complexity:"O(f)",  color:"#a855f7"},
  WorkingSet:{id:"WorkingSet",label:"Working Set",full:"Working Set Model",     type:"Adaptive",run:runWorkingSet,desc:"Keeps active working-window pages in memory.",           complexity:"O(n·w)",color:"#06b6d4"},
  PFF:       {id:"PFF",       label:"PFF",        full:"Page Fault Frequency",  type:"Adaptive",run:runPFF,       desc:"Adapts resident set size by monitoring fault rate.",    complexity:"O(n)",  color:"#0ea5e9"},
};
const PRESETS=[
  {name:"OS Textbook",     ref:"7,0,1,2,0,3,0,4,2,3,0,3,2,1,2,0,1,7,0,1"},
  {name:"Locality Pattern",ref:"1,2,3,4,1,2,5,1,2,3,4,5"},
  {name:"Thrashing Case",  ref:"1,2,3,4,5,1,2,3,4,5,1,2,3,4,5"},
  {name:"High Hit Rate",   ref:"1,1,2,2,3,3,1,1,2,2,3,3,4,4"},
];
const LEARN_DATA={
  FIFO:      {steps:["Page arrives — check if already in memory","HIT: no change","FAULT: check for empty frame","Empty frame available? Load page directly","All frames full? Remove oldest page (queue front), load new"],pros:["Dead simple to implement","No usage tracking needed","Predictable, deterministic"],cons:["Belady's Anomaly: more frames can mean more faults","Ignores recency of use","Poor real-world performance"],ex:"Queue: [1,2,3] → Page 4 faults → Evict 1 → [2,3,4]"},
  LRU:       {steps:["Page arrives — check if in memory","HIT: promote page to most-recently-used","FAULT + empty frame: load and mark as most recent","FAULT + full: find least recently used page","Evict LRU page, load new page"],pros:["No Belady's Anomaly","Excellent temporal locality","Strong real-world hit rates"],cons:["Access-order tracking overhead","Complex hardware implementation","O(n) scan per eviction naively"],ex:"Stack: [3,1,2] → Page 4 → Evict 3 (LRU) → [1,2,4]"},
  Optimal:   {steps:["Page arrives — check if in memory","HIT: continue","FAULT + full: scan all future references","Find page whose next use is furthest away","Evict that page, load new one"],pros:["Provably minimum possible faults","No anomalies of any kind","Perfect theoretical benchmark"],cons:["Requires future reference knowledge","Cannot be implemented in a real OS","Useful only for comparative analysis"],ex:"Future: [..7 at +8, ..3 at +2] → Evict page 7"},
  Clock:     {steps:["Maintain circular buffer of frames with R-bits","New page load: set reference bit = 1","On fault: sweep clock pointer clockwise","R=1 → clear to 0, advance pointer","R=0 → evict this page, insert new page"],pros:["Good LRU approximation","Hardware-friendly — only one R-bit per frame","Efficient O(frames) per eviction"],cons:["Less accurate than true LRU","All-ones case degrades to FIFO behavior","Pointer position affects results"],ex:"[A:1, B:1, C:0, D:1] ptr→C → Evict C, set R=1"},
  WorkingSet:{steps:["Define time window Δ (last N references)","Working Set = distinct pages in window","Allocate frames to hold entire working set","Pages outside window are eviction candidates","Dynamically resize allocation as WS changes"],pros:["Prevents thrashing effectively","Adapts to locality phases of a program","Matches realistic process memory behavior"],cons:["Choosing Δ is non-trivial","Higher bookkeeping per reference","Allocation can lag behind phase changes"],ex:"Δ=3, recent=[1,2,1] → WS={1,2} → evict page 3"},
  PFF:       {steps:["Track time intervals between consecutive page faults","Inter-fault time < threshold → HIGH fault rate","High rate: allocate more frames to process","Inter-fault time > threshold → LOW fault rate","Low rate: reclaim frames, evict cold pages"],pros:["Prevents over and under-allocation","Continuously adapts to workload changes","Efficient global memory utilization"],cons:["Threshold requires careful tuning","Reacts with some delay to sudden changes","More complex OS-level implementation needed"],ex:"Fast faults → expand resident set. Slow faults → shrink & reclaim"},
};

/* ════════════════════════════════════════════════════════
   DESIGN TOKENS
════════════════════════════════════════════════════════ */
const C={
  bg0:"#07090F",bg1:"#0C1018",bg2:"#111520",bg3:"#161B28",bg4:"#1C2333",
  b0:"rgba(255,255,255,0.055)",b1:"rgba(255,255,255,0.10)",b2:"rgba(255,255,255,0.16)",
  t0:"#EEF2FF",t1:"#9BA8C0",t2:"#4E5E7A",
  blue:"#3B82F6",indigo:"#6366F1",violet:"#8B5CF6",
  green:"#10B981",red:"#F43F5E",amber:"#F59E0B",
  mono:"'IBM Plex Mono','Courier New',monospace",
  head:"'Epilogue','Helvetica Neue',sans-serif",
  body:"'DM Sans',system-ui,sans-serif",
};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Epilogue:wght@400;600;700;800;900&family=DM+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(59,130,246,0.2);border-radius:2px}
input,button,select,textarea{font-family:'DM Sans',system-ui,sans-serif;outline:none;}
button{cursor:pointer;border:none;background:none;color:inherit;}
input[type=range]{-webkit-appearance:none;height:2px;border-radius:1px;background:#1C2333;cursor:pointer;}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;background:#3B82F6;border-radius:50%;cursor:pointer;box-shadow:0 0 6px rgba(59,130,246,0.5);}
.nl{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:6px;cursor:pointer;transition:all 0.13s;color:#4E5E7A;font-size:12.5px;font-weight:500;border:1px solid transparent;white-space:nowrap;}
.nl:hover{color:#EEF2FF;background:rgba(255,255,255,0.04);}
.nl.on{color:#EEF2FF;background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.2);}
.b1{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:600;letter-spacing:0.01em;transition:all 0.14s;cursor:pointer;border:1px solid transparent;}
.bblue{background:#3B82F6;color:#fff;border-color:#3B82F6;}
.bblue:hover{background:#2563EB;box-shadow:0 4px 20px rgba(59,130,246,0.35);transform:translateY(-1px);}
.bghost{background:transparent;color:#9BA8C0;border-color:rgba(255,255,255,0.055);}
.bghost:hover{background:rgba(255,255,255,0.045);border-color:rgba(255,255,255,0.10);color:#EEF2FF;}
.bsm{padding:6px 12px;font-size:12px;}
.card{background:#0C1018;border:1px solid rgba(255,255,255,0.055);border-radius:10px;transition:border-color 0.15s;}
.card:hover{border-color:rgba(255,255,255,0.10);}
.ac{background:#0C1018;border:1px solid rgba(255,255,255,0.055);border-radius:10px;padding:18px;cursor:pointer;transition:all 0.18s;position:relative;overflow:hidden;}
.ac:hover{border-color:rgba(59,130,246,0.35);transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,0.45);}
.ac.sel{border-color:rgba(59,130,246,0.5);background:rgba(59,130,246,0.05);}
.chip{display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:0.08em;padding:2px 7px;border-radius:4px;font-family:'IBM Plex Mono','Courier New',monospace;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pF{0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0.6)}60%{box-shadow:0 0 0 10px rgba(244,63,94,0)}}
@keyframes pH{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.5)}60%{box-shadow:0 0 0 8px rgba(16,185,129,0)}}
@keyframes tick{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:translateY(0)}}
@keyframes drift{0%,100%{transform:translateY(0) translateX(0)}33%{transform:translateY(-20px) translateX(10px)}66%{transform:translateY(12px) translateX(-8px)}}
@keyframes scanPulse{0%,100%{opacity:0.2}50%{opacity:0.6}}
@keyframes glowBeat{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,0.5)}50%{box-shadow:0 0 0 6px rgba(59,130,246,0)}}
.pv{animation:fadeUp 0.28s ease both;}
.ff{animation:pF 0.55s ease;}
.fh{animation:pH 0.45s ease;}
.stk{animation:tick 0.2s ease both;}
`;

/* ════════════════════════════════════════════════════════
   APP ROOT
════════════════════════════════════════════════════════ */
export default function App(){
  const [view,setView]=useState("landing");
  const [algoId,setAlgoId]=useState("LRU");
  const [frames,setFrames]=useState(3);
  const [refStr,setRefStr]=useState("7,0,1,2,0,3,0,4,2,3,0,3,2,1,2,0,1,7,0,1");
  const [speed,setSpeed]=useState(700);
  const [collapsed,setCol]=useState(false);
  const [mouse,setMouse]=useState({x:-400,y:-400});

  useEffect(()=>{
    const h=e=>setMouse({x:e.clientX,y:e.clientY});
    window.addEventListener("mousemove",h);
    return()=>window.removeEventListener("mousemove",h);
  },[]);

  const refArr=useMemo(()=>refStr.split(",").map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)),[refStr]);

  const isLanding=view==="landing";
  const NAV=[
    {id:"landing", label:"Home"},
    {id:"algos",   label:"Algorithms"},
    {id:"simulate",label:"Simulate"},
    {id:"compare", label:"Compare"},
    {id:"learn",   label:"Learn"},
  ];

  return(
    <div style={{fontFamily:C.body,background:C.bg0,color:C.t0,minHeight:"100vh",display:"flex",position:"relative"}}>
      <style>{CSS}</style>
      {/* cursor glow */}
      <div style={{position:"fixed",pointerEvents:"none",zIndex:9999,width:480,height:480,borderRadius:"50%",
        background:"radial-gradient(circle,rgba(59,130,246,0.032) 0%,transparent 65%)",
        left:mouse.x,top:mouse.y,transform:"translate(-50%,-50%)",transition:"left 0.07s,top 0.07s"}}/>

      {/* SIDEBAR — hidden on landing */}
      {!isLanding&&(
        <aside style={{width:collapsed?52:196,flexShrink:0,background:C.bg1,borderRight:`1px solid ${C.b0}`,
          display:"flex",flexDirection:"column",transition:"width 0.2s ease",overflow:"hidden",
          position:"sticky",top:0,height:"100vh",zIndex:100}}>
          <div style={{padding:"15px 11px",borderBottom:`1px solid ${C.b0}`,display:"flex",alignItems:"center",gap:9,minHeight:52}}>
            <div style={{width:26,height:26,flexShrink:0,background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",
              borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:11,fontWeight:900,color:"#fff",fontFamily:C.head}}>P</div>
            {!collapsed&&<span style={{fontFamily:C.head,fontWeight:900,fontSize:13,letterSpacing:"-0.03em"}}>
              PageSim<span style={{color:C.blue}}>.</span></span>}
          </div>
          <nav style={{flex:1,padding:"10px 8px",display:"flex",flexDirection:"column",gap:1}}>
            {NAV.map(n=>(
              <div key={n.id} className={`nl${view===n.id?" on":""}`} onClick={()=>setView(n.id)} title={collapsed?n.label:""}>
                <span style={{fontSize:13,flexShrink:0,opacity:view===n.id?1:0.5}}>
                  {n.id==="landing"?"⬡":n.id==="algos"?"◈":n.id==="simulate"?"▷":n.id==="compare"?"⊞":"≡"}
                </span>
                {!collapsed&&<span>{n.label}</span>}
              </div>
            ))}
          </nav>
          <div style={{padding:"10px 8px",borderTop:`1px solid ${C.b0}`}}>
            <div className="nl" onClick={()=>setCol(!collapsed)}>
              <span style={{fontSize:11,opacity:0.4,display:"inline-block",transition:"transform 0.2s",transform:collapsed?"scaleX(-1)":"none"}}>◀◀</span>
              {!collapsed&&<span style={{fontSize:11}}>Collapse</span>}
            </div>
          </div>
        </aside>
      )}

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {/* topbar */}
        {!isLanding&&(
          <header style={{height:48,borderBottom:`1px solid ${C.b0}`,display:"flex",alignItems:"center",
            justifyContent:"space-between",padding:"0 20px",background:C.bg1,position:"sticky",top:0,zIndex:50,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:C.t2,fontSize:11,fontFamily:C.mono}}>~/</span>
              <span style={{color:C.t1,fontSize:12,fontWeight:500}}>{NAV.find(n=>n.id===view)?.label}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:5,background:C.bg2,border:`1px solid ${C.b0}`,borderRadius:5,padding:"3px 9px"}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:C.green,animation:"glowBeat 2s ease infinite"}}/>
                <span style={{fontSize:10,fontFamily:C.mono,color:C.t2}}>{algoId}</span>
              </div>
              <button className="b1 bghost bsm" onClick={()=>setView("landing")}>← Home</button>
            </div>
          </header>
        )}
        <main style={{flex:1,overflow:"auto"}}>
          <div className="pv" key={view}>
            {view==="landing"  &&<Landing  setView={setView} algoId={algoId} frames={frames} refStr={refStr}/>}
            {view==="algos"    &&<Algos    algoId={algoId} setAlgoId={setAlgoId} setView={setView}/>}
            {view==="simulate" &&<Simulate algoId={algoId} frames={frames} setFrames={setFrames}
                                           refStr={refStr} setRefStr={setRefStr} refArr={refArr}
                                           speed={speed} setSpeed={setSpeed} setView={setView}/>}
            {view==="compare"  &&<Compare  frames={frames} refStr={refStr} setRefStr={setRefStr} setFrames={setFrames}/>}
            {view==="learn"    &&<Learn/>}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   LANDING
════════════════════════════════════════════════════════ */
function Landing({setView}){
  const [tick,setTick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),750);return()=>clearInterval(t);},[]);

  const DR=[7,0,1,2,0,3,0,4,2,3,0,3];
  const DR_RES=useMemo(()=>runFIFO(3,DR),[]);
  const dStep=tick%(DR.length+5);
  const dFrame=dStep<DR_RES.steps.length?DR_RES.steps[dStep]:DR_RES.steps[DR_RES.steps.length-1];

  const features=[
    {icon:"▷",title:"Step-by-Step Simulation",desc:"Animate every page load and eviction with precise visual feedback."},
    {icon:"⊞",title:"Side-by-Side Comparison",desc:"Run all 6 algorithms on the same input. Ranked charts show the winner."},
    {icon:"◈",title:"6 Algorithms Covered",desc:"FIFO, LRU, Optimal, Clock, Working Set, and PFF all in one place."},
    {icon:"≡",title:"Deep Reference Docs",desc:"Step-by-step breakdowns, pros/cons, and worked examples for each algorithm."},
  ];

  return(
    <div style={{minHeight:"100vh",position:"relative",overflow:"hidden"}}>
      {/* bg effects */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(rgba(59,130,246,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.035) 1px,transparent 1px)`,backgroundSize:"52px 52px"}}/>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 70% 50% at 50% 0%,rgba(59,130,246,0.08) 0%,transparent 70%)"}}/>
        <div style={{position:"absolute",width:700,height:700,borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,0.065),transparent 70%)",top:"-20%",right:"-15%",animation:"drift 18s ease-in-out infinite",filter:"blur(50px)"}}/>
        <div style={{position:"absolute",width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(59,130,246,0.05),transparent 70%)",bottom:"0%",left:"-10%",animation:"drift 24s ease-in-out infinite reverse",filter:"blur(60px)"}}/>
        {[...Array(22)].map((_,i)=>(
          <div key={i} style={{position:"absolute",width:2,height:2,borderRadius:"50%",
            background:`rgba(99,102,241,${0.12+Math.random()*0.2})`,
            left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,
            animation:`scanPulse ${3+Math.random()*5}s ease-in-out infinite`,
            animationDelay:`${Math.random()*6}s`}}/>
        ))}
      </div>

      {/* TOPNAV */}
      <nav style={{position:"sticky",top:0,zIndex:200,backdropFilter:"blur(24px)",
        background:"rgba(7,9,15,0.85)",borderBottom:`1px solid ${C.b0}`,
        display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 36px",height:52}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",
            borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"#fff",fontFamily:C.head}}>P</div>
          <span style={{fontFamily:C.head,fontWeight:900,fontSize:14,letterSpacing:"-0.03em"}}>PageSim<span style={{color:C.blue}}>.</span></span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {[["algos","Algorithms"],["compare","Compare"],["learn","Learn"]].map(([id,l])=>(
            <button key={id} className="b1 bghost bsm" onClick={()=>setView(id)}>{l}</button>
          ))}
          <button className="b1 bblue bsm" onClick={()=>setView("simulate")}>Open Simulator</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{position:"relative",zIndex:1,padding:"72px 36px 60px",maxWidth:1100,margin:"0 auto",
        display:"grid",gridTemplateColumns:"1fr 1fr",gap:52,alignItems:"center"}}>
        <div>
          <div style={{display:"inline-flex",alignItems:"center",gap:7,background:"rgba(59,130,246,0.09)",
            border:"1px solid rgba(59,130,246,0.2)",borderRadius:100,padding:"4px 14px",marginBottom:22}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:C.blue,animation:"glowBeat 2s ease infinite"}}/>
            <span style={{fontSize:10,fontFamily:C.mono,color:C.blue,letterSpacing:"0.1em"}}>OS MEMORY MANAGEMENT SIMULATOR</span>
          </div>
          <h1 style={{fontFamily:C.head,fontSize:"clamp(34px,5vw,56px)",fontWeight:900,lineHeight:1.05,letterSpacing:"-0.045em",marginBottom:18}}>
            Page Replacement<br/>
            <span style={{background:"linear-gradient(105deg,#3B82F6 0%,#8B5CF6 45%,#06B6D4 90%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Algorithms</span>
          </h1>
          <p style={{fontSize:15,color:C.t1,lineHeight:1.75,marginBottom:30,maxWidth:450}}>
            An interactive simulator for OS memory management. Step through FIFO, LRU, Optimal, Clock, and more — frame by frame, in real time.
          </p>
          <div style={{display:"flex",gap:10,marginBottom:44}}>
            <button className="b1 bblue" style={{padding:"10px 24px",fontSize:14}} onClick={()=>setView("simulate")}>▷ &nbsp;Start Simulating</button>
            <button className="b1 bghost" style={{padding:"10px 24px",fontSize:14}} onClick={()=>setView("algos")}>Browse Algorithms →</button>
          </div>
          <div style={{display:"flex",gap:28}}>
            {[["6","Algorithms"],["Real-time","Visualization"],["Step","Controls"]].map(([v,l])=>(
              <div key={l}>
                <div style={{fontFamily:C.head,fontWeight:800,fontSize:22,letterSpacing:"-0.04em"}}>{v}</div>
                <div style={{fontSize:11,color:C.t2,marginTop:1}}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* LIVE DEMO WIDGET */}
        <div style={{position:"relative"}}>
          <div style={{background:C.bg1,border:`1px solid ${C.b1}`,borderRadius:14,padding:22,
            boxShadow:"0 20px 70px rgba(0,0,0,0.65)"}}>
            {/* terminal bar */}
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:18}}>
              {["#F43F5E","#F59E0B","#10B981"].map(c=>(
                <div key={c} style={{width:9,height:9,borderRadius:"50%",background:c,opacity:0.7}}/>
              ))}
              <span style={{fontFamily:C.mono,fontSize:9,color:C.t2,marginLeft:7}}>fifo.run(frames=3)</span>
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:3}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:C.green,animation:"glowBeat 1.5s ease infinite"}}/>
                <span style={{fontFamily:C.mono,fontSize:8,color:C.green}}>LIVE</span>
              </div>
            </div>
            {/* ref string */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:9,fontFamily:C.mono,color:C.t2,marginBottom:7,letterSpacing:"0.1em"}}>REFERENCE STRING</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {DR.map((p,i)=>{
                  const isCur=i===dStep,isPast=i<dStep&&i<DR_RES.steps.length;
                  const isH=isPast&&DR_RES.steps[i]?.hit,isF=isPast&&DR_RES.steps[i]?.fault;
                  return(
                    <div key={i} style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",
                      borderRadius:5,fontFamily:C.mono,fontWeight:600,fontSize:10,
                      background:isCur?(dFrame?.hit?"rgba(16,185,129,0.12)":"rgba(244,63,94,0.12)"):isPast?C.bg3:C.bg2,
                      border:`1px solid ${isCur?(dFrame?.hit?C.green:C.red):isPast?(isH?C.green+"44":isF?C.red+"44":C.b0):C.b0}`,
                      color:isCur?C.t0:isPast?(isH?C.green:isF?C.red:C.t2):C.t2,
                      transform:isCur?"scale(1.14)":"scale(1)",transition:"all 0.18s"}}>
                      {p}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* frames */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:9,fontFamily:C.mono,color:C.t2,marginBottom:7,letterSpacing:"0.1em"}}>MEMORY FRAMES</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                {(dFrame?.frames||[null,null,null]).map((pg,fi)=>(
                  <div key={fi} style={{background:pg!=null?C.bg3:C.bg2,border:`1px solid ${pg!=null?C.b1:C.b0}`,
                    borderRadius:7,padding:"11px 8px",textAlign:"center",transition:"all 0.22s"}}>
                    <div style={{fontSize:8,fontFamily:C.mono,color:C.t2,marginBottom:4}}>F{fi+1}</div>
                    <div style={{fontFamily:C.mono,fontSize:20,fontWeight:700,color:pg!=null?C.t0:C.bg4,transition:"color 0.2s"}}>
                      {pg!=null?pg:"·"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* status */}
            <div style={{background:dFrame?.hit?"rgba(16,185,129,0.07)":"rgba(244,63,94,0.07)",
              border:`1px solid ${dFrame?.hit?"rgba(16,185,129,0.22)":"rgba(244,63,94,0.22)"}`,
              borderRadius:7,padding:"7px 12px",display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:dFrame?.hit?C.green:C.red,flexShrink:0}}/>
              <span style={{fontFamily:C.mono,fontSize:10,color:dFrame?.hit?C.green:C.red,fontWeight:600}}>
                PAGE {dFrame?.hit?"HIT":"FAULT"} — pg {dFrame?.page}
              </span>
            </div>
          </div>
          {/* floating badge */}
          <div style={{position:"absolute",top:-14,right:-14,background:C.bg0,
            border:"1px solid rgba(139,92,246,0.28)",borderRadius:8,padding:"7px 11px",boxShadow:"0 6px 20px rgba(0,0,0,0.5)"}}>
            <div style={{fontFamily:C.mono,fontSize:9,color:C.t2,marginBottom:1}}>Algorithm</div>
            <div style={{fontFamily:C.head,fontWeight:800,fontSize:13,color:C.violet}}>FIFO Demo</div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{position:"relative",zIndex:1,padding:"0 36px 72px",maxWidth:1100,margin:"0 auto"}}>
        <div style={{borderTop:`1px solid ${C.b0}`,paddingTop:56,marginBottom:40,textAlign:"center"}}>
          <h2 style={{fontFamily:C.head,fontWeight:800,fontSize:"clamp(22px,3vw,34px)",letterSpacing:"-0.04em",marginBottom:8}}>
            Everything you need to understand<br/>memory management
          </h2>
          <p style={{color:C.t2,fontSize:13}}>Built for students, educators, and curious engineers.</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(235px,1fr))",gap:10}}>
          {features.map((f,i)=>(
            <div key={i} style={{background:C.bg1,border:`1px solid ${C.b0}`,borderRadius:10,padding:"18px 16px",transition:"all 0.16s",cursor:"pointer"}}
              onClick={()=>setView(["simulate","compare","algos","learn"][i])}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.b2;e.currentTarget.style.transform="translateY(-3px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.b0;e.currentTarget.style.transform="translateY(0)";}}>
              <div style={{width:30,height:30,background:"rgba(59,130,246,0.09)",border:"1px solid rgba(59,130,246,0.18)",
                borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,marginBottom:12}}>{f.icon}</div>
              <div style={{fontFamily:C.head,fontWeight:700,fontSize:13,marginBottom:5}}>{f.title}</div>
              <div style={{fontSize:12,color:C.t2,lineHeight:1.65}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ALGO GRID */}
      <section style={{position:"relative",zIndex:1,padding:"0 36px 72px",maxWidth:1100,margin:"0 auto"}}>
        <div style={{borderTop:`1px solid ${C.b0}`,paddingTop:56}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:28}}>
            <div>
              <h2 style={{fontFamily:C.head,fontWeight:800,fontSize:"clamp(20px,3vw,30px)",letterSpacing:"-0.04em",marginBottom:5}}>Six algorithms, one platform</h2>
              <p style={{color:C.t2,fontSize:12}}>From textbook classics to adaptive real-time strategies.</p>
            </div>
            <button className="b1 bghost bsm" onClick={()=>setView("algos")}>View all →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:9}}>
            {Object.values(ALGOS).map(a=>(
              <div key={a.id} style={{background:C.bg1,border:`1px solid ${C.b0}`,borderRadius:9,padding:"14px",cursor:"pointer",transition:"all 0.15s",position:"relative",overflow:"hidden"}}
                onClick={()=>setView("algos")}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=a.color+"50";e.currentTarget.style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.b0;e.currentTarget.style.transform="translateY(0)";}}>
                <div style={{position:"absolute",top:0,right:0,width:45,height:45,background:`radial-gradient(circle at top right,${a.color}15,transparent)`,pointerEvents:"none"}}/>
                <div style={{fontFamily:C.mono,fontWeight:700,fontSize:12,color:a.color,marginBottom:5}}>{a.label}</div>
                <div style={{fontSize:10,color:C.t2,lineHeight:1.55,marginBottom:8}}>{a.desc.slice(0,50)}…</div>
                <span className="chip" style={{background:`${a.color}14`,color:a.color}}>{a.type}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{position:"relative",zIndex:1,padding:"0 36px 90px",maxWidth:680,margin:"0 auto",textAlign:"center"}}>
        <div style={{background:"linear-gradient(140deg,rgba(59,130,246,0.055),rgba(139,92,246,0.055))",
          border:"1px solid rgba(99,102,241,0.18)",borderRadius:14,padding:"44px 36px"}}>
          <h2 style={{fontFamily:C.head,fontWeight:900,fontSize:"clamp(22px,3vw,32px)",letterSpacing:"-0.04em",marginBottom:10}}>Ready to simulate?</h2>
          <p style={{color:C.t1,fontSize:14,marginBottom:26,lineHeight:1.7}}>Pick an algorithm, set your reference string, and watch memory management unfold step by step.</p>
          <div style={{display:"flex",gap:9,justifyContent:"center"}}>
            <button className="b1 bblue" style={{padding:"11px 26px",fontSize:14}} onClick={()=>setView("simulate")}>▷ &nbsp;Launch Simulator</button>
            <button className="b1 bghost" style={{padding:"11px 26px",fontSize:14}} onClick={()=>setView("compare")}>Compare Algorithms</button>
          </div>
        </div>
      </section>

      <footer style={{borderTop:`1px solid ${C.b0}`,padding:"18px 36px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:1}}>
        <span style={{fontFamily:C.mono,fontSize:9,color:C.t2}}>PageSim · OS Memory Management Simulator</span>
        <div style={{display:"flex",gap:12}}>
          {[["algos","Algorithms"],["simulate","Simulate"],["compare","Compare"],["learn","Learn"]].map(([id,l])=>(
            <button key={id} style={{background:"none",fontSize:11,color:C.t2,cursor:"pointer"}} onClick={()=>setView(id)}>{l}</button>
          ))}
        </div>
      </footer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ALGOS VIEW
════════════════════════════════════════════════════════ */
function Algos({algoId,setAlgoId,setView}){
  return(
    <div style={{padding:"26px 22px",maxWidth:920}}>
      <H title="Algorithms" sub="Select an algorithm to simulate"/>
      {["Classic","Adaptive"].map(type=>(
        <div key={type} style={{marginBottom:30}}>
          <Div label={type}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:9}}>
            {Object.values(ALGOS).filter(a=>a.type===type).map(a=>(
              <div key={a.id} className={`ac${algoId===a.id?" sel":""}`} onClick={()=>setAlgoId(a.id)}>
                <div style={{position:"absolute",top:0,right:0,width:55,height:55,background:`radial-gradient(circle at top right,${a.color}17,transparent)`,pointerEvents:"none"}}/>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:9}}>
                  <div>
                    <div style={{fontFamily:C.head,fontWeight:800,fontSize:14,marginBottom:2}}>{a.full}</div>
                    <span style={{fontFamily:C.mono,fontSize:10,color:a.color}}>{a.complexity}</span>
                  </div>
                  {algoId===a.id&&<div style={{width:6,height:6,borderRadius:"50%",background:C.blue,boxShadow:`0 0 7px ${C.blue}`,marginTop:3}}/>}
                </div>
                <p style={{fontSize:11,color:C.t2,lineHeight:1.65,marginBottom:13}}>{a.desc}</p>
                <button className="b1 bblue bsm" style={{width:"100%"}}
                  onClick={e=>{e.stopPropagation();setAlgoId(a.id);setView("simulate");}}>Simulate →</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SIMULATE VIEW
════════════════════════════════════════════════════════ */
function Simulate({algoId,frames,setFrames,refStr,setRefStr,refArr,speed,setSpeed,setView}){
  const algo=ALGOS[algoId];
  const {steps,faults}=useMemo(()=>algo.run(frames,refArr),[algo,frames,refArr]);
  const hits=steps.filter(s=>s.hit).length;

  const [step,setStep]=useState(-1);
  const [playing,setPlay]=useState(false);
  const [tick,setTick]=useState(0);
  const timer=useRef();

  useEffect(()=>{setStep(-1);setPlay(false);},[algoId,frames,refStr]);
  useEffect(()=>{
    if(playing){timer.current=setInterval(()=>{setStep(s=>{if(s>=steps.length-1){setPlay(false);return s;}setTick(t=>t+1);return s+1;});},speed);}
    return()=>clearInterval(timer.current);
  },[playing,speed,steps.length]);
  useEffect(()=>{
    const h=e=>{
      if(e.key===" "){e.preventDefault();setPlay(p=>!p);}
      if(e.key==="ArrowRight")setStep(s=>Math.min(s+1,steps.length-1));
      if(e.key==="ArrowLeft") setStep(s=>Math.max(s-1,-1));
      if(e.key.toLowerCase()==="r"){setStep(-1);setPlay(false);}
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[steps.length]);

  const cur=step>=0?steps[step]:null;
  const fN=steps.slice(0,step+1).filter(s=>s.fault).length;
  const hN=steps.slice(0,step+1).filter(s=>s.hit).length;

  return(
    <div style={{padding:"22px 22px",maxWidth:1060}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <button className="b1 bghost bsm" onClick={()=>setView("algos")}>← {algo.label}</button>
          <span style={{color:C.t2}}>|</span>
          <span style={{fontFamily:C.head,fontWeight:800,fontSize:16}}>{algo.full}</span>
          <span className="chip" style={{background:`${algo.color}17`,color:algo.color}}>{algo.type}</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          {[["Space","Play/Pause"],["←→","Step"],["R","Reset"]].map(([k,l])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:3}}>
              <kbd style={{background:C.bg3,border:`1px solid ${C.b0}`,borderRadius:4,padding:"1px 5px",fontSize:9,fontFamily:C.mono,color:C.t2}}>{k}</kbd>
              <span style={{fontSize:9,color:C.t2}}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 255px",gap:13}}>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {/* ref string */}
          <div className="card" style={{padding:"13px 15px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:9}}>
              <span style={{fontSize:9,fontFamily:C.mono,color:C.t2,letterSpacing:"0.1em"}}>REFERENCE STRING</span>
              <span style={{fontSize:9,fontFamily:C.mono,color:C.t2}}>{step+1}/{steps.length}</span>
            </div>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {refArr.map((p,i)=>{
                const iC=i===step,iP=i<step&&i<steps.length;
                const iH=iP&&steps[i]?.hit,iF=iP&&steps[i]?.fault;
                return(
                  <div key={i} onClick={()=>{setStep(i);setPlay(false);}}
                    style={{width:29,height:29,display:"flex",alignItems:"center",justifyContent:"center",
                      borderRadius:5,fontFamily:C.mono,fontWeight:600,fontSize:11,cursor:"pointer",
                      background:iC?(cur?.hit?"rgba(16,185,129,0.11)":"rgba(244,63,94,0.11)"):iP?C.bg3:C.bg2,
                      border:`1px solid ${iC?(cur?.hit?C.green:C.red):iP?(iH?C.green+"40":iF?C.red+"40":C.b0):C.b0}`,
                      color:iC?C.t0:iP?(iH?C.green:iF?C.red:C.t2):C.t2,
                      transform:iC?"scale(1.16)":"scale(1)",transition:"all 0.15s",
                      boxShadow:iC?`0 0 9px ${cur?.hit?C.green:C.red}44`:"none"}}>
                    {p}
                  </div>
                );
              })}
            </div>
          </div>

          {/* frames */}
          <div className="card" style={{padding:"15px 17px"}}>
            <div style={{fontSize:9,fontFamily:C.mono,color:C.t2,letterSpacing:"0.1em",marginBottom:13}}>MEMORY FRAMES</div>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(frames,8)},1fr)`,gap:9}}>
              {(cur?.frames||Array(frames).fill(null)).map((pg,fi)=>{
                const prev=step>0?steps[step-1]?.frames[fi]:null;
                const isNew=cur&&!cur.hit&&cur.frames[fi]===cur.page&&prev!==cur.frames[fi];
                const empty=pg===null||pg===undefined;
                return(
                  <div key={fi} className={isNew?(cur?.hit?"fh":"ff"):""}
                    style={{background:isNew?(cur?.hit?"rgba(16,185,129,0.09)":"rgba(244,63,94,0.09)"):empty?C.bg2:C.bg3,
                      border:`1px solid ${isNew?(cur?.hit?C.green:C.red):empty?C.b0:C.b1}`,
                      borderRadius:9,padding:"15px 9px",textAlign:"center",
                      transition:"all 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                      boxShadow:isNew?`0 0 16px ${cur?.hit?"rgba(16,185,129,0.18)":"rgba(244,63,94,0.18)"}`:"none",
                      position:"relative",overflow:"hidden"}}>
                    {isNew&&<div style={{position:"absolute",inset:0,
                      background:`radial-gradient(circle at center,${cur?.hit?"rgba(16,185,129,0.07)":"rgba(244,63,94,0.07)"},transparent 70%)`,
                      pointerEvents:"none"}}/>}
                    <div style={{fontSize:8,fontFamily:C.mono,color:C.t2,marginBottom:5,letterSpacing:"0.1em"}}>F{fi+1}</div>
                    <div style={{fontFamily:C.mono,fontSize:24,fontWeight:700,
                      color:empty?C.bg4:isNew?(cur?.hit?C.green:C.red):C.t0,
                      letterSpacing:"-0.04em",transition:"color 0.2s"}}>
                      {empty?"·":pg}
                    </div>
                    {isNew&&<div style={{height:2,background:cur?.hit?C.green:C.red,borderRadius:1,marginTop:7,width:"55%",marginInline:"auto"}}/>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* status */}
          {cur&&(
            <div className="stk card" key={tick}
              style={{padding:"10px 15px",display:"flex",alignItems:"center",gap:11,
                borderColor:cur.hit?"rgba(16,185,129,0.22)":"rgba(244,63,94,0.22)",
                background:cur.hit?"rgba(16,185,129,0.035)":"rgba(244,63,94,0.035)"}}>
              <div style={{width:6,height:6,borderRadius:"50%",flexShrink:0,
                background:cur.hit?C.green:C.red,animation:cur.hit?"pH 1.2s ease infinite":"pF 1.2s ease infinite"}}/>
              <div>
                <div style={{fontFamily:C.head,fontWeight:700,fontSize:12,color:cur.hit?C.green:C.red,marginBottom:1}}>PAGE {cur.hit?"HIT":"FAULT"}</div>
                <div style={{fontSize:10,color:C.t2}}>
                  Page <span style={{fontFamily:C.mono,color:C.t1}}>{cur.page}</span>
                  {cur.hit?" is already in memory":cur.evicted?` loaded — evicted page ${cur.evicted}`:" loaded into empty frame"}
                </div>
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:14}}>
                {[{v:fN,l:"FAULTS",c:C.red},{v:hN,l:"HITS",c:C.green}].map(s=>(
                  <div key={s.l} style={{textAlign:"right"}}>
                    <div style={{fontFamily:C.mono,fontSize:17,fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                    <div style={{fontSize:8,color:C.t2,letterSpacing:"0.08em"}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* timeline */}
          <div className="card" style={{padding:"11px 15px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
              <span style={{fontSize:9,fontFamily:C.mono,color:C.t2,letterSpacing:"0.1em"}}>TIMELINE</span>
              <span style={{fontSize:9,fontFamily:C.mono,color:C.t2}}>{steps.length?Math.round((step+1)/steps.length*100):0}%</span>
            </div>
            <div style={{display:"flex",gap:2,marginBottom:7}}>
              {steps.map((s,i)=>(
                <div key={i} onClick={()=>{setStep(i);setPlay(false);}}
                  title={`Step ${i+1}: ${s.fault?"FAULT":"HIT"} pg${s.page}`}
                  style={{flex:1,height:6,borderRadius:2,cursor:"pointer",
                    background:i<=step?(s.fault?C.red:C.green):C.bg4,
                    opacity:i===step?1:0.6,transition:"background 0.15s"}}/>
              ))}
            </div>
            <input type="range" min="-1" max={steps.length-1} value={step}
              onChange={e=>{setStep(+e.target.value);setPlay(false);}} style={{width:"100%"}}/>
          </div>

          {/* controls */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {[
              {l:"⏮",a:()=>{setStep(-1);setPlay(false);}},
              {l:"◀",a:()=>setStep(s=>Math.max(s-1,-1))},
              {l:playing?"⏸":"▷",a:()=>setPlay(p=>!p),primary:true},
              {l:"▶",a:()=>setStep(s=>Math.min(s+1,steps.length-1))},
              {l:"⏭",a:()=>setStep(steps.length-1)},
            ].map((b,i)=>(
              <button key={i} className={`b1 ${b.primary?"bblue":"bghost"}`}
                style={{minWidth:36,...(b.primary?{padding:"8px 18px",fontSize:13}:{})}}
                onClick={b.a}>{b.l}</button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,background:C.bg2,
              border:`1px solid ${C.b0}`,borderRadius:6,padding:"0 11px",height:32}}>
              <span style={{fontSize:9,color:C.t2,fontFamily:C.mono}}>Speed</span>
              <input type="range" min="100" max="2000" value={speed} onChange={e=>setSpeed(+e.target.value)} style={{width:76}}/>
              <span style={{fontSize:9,color:C.t2,fontFamily:C.mono,minWidth:34}}>{speed}ms</span>
            </div>
          </div>
        </div>

        {/* config panel */}
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          <div className="card" style={{padding:"13px"}}>
            <FL>Frames: <span style={{color:C.blue,fontFamily:C.mono}}>{frames}</span></FL>
            <input type="range" min="1" max="8" value={frames} onChange={e=>setFrames(+e.target.value)} style={{width:"100%",marginBottom:12}}/>
            <FL>Reference String</FL>
            <textarea value={refStr} onChange={e=>setRefStr(e.target.value)} rows={3}
              style={{width:"100%",background:C.bg2,border:`1px solid ${C.b0}`,borderRadius:6,
                padding:"6px 8px",color:C.t0,fontFamily:C.mono,fontSize:10,lineHeight:1.6,resize:"vertical",marginBottom:9}}/>
            <button className="b1 bghost bsm" style={{width:"100%"}} onClick={()=>{
              setRefStr(Array.from({length:14},()=>Math.floor(Math.random()*7)).join(","));
            }}>🎲 Random</button>
          </div>
          <div className="card" style={{padding:"13px"}}>
            <FL style={{marginBottom:9}}>Presets</FL>
            {PRESETS.map((p,i)=>(
              <button key={i} onClick={()=>setRefStr(p.ref)}
                style={{display:"block",width:"100%",textAlign:"left",padding:"7px 8px",
                  borderRadius:5,background:"transparent",border:"1px solid transparent",
                  color:C.t1,fontSize:11,marginBottom:4,cursor:"pointer",transition:"all 0.12s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=C.bg3;e.currentTarget.style.borderColor=C.b0;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
                <div style={{fontWeight:600,fontSize:11,marginBottom:1}}>{p.name}</div>
                <div style={{fontFamily:C.mono,fontSize:9,color:C.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.ref}</div>
              </button>
            ))}
          </div>
          <div className="card" style={{padding:"13px"}}>
            <FL style={{marginBottom:10}}>Summary</FL>
            {[{l:"Faults",v:faults,c:C.red},{l:"Hits",v:hits,c:C.green},{l:"Hit Rate",v:steps.length?`${Math.round(hits/steps.length*100)}%`:"—",c:C.blue},{l:"Steps",v:steps.length,c:C.t1}].map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"5px 0",borderBottom:i<3?`1px solid ${C.b0}`:"none"}}>
                <span style={{fontSize:11,color:C.t2}}>{s.l}</span>
                <span style={{fontFamily:C.mono,fontWeight:600,fontSize:12,color:s.c}}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   COMPARE VIEW — FULLY REBUILT
════════════════════════════════════════════════════════ */
function Compare({frames:gf,refStr:gr,setRefStr,setFrames}){
  const [localRef,setLocalRef]=useState(gr);
  const [localF,setLocalF]=useState(gf);
  const [sel,setSel]=useState(Object.keys(ALGOS));

  const arr=useMemo(()=>localRef.split(",").map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)),[localRef]);

  const results=useMemo(()=>{
    if(!arr.length||localF<1)return[];
    return sel.map(k=>{
      const a=ALGOS[k];
      const{steps,faults}=a.run(localF,arr);
      const hits=steps.filter(s=>s.hit).length;
      const total=steps.length;
      const hr=total?Math.round(hits/total*100):0;
      return{id:k,name:a.label,full:a.full,faults,hits,total,hr,mr:100-hr,color:a.color,type:a.type};
    }).sort((a,b)=>a.faults-b.faults);
  },[sel,localF,arr]);

  const best=results[0];
  const worst=results[results.length-1];

  return(
    <div style={{padding:"22px 22px",maxWidth:1060}}>
      <H title="Algorithm Comparison" sub="Evaluate all algorithms on the same reference string"/>

      {/* CONFIG */}
      <div className="card" style={{padding:"13px 16px",marginBottom:16,display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div style={{flex:"1 1 260px"}}>
          <FL>Reference String</FL>
          <input value={localRef} onChange={e=>setLocalRef(e.target.value)}
            style={{width:"100%",background:C.bg2,border:`1px solid ${C.b0}`,borderRadius:6,padding:"6px 8px",color:C.t0,fontFamily:C.mono,fontSize:11}}/>
        </div>
        <div style={{minWidth:130}}>
          <FL>Frames: <span style={{color:C.blue,fontFamily:C.mono}}>{localF}</span></FL>
          <input type="range" min="1" max="8" value={localF} onChange={e=>setLocalF(+e.target.value)} style={{width:"100%"}}/>
        </div>
        <div>
          <FL>Toggle Algorithms</FL>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {Object.keys(ALGOS).map(k=>(
              <button key={k} onClick={()=>setSel(s=>s.includes(k)?s.filter(x=>x!==k):[...s,k])}
                style={{padding:"3px 8px",borderRadius:5,fontSize:10,fontFamily:C.mono,fontWeight:700,cursor:"pointer",transition:"all 0.12s",
                  background:sel.includes(k)?`${ALGOS[k].color}17`:C.bg2,
                  border:`1px solid ${sel.includes(k)?ALGOS[k].color:C.b0}`,
                  color:sel.includes(k)?ALGOS[k].color:C.t2}}>{k}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {PRESETS.map((p,i)=>(
            <button key={i} className="b1 bghost bsm" style={{fontSize:9}} onClick={()=>setLocalRef(p.ref)}>{p.name}</button>
          ))}
          <button className="b1 bghost bsm" style={{fontSize:11}} onClick={()=>setLocalRef(Array.from({length:14},()=>Math.floor(Math.random()*7)).join(","))}>🎲</button>
        </div>
      </div>

      {!results.length?(
        <div style={{textAlign:"center",padding:"60px 0",color:C.t2}}>
          <div style={{fontSize:28,marginBottom:10}}>⊞</div>
          <div style={{fontSize:13}}>Select at least one algorithm and enter a valid reference string.</div>
        </div>
      ):(
        <>
          {/* WINNER / LOSER */}
          {results.length>=2&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:16}}>
              <div style={{background:"rgba(16,185,129,0.055)",border:"1px solid rgba(16,185,129,0.18)",borderRadius:9,padding:"11px 15px",display:"flex",alignItems:"center",gap:9}}>
                <span style={{fontSize:18}}>🏆</span>
                <div>
                  <div style={{fontSize:8,fontFamily:C.mono,color:C.t2,marginBottom:1,letterSpacing:"0.1em"}}>BEST PERFORMER</div>
                  <div style={{fontFamily:C.head,fontWeight:800,fontSize:13}}>{best.full}</div>
                  <div style={{fontSize:10,color:C.green,fontFamily:C.mono}}>{best.faults} faults · {best.hr}% hit rate</div>
                </div>
              </div>
              <div style={{background:"rgba(244,63,94,0.04)",border:"1px solid rgba(244,63,94,0.14)",borderRadius:9,padding:"11px 15px",display:"flex",alignItems:"center",gap:9}}>
                <span style={{fontSize:18}}>⚠️</span>
                <div>
                  <div style={{fontSize:8,fontFamily:C.mono,color:C.t2,marginBottom:1,letterSpacing:"0.1em"}}>MOST FAULTS</div>
                  <div style={{fontFamily:C.head,fontWeight:800,fontSize:13}}>{worst.full}</div>
                  <div style={{fontSize:10,color:C.red,fontFamily:C.mono}}>{worst.faults} faults · {worst.hr}% hit rate</div>
                </div>
              </div>
            </div>
          )}

          {/* METRIC CARDS */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:8,marginBottom:16}}>
            {results.map((r,i)=>(
              <div key={r.id} style={{background:C.bg1,border:`1px solid ${i===0?"rgba(16,185,129,0.28)":C.b0}`,
                borderRadius:9,padding:"13px 13px",position:"relative",overflow:"hidden",transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=r.color+"50"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=i===0?"rgba(16,185,129,0.28)":C.b0}>
                {i===0&&<div style={{position:"absolute",top:-5,right:7,fontSize:11,background:C.bg0,padding:"0 3px"}}>🥇</div>}
                <div style={{position:"absolute",top:0,right:0,width:38,height:38,background:`radial-gradient(circle at top right,${r.color}14,transparent)`,pointerEvents:"none"}}/>
                <div style={{fontFamily:C.mono,fontWeight:700,fontSize:11,color:r.color,marginBottom:8}}>{r.name}</div>
                <div style={{fontFamily:C.head,fontWeight:900,fontSize:24,color:C.red,letterSpacing:"-0.05em",lineHeight:1}}>{r.faults}</div>
                <div style={{fontSize:8,color:C.t2,marginBottom:8,letterSpacing:"0.07em"}}>PAGE FAULTS</div>
                <div style={{height:3,background:C.bg4,borderRadius:2,marginBottom:5,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:2,width:`${r.hr}%`,background:`linear-gradient(90deg,${r.color},${r.color}77)`,transition:"width 0.8s ease"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:10,color:C.green,fontFamily:C.mono,fontWeight:600}}>{r.hr}%</span>
                  <span style={{fontSize:9,color:C.t2}}>hit</span>
                </div>
              </div>
            ))}
          </div>

          {/* CHARTS */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:14}}>
            <div className="card" style={{padding:"16px 14px"}}>
              <div style={{fontFamily:C.head,fontWeight:700,fontSize:12,marginBottom:3}}>Page Faults by Algorithm</div>
              <div style={{fontSize:10,color:C.t2,marginBottom:14}}>Lower is better ↓</div>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={results.map(r=>({name:r.name,value:r.faults,color:r.color}))} margin={{top:2,right:2,left:-22,bottom:0}} barSize={22}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.b0} vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:C.t2,fontSize:9,fontFamily:C.mono}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:C.t2,fontSize:9}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:C.bg1,border:`1px solid ${C.b1}`,borderRadius:7,color:C.t0,fontSize:10,fontFamily:C.mono}}
                    cursor={{fill:"rgba(255,255,255,0.02)"}} formatter={v=>[`${v} faults`]}/>
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {results.map((r,i)=><Cell key={i} fill={r.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card" style={{padding:"16px 14px"}}>
              <div style={{fontFamily:C.head,fontWeight:700,fontSize:12,marginBottom:3}}>Hit Rate %</div>
              <div style={{fontSize:10,color:C.t2,marginBottom:14}}>Higher is better ↑</div>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={results.map(r=>({name:r.name,value:r.hr,color:r.color}))} margin={{top:2,right:2,left:-22,bottom:0}} barSize={22}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.b0} vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:C.t2,fontSize:9,fontFamily:C.mono}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:C.t2,fontSize:9}} axisLine={false} tickLine={false} domain={[0,100]}/>
                  <Tooltip contentStyle={{background:C.bg1,border:`1px solid ${C.b1}`,borderRadius:7,color:C.t0,fontSize:10,fontFamily:C.mono}}
                    cursor={{fill:"rgba(255,255,255,0.02)"}} formatter={v=>[`${v}%`,"Hit Rate"]}/>
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {results.map((_,i)=><Cell key={i} fill={C.green} opacity={0.5+i*0.09}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TABLE */}
          <div className="card" style={{overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.b0}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:C.head,fontWeight:700,fontSize:13}}>Detailed Results</span>
              <span style={{fontSize:9,fontFamily:C.mono,color:C.t2}}>{arr.length} refs · {localF} frames</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:C.bg2}}>
                    {["#","Algorithm","Type","Faults","Hits","Steps","Hit Rate","Miss Rate","Verdict"].map(h=>(
                      <th key={h} style={{padding:"8px 13px",textAlign:"left",fontSize:8,fontFamily:C.mono,
                        color:C.t2,letterSpacing:"0.09em",fontWeight:600,borderBottom:`1px solid ${C.b0}`,whiteSpace:"nowrap"}}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r,i)=>(
                    <tr key={r.id} style={{borderBottom:`1px solid ${C.b0}`,transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.bg2}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"9px 13px",fontFamily:C.mono,fontSize:11,color:C.t2}}>
                        {i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}
                      </td>
                      <td style={{padding:"9px 13px"}}>
                        <div style={{fontFamily:C.mono,fontWeight:700,fontSize:11,color:r.color}}>{r.name}</div>
                        <div style={{fontSize:9,color:C.t2}}>{r.full}</div>
                      </td>
                      <td style={{padding:"9px 13px"}}>
                        <span className="chip" style={{background:`${r.color}14`,color:r.color}}>{r.type}</span>
                      </td>
                      <td style={{padding:"9px 13px",fontFamily:C.mono,fontWeight:700,fontSize:13,color:C.red}}>{r.faults}</td>
                      <td style={{padding:"9px 13px",fontFamily:C.mono,fontWeight:700,fontSize:13,color:C.green}}>{r.hits}</td>
                      <td style={{padding:"9px 13px",fontFamily:C.mono,fontSize:11,color:C.t2}}>{r.total}</td>
                      <td style={{padding:"9px 13px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,minWidth:80}}>
                          <div style={{flex:1,height:3,background:C.bg4,borderRadius:2}}>
                            <div style={{height:"100%",borderRadius:2,background:C.green,width:`${r.hr}%`,transition:"width 0.7s"}}/>
                          </div>
                          <span style={{fontFamily:C.mono,fontSize:10,color:C.green,fontWeight:600,minWidth:30}}>{r.hr}%</span>
                        </div>
                      </td>
                      <td style={{padding:"9px 13px",fontFamily:C.mono,fontSize:10,color:C.red}}>{r.mr}%</td>
                      <td style={{padding:"9px 13px"}}>
                        <span style={{fontSize:10,fontWeight:600,color:i===0?C.green:i===results.length-1?C.red:C.t2}}>
                          {i===0?"Best":i===results.length-1?"Worst":"Mid"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   LEARN VIEW
════════════════════════════════════════════════════════ */
function Learn(){
  const [active,setActive]=useState("FIFO");
  const a=ALGOS[active];
  const d=LEARN_DATA[active];
  return(
    <div style={{padding:"22px 22px",maxWidth:900}}>
      <H title="Algorithm Reference" sub="Step-by-step breakdowns, trade-offs, and worked examples"/>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:22}}>
        {Object.values(ALGOS).map(al=>(
          <button key={al.id} onClick={()=>setActive(al.id)}
            style={{padding:"6px 12px",borderRadius:6,fontSize:10,fontFamily:C.mono,fontWeight:700,cursor:"pointer",transition:"all 0.12s",
              background:active===al.id?`${al.color}17`:C.bg2,
              border:`1px solid ${active===al.id?al.color:C.b0}`,
              color:active===al.id?al.color:C.t2}}>{al.label}</button>
        ))}
      </div>
      <div className="pv" key={active}>
        <div style={{background:C.bg1,border:`1px solid ${C.b0}`,borderLeft:`3px solid ${a.color}`,
          borderRadius:"0 10px 10px 0",padding:"18px 20px",marginBottom:12,display:"flex",gap:14,alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:6}}>
              <span style={{fontFamily:C.head,fontWeight:900,fontSize:19,letterSpacing:"-0.03em"}}>{a.full}</span>
              <span className="chip" style={{background:`${a.color}17`,color:a.color}}>{a.type}</span>
            </div>
            <p style={{fontSize:12,color:C.t1,lineHeight:1.7}}>{a.desc}</p>
          </div>
          <div style={{background:C.bg2,border:`1px solid ${C.b0}`,borderRadius:7,padding:"8px 13px",textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:8,fontFamily:C.mono,color:C.t2,marginBottom:1,letterSpacing:"0.1em"}}>COMPLEXITY</div>
            <div style={{fontFamily:C.mono,fontWeight:700,fontSize:12,color:a.color}}>{a.complexity}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div className="card" style={{padding:"14px"}}>
            <div style={{fontSize:8,fontFamily:C.mono,color:C.t2,letterSpacing:"0.1em",marginBottom:11}}>HOW IT WORKS</div>
            {d.steps.map((s,i)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
                <div style={{width:17,height:17,borderRadius:4,background:`${a.color}17`,border:`1px solid ${a.color}28`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontFamily:C.mono,fontWeight:700,color:a.color,flexShrink:0}}>{i+1}</div>
                <span style={{fontSize:11,color:C.t1,lineHeight:1.65}}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <div className="card" style={{padding:"13px",flex:1}}>
              <div style={{fontSize:8,fontFamily:C.mono,color:C.green,letterSpacing:"0.1em",marginBottom:9}}>ADVANTAGES</div>
              {d.pros.map((p,i)=>(
                <div key={i} style={{display:"flex",gap:6,marginBottom:5,alignItems:"flex-start"}}>
                  <span style={{color:C.green,fontSize:10,flexShrink:0,marginTop:1}}>+</span>
                  <span style={{fontSize:11,color:C.t1,lineHeight:1.55}}>{p}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{padding:"13px",flex:1}}>
              <div style={{fontSize:8,fontFamily:C.mono,color:C.red,letterSpacing:"0.1em",marginBottom:9}}>LIMITATIONS</div>
              {d.cons.map((c,i)=>(
                <div key={i} style={{display:"flex",gap:6,marginBottom:5,alignItems:"flex-start"}}>
                  <span style={{color:C.red,fontSize:10,flexShrink:0,marginTop:1}}>−</span>
                  <span style={{fontSize:11,color:C.t1,lineHeight:1.55}}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.b0}`,borderRadius:8,padding:"11px 15px",display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:8,fontFamily:C.mono,color:C.t2,letterSpacing:"0.1em",flexShrink:0,paddingTop:2,minWidth:50}}>EXAMPLE</span>
          <span style={{fontFamily:C.mono,fontSize:11,color:a.color,lineHeight:1.8}}>{d.ex}</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SHARED
════════════════════════════════════════════════════════ */
function H({title,sub}){return(<div style={{marginBottom:22}}><h2 style={{fontFamily:C.head,fontWeight:800,fontSize:22,letterSpacing:"-0.04em",marginBottom:3}}>{title}</h2>{sub&&<p style={{fontSize:12,color:C.t2}}>{sub}</p>}</div>);}
function FL({children,style={}}){return <div style={{fontSize:9,fontFamily:C.mono,color:C.t2,letterSpacing:"0.07em",marginBottom:5,...style}}>{children}</div>;}
function Div({label}){return(<div style={{display:"flex",alignItems:"center",gap:9,marginBottom:12}}><span style={{fontSize:9,fontFamily:C.mono,color:C.t2,letterSpacing:"0.1em"}}>{label.toUpperCase()}</span><div style={{flex:1,height:1,background:C.b0}}/></div>);}
