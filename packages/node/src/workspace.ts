/**
 * The full-size, local-only Drop management window.
 *
 * It is intentionally a second surface, not a stretched menu-bar popover.
 * Same Node endpoints, same bearer token and no Tauri IPC or external assets.
 * Peer-supplied strings are always inserted with textContent, never HTML.
 */
export function renderWorkspace(): string {
  return String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Drop · Mon espace</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #fbfaf8; --paper:#fffefd; --well:#f5f1f2;
  --ink:#292732; --soft:#5e5965; --mute:#746e79; --line:#e9e3e8;
  --accent:#5656a9; --accent-subtle:#eeecf9; --accent-ink:#fff;
  --success:#397e69; --warning:#99704c; --danger:#a25259;
  --shadow:0 6px 30px rgba(54,42,62,.045); --round:18px;
}
@media(prefers-color-scheme:dark) {
  :root {
    --bg:#24232a; --paper:#2c2a32; --well:#343139; --ink:#f5f0f3;
    --soft:#d7cfd7; --mute:#c1b7c3; --line:#49434d;
    --accent:#b9b1fa; --accent-subtle:#393547; --accent-ink:#24232a;
    --success:#8dc5ae; --warning:#e1ba84; --danger:#efa5a9;
    --shadow:0 6px 30px rgba(0,0,0,.1);
  }
}
*{box-sizing:border-box}
html{height:100%;overflow:hidden}
body{margin:0;height:100%;overflow:hidden; background:var(--bg);color:var(--ink);
  font:14px/1.52 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
button:disabled{opacity:.48;cursor:default}
a{color:var(--accent)}
#shell{display:grid;grid-template-columns:238px minmax(0,1fr);height:100%}
aside{padding:31px 16px 22px 21px;border-right:1px solid var(--line);
  display:flex;flex-direction:column;gap:29px;min-width:0;background:var(--paper)}
.brand{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin-left:12px}
.brand strong{font-size:25px;letter-spacing:-.075em;line-height:1.1;font-weight:750}
.brand span{font-size:11px;color:var(--mute)}
nav{display:flex;flex-direction:column;gap:4px}
nav button{border:0;background:transparent;min-height:43px;padding:10px 13px;
  display:flex;justify-content:space-between;align-items:center;text-align:left;
  border-radius:11px;color:var(--soft);font-size:13px;font-weight:560;transition:background .14s}
nav button:hover{background:var(--well)}
nav button[aria-current="page"]{background:var(--accent-subtle);color:var(--accent);font-weight:650}
.side-foot{margin-top:auto;padding:14px 12px 0;border-top:1px solid var(--line)}
.identity{display:flex;align-items:center;gap:10px}
.avatar{height:34px;width:34px;display:grid;place-items:center;flex:none;
  border-radius:12px;background:#eee2dd;color:#77555b;font-weight:680;font-size:12px}
.identity .name{display:block;font-weight:630;font-size:12.5px}
.identity .small{display:block;font-size:11px;color:var(--mute)}
.online-dot{width:7px;height:7px;border-radius:50%;display:inline-block;background:var(--success)}
.online-dot.off{background:var(--warning)}
#main-container{min-width:0;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
main{margin:0 auto;max-width:970px;padding:54px clamp(24px,5.4vw,80px) 90px}
.kicker{text-transform:uppercase;letter-spacing:.15em;font-size:10px;color:var(--mute);font-weight:650;margin:0 0 9px}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 0 30px}
h1{font-size:clamp(27px,2.65vw,35px);line-height:1.16;letter-spacing:-.055em;font-weight:670;margin:0 0 7px}
.subtitle{color:var(--soft);margin:0;max-width:54ch}
.section-heading{font-size:13px;font-weight:680;color:var(--ink);margin:28px 0 12px;letter-spacing:-.012em}
.section-heading:first-child{margin-top:0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.surface{background:var(--paper);border:1px solid var(--line);box-shadow:var(--shadow);
  border-radius:var(--round);padding:22px;min-width:0}
.surface.tall{min-height:220px}
.surface.slim{padding:17px 20px}
.welcome{background:linear-gradient(115deg,#f9f5f5,#f1f0fa 95%);border:1px solid #efeaee;
  border-radius:21px;padding:29px 32px 28px;min-height:190px;
  display:flex;align-items:flex-start;justify-content:space-between;gap:25px}
.welcome strong{display:block;font-size:22px;letter-spacing:-.042em;line-height:1.25;font-weight:680;max-width:20ch}
.welcome p{margin:11px 0 18px;color:#67626f;font-size:13px;max-width:42ch}
.welcome .smallsign{font-size:44px;line-height:1;align-self:center;color:#b8aed3;font-weight:280}
.card-title{font-size:15px;font-weight:660;letter-spacing:-.02em;margin:0 0 8px}
.card-text{font-size:12.5px;color:var(--soft);margin:0 0 17px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:39px;
  border:1px solid var(--line);border-radius:10px;padding:0 15px;font-size:12.5px;
  font-weight:620;background:var(--paper);color:var(--ink);text-decoration:none}
.btn:hover{background:var(--well)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.09);background:var(--accent)}
.btn.quiet{background:transparent}
.btn.danger{color:var(--danger);border-color:var(--line)}
.btn.sm{min-height:33px;padding:0 11px;font-size:12px}
.actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:18px}
.soft{color:var(--soft)}.muted{color:var(--mute);font-size:12px}.good{color:var(--success)}.bad{color:var(--danger)}
.person{display:flex;align-items:center;gap:11px;min-width:0}
.person .copy{min-width:0;flex:1}
.person strong{display:block;font-size:13px;font-weight:660;overflow-wrap:anywhere}
.person small{display:block;font-size:11.5px;color:var(--soft);margin-top:2px;overflow-wrap:anywhere}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-height:68px;padding:12px 0;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row .aside-text{font-size:12px;color:var(--soft);text-align:right;flex-shrink:0}
.row .aside-text.good{color:var(--success)}.row .aside-text.bad{color:var(--danger)}
.tag-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tag{display:inline-flex;align-items:center;border-radius:7px;background:var(--well);padding:3px 8px;
  font-size:10.5px;color:var(--soft);max-width:100%;overflow-wrap:anywhere}
.stat{font-size:24px;font-weight:680;letter-spacing:-.045em;line-height:1.15}
.stat-caption{font-size:12px;color:var(--soft);margin-top:4px}
.field{display:grid;gap:6px;font-size:12px;color:var(--soft);font-weight:580;margin-bottom:14px}
.field input,.field textarea,.field select{width:100%;border:1px solid var(--line);
  border-radius:10px;background:var(--paper);padding:10px 12px;min-height:40px;
  font-size:13px;line-height:1.45;color:var(--ink)}
.field textarea{min-height:90px;resize:vertical}
.field input:disabled{background:var(--well)}
.fieldset{border:0;padding:0;margin:0}
.fieldset legend{font-size:12px;font-weight:650;margin-bottom:10px}
.radio{display:flex;align-items:flex-start;gap:11px;padding:12px 10px;border-radius:10px;cursor:pointer}
.radio:hover{background:var(--well)}
.radio input{accent-color:var(--accent);margin-top:4px;width:16px;height:16px}
.radio strong{display:block;font-size:12.5px}
.radio small{display:block;font-size:11.5px;color:var(--soft);margin-top:3px}
input[type="checkbox"]{width:16px;height:16px;accent-color:var(--accent)}
.checkbox{display:flex;align-items:flex-start;gap:10px}
.message{font-size:12.5px;padding:13px 15px;border-radius:12px;border:1px solid var(--line);background:var(--well);margin:16px 0}
.message.error{border-color:var(--danger);background:var(--paper)}
.pre{white-space:pre-wrap;word-break:break-word;border-radius:12px;background:var(--well);
  padding:14px;font:11px/1.55 ui-monospace,SFMono-Regular,monospace;user-select:text}
.divider{height:1px;background:var(--line);margin:17px 0}
.trail{display:flex;flex-direction:column;gap:7px;margin-top:10px}
.trail-item{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--soft)}
.trail-item:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;margin-top:7px}
.small-heading{font-size:11px;font-weight:660;color:var(--soft);margin-bottom:6px}
.empty{padding:29px 18px;text-align:center;color:var(--soft);font-size:13px}
.empty strong{display:block;color:var(--ink);font-size:14px;margin-bottom:5px}
.form-card{max-width:650px}
.inline-note{display:block;margin-top:10px;color:var(--soft);font-size:11.5px}
.review{border-radius:12px;border:1px solid var(--line);background:var(--well);padding:13px 16px}
.review strong{display:block;font-size:12px}
.review p{margin:6px 0 0;color:var(--soft);font-size:12px}
.hidden{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media (max-width:860px){
  #shell{grid-template-columns:190px minmax(0,1fr)}
  aside{padding-left:12px}
  main{padding:36px 26px 60px}
  .welcome{padding:25px}
}
@media (max-width:670px){
  html,body{height:auto;overflow:auto}
  #shell{display:block;height:auto}
  aside{position:static;padding:16px 16px 12px;border-right:0;border-bottom:1px solid var(--line);gap:13px}
  .brand{margin-left:5px}.side-foot{display:none}
  nav{display:flex;flex-direction:row;gap:5px;overflow-x:auto;scrollbar-width:thin}
  nav button{white-space:nowrap;min-height:40px}
  #main-container{overflow:visible}
  main{padding:27px 17px 60px}
  .grid{grid-template-columns:1fr}
  .page-head{align-items:flex-start}
  .welcome{min-height:0}
  .welcome .smallsign{display:none}
}
@media(prefers-color-scheme:dark) {
  .welcome{background:linear-gradient(115deg,#39343d,#36344b);border-color:var(--line)}
  .welcome p{color:var(--soft)}
  .welcome .smallsign{color:#8279a9}
  .avatar{background:#493c40;color:#ead2d2}
}
@media(prefers-reduced-motion:reduce){nav button{transition:none}}
@media(prefers-reduced-transparency:reduce){aside{background:var(--bg)}}
@media(prefers-contrast:more){:root{--line:#807785;--mute:#514855} .surface,.btn{border-width:2px}}
@media(prefers-color-scheme:dark) and (prefers-contrast:more){:root{--line:#c4b7c9;--mute:#e0d3e2}}
</style>
</head>
<body>
<div id="shell">
<aside aria-label="Navigation">
  <div class="brand"><strong>drop.</strong><span>Votre espace</span></div>
  <nav aria-label="Sections de Drop">
    <button type="button" data-section="overview" aria-current="page">Vue d’ensemble</button>
    <button type="button" data-section="team">Équipe</button>
    <button type="button" data-section="agents">Assistants</button>
    <button type="button" data-section="sharing">Outils partagés</button>
    <button type="button" data-section="facts">Faits publiés</button>
    <button type="button" data-section="network">Connexion</button>
  </nav>
  <div class="side-foot">
    <div class="identity">
      <span class="avatar" id="self-avatar" aria-hidden="true">·</span>
      <span><span class="name" id="self-name">Connexion…</span><span class="small" id="self-status">Moteur local</span></span>
    </div>
  </div>
</aside>
<div id="main-container">
  <main id="content" tabindex="-1" aria-live="polite" aria-busy="true">
    <p class="kicker">Drop</p><h1>Votre espace</h1><p class="subtitle">Préparation de tes informations locales…</p>
  </main>
</div>
</div>
<div id="live" class="sr-only" role="status" aria-live="polite"></div>
<script>
(function(){
  'use strict';
  var token = new URLSearchParams(location.search).get('token') || '';
  var nav = Array.prototype.slice.call(document.querySelectorAll('[data-section]'));
  var content = document.getElementById('content');
  var active = 'overview';
  var revision = 0;
  var lastNotice = '';
  var errorNotice = '';
  var preview = null;
  var factDraft = null;
  var pendingRetire = '';
  var pendingShare = '';
  var internetDraft = null;
  var states = {proposed:'envoyée',awaiting_approval:'en attente',approved:'acceptée',
    running:'en cours',in_review:'en relecture',delivered:'reçue',receipted:'reçue',
    denied:'refusée',not_now:'reportée',expired:'expirée',failed:'échouée'};
  function el(tag, attr) {
    var node = document.createElement(tag);
    var args = Array.prototype.slice.call(arguments,2);
    Object.keys(attr||{}).forEach(function(key){
      if(key==='text')node.textContent=String(attr[key]);
      else if(key==='class')node.className=attr[key];
      else if(key==='onclick')node.addEventListener('click',attr[key]);
      else if(key==='onchange')node.addEventListener('change',attr[key]);
      else node.setAttribute(key,String(attr[key]));
    });
    args.forEach(function(item){if(item===null||item===undefined)return;
      node.appendChild(typeof item==='string'?document.createTextNode(item):item);});
    return node;
  }
  function button(text, fn, flavor){
    return el('button',{type:'button',class:'btn '+(flavor||''),onclick:fn,text:text});
  }
  function row(){return el.apply(null,['div',{class:'row'}].concat(Array.prototype.slice.call(arguments)));}
  function surface(){return el.apply(null,['div',{class:'surface'}].concat(Array.prototype.slice.call(arguments)));}
  function paragraph(text){return el('p',{class:'card-text',text:text});}
  function h2(text){return el('h2',{class:'section-heading',text:text});}
  function note(text){return el('p',{class:'muted',text:text});}
  function initials(s){return String(s||'?').trim().split(/\s+/).slice(0,2).map(function(p){return p[0]||''}).join('').toUpperCase();}
  function person(name,detail){return el('div',{class:'person'},el('span',{class:'avatar','aria-hidden':'true',text:initials(name)}),
      el('span',{class:'copy'},el('strong',{text:name}),el('small',{text:detail||''})));}
  function tag(text){return el('span',{class:'tag',text:text});}
  function api(method,path,data){
    var headers={Authorization:'Bearer '+token};
    if(data!==undefined)headers['Content-Type']='application/json';
    return fetch(path,{method:method,headers:headers,body:data===undefined?undefined:JSON.stringify(data),
      credentials:'same-origin',referrerPolicy:'no-referrer'}).then(async function(res){
      var value=await res.json().catch(function(){return{}});
      if(!res.ok){var err=new Error(value.message||value.error||'Action impossible.');
        err.code=value.code||value.error;throw err;}
      return value;
    });
  }
  function announce(message){document.getElementById('live').textContent=message;}
  function failure(err){errorNotice=err.message||'Une erreur est survenue.';announce(errorNotice);render(true);}
  function success(message){lastNotice=message;announce(message);render(true);}
  function change(next){active=next;preview=null;factDraft=null;pendingRetire='';pendingShare='';internetDraft=null;render(true);}
  nav.forEach(function(b){b.addEventListener('click',function(){change(b.getAttribute('data-section'));});});
  function makeHeader(section){
    var data={
      overview:['Ton espace','Tout ce qui compte, au même endroit.'],
      team:['Ton équipe','Les bonnes personnes, quand tu en as besoin.'],
      agents:['Tes assistants','Connecte tes outils de travail, sans rien partager automatiquement.'],
      sharing:['Ce que tu partages','Choisis les outils avec lesquels tu acceptes de répondre aux collègues.'],
      facts:['Ce que tu publies','Des réponses disponibles pour les collègues, sans demander ton accord à nouveau.'],
      network:['Connexion','Tes échanges restent dans l’infrastructure que tu as choisie.']
    }[section];
    return el('div',{class:'page-head'},el('div',{},el('p',{class:'kicker',text:'Drop / Mon espace'}),
      el('h1',{text:data[0]}),el('p',{class:'subtitle',text:data[1]})));
  }
  function render(focus){
    var version=++revision;
    nav.forEach(function(b){if(b.getAttribute('data-section')===active)b.setAttribute('aria-current','page');
      else b.removeAttribute('aria-current');});
    var next=el('main',{id:'content','aria-busy':'true',tabindex:'-1'});
    next.appendChild(makeHeader(active));
    if(errorNotice){next.appendChild(el('div',{class:'message error',role:'alert',text:errorNotice}));errorNotice='';}
    if(lastNotice){next.appendChild(el('div',{class:'message',text:lastNotice}));lastNotice='';}
    var host=content.parentNode;host.replaceChild(next,content);content=next;
    next.appendChild(el('div',{class:'muted',text:'Chargement…'}));
    var request=active==='overview'?overview:active==='team'?team:
      active==='agents'?agents:active==='sharing'?sharing:
      active==='facts'?facts:network;
    request(next).then(function(){
      if(version!==revision)return;
      var load=Array.prototype.filter.call(next.children,function(ch){return ch.textContent==='Chargement…';})[0];
      if(load)load.remove();
      next.setAttribute('aria-busy','false');
      if(focus)next.focus({preventScroll:true});
    }).catch(function(err){
      if(version!==revision)return;
      var load=Array.prototype.filter.call(next.children,function(ch){return ch.textContent==='Chargement…';})[0];
      if(load)load.remove();
      next.appendChild(el('div',{class:'message error',role:'alert',text:err.message||'Impossible de charger cette section.'}));
      next.appendChild(button('Réessayer',function(){render(true);}));
      next.setAttribute('aria-busy','false');
    });
    api('GET','/ui/admin/status').then(function(s){
      document.getElementById('self-name').textContent=s.displayName||'Moi';
      document.getElementById('self-avatar').textContent=initials(s.displayName);
      document.getElementById('self-status').textContent=s.relayConnected?'Connecté à ton équipe':'Connexion locale';
    }).catch(function(){document.getElementById('self-status').textContent='Moteur indisponible';});
  }
  function outboundSentence(d){
    if(d.error||d.state==='failed')return 'La demande n’a pas abouti.';
    if(d.state==='awaiting_approval')return 'Tu attends l’accord de '+d.ownerName+'.';
    if(d.state==='in_review')return d.ownerName+' relit la réponse avant de te l’envoyer.';
    if(d.state==='approved'||d.state==='running')return 'La réponse est en préparation chez '+d.ownerName+'.';
    if(d.state==='delivered'||d.state==='receipted')return 'La réponse est arrivée dans ton assistant.';
    if(d.state==='denied')return d.ownerName+' a refusé la demande.';
    if(d.state==='expired')return 'La demande a expiré.';
    if(d.state==='not_now')return d.ownerName+' répondra peut-être plus tard.';
    return 'La question a été envoyée.';
  }
  async function overview(view){
    var result=await Promise.all([
      api('GET','/ui/team').catch(function(){return {team:null,members:[]};}),
      api('GET','/ui/admin/tools'), api('GET','/ui/facts').catch(function(){return {facts:[]};}),
      api('GET','/ui/outbound').catch(function(){return {drops:[]};})
    ]);
    var teamData=result[0],tools=result[1],facts=result[2],sent=result[3];
    var welcome=el('section',{class:'welcome'},
      el('div',{},el('strong',{text:'Les bonnes réponses. Sans partager les accès.'}),
        el('p',{text:'Tes collègues peuvent poser une question à tes outils. Tu gardes toujours la décision sur ce qui part.'}),
        button('Voir mon équipe',function(){change('team');},'primary')),
      el('span',{class:'smallsign','aria-hidden':'true',text:'↗'}));
    view.appendChild(welcome);
    var grid=el('div',{class:'grid',style:'margin-top:16px'});
    var count=teamData.members.filter(function(m){return m.online}).length;
    grid.appendChild(surface(el('div',{class:'stat',text:String(teamData.members.length)}),
      el('div',{class:'stat-caption',text:'Personnes dans ton équipe'}),
      el('div',{class:'actions'},button('Voir les membres',function(){change('team');},'sm'))));
    var shares=Object.keys(tools.shared||{}).length;
    grid.appendChild(surface(el('div',{class:'stat',text:String(shares)}),
      el('div',{class:'stat-caption',text:'Outils actuellement partagés'}),
      el('div',{class:'actions'},button('Gérer mes partages',function(){change('sharing');},'sm'))));
    view.appendChild(grid);
    view.appendChild(h2('Tes dernières questions'));
    var card=surface();
    if(!sent.drops.length){card.appendChild(el('div',{class:'empty'},el('strong',{text:'Aucune question envoyée'}),
      el('span',{text:'Tes prochains échanges apparaîtront ici.'})));}
    sent.drops.slice(0,4).forEach(function(d){
      card.appendChild(row(person(d.ownerName||'Collègue',d.title),
        el('span',{class:'aside-text',text:states[d.state]||d.state})));
    });
    view.appendChild(card);
    view.appendChild(note('Les informations restent chez leurs propriétaires. Chaque envoi suit ses propres règles de consentement.'));
  }
  async function team(view){
    var data=await api('GET','/ui/team');
    if(!data.team){
      var input=el('input',{type:'text',maxlength:'60',placeholder:'Ex. Atelier'});
      view.appendChild(surface(el('h2',{class:'card-title',text:'Crée ton équipe'}),
        paragraph('Choisis simplement un nom. Tu pourras ensuite inviter les personnes avec lesquelles tu travailles.'),
        el('label',{class:'field'},'Nom de l’équipe',input),
        button('Créer l’équipe',function(){
          if(!input.value.trim()){input.focus();announce('Donne un nom à ton équipe.');return;}
          api('POST','/ui/admin/team',{name:input.value.trim()}).then(function(){success('Équipe créée.');}).catch(failure);
        },'primary')));
      return;
    }
    view.appendChild(el('div',{class:'grid'},surface(el('div',{class:'stat',text:String(data.members.length)}),
      el('div',{class:'stat-caption',text:'Membres'})),surface(el('div',{class:'stat',text:String(data.members.filter(function(m){return m.online}).length)}),
      el('div',{class:'stat-caption',text:'En ligne maintenant'}))));
    view.appendChild(h2(data.team.name));
    var members=surface();
    data.members.forEach(function(m){
      var details=m.self?'C’est toi':(m.agents||[]).join(', ')||'Aucun assistant indiqué';
      var r=row(person(m.displayName,details),el('span',{class:'aside-text '+(m.online?'good':''),text:m.online?'En ligne':'Hors ligne'}));
      if(m.capabilities&&m.capabilities.length){
        var extra=el('div',{class:'tag-row'});
        m.capabilities.slice(0,5).forEach(function(cap){extra.appendChild(tag(cap.title.replace('Répondre à partir de ','')));});
        r.querySelector('.copy').appendChild(extra);
      }
      members.appendChild(r);
    });
    view.appendChild(members);
    var inviteBox=surface(el('h2',{class:'card-title',text:'Une personne manque ?'}),
      paragraph('L’invitation ne donne accès à aucun document. Chaque demande continuera de nécessiter un accord.'));
    inviteBox.appendChild(button('Créer un lien d’invitation',function(e){
      var control=e.currentTarget;control.disabled=true;
      api('POST','/ui/invite').then(function(x){
        var url='drop://pair?code='+encodeURIComponent(x.code);
        var display=el('code',{class:'pre',text:url});
        inviteBox.appendChild(el('p',{class:'muted',text:'Lien valable 24 heures et une seule fois. Envoie-le directement à ton collègue.'}));
        inviteBox.appendChild(display);
        inviteBox.appendChild(el('div',{class:'actions'},button('Copier le lien',function(){
          if(!navigator.clipboard||!navigator.clipboard.writeText){announce('Sélectionne le lien pour le copier.');return;}
          navigator.clipboard.writeText(url).then(function(){announce('Lien copié.');}).catch(function(){announce('Sélectionne le lien pour le copier.');});
        })));
      }).catch(failure).finally(function(){control.disabled=false;});
    }));
    view.appendChild(h2('Invitations'));view.appendChild(inviteBox);
  }
  async function agents(view){
    var tools=await api('GET','/ui/admin/tools');
    view.appendChild(surface(el('h2',{class:'card-title',text:'Connecte tes assistants'}),
      paragraph('Drop analyse uniquement les emplacements de configuration connus. Il ne lit pas tes conversations et ne partage aucun outil lors du raccordement.'),
      button('Analyser cet ordinateur',function(e){
        var control=e.currentTarget;control.disabled=true;
        Promise.all([api('GET','/ui/admin/onboarding'),api('GET','/ui/admin/projects').catch(function(){return {projects:[]};})])
          .then(function(values){preview={plans:values[0].agents||[],manual:values[0].manual,projects:values[1].projects||[]};render(true);})
          .catch(failure).finally(function(){control.disabled=false;});
      },'primary')));
    view.appendChild(h2(preview?'Résultat de l’analyse':'Assistants déjà présents'));
    var list=surface();
    if(preview){
      var chosen=[];
      preview.plans.filter(function(plan){return plan.state!=='absent';}).forEach(function(plan){
        var detail=plan.detail||plan.state;
        if(plan.state==='ready'){
          var checked=el('input',{type:'checkbox','aria-label':'Connecter '+plan.label});checked.checked=true;
          chosen.push({plan:plan,control:checked});
          list.appendChild(row(person(plan.label,'Prêt à être connecté'),checked));
        } else {
          var state=plan.state==='already_connected'?'Déjà raccordé':plan.state==='manual'?'À configurer manuellement':detail;
          list.appendChild(row(person(plan.label,state),plan.state==='already_connected'?
            button('Déconnecter',function(){
              api('POST','/ui/admin/onboarding',{selections:[{agent:plan.agent,fingerprint:plan.fingerprint,action:'disconnect'}]})
                .then(function(){preview=null;success('Connecteur retiré.');}).catch(failure);
            },'sm'):el('span',{class:'muted',text:plan.state==='conflict'?'Conflit à résoudre':''})));
          if(plan.manual&&plan.manual.steps){
            list.appendChild(el('details',{},el('summary',{class:'muted',text:'Configuration de '+plan.label}),
              el('p',{class:'muted',text:plan.manual.steps}),el('pre',{class:'pre',text:plan.manual.snippet||''})));
          }
        }
      });
      if(!preview.plans.some(function(plan){return plan.state!=='absent';}))
        list.appendChild(el('div',{class:'empty',text:'Aucun assistant détecté. Tu peux utiliser la configuration manuelle.'}));
      view.appendChild(list);
      if(chosen.length){
        view.appendChild(surface(el('h2',{class:'card-title',text:'Confirmer le raccordement'}),
          paragraph('Seuls les assistants cochés recevront le connecteur Drop. Aucun outil ne sera partagé.'),
          button('Connecter les assistants sélectionnés',function(e){
            var selected=chosen.filter(function(p){return p.control.checked;}).map(function(p){return{agent:p.plan.agent,fingerprint:p.plan.fingerprint,action:'connect'};});
            if(!selected.length){announce('Choisis au moins un assistant.');return;}
            var control=e.currentTarget;control.disabled=true;
            api('POST','/ui/admin/onboarding',{selections:selected}).then(function(result){
              preview=null;success('Configuration mise à jour. Redémarre tes assistants pour vérifier leur connexion.');
            }).catch(failure).finally(function(){control.disabled=false;});
          },'primary')));
      }
      if(preview.manual)view.appendChild(surface(el('h2',{class:'card-title',text:'Autre assistant'}),
        paragraph('Ajoute manuellement Drop comme serveur MCP dans ton assistant, puis redémarre-le.'),
        el('pre',{class:'pre',text:JSON.stringify({mcpServers:{drop:preview.manual}},null,2)})));
    } else {
      var installed=(tools.agents||[]).filter(function(a){return a.installed;});
      installed.forEach(function(a){list.appendChild(row(person(a.label,
        a.dropInstalled?'Connecteur Drop présent':'Pas encore raccordé'),
        el('span',{class:'aside-text '+(a.dropInstalled?'good':''),text:a.dropInstalled?'Raccordé':'À connecter'})));});
      if(!installed.length)list.appendChild(el('div',{class:'empty',text:'Analyse ton ordinateur pour découvrir les assistants compatibles.'}));
      view.appendChild(list);
    }
    view.appendChild(note('Raccorder un assistant ne garantit pas que l’équipe est joignable. Les deux états restent indépendants.'));
  }
  async function sharing(view){
    var data=await api('GET','/ui/admin/tools');
    var shared=data.shared||{};
    view.appendChild(surface(el('h2',{class:'card-title',text:'La réponse, pas l’accès'}),
      paragraph('Partager un outil permet de répondre à des questions avec lui, après ton accord. Tes collègues ne reçoivent pas l’accès à sa source.')));
    var list=surface();var count=0;
    (data.agents||[]).filter(function(a){return a.installed;}).forEach(function(a){
      (a.servers||[]).filter(function(s){return s.shareable;}).forEach(function(s){
        count++;var key=a.agent+'/'+s.name;var id=shared[key];
        var action=id?button('Ne plus partager',function(){
          api('POST','/ui/admin/unshare',{capabilityId:id}).then(function(){pendingShare='';success('Partage retiré.');}).catch(failure);
        },'sm'):button('Partager…',function(){pendingShare=key;render(true);},'sm');
        list.appendChild(row(person(s.name,a.label+(s.kind?' · '+s.kind:'')),
          el('div',{style:'display:flex;align-items:center;gap:10px'},
            el('span',{class:'aside-text '+(id?'good':''),text:id?'Partagé':'Privé'}),action)));
        if(pendingShare===key&&!id){
          list.appendChild(el('div',{class:'review'},el('strong',{text:'Partager '+s.name+' avec ton équipe ?'}),
            el('p',{text:'Drop proposera une réponse limitée. Chaque question restera soumise à ton accord. Le raccordement seul ne publie rien.'}),
            el('div',{class:'actions'},button('Annuler',function(){pendingShare='';render(true);}),
              button('Confirmer le partage',function(e){var control=e.currentTarget;control.disabled=true;
                api('POST','/ui/admin/share',{agent:a.agent,server:s.name}).then(function(){pendingShare='';success('Outil partagé.');})
                  .catch(failure).finally(function(){control.disabled=false;});
              },'primary'))));
        }
      });
    });
    if(!count)list.appendChild(el('div',{class:'empty'},el('strong',{text:'Aucun outil partageable'}),
      el('span',{text:'Connecte un assistant avec des outils de lecture, puis reviens ici.'})));
    view.appendChild(h2('Outils disponibles'));view.appendChild(list);
    view.appendChild(note('Certains connecteurs ou modèles nécessitent une configuration supplémentaire. En cas de refus, aucun partage n’est créé.'));
  }
  function label(text,control){return el('label',{class:'field'},text,control);}
  function textbox(value,placeholder,max){
    var x=el('input',{type:'text',maxlength:String(max||120),placeholder:placeholder||''});x.value=value||'';return x;
  }
  async function facts(view){
    var data=await api('GET','/ui/facts');
    view.appendChild(surface(el('h2',{class:'card-title',text:'Un fait publié est une réponse déjà autorisée'}),
      paragraph('Il pourra être servi tel quel à son public, sans te redemander, jusqu’à sa date de fin. Tu peux le retirer à tout moment.')));
    if(factDraft){
      var f=factDraft;
      var topic=textbox(f.topic,'Ex. Livraison du site',120), statement=el('textarea',{maxlength:'1000',rows:'4'}),
        keywords=textbox(f.keywords,'Ex. livraison, site',330),src=textbox(f.label,'Ex. Planning projet',200),
        url=el('input',{type:'url',placeholder:'https://… (facultatif)',maxlength:'500'}),
        validity=el('select',{},el('option',{value:'7',text:'7 jours'}),el('option',{value:'30',text:'30 jours'}),
          el('option',{value:'90',text:'90 jours'}),el('option',{value:'365',text:'1 an'}));
      statement.value=f.statement||'';url.value=f.url||'';
      if(!Array.prototype.some.call(validity.options,function(o){return o.value===String(f.validDays||30);}))
        validity.appendChild(el('option',{value:String(f.validDays||30),text:String(f.validDays||30)+' jours'}));
      validity.value=String(f.validDays||30);
      var audience=el('select',{},el('option',{value:'team',text:'Toute mon équipe'}),
        el('option',{value:'peers',text:'Personnes choisies'}));
      audience.value=f.audience||'team';
      var picks=el('div',{});var choices=[];
      function updatePicks(){picks.replaceChildren();picks.classList.toggle('hidden',audience.value!=='peers');
        if(audience.value==='peers')data.peers.forEach(function(p){
          var c=el('input',{type:'checkbox'});c.checked=(f.nodeIds||[]).indexOf(p.nodeId)>=0;
          choices.push({id:p.nodeId,c:c});
          picks.appendChild(el('label',{class:'radio'},c,el('span',{text:p.displayName})));
        });
      }
      updatePicks();audience.addEventListener('change',function(){choices=[];updatePicks();});
      var form=surface(el('h2',{class:'card-title',text:f.factId?'Modifier le fait':'Publier un fait'}),
        label('Sujet',topic),label('Énoncé',statement),label('Mots-clés séparés par des virgules',keywords),
        label('Source',src),label('Lien de la source',url),label('Durée de validité',validity),
        label('Qui pourra le recevoir ?',audience),picks,
        el('div',{class:'review'},el('strong',{text:'Attention : publication sans nouvelle autorisation'}),
          el('p',{text:'Ce texte pourra être communiqué automatiquement au public choisi jusqu’à expiration.'})));
      form.appendChild(el('div',{class:'actions'},button('Annuler',function(){factDraft=null;render(true);}),
        button(f.factId?'Enregistrer':'Publier',function(e){
          if(!topic.value.trim()||!statement.value.trim()||!src.value.trim()){
            announce('Sujet, énoncé et source sont obligatoires.');topic.focus();return;
          }
          var ids=choices.filter(function(x){return x.c.checked;}).map(function(x){return x.id;});
          if(audience.value==='peers'&&!ids.length){announce('Choisis les personnes destinataires.');return;}
          var body={topic:topic.value.trim(),statement:statement.value.trim(),
            keywords:keywords.value.split(',').map(function(x){return x.trim();}).filter(Boolean),
            source:url.value.trim()?{label:src.value.trim(),url:url.value.trim()}:{label:src.value.trim()},
            validDays:Number(validity.value),
            audience:audience.value==='team'?{kind:'team'}:{kind:'peers',nodeIds:ids}};
          var control=e.currentTarget;control.disabled=true;
          api('POST',f.factId?'/ui/facts/'+f.factId:'/ui/facts',body).then(function(){factDraft=null;success('Fait enregistré.');})
            .catch(failure).finally(function(){control.disabled=false;});
        },'primary')));
      view.appendChild(h2('Rédaction'));view.appendChild(form);return;
    }
    view.appendChild(el('div',{class:'actions'},button('Publier un fait',function(){
      factDraft={topic:'',statement:'',keywords:'',label:'',url:'',validDays:30,audience:'team',nodeIds:[]};
      render(true);
    },'primary')));
    view.appendChild(h2('Faits disponibles'));
    var list=surface();
    if(!data.facts.length)list.appendChild(el('div',{class:'empty'},el('strong',{text:'Rien de publié'}),
      el('span',{text:'Tu peux publier une information stable pour éviter des questions répétitives.'})));
    data.facts.forEach(function(f){
      var active=f.live&&f.status==='active';var item=el('div',{class:'row',style:'align-items:flex-start'},
        el('div',{class:'copy'},el('div',{class:'card-title',text:f.topic}),
          el('div',{class:'soft',text:f.statement}),
          el('p',{class:'muted',text:'Source : '+f.source.label+' · '+(active?'Actif':f.status==='retired'?'Retiré':'Expiré')})),
        el('div',{style:'display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end'},
          active?button('Modifier',function(){
            factDraft={factId:f.factId,topic:f.topic,statement:f.statement,keywords:(f.keywords||[]).join(', '),
              label:f.source.label,url:f.source.url||'',validDays:Math.max(1,Math.round((f.validTo-f.publishedAt)/86400000)),
              audience:f.audience.kind,nodeIds:f.audience.nodeIds||[]};render(true);
          },'sm'):null,
          active?button('Retirer',function(){pendingRetire=f.factId;render(true);},'sm danger'):null));
      list.appendChild(item);
      if(pendingRetire===f.factId&&active){
        list.appendChild(el('div',{class:'review'},el('strong',{text:'Retirer ce fait ?'}),
          el('p',{text:'Il ne sera plus servi aux prochaines questions.'}),
          el('div',{class:'actions'},button('Annuler',function(){pendingRetire='';render(true);}),
            button('Confirmer le retrait',function(){
              api('POST','/ui/facts/'+f.factId+'/retire',{}).then(function(){pendingRetire='';success('Fait retiré.');}).catch(failure);
            },'danger'))));
      }
    });
    view.appendChild(list);
  }
  async function network(view){
    var data=await api('GET','/ui/admin/internet');
    var settings=data.settings||{mode:'off'};
    var current=internetDraft||{mode:settings.mode||'off',relay:settings.relay||''};
    var description={off:'Désactivée',starting:'Démarrage…',
      on:'Internet activé sur les réseaux autorisés',failed:'Connexion interrompue',
      unavailable:'Composant Internet non installé'};
    view.appendChild(surface(el('h2',{class:'card-title',text:'Une connexion à ton rythme'}),
      paragraph('Sur le même réseau, Drop retrouve tes collègues directement. Pour travailler à distance, tu peux choisir un relais que tu contrôles. Rien ne s’active seul.'),
      el('div',{class:'row'},el('div',{class:'person'},el('span',{class:'online-dot '+(data.state==='on'?'':'off')}),
        el('div',{},el('strong',{text:'Connexion par Internet'}),el('small',{text:description[data.state]||'État indisponible'}))))));
    var container=surface(el('h2',{class:'card-title',text:'Connexion par Internet'}));
    var radios=el('div',{});
    [
      ['off','Désactivée','Les échanges restent sur le réseau local.'],
      ['direct','Direct uniquement','Pour les réseaux où les deux appareils peuvent se joindre.'],
      ['relay','Mon relais ou celui de l’équipe','Un relais choisi par vous ; il voit les adresses IP, pas le contenu chiffré.'],
      ['n0','Relais public de test','Serveur tiers, uniquement pour les essais ; peut être interdit en profil privé.']
    ].forEach(function(pair){
      var control=el('input',{type:'radio',name:'network-mode',value:pair[0]});control.checked=current.mode===pair[0];
      control.addEventListener('change',function(){current.mode=pair[0];internetDraft=current;render(true);});
      radios.appendChild(el('label',{class:'radio'},control,el('span',{},el('strong',{text:pair[1]}),
        el('small',{text:pair[2]}))));
    });
    container.appendChild(radios);
    if(current.mode==='relay'){
      var input=el('input',{type:'url',placeholder:'https://relais.mon-equipe.fr',value:current.relay||''});
      input.addEventListener('input',function(){current.relay=input.value;internetDraft=current;});
      container.appendChild(label('Adresse du relais',input));
    }
    container.appendChild(el('div',{class:'actions'},button('Enregistrer la connexion',function(e){
      if(current.mode==='relay'&&!current.relay.trim()){announce('Indique l’adresse du relais.');return;}
      var control=e.currentTarget;control.disabled=true;
      api('POST','/ui/admin/internet',current.mode==='relay'?{mode:current.mode,relay:current.relay.trim()}:{mode:current.mode})
        .then(function(){internetDraft=null;success('Choix de connexion enregistré.');})
        .catch(failure).finally(function(){control.disabled=false;});
    },'primary')));
    view.appendChild(h2('Choisir une connexion'));view.appendChild(container);
    view.appendChild(note('Drop ne sélectionne aucun relais public à ta place. Les règles de ton entreprise peuvent limiter les choix.'));
  }
  render(false);
}());
</script>
</body>
</html>`;
}
