
"use client";

import {
  CalendarDays, Users, MessageCircle, Images, Plane, Settings, Bell, Plus,
  ChevronLeft, ChevronRight, Check, Clock, Video, Image as ImageIcon, Globe2,
  LogOut, UserRound, Sparkles, Menu, X, Send, Camera, MapPinned, Trash2,
  ThumbsUp, HelpCircle, MapPin, Link as LinkIcon, Copy, Upload, Save, Star,
  MessageSquareText, ShieldCheck, CalendarCheck, UserPlus, Pencil
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Brand = "bros" | "girls";
type View = "dashboard"|"calendar"|"groups"|"holidays"|"messages"|"media"|"feedback"|"settings";
type RSVP = "yes"|"maybe"|"no";

type User = {id:string; username:string; displayName:string; email:string; photo?:string; brand:Brand; theme:string};
type EventItem = {id:string; title:string; date:string; time:string; location:string; maps?:string; details?:string; cover?:string; theme:string; groupId:string; attendees:Record<string,RSVP>};
type Group = {id:string; name:string; code:string; description:string; members:string[]};
type Holiday = {id:string; userId:string; start:string; end:string; city:string; country:string; status:"available"|"maybe"|"unavailable"};
type ChatMessage = {id:string; userId:string; text:string; at:number};
type MediaItem = {id:string; userId:string; eventId?:string; type:"image"|"video"; data:string; name:string; at:number};
type Feedback = {id:string; userId:string; rating:number; useful:string; missing:string; confusing:string; at:number};

const LS = "circle-calendar-beta-v3";
const seed: {
  users: User[];
  groups: Group[];
  events: EventItem[];
  holidays: Holiday[];
  messages: ChatMessage[];
  media: MediaItem[];
  feedback: Feedback[];
} = {
  users: [
    {id:"u1",username:"ionut",displayName:"Ionuț Bogdan",email:"demo@circle.app",brand:"bros",theme:"neon"},
    {id:"u2",username:"alex",displayName:"Alex",email:"alex@demo.app",brand:"bros",theme:"neon"},
    {id:"u3",username:"radu",displayName:"Radu",email:"radu@demo.app",brand:"bros",theme:"neon"},
    {id:"u4",username:"maria",displayName:"Maria",email:"maria@demo.app",brand:"girls",theme:"neon"},
  ],
  groups: [
    {id:"g1",name:"The Crew",code:"BRO-2026",description:"Weekends, BBQ, ATV and trips.",members:["u1","u2","u3"]},
    {id:"g2",name:"Family",code:"FAM-2026",description:"Family plans and birthdays.",members:["u1","u4"]},
  ],
  events: [
    {id:"e1",title:"BBQ at Movilița",date:"2026-07-31",time:"18:00",location:"Movilița, Romania",details:"Bring something for the table.",theme:"cyan",groupId:"g1",attendees:{u1:"yes",u2:"yes",u3:"maybe"}},
    {id:"e2",title:"Weekend at sea",date:"2026-08-10",time:"10:00",location:"Constanța, Romania",theme:"green",groupId:"g1",attendees:{u1:"yes",u2:"yes",u3:"yes"}},
  ],
  holidays: [
    {id:"h1",userId:"u1",start:"2026-08-03",end:"2026-08-12",city:"Constanța",country:"Romania",status:"available"},
    {id:"h2",userId:"u2",start:"2026-08-07",end:"2026-08-14",city:"Varna",country:"Bulgaria",status:"maybe"},
  ],
  messages: [
    {id:"m1",userId:"u2",text:"Who brings the charcoal?",at:Date.now()-600000},
    {id:"m2",userId:"u1",text:"I’ll bring charcoal and the cooler.",at:Date.now()-500000},
  ],
  media: [],
  feedback: [],
};

function uid(prefix:string){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`}
function initials(name:string){return name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()}
function formatDate(s:string){return new Date(s+"T12:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})}
function saveFile(file:File):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file)})}

export default function Page(){
  const [ready,setReady]=useState(false);
  const [data,setData]=useState(seed);
  const [currentUserId,setCurrentUserId]=useState<string|null>(null);
  const [authMode,setAuthMode]=useState<"landing"|"login"|"register">("landing");
  const [selectedBrand,setSelectedBrand]=useState<Brand>("bros");
  const [view,setView]=useState<View>("dashboard");
  const [menuOpen,setMenuOpen]=useState(false);
  const [eventOpen,setEventOpen]=useState(false);
  const [editingEvent,setEditingEvent]=useState<EventItem|null>(null);
  const [profileOpen,setProfileOpen]=useState(false);
  const [notificationOpen,setNotificationOpen]=useState(false);
  const [notificationsRead,setNotificationsRead]=useState(false);
  const [activeGroupId,setActiveGroupId]=useState("g1");
  const [toast,setToast]=useState("");
  const [quickOpen,setQuickOpen]=useState(false);

  useEffect(()=>{
    try{
      const saved=localStorage.getItem(LS);
      if(saved){const parsed=JSON.parse(saved);setData(parsed.data||seed);setCurrentUserId(parsed.currentUserId||null);setActiveGroupId(parsed.activeGroupId||"g1")}
    }catch{}
    setReady(true);
  },[]);
  useEffect(()=>{if(ready)localStorage.setItem(LS,JSON.stringify({data,currentUserId,activeGroupId}))},[ready,data,currentUserId,activeGroupId]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2400);return()=>clearTimeout(t)},[toast]);

  const currentUser=data.users.find(u=>u.id===currentUserId)||null;
  const activeGroup=data.groups.find(g=>g.id===activeGroupId)||data.groups[0];
  const brand=currentUser?.brand||"bros";
  const theme=currentUser?.theme||"neon";
  const themeClass=`${brand}-${theme}`;
  const groupEvents=data.events.filter(e=>e.groupId===activeGroup?.id);
  const activityItems=useMemo(()=>{
    const eventItems=groupEvents.slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).slice(0,4).map(e=>({
      id:`event-${e.id}`, icon:"calendar", title:e.title, text:`Event · ${formatDate(e.date)} at ${e.time}`, view:"calendar" as View
    }));
    const messageItems=data.messages.slice(-3).reverse().map(m=>{
      const author=data.users.find(u=>u.id===m.userId);
      return {id:`message-${m.id}`,icon:"message",title:author?.displayName||"Group member",text:m.text,view:"messages" as View};
    });
    const holidayItems=data.holidays.slice(-2).reverse().map(h=>{
      const author=data.users.find(u=>u.id===h.userId);
      return {id:`holiday-${h.id}`,icon:"plane",title:`${author?.displayName||"Someone"} added a holiday`,text:`${h.city}, ${h.country} · ${formatDate(h.start)}`,view:"holidays" as View};
    });
    return [...eventItems,...messageItems,...holidayItems].slice(0,7);
  },[groupEvents,data.messages,data.holidays,data.users]);
  const unreadCount=notificationsRead?0:activityItems.length;

  function updateUser(patch:Partial<User>){
    if(!currentUser)return;
    setData({...data,users:data.users.map(u=>u.id===currentUser.id?{...u,...patch}:u)});
  }

  if(!ready)return <main className="loading"><Sparkles/> Loading Circle Calendar…</main>;

  if(!currentUser){
    return <AuthScreen data={data} setData={setData} authMode={authMode} setAuthMode={setAuthMode}
      setCurrentUserId={setCurrentUserId} setToast={setToast} selectedBrand={selectedBrand} setSelectedBrand={setSelectedBrand}/>;
  }

  return <main className={`appShell ${themeClass}`}>
    <div className="aurora a1"/><div className="aurora a2"/>
    {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
    <aside className={`sidebar ${menuOpen?"open":""}`}>
      <div className="sideBrand"><span>CC</span><div><strong>{brand==="bros"?"BRO’S":"GIRLS’"}</strong><small>CALENDAR BETA</small></div><button className="closeMobile" onClick={()=>setMenuOpen(false)}><X/></button></div>
      <label className="groupSelectLabel">ACTIVE GROUP
        <select value={activeGroupId} onChange={e=>setActiveGroupId(e.target.value)}>
          {data.groups.filter(g=>g.members.includes(currentUser.id)).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <nav>
        {[
          ["dashboard","Home",Sparkles],["calendar","Calendar",CalendarDays],["groups","Groups",Users],
          ["holidays","Holidays",Plane],["messages","Messages",MessageCircle],["media","Media",Images],
          ["feedback","Feedback",MessageSquareText],["settings","Settings",Settings]
        ].map(([id,label,Icon])=><button key={id as string} className={view===id?"active":""} onClick={()=>{setView(id as View);setMenuOpen(false)}}><Icon size={19}/><span>{label as string}</span></button>)}
      </nav>
      <div className="inviteCard"><small>INVITE CODE</small><strong>{activeGroup?.code}</strong><button onClick={()=>{navigator.clipboard?.writeText(activeGroup?.code||"");setToast("Invite code copied")}}><Copy size={15}/> Copy code</button></div>
    </aside>

    <section className="content">
      <header className="topbar">
        <button className="menuBtn" onClick={()=>setMenuOpen(true)}><Menu/></button>
        <div><small>{brand==="bros"?"BRO’S CALENDAR":"GIRLS’ CALENDAR"}</small><h2>{view[0].toUpperCase()+view.slice(1)}</h2></div>
        <div className="topActions">
          <div className="notificationWrap">
            <button className="iconBtn notification" onClick={()=>setNotificationOpen(!notificationOpen)} aria-label="Notifications">
              <Bell size={19}/>{unreadCount>0&&<span className="notificationBadge">{unreadCount}</span>}
            </button>
            {notificationOpen&&<div className="notificationPanel">
              <div className="notificationHead"><div><small>ACTIVITY CENTER</small><h3>Notifications</h3></div><button onClick={()=>setNotificationsRead(true)}>Mark all as read</button></div>
              <div className="notificationList">
                {activityItems.length===0?<div className="emptyNotification">No activity yet.</div>:activityItems.map(item=><button key={item.id} className="notificationItem" onClick={()=>{setView(item.view);setNotificationOpen(false);setNotificationsRead(true)}}>
                  <span className="notificationIcon">{item.icon==="calendar"?<CalendarDays/>:item.icon==="message"?<MessageCircle/>:<Plane/>}</span>
                  <span><strong>{item.title}</strong><small>{item.text}</small></span>
                  {!notificationsRead&&<i/>}
                </button>)}
              </div>
            </div>}
          </div>
          <div className="profileWrap">
            <button className="profileBtn" onClick={()=>setProfileOpen(!profileOpen)}>
              {currentUser.photo?<img className="avatarImage big" src={currentUser.photo} alt="Profile"/>:<span className="avatar big">{initials(currentUser.displayName)}</span>}
              <div><strong>@{currentUser.username}</strong><small>Beta tester</small></div>
            </button>
            {profileOpen&&<div className="profileMenu">
              <button onClick={()=>{setView("settings");setProfileOpen(false)}}><UserRound size={17}/> Profile</button>
              <button onClick={()=>{setCurrentUserId(null);setAuthMode("landing")}}><LogOut size={17}/> Log out</button>
            </div>}
          </div>
          <button className="primary compact" onClick={()=>{setEditingEvent(null);setEventOpen(true)}}><Plus size={18}/> New event</button>
        </div>
      </header>

      {view==="dashboard"&&<Dashboard events={groupEvents} users={data.users} holidays={data.holidays} currentUser={currentUser} activityItems={activityItems} setView={setView} setEventOpen={setEventOpen} setEditingEvent={setEditingEvent}/>}
      {view==="calendar"&&<CalendarView events={groupEvents} users={data.users} currentUser={currentUser} setData={setData} data={data} setToast={setToast} setEventOpen={setEventOpen} setEditingEvent={setEditingEvent}/>}
      {view==="groups"&&<GroupsView groups={data.groups} currentUser={currentUser} setData={setData} data={data} setActiveGroupId={setActiveGroupId} setToast={setToast}/>}
      {view==="holidays"&&<HolidaysView holidays={data.holidays} users={data.users} currentUser={currentUser} data={data} setData={setData} setToast={setToast}/>}
      {view==="messages"&&<MessagesView messages={data.messages} users={data.users} currentUser={currentUser} data={data} setData={setData}/>}
      {view==="media"&&<MediaView media={data.media} events={groupEvents} currentUser={currentUser} data={data} setData={setData} setToast={setToast}/>}
      {view==="feedback"&&<FeedbackView currentUser={currentUser} data={data} setData={setData} setToast={setToast}/>}
      {view==="settings"&&<SettingsView user={currentUser} updateUser={updateUser} setToast={setToast}/>}
    </section>
    <nav className="mobileNav" aria-label="Mobile navigation">
      <button className={view==="dashboard"?"active":""} onClick={()=>setView("dashboard")}><Sparkles/><span>Home</span></button>
      <button className={view==="calendar"?"active":""} onClick={()=>setView("calendar")}><CalendarDays/><span>Calendar</span></button>
      <button className="mobileAdd" onClick={()=>setQuickOpen(true)} aria-label="Create"><Plus/></button>
      <button className={view==="messages"?"active":""} onClick={()=>setView("messages")}><MessageCircle/><span>Chat</span></button>
      <button className={view==="settings"?"active":""} onClick={()=>setView("settings")}><UserRound/><span>Profile</span></button>
    </nav>
    {quickOpen&&<div className="quickBack" onClick={()=>setQuickOpen(false)}><section className="quickSheet" onClick={e=>e.stopPropagation()}>
      <div className="quickHandle"/><div className="quickHead"><div><small>CREATE QUICKLY</small><h3>What do you want to add?</h3></div><button className="iconBtn" onClick={()=>setQuickOpen(false)}><X/></button></div>
      <div className="quickGrid">
        <button onClick={()=>{setEditingEvent(null);setEventOpen(true);setQuickOpen(false)}}><CalendarCheck/><strong>Event</strong><small>Plan a date and place</small></button>
        <button onClick={()=>{setView("groups");setQuickOpen(false)}}><Users/><strong>Group</strong><small>Create or join a circle</small></button>
        <button onClick={()=>{setView("media");setQuickOpen(false)}}><Camera/><strong>Album</strong><small>Add photos and videos</small></button>
        <button onClick={()=>{setToast("Polls arrive in the next version");setQuickOpen(false)}}><ThumbsUp/><strong>Poll</strong><small>Vote together soon</small></button>
      </div>
    </section></div>}
    {eventOpen&&<EventModal close={()=>{setEventOpen(false);setEditingEvent(null)}} groupId={activeGroup.id} currentUser={currentUser} data={data} setData={setData} setToast={setToast} eventToEdit={editingEvent}/>}
  </main>
}

function AuthScreen({data,setData,authMode,setAuthMode,setCurrentUserId,setToast,selectedBrand,setSelectedBrand}:any){
  const [error,setError]=useState("");
  const submit=(mode:"login"|"register")=>{
    const email=(document.getElementById("email") as HTMLInputElement)?.value.trim().toLowerCase();
    const password=(document.getElementById("password") as HTMLInputElement)?.value;
    if(!email||!password||password.length<6){setError("Enter a valid email and a password of at least 6 characters.");return}
    if(mode==="login"){
      const user=data.users.find((u:User)=>u.email.toLowerCase()===email);
      if(!user){setError("Account not found on this browser. Create one first or open the demo.");return}
      setCurrentUserId(user.id);return;
    }
    const name=(document.getElementById("name") as HTMLInputElement)?.value.trim();
    const username=(document.getElementById("username") as HTMLInputElement)?.value.trim().replace(/^@/,"");
    const confirm=(document.getElementById("confirm") as HTMLInputElement)?.value;
    if(!name||!username){setError("Name and username are required.");return}
    if(password!==confirm){setError("Passwords do not match.");return}
    if(data.users.some((u:User)=>u.email.toLowerCase()===email)){setError("This email already exists on this browser.");return}
    const id=uid("u");
    const user={id,username,displayName:name,email,brand:selectedBrand,theme:"neon"};
    const starterGroup={id:uid("g"),name:`${name}'s group`,code:`CIR-${Math.random().toString(36).slice(2,7).toUpperCase()}`,description:"My first Circle Calendar group.",members:[id]};
    setData({...data,users:[...data.users,user],groups:[...data.groups,starterGroup]});
    setCurrentUserId(id);setToast("Account created");
  };

  if(authMode==="landing")return <main className={`landing ${selectedBrand}-neon`}>
    <div className="aurora a1"/><div className="aurora a2"/>
    <header className="landingHeader"><div className="brandMark"><span>CC</span><strong>CIRCLE CALENDAR</strong></div><button className="ghost" onClick={()=>setAuthMode("login")}>Log in</button></header>
    <section className="hero">
      <div className="eyebrow"><Sparkles size={16}/> BETA TEST</div>
      <h1>Plan together.<br/><span>Remember everything.</span></h1>
      <p>Events, holidays, chat, photos, videos and locations — one private space for your group.</p>
      <div className="brandChooser">
        <small>CHOOSE YOUR EXPERIENCE</small>
        <div>
          <button className={selectedBrand==="bros"?"active":""} onClick={()=>setSelectedBrand("bros")}>
            <span>🧔</span><strong>Bro’s Calendar</strong><small>Dark, bold and energetic</small>
          </button>
          <button className={selectedBrand==="girls"?"active":""} onClick={()=>setSelectedBrand("girls")}>
            <span>✨</span><strong>Girls’ Calendar</strong><small>Elegant, bright and social</small>
          </button>
        </div>
      </div>
      <div className="ctaRow"><button className="primary" onClick={()=>setAuthMode("register")}>Create free account <ChevronRight/></button><button className="secondary" onClick={()=>{
      setData({...data,users:data.users.map((u:User)=>u.id==="u1"?{...u,brand:selectedBrand,theme:"neon"}:u)});
      setCurrentUserId("u1");
    }}>Open demo</button></div>
      <div className="trustRow"><span>✓ Functional local beta</span><span>✓ Data saved on this device</span><span>✓ Feedback included</span></div>
    </section>
    <section className="betaNotice"><ShieldCheck/><div><strong>Private beta</strong><p>This version stores test data only in your browser. Friends on different devices do not yet share the same database.</p></div></section>
  </main>;

  return <main className={`landing ${selectedBrand}-neon`}><div className="aurora a1"/><div className="aurora a2"/>
    <header className="landingHeader"><button className="ghost" onClick={()=>setAuthMode("landing")}><ChevronLeft/> Back</button><div className="brandMark"><span>CC</span><strong>CIRCLE CALENDAR</strong></div></header>
    <section className="authCard">
      <div className="authBrandBadge">{selectedBrand==="bros"?"🧔 Bro’s Calendar":"✨ Girls’ Calendar"}</div>
      <div className="eyebrow">{authMode==="register"?"CREATE ACCOUNT":"WELCOME BACK"}</div><h1>{authMode==="register"?"Join the beta":"Log in"}</h1>
      <div className="authForm">
        {authMode==="register"&&<><label>Display name<input id="name" placeholder="Your name"/></label><label>Username<input id="username" placeholder="username"/></label></>}
        <label>Email<input id="email" type="email" placeholder="you@example.com"/></label>
        <label>Password<input id="password" type="password" placeholder="Minimum 6 characters"/></label>
        {authMode==="register"&&<label>Confirm password<input id="confirm" type="password"/></label>}
        {error&&<div className="errorBox">{error}</div>}
        <button className="primary authSubmit" onClick={()=>submit(authMode)}>{authMode==="register"?"Create account":"Log in"}</button>
        <div className="authSwitch">{authMode==="register"?"Already registered?":"No account?"}<button onClick={()=>{setError("");setAuthMode(authMode==="register"?"login":"register")}}>{authMode==="register"?"Log in":"Create account"}</button></div>
      </div>
    </section>
  </main>
}

function Dashboard({events,users,holidays,currentUser,activityItems,setView,setEventOpen,setEditingEvent}:any){
  const now=new Date();
  const upcoming=[...events].filter((e:EventItem)=>new Date(`${e.date}T${e.time||"00:00"}`)>=new Date(now.getFullYear(),now.getMonth(),now.getDate())).sort((a:EventItem,b:EventItem)=>(a.date+a.time).localeCompare(b.date+b.time));
  const next=upcoming[0];
  const todayKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const todayCount=events.filter((e:EventItem)=>e.date===todayKey).length;
  return <div className="page dashboardPage">
    <section className="homeHero">
      <div><div className="eyebrow"><Sparkles size={15}/> YOUR CIRCLE TODAY</div><h1>Bună, {currentUser.displayName.split(" ")[0]}! <span>👋</span></h1><p>{todayCount?`Ai ${todayCount} ${todayCount===1?"eveniment":"evenimente"} astăzi.`:"Astăzi este liber. Poate facem un plan?"}</p></div>
      <button className="primary" onClick={()=>{setEditingEvent(null);setEventOpen(true)}}><Plus/> Creează un plan</button>
    </section>

    <div className="homeGrid">
      <section className="panel nextEventCard">
        <div className="panelHead"><div><small>URMĂTORUL EVENIMENT</small><h3>{next?next.title:"Nimic planificat încă"}</h3></div><button onClick={()=>setView("calendar")}>Calendar</button></div>
        {next?<><div className="nextEventDate"><div><b>{new Date(next.date+"T12:00").getDate()}</b><small>{new Date(next.date+"T12:00").toLocaleString(undefined,{month:"short"}).toUpperCase()}</small></div><span><Clock/> {next.time}</span><span><MapPin/> {next.location}</span></div><p>{next.details||"Deschide calendarul pentru detalii și confirmarea participării."}</p><div className="nextEventFoot"><AvatarStack ids={Object.keys(next.attendees).filter(id=>next.attendees[id]==="yes")} users={users}/><button className="secondary" onClick={()=>setView("calendar")}>Vezi detalii <ChevronRight/></button></div></>:<div className="emptyCompact"><CalendarDays/><p>Creează primul eveniment pentru grup.</p><button className="secondary" onClick={()=>{setEditingEvent(null);setEventOpen(true)}}><Plus/> Eveniment</button></div>}
      </section>

      <section className="panel activityCard">
        <div className="panelHead"><div><small>ACTIVITATE RECENTĂ</small><h3>Ce s-a întâmplat</h3></div><button onClick={()=>setView("messages")}>Vezi tot</button></div>
        <div className="homeActivity">{activityItems.slice(0,4).map((item:any)=><button key={item.id} onClick={()=>setView(item.view)}><span>{item.icon==="calendar"?<CalendarDays/>:item.icon==="message"?<MessageCircle/>:<Plane/>}</span><div><strong>{item.title}</strong><small>{item.text}</small></div><ChevronRight/></button>)}</div>
      </section>
    </div>

    <section className="quickActionsPanel">
      <div><small>CREEAZĂ RAPID</small><h3>Adaugă ceva în cerc</h3></div>
      <div className="quickActions">
        <button onClick={()=>{setEditingEvent(null);setEventOpen(true)}}><CalendarCheck/><span><strong>Eveniment</strong><small>Dată, oră și locație</small></span></button>
        <button onClick={()=>setView("groups")}><Users/><span><strong>Grup</strong><small>Invită prietenii</small></span></button>
        <button onClick={()=>setView("media")}><Images/><span><strong>Album</strong><small>Poze și videoclipuri</small></span></button>
        <button onClick={()=>setView("holidays")}><Plane/><span><strong>Vacanță</strong><small>Arată disponibilitatea</small></span></button>
      </div>
    </section>

    <div className="statsGrid compactStats">
      <Stat icon={<CalendarDays/>} label="Upcoming events" value={String(upcoming.length)} note="In the active group"/>
      <Stat icon={<Users/>} label="Circle members" value={String(users.length)} note="Local beta testers"/>
      <Stat icon={<Plane/>} label="Holiday plans" value={String(holidays.length)} note="Compare availability"/>
      <Stat icon={<MessageSquareText/>} label="Feedback" value="Open" note="Help shape the app"/>
    </div>
  </div>
}

function CalendarView({events,users,currentUser,setData,data,setToast,setEventOpen,setEditingEvent}:any){
  const [month,setMonth]=useState(new Date("2026-07-01T12:00:00"));
  const year=month.getFullYear(), m=month.getMonth();
  const first=(new Date(year,m,1).getDay()+6)%7;
  const count=new Date(year,m+1,0).getDate();
  const cells=Array.from({length:42},(_,i)=>i-first+1);
  const changeMonth=(n:number)=>setMonth(new Date(year,m+n,1));
  const rsvp=(eventId:string,status:RSVP)=>{setData({...data,events:data.events.map((e:EventItem)=>e.id===eventId?{...e,attendees:{...e.attendees,[currentUser.id]:status}}:e)});setToast(`RSVP: ${status}`)};
  const remove=(id:string)=>{if(confirm("Delete this event?"))setData({...data,events:data.events.filter((e:EventItem)=>e.id!==id)})};
  return <div className="page"><section className="panel calendarPanel">
    <div className="calendarHead"><div><button className="round" onClick={()=>changeMonth(-1)}><ChevronLeft/></button><button className="round" onClick={()=>changeMonth(1)}><ChevronRight/></button><h2>{month.toLocaleString(undefined,{month:"long",year:"numeric"})}</h2></div><button className="primary compact" onClick={()=>{setEditingEvent(null);setEventOpen(true)}}><Plus/> Event</button></div>
    <div className="weekHeader">{["MON","TUE","WED","THU","FRI","SAT","SUN"].map(d=><div key={d}>{d}</div>)}</div>
    <div className="calendarGrid">{cells.map((d,i)=>{
      const valid=d>0&&d<=count; const date=valid?`${year}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`:""; const dayEvents=events.filter((e:EventItem)=>e.date===date);
      return <div className={`dayCell ${!valid?"muted":""}`} key={i}><b>{valid?d:""}</b>{dayEvents.map((e:EventItem)=><div className={`calendarEvent ${e.theme}`} key={e.id}>
        {e.cover&&<img src={e.cover} alt="" className="eventCover"/>}<strong>{e.time}</strong><span>{e.title}</span><small>{e.location}</small>
        <AvatarStack ids={Object.keys(e.attendees).filter(id=>e.attendees[id]==="yes")} users={users}/>
        <div className="rsvpRow"><button className={e.attendees[currentUser.id]==="yes"?"active":""} onClick={()=>rsvp(e.id,"yes")} title="Going"><Check/></button><button className={e.attendees[currentUser.id]==="maybe"?"active":""} onClick={()=>rsvp(e.id,"maybe")} title="Maybe"><HelpCircle/></button><button onClick={()=>{setEditingEvent(e);setEventOpen(true)}} title="Edit"><Pencil/></button><button onClick={()=>remove(e.id)} title="Delete"><Trash2/></button></div>
      </div>)}</div>
    })}</div>
  </section></div>
}

function GroupsView({groups,currentUser,setData,data,setActiveGroupId,setToast}:any){
  const [joinCode,setJoinCode]=useState("");
  const create=()=>{const name=prompt("Group name?")?.trim();if(!name)return;const g={id:uid("g"),name,code:`CIR-${Math.random().toString(36).slice(2,7).toUpperCase()}`,description:"New group",members:[currentUser.id]};setData({...data,groups:[...data.groups,g]});setActiveGroupId(g.id);setToast("Group created")};
  const join=()=>{const g=groups.find((x:Group)=>x.code.toUpperCase()===joinCode.toUpperCase());if(!g){setToast("Invite code not found");return}setData({...data,groups:groups.map((x:Group)=>x.id===g.id?{...x,members:Array.from(new Set([...x.members,currentUser.id]))}:x)});setActiveGroupId(g.id);setToast("Joined group")};
  return <div className="page"><div className="pageIntro"><div><small>PRIVATE CIRCLES</small><h1>Groups</h1><p>Create a group or join using an invitation code.</p></div><button className="primary" onClick={create}><Plus/> Create group</button></div>
    <section className="panel joinPanel"><input value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder="Invite code"/><button className="secondary" onClick={join}><UserPlus/> Join group</button></section>
    <div className="cards3">{groups.filter((g:Group)=>g.members.includes(currentUser.id)).map((g:Group,i:number)=><section className="groupCard" key={g.id}><div className={`groupCover cover${i%3+1}`}><span>{initials(g.name)}</span></div><div className="groupBody"><h3>{g.name}</h3><p>{g.description}</p><small>{g.members.length} members · Code {g.code}</small><button className="secondary" onClick={()=>setActiveGroupId(g.id)}>Open group</button></div></section>)}</div>
  </div>
}

function HolidaysView({holidays,users,currentUser,data,setData,setToast}:any){
  const add=()=>{const city=(document.getElementById("hcity") as HTMLInputElement).value.trim();const country=(document.getElementById("hcountry") as HTMLInputElement).value.trim();const start=(document.getElementById("hstart") as HTMLInputElement).value;const end=(document.getElementById("hend") as HTMLInputElement).value;const status=(document.getElementById("hstatus") as HTMLSelectElement).value as any;if(!city||!country||!start||!end){setToast("Complete all holiday fields");return}setData({...data,holidays:[...data.holidays,{id:uid("h"),userId:currentUser.id,start,end,city,country,status}]});setToast("Holiday saved")};
  return <div className="page"><div className="pageIntro"><div><small>AVAILABILITY SYNC</small><h1>Holidays & locations</h1><p>Tell the group where and when you will be available.</p></div></div>
    <section className="panel holidayForm"><label>City<input id="hcity" placeholder="Constanța"/></label><label>Country<input id="hcountry" placeholder="Romania"/></label><label>Start<input id="hstart" type="date"/></label><label>End<input id="hend" type="date"/></label><label>Status<select id="hstatus"><option value="available">Available</option><option value="maybe">Maybe</option><option value="unavailable">Unavailable</option></select></label><button className="primary" onClick={add}><Save/> Save</button></section>
    <section className="panel holidayTable">{holidays.map((h:Holiday)=>{const u=users.find((x:User)=>x.id===h.userId);return <div className="holidayRow" key={h.id}><span className="avatar">{initials(u?.displayName||"?")}</span><div><strong>{u?.displayName}</strong><small><MapPin size={13}/>{h.city}, {h.country}</small></div><div><small>PERIOD</small><strong>{formatDate(h.start)} — {formatDate(h.end)}</strong></div><span className="overlap">{h.status}</span>{h.userId===currentUser.id&&<button className="iconBtn" onClick={()=>setData({...data,holidays:data.holidays.filter((x:Holiday)=>x.id!==h.id)})}><Trash2/></button>}</div>})}</section>
  </div>
}

function MessagesView({messages,users,currentUser,data,setData}:any){
  const [text,setText]=useState("");
  const send=()=>{if(!text.trim())return;setData({...data,messages:[...data.messages,{id:uid("m"),userId:currentUser.id,text:text.trim(),at:Date.now()}]});setText("")};
  return <div className="page"><section className="panel chatWindow fullChat"><div className="chatHeader"><div><span className="avatar">TC</span><div><strong>Group chat</strong><small>Local beta conversation</small></div></div></div>
    <div className="messages">{messages.map((m:ChatMessage)=>{const u=users.find((x:User)=>x.id===m.userId);return <div className={`message ${m.userId===currentUser.id?"mine":""}`} key={m.id}><small>{u?.displayName}</small><p>{m.text}</p><time>{new Date(m.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time></div>})}</div>
    <div className="messageComposer"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send()}} placeholder="Write a message..."/><button className="send" onClick={send}><Send/></button></div>
  </section></div>
}

function MediaView({media,events,currentUser,data,setData,setToast}:any){
  const input=useRef<HTMLInputElement>(null);
  const upload=async(files:FileList|null)=>{if(!files)return;const list:MediaItem[]=[];for(const f of Array.from(files).slice(0,5)){if(f.size>4_000_000){setToast(`${f.name} is larger than 4 MB`);continue}list.push({id:uid("med"),userId:currentUser.id,type:f.type.startsWith("video")?"video":"image",data:await saveFile(f),name:f.name,at:Date.now()})}setData({...data,media:[...list,...data.media]});setToast(`${list.length} file(s) added`)};
  return <div className="page"><div className="pageIntro"><div><small>SHARED MEMORIES</small><h1>Photos & videos</h1><p>Local previews for the beta. Maximum 4 MB per file.</p></div><button className="primary" onClick={()=>input.current?.click()}><Upload/> Upload</button><input ref={input} hidden type="file" multiple accept="image/*,video/*" onChange={e=>upload(e.target.files)}/></div>
    {media.length?<div className="mediaGrid">{media.map((m:MediaItem)=><article className="uploadedMedia" key={m.id}>{m.type==="image"?<img src={m.data} alt={m.name}/>:<video src={m.data} controls/>}<div><strong>{m.name}</strong><button className="iconBtn" onClick={()=>setData({...data,media:data.media.filter((x:MediaItem)=>x.id!==m.id)})}><Trash2/></button></div></article>)}</div>:<Empty text="No media yet. Upload a test photo or short video."/>}
  </div>
}

function FeedbackView({currentUser,data,setData,setToast}:any){
  const [rating,setRating]=useState(0);
  const submit=()=>{const useful=(document.getElementById("fuseful") as HTMLTextAreaElement).value;const missing=(document.getElementById("fmissing") as HTMLTextAreaElement).value;const confusing=(document.getElementById("fconfusing") as HTMLTextAreaElement).value;if(!rating){setToast("Choose a rating");return}setData({...data,feedback:[...data.feedback,{id:uid("f"),userId:currentUser.id,rating,useful,missing,confusing,at:Date.now()}]});setToast("Feedback saved. Thank you!")};
  return <div className="page"><div className="pageIntro"><div><small>BETA FEEDBACK</small><h1>Tell us what you think</h1><p>Use the app for a few days, then answer honestly.</p></div></div>
    <section className="panel feedbackForm"><label>Overall rating<div className="stars">{[1,2,3,4,5].map(n=><button key={n} className={rating>=n?"active":""} onClick={()=>setRating(n)}><Star/></button>)}</div></label><label>What was most useful?<textarea id="fuseful"/></label><label>What is missing?<textarea id="fmissing"/></label><label>What was confusing or difficult?<textarea id="fconfusing"/></label><button className="primary" onClick={submit}><Send/> Send feedback</button></section>
  </div>
}

function SettingsView({user,updateUser,setToast}:any){
  const file=useRef<HTMLInputElement>(null);
  const changePhoto=async(f:File|undefined)=>{if(!f)return;if(f.size>3_000_000){setToast("Photo must be under 3 MB");return}updateUser({photo:await saveFile(f)});setToast("Profile photo updated")};
  const themes=user.brand==="bros"?[["neon","Neon Core"],["steel","Steel Blue"],["forest","Forest Grid"]]:[["neon","Rose Night"],["lavender","Lavender Glow"],["champagne","Champagne"]];
  return <div className="page"><div className="pageIntro"><div><small>PERSONALIZE</small><h1>Settings</h1><p>Profile, brand and visual theme.</p></div></div><div className="settingsGrid">
    <section className="panel settingBlock"><h3>Profile</h3><div className="profileEditor">{user.photo?<img className="avatarImage huge" src={user.photo} alt="Profile"/>:<span className="avatar huge">{initials(user.displayName)}</span>}<div className="photoActions"><button className="secondary" onClick={()=>file.current?.click()}>Change photo</button>{user.photo&&<button className="ghost" onClick={()=>updateUser({photo:undefined})}>Remove</button>}<input ref={file} hidden type="file" accept="image/*" onChange={e=>changePhoto(e.target.files?.[0])}/></div></div><label>Username</label><input value={user.username} onChange={e=>updateUser({username:e.target.value.replace(/^@/,"")})}/><label>Display name</label><input value={user.displayName} onChange={e=>updateUser({displayName:e.target.value})}/></section>
    <section className="panel settingBlock"><h3>Experience</h3><label>Calendar style</label><div className="segmented"><button className={user.brand==="bros"?"active":""} onClick={()=>updateUser({brand:"bros",theme:"neon"})}>Bro’s</button><button className={user.brand==="girls"?"active":""} onClick={()=>updateUser({brand:"girls",theme:"neon"})}>Girls’</button></div><label>Theme</label><div className="themeGrid">{themes.map(([id,name]:string[],i:number)=><button className={`themeChoice themePreview${i+1} ${user.theme===id?"active":""}`} key={id} onClick={()=>updateUser({theme:id})}><span/><strong>{name}</strong>{user.theme===id&&<Check/>}</button>)}</div></section>
  </div></div>
}

function EventModal({close,groupId,currentUser,data,setData,setToast,eventToEdit}:any){
  const editing=Boolean(eventToEdit);
  const [title,setTitle]=useState(eventToEdit?.title||"");
  const [date,setDate]=useState(eventToEdit?.date||"");
  const [time,setTime]=useState(eventToEdit?.time||"");
  const [location,setLocation]=useState(eventToEdit?.location||"");
  const [maps,setMaps]=useState(eventToEdit?.maps||"");
  const [details,setDetails]=useState(eventToEdit?.details||"");
  const [cover,setCover]=useState<string|undefined>(eventToEdit?.cover);

  const submit=()=>{
    if(!title.trim()||!date||!time||!location.trim()){
      setToast("Complete title, date, time and location");
      return;
    }

    if(editing){
      setData({
        ...data,
        events:data.events.map((e:EventItem)=>e.id===eventToEdit.id?{
          ...e,
          title:title.trim(),
          date,
          time,
          location:location.trim(),
          maps:maps.trim(),
          details:details.trim(),
          cover
        }:e)
      });
      setToast("Event updated");
    }else{
      const e:EventItem={
        id:uid("e"),
        title:title.trim(),
        date,
        time,
        location:location.trim(),
        maps:maps.trim(),
        details:details.trim(),
        cover,
        theme:"cyan",
        groupId,
        attendees:{[currentUser.id]:"yes"}
      };
      setData({...data,events:[...data.events,e]});
      setToast("Event created");
    }
    close();
  };

  return <div className="modalBack" onMouseDown={close}>
    <div className="modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="modalHead">
        <div><small>{editing?"EDIT PLAN":"NEW PLAN"}</small><h2>{editing?"Edit event":"Create an event"}</h2></div>
        <button className="iconBtn" onClick={close}><X/></button>
      </div>
      <div className="formGrid">
        <label className="full">Title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. BBQ at Movilița"/></label>
        <label>Date<input value={date} onChange={e=>setDate(e.target.value)} type="date"/></label>
        <label>Time<input value={time} onChange={e=>setTime(e.target.value)} type="time"/></label>
        <label className="full">Location<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="City, address or place"/></label>
        <label className="full">Google Maps link<input value={maps} onChange={e=>setMaps(e.target.value)} placeholder="https://maps.google.com/..."/></label>
        <label className="full">Details<textarea value={details} onChange={e=>setDetails(e.target.value)}/></label>
        <label className="full">Cover photo<input type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(f&&f.size<3_000_000)setCover(await saveFile(f))}}/></label>
        {cover&&<div className="coverEditWrap"><img className="coverPreview" src={cover} alt="Event cover"/><button className="secondary" onClick={()=>setCover(undefined)} type="button">Remove cover</button></div>}
      </div>
      <div className="modalFoot">
        <button className="secondary" onClick={close}>Cancel</button>
        <button className="primary" onClick={submit}>{editing?"Save changes":"Create event"}</button>
      </div>
    </div>
  </div>
}

function Stat({icon,label,value,note}:any){return <section className="statCard"><div className="statIcon">{icon}</div><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></section>}
function AvatarStack({ids,users}:any){return <div className="avatarStack">{ids.slice(0,4).map((id:string)=>{const u=users.find((x:User)=>x.id===id);return u?.photo?<img className="avatarImage" src={u.photo} alt={u.displayName} key={id}/>:<span className="avatar" key={id}>{initials(u?.displayName||"?")}</span>})}{ids.length>4&&<span className="avatar extra">+{ids.length-4}</span>}</div>}
function Empty({text}:{text:string}){return <div className="empty"><CalendarCheck/><p>{text}</p></div>}
