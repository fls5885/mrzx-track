(function(){
  'use strict';
  var ua=navigator.userAgent||'';
  var platform=/Android/i.test(ua)?'android':((/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1))?'ios':'desktop');
  document.documentElement.classList.add('platform-'+platform);
  var standalone=!!(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||!!navigator.standalone;
  if(standalone)document.documentElement.classList.add('standalone');
  var isMobileDevice=platform!=='desktop'||standalone;
  if(isMobileDevice)document.documentElement.classList.add('mobile-device');
  var nativeApp=!!(window.Capacitor&&window.Capacitor.Plugins);
  if(nativeApp){
    document.documentElement.classList.add('native-app');
    try{
      if(Capacitor.Plugins.StatusBar){
        Capacitor.Plugins.StatusBar.setOverlaysWebView({overlay:false});
        if(Capacitor.Plugins.StatusBar.setStyle)Capacitor.Plugins.StatusBar.setStyle({style:'LIGHT'});
      }
    }catch(e){}
  }
  var API='https://tms.mrzxrisingstar.com/prod-api/tms/order/client/place/public/routes';
  var $=function(s){return document.querySelector(s);};
  var orders=[],activeOrder=null,filterMode='all',demoMode=new URLSearchParams(location.search).get('demo')||'',currentScreen='query';
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function countText(v){return v==null||v===''?'—':v;}
  function fmt(ts){if(!ts)return '—';var d=new Date(ts);return (d.getMonth()+1)+'/'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  function fmtShort(ts){if(!ts)return '—';var d=new Date(ts);return (d.getMonth()+1)+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  function latestMeaningful(routes){
    var arr=(routes||[]).slice().sort(function(a,b){return (b.optionTime||0)-(a.optionTime||0);});
    for(var i=0;i<arr.length;i++){var txt=String(arr[i].cn||arr[i].description||'');if(arr[i].route==='/'||/^预计美国配送时间/.test(txt))continue;return arr[i];}
    return arr[0]||null;
  }
  function shortStatus(o){
    var routes=(o.routes||[]).slice().sort(function(a,b){return (b.optionTime||0)-(a.optionTime||0);});var latest=null;
    if(!routes.length&&!String(o.currentRouteCn||'').trim())return '暂无轨迹';
    for(var i=0;i<routes.length;i++){var t=String(routes[i].cn||routes[i].description||'');if(routes[i].route==='/'||/^预计美国配送时间/.test(t))continue;latest=routes[i];break;}
    latest=latest||routes[0]||{};var text=String(latest.cn||latest.description||latest.details||'');
    var known=[[/已签收|妥投/,'已签收'],[/已清关放行/,'已清关放行'],[/抵达始发铁路站|铁路站.*待转运/,'铁路待转运'],[/铁路.*(出发|在途|运输)/,'铁路运输中'],[/已提柜/,'已提柜'],[/已卸船/,'已卸船'],[/已到港|海运已到港/,'已到港'],[/已开船/,'航行中'],[/晚到港|延迟到港|到港延误/,'晚到港'],[/晚开|延迟开船|开船推迟/,'晚开船'],[/查验|扣关/,'查验']];
    for(var k=0;k<known.length;k++)if(known[k][0].test(text))return known[k][1];
    var s=String(o.currentRouteCn||latest.route||text||'运输中').trim();return s.length>10?s.slice(0,10)+'…':s;
  }
  function statusKind(s){if(/晚到|晚开|查验|甩柜|改配/.test(s))return 'late';if(/铁路/.test(s))return 'rail';if(/已到港|已卸船|已清关|已提柜|送仓/.test(s))return 'port';if(/已签收/.test(s))return 'done';return 'transit';}
  function classify(text){
    var s=String(text||'');
    if(/查验.*放行|放行.*查验/.test(s)&&!/晚|延误/.test(s))return null;
    if(/查验|海关.*查|扣关/.test(s))return {key:'customs',label:'查验/扣关'};
    if(/甩柜|超载.*换船|爆仓.*换船|改配.*(没出|未出)/.test(s))return {key:'rolling',label:'甩柜/改配'};
    if(/晚开|延迟开船|开船推迟|开船延误/.test(s))return {key:'lateSail',label:'晚开船'};
    if(/晚到港|延迟到港|到港延误|晚靠/.test(s))return {key:'lateArrive',label:'晚到港'};
    if(/天气|台风|风暴/.test(s)&&/延误|晚|影响|调整航速/.test(s))return {key:'weather',label:'天气影响'};
    if(/延误|延迟|推迟|延后/.test(s))return {key:'delay',label:'延误'};
    return null;
  }
  function analyze(routes){
    var list=(routes||[]).slice().sort(function(a,b){return (a.optionTime||0)-(b.optionTime||0);});var resolve={lateSail:/已开船|已到港|已卸船|已清关放行/,lateArrive:/已到港|海运已到港|已卸船|已清关放行/,customs:/报关放行|查验放行|已清关放行|已开船|已到港/,rolling:/改配.{0,4}船名|已开船|已到港/,weather:/已开船|已到港|已卸船|已清关放行/,delay:/已开船|已到港|已卸船|已清关放行/};
    var out=[],seen={};
    list.forEach(function(r,i){
      var text=String(r.cn||r.description||r.details||'');var c=classify(text);if(!c)return;
      var key=c.key+'|'+r.id;if(seen[key])return;seen[key]=1;
      var resolved=false,resolution='';if(/已开船|已到港|已卸船|已清关放行|已签收/.test(text)){resolved=true;resolution=text;}
      for(var j=i+1;j<list.length;j++){var lt=String(list[j].cn||list[j].description||list[j].details||'');if((resolve[c.key]||resolve.delay).test(lt)){resolved=true;resolution=lt;break;}}
      out.push({key:c.key,label:c.label,text:text,time:r.optionTime||0,resolved:resolved,resolution:resolution});
    });
    return out;
  }
  function currentAlerts(o){return (o.alerts||[]).filter(function(a){return !a.resolved;});}
  function latestCurrentAlert(o){
    var cur=currentAlerts(o).slice().sort(function(a,b){return (b.time||0)-(a.time||0);});
    return cur[0]||null;
  }
  function currentTrackText(o){
    var a=latestCurrentAlert(o);
    return a?a.text:(o.latest?(o.latest.cn||o.latest.description||''):'—');
  }
  function statusGroup(o){
    var s=String(o.status||'');
    if(/签收/.test(s))return 'signed';
    if(/查验|甩柜|扣关|异常/.test(s))return 'abnormal';
    if(/晚到|晚开|延误|天气/.test(s)||currentAlerts(o).length)return 'delay';
    if(/预约/.test(s))return 'appointment';
    if(/送仓|派送|提柜/.test(s))return 'delivery';
    return 'transit';
  }
  function matchesFilter(o,mode){
    if(mode==='all')return true;
    if(mode==='dw')return !!o.dw;
    return statusGroup(o)===mode;
  }
  function actionFor(o){
    var cur=currentAlerts(o),keys={};cur.forEach(function(a){keys[a.key]=1;});
    if(keys.customs)return '已联系报关行确认查验进度，放行后安排提柜和送仓';
    if(keys.rolling)return '已向船司确认新船名航次和最新开船时间';
    if(keys.lateSail)return '已向船司确认最新开船时间，并按新船期更新预计到港';
    if(keys.lateArrive)return '正在向船司/目的港确认最新到港时间，并同步更新 delivery window';
    if(keys.weather)return '持续关注天气和船司更新，提前评估派送影响';
    return '正在跟进最新轨迹，有进展会第一时间同步';
  }
  function stageOf(o){
    var s=o.status||'';
    if(o.kind==='done'||s==='已签收')return 4;
    if(o.kind==='late'&&/晚到港/.test(s))return 2;
    if(/已清关放行/.test(s))return 3;
    if(/已到港|已卸船/.test(s))return 2;
    if(/铁路/.test(s))return 3;
    if(/航行中|已开船/.test(s))return 1;
    return 1;
  }
  function etaText(o){
    var t=String(o.latest?(o.latest.cn||o.latest.description||''):'');
    var m=t.match(/预计[^0-9]{0,10}([0-9]{1,2}\/[0-9]{1,2})/);
    return m?m[1]:'—';
  }
  function buildOrder(raw){
    var routes=Array.isArray(raw.routes)?raw.routes:[];var status=shortStatus(raw);var latest=latestMeaningful(routes);
    var pkg=Array.isArray(raw.pkgs)?raw.pkgs:[];var pods=Array.isArray(raw.podFiles)?raw.podFiles:[];var photos=[];
    pkg.forEach(function(p){(p.files||[]).forEach(function(f){photos.push({src:f.filePath,name:f.fileName});});});
    var dw='';routes.forEach(function(r){var t=String(r.cn||r.description||'');if(/预计美国配送时间|delivery window|DW/i.test(t)&&!dw)dw=t;});
    return {no:raw.customerOrderNo||raw.trackingNumber,status:status,kind:statusKind(status),routes:routes,latest:latest,alerts:analyze(routes),receipt:{name:raw.consigneeName||'—',country:raw.consigneeCountry||'—',zip:raw.consigneePostCode||'—',warehouse:raw.warehouseCode||'—'},pods:pods,boxes:pkg,photos:photos,pieceCount:raw.pieceCount,weight:raw.billingWeight||raw.actualGrossWeight,stage:0,
      channel:raw.channelName||'—',origin:raw.placeOrderWarehouseName||'—',completeTime:raw.completeTime||0,gross:raw.actualGrossWeight||'—',volume:raw.actualVolume||'—',volumetric:raw.volumetricWeight||'—',billingWeight:raw.billingWeight||'—',billingVolume:raw.billingVolume||'—',chargeType:raw.chargeType||'—',dw:dw,podCount:pods.length,imageCount:photos.length};
  }

  var DEMO=[
    {customerOrderNo:'FBA00DEMO01',currentRouteCn:'晚到港',pieceCount:12,billingWeight:'186.4',consigneeName:'LAX9',consigneeCountry:'美国',consigneePostCode:'92376',warehouseCode:'LAX9',routes:[{id:'d1',route:'运输中',cn:'官网更新显示晚到港，预计当地时间 11/17 到港 Long Beach，赔付时效顺延请知悉',optionTime:Date.now()-3600000,city:'Long Beach'},{id:'d0',route:'PENDING_ARRIVE_PORT',cn:'船名船次: CSCL YELLOW SEA 073E 10/30 已开船，预计当地时间 11/16 到港 Long Beach',description:'航行中',optionTime:Date.now()-86400000,city:'Ning Bo'}],podFiles:[{fileName:'FBA00DEMO01-POD.pdf',filePath:'#'}],pkgs:[{boxNumber:'U000001',length:'48',width:'39.1',height:'50.9',weight:'17.4',volume:'0.096',files:[{fileName:'IMG_001.jpg',filePath:''}]},{boxNumber:'U000002',length:'48',width:'39.1',height:'50.9',weight:'16.8',volume:'0.096',files:[{fileName:'IMG_002.jpg',filePath:''}]},{boxNumber:'U000003',length:'48',width:'39.1',height:'50.9',weight:'17.1',volume:'0.096',files:[{fileName:'IMG_003.jpg',filePath:''}]}]},
    {customerOrderNo:'FBA00DEMO02',currentRouteCn:'铁路待转运',pieceCount:6,billingWeight:'92.1',consigneeName:'SAV3',consigneeCountry:'美国',consigneePostCode:'31313',warehouseCode:'SAV3',routes:[{id:'e1',route:'运输中',cn:'抵达始发铁路站 待转运',optionTime:Date.now()-7200000,city:'Long Beach'},{id:'e0',route:'PENDING_PICK_CONTAINER',cn:'已清关放行',optionTime:Date.now()-172800000,city:'Long Beach'}],podFiles:[],pkgs:[{boxNumber:'U000001',length:'56',width:'42',height:'38',weight:'15.3',volume:'0.089',files:[]}]},
    {customerOrderNo:'FBA00DEMO03',currentRouteCn:'已到港',pieceCount:4,billingWeight:'61.2',consigneeName:'ONT8',consigneeCountry:'美国',consigneePostCode:'92551',warehouseCode:'ONT8',routes:[{id:'f1',route:'PENDING_CLEARANCE',cn:'海运已到港',optionTime:Date.now()-1800000,city:'Los Angeles'}],podFiles:[],pkgs:[{boxNumber:'U000001',length:'45',width:'35',height:'32',weight:'14.2',volume:'0.05',files:[]}]}
  ].map(buildOrder);

  function show(name,fromHistory){
    ['query','results','detail'].forEach(function(n){var el=document.getElementById('screen-'+n);if(el)el.hidden=n!==name;});
    if(!fromHistory&&name!==currentScreen){
      currentScreen=name;
      try{history.pushState({screen:name},'',location.pathname+location.search+'#'+name);}catch(e){}
    }else if(fromHistory){currentScreen=name;}
    if(name==='query'){var i=document.getElementById('noInput');if(i)setTimeout(function(){i.focus();},30);}
  }
  function goBack(fallback){
    if(history.state&&history.state.screen&&history.state.screen!=='query'){try{history.back();return;}catch(e){}}
    show(fallback||'query',true);
  }
  function pill(kind,status){
    if(kind==='late')return '<span class="pill late">'+esc(status)+'</span>';
    if(kind==='rail')return '<span class="pill rail">'+esc(status)+'</span>';
    if(kind==='port'||kind==='done')return '<span class="pill port">'+esc(status)+'</span>';
    return '<span class="pill">'+esc(status)+'</span>';
  }
  function stages(o){
    var n=stageOf(o);var labels=['开船','到港','清关','派送'];
    return '<div class="progress">'+labels.map(function(_,i){return '<i class="'+(i<n-1?'done':i===n-1?'current':'')+'"></i>';}).join('')+'<span class="p-train">'+(o.kind==='rail'?'铁路':'海运')+'</span></div><div class="progress-labels">'+labels.map(function(x){return '<span>'+x+'</span>';}).join('')+'</div>';
  }
  function renderResults(){
    var all=orders;
    var shown=all.filter(function(o){return matchesFilter(o,filterMode);});
    var defs=[['all','全部'],['transit','运输中'],['delay','延误'],['dw','DW窗口期'],['appointment','预约中'],['delivery','送仓中'],['abnormal','异常'],['signed','已签收']];
    var counts={all:all.length,dw:all.filter(function(o){return !!o.dw;}).length};
    ['transit','delay','appointment','delivery','abnormal','signed'].forEach(function(k){counts[k]=all.filter(function(o){return statusGroup(o)===k;}).length;});
    var fr=document.getElementById('filterRow');
    if(fr){fr.innerHTML=defs.map(function(d){return '<button class="filter '+(filterMode===d[0]?'on':'')+(d[0]==='delay'?' alert':'')+'" data-filter="'+d[0]+'">'+d[1]+' '+counts[d[0]]+'</button>';}).join('');
      fr.querySelectorAll('.filter').forEach(function(b){b.onclick=function(){filterMode=b.getAttribute('data-filter');renderResults();};});}
    var podTotal=all.filter(function(o){return o.pods.length;}).length,imgTotal=all.reduce(function(n,o){return n+o.imageCount;},0);
    var pt=document.getElementById('podTotal'),it=document.getElementById('imgTotal');if(pt)pt.textContent=podTotal;if(it)it.textContent=imgTotal;
    var st=document.getElementById('statTotal'),sd=document.getElementById('statDelay'),sp=document.getElementById('statPending');if(st)st.textContent=all.length;if(sd)sd.textContent=counts.delay;if(sp)sp.textContent=counts.delay;
    var t=document.querySelector('#screen-results .appbar-title');if(t)t.innerHTML='查询结果 <span>'+all.length+' 票</span>';
    var list=document.getElementById('resultList');
    list.innerHTML=shown.map(function(o){
      var cur=currentAlerts(o);
      var tags='';
      if(o.pods.length)tags+='<span class="mini-tag">POD '+o.pods.length+'</span>';
      if(o.imageCount)tags+='<span class="mini-tag">图 '+o.imageCount+'</span>';
      if(o.boxes.length)tags+='<span class="mini-tag">'+o.boxes.length+' 箱</span>';
      return '<article class="ship-card '+(cur.length?'alert':'')+'" data-order="'+orders.indexOf(o)+'">'+
        '<div class="ship-top"><div><div class="ship-no">'+esc(o.no)+'</div><div class="ship-meta">'+countText(o.pieceCount)+' 件 · '+esc(o.weight||'—')+' kg</div></div>'+pill(o.kind,o.status)+'</div>'+
        stages(o)+
        '<div class="ship-latest"><b>最新</b> '+esc(o.latest?(o.latest.cn||o.latest.description||''):'—')+'</div>'+
        '<div class="ship-bottom"><span class="eta">'+(o.kind==='late'?'预计到港 <b>'+esc(etaText(o))+'</b>':'状态更新 <b>'+(o.latest?fmtShort(o.latest.optionTime):'—')+'</b>')+'</span><span class="ship-tags">'+tags+'</span></div></article>';
    }).join('')||'<div class="empty-result">没有符合筛选的票</div>';
  }
  function routeLabel(r){
    var x=String(r&&r.route||'');
    var map={PENDING_ARRIVE_PORT:'待靠港',PENDING_SAIL:'待开船',PENDING_CLEARANCE:'待清关',PENDING_PICK_CONTAINER:'待提柜','运输中':'运输中','/':'计划'};
    if(map[x])return map[x];
    if(/^[\u4e00-\u9fa5]/.test(x))return x;
    return String((r&&r.description)||'节点');
  }
  function renderFiles(o){
    var pods=o.pods.length?o.pods.map(function(p){return '<a class="pod-item" href="'+esc(p.filePath)+'" target="_blank" rel="noopener"><span class="pod-icon">PDF</span><span class="pod-name">'+esc(p.fileName||'POD')+'</span><span class="pod-dl">下载</span></a>';}).join(''):'<div class="files-empty">这票暂无 POD 文件</div>';
    var photos=o.photos.length?o.photos.map(function(p,i){if(!p.src)return '<div class="photo-cell photo-fallback"><span>过机 '+String(i+1).padStart(2,'0')+'</span></div>';var thumb=p.src+(p.src.indexOf('?')>=0?'&':'?')+'x-oss-process=image/resize,m_lfit,w_480/quality,q_80';return '<a class="photo-cell" href="'+esc(p.src)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(thumb)+'" data-original="'+esc(p.src)+'" alt="过机图 '+(i+1)+'" onerror="this.onerror=null;this.src=this.dataset.original"><i>'+String(i+1).padStart(2,'0')+'</i></a>';}).join(''):'<div class="files-empty">这票暂无过机图片</div>';
    return '<div class="mini-section"><div class="mini-head"><h3>POD 文件</h3><button data-all-pods>全部下载</button></div><div class="pod-list">'+pods+'</div></div><div class="mini-section"><div class="mini-head"><h3>过机图片</h3><button data-all-images>全部 '+o.photos.length+' 张</button></div><div class="photo-grid">'+photos+'</div></div>';
  }
  function renderDetail(){
    var o=activeOrder;if(!o)return;
    var cur=currentAlerts(o);var stage=stageOf(o);
    var latestDelay=latestCurrentAlert(o);
    var labels=['开船','到港','清关','派送'];
    var trail=o.routes.slice().sort(function(a,b){return (b.optionTime||0)-(a.optionTime||0);}).slice(0,20);
    var hasTrack=trail.length>0;
    var latestText=hasTrack?currentTrackText(o):'—';
    var html='<div class="detail-head"><div class="dh-top"><div><div class="ship-no-line"><div class="ship-no">'+esc(o.no)+'</div><button class="inline-copy" id="copyOrder" type="button" aria-label="复制单号"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>复制</span></button></div><div class="ship-meta">'+countText(o.pieceCount)+' 件 · '+esc(o.weight||'—')+' kg</div></div>'+pill(o.kind,o.status)+'</div>';
    if(cur.length) html+='<div class="delay-banner"><span class="warn-ico">!</span><div><b>预计到港延误</b><p>'+esc(latestDelay?latestDelay.text:cur[0].text)+'</p></div></div>';
    html+='<div class="current-copy-row"><span class="current-copy-label">当前轨迹</span><button class="copy-current" id="copyCurrent" type="button"'+(hasTrack?'':' disabled')+'><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>复制当前轨迹</span></button></div>';
    html+='<div class="stage-strip">'+labels.map(function(x,i){return '<span class="'+(i<stage-1?'done':i===stage-1?'current':'')+'">'+x+'</span>';}).join('')+'</div></div>';
    html+='<div class="detail-tabs"><button class="on" data-pane="trail">轨迹</button><button data-pane="files">文件</button><button data-pane="info">信息</button></div>';
    html+='<div class="detail-pane" data-pane="trail"><div class="trail-tools"><span>共 '+trail.length+' 个节点</span><label class="operator-switch"><input type="checkbox" id="operatorToggle"><span>操作人</span></label></div>'+(hasTrack?'<div class="timeline-card">'+trail.map(function(r,i){var op=r.createUserName||r.updateUserName||'—';return '<div class="tl-item '+(i===0?'current':'')+'" style="--i:'+i+'"><span class="tl-dot"></span><div class="tl-content"><div class="tl-meta"><span class="tl-status">'+esc(routeLabel(r))+'</span><time>'+esc(fmt(r.optionTime))+' · '+esc(r.city||r.country||'')+'</time></div><p>'+esc(r.cn||r.description||'')+'</p><div class="tl-operator">操作人：'+esc(op)+'</div></div><button class="tl-copy" data-track-index="'+i+'" type="button" aria-label="复制这条轨迹"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>复制</span></button></div>';}).join('')+'</div>':'<div class="empty-trail">接口暂未返回轨迹<br><span>请稍后刷新，或核对单号是否已入仓</span></div>')+'</div>';
    html+='<div class="detail-pane" data-pane="files" hidden>'+renderFiles(o)+'</div>';
    html+='<div class="detail-pane" data-pane="info" hidden><div class="mini-section"><div class="mini-head"><h3>订单信息</h3><span>'+esc(o.no)+'</span></div><div class="meta-grid"><span>渠道</span><b>'+esc(o.channel)+'</b><span>下单仓库</span><b>'+esc(o.origin)+'</b><span>目的仓</span><b>'+esc(o.receipt.warehouse)+'</b><span>收货人</span><b>'+esc(o.receipt.name)+'</b><span>国家</span><b>'+esc(o.receipt.country)+'</b><span>邮编</span><b>'+esc(o.receipt.zip)+'</b><span>件数</span><b>'+countText(o.pieceCount)+'</b><span>完成时间</span><b>'+esc(o.completeTime?fmt(o.completeTime):'—')+'</b><span>实际毛重</span><b>'+esc(o.gross)+' kg</b><span>实际体积</span><b>'+esc(o.volume)+' m³</b><span>体积重</span><b>'+esc(o.volumetric)+' kg</b><span>计费重</span><b>'+esc(o.billingWeight)+' kg</b><span>方数</span><b>'+esc(o.billingVolume)+'</b><span>DW窗口期</span><b>'+esc(o.dw?'有':'—')+'</b></div></div><div class="mini-section"><div class="mini-head"><h3>箱规尺寸</h3><button data-export-box>导出表格</button></div><table><thead><tr><th>箱号</th><th>长</th><th>宽</th><th>高</th><th>重量</th><th>体积</th></tr></thead><tbody>'+o.boxes.map(function(b){return '<tr><td>'+esc(b.boxNumber||'')+'</td><td>'+esc(b.length||'')+'</td><td>'+esc(b.width||'')+'</td><td>'+esc(b.height||'')+'</td><td>'+esc(b.weight||'')+'</td><td>'+esc(b.volume||'')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
    html+='<div class="detail-end">以上为我司最新轨迹，实际以承运商/官网更新为准</div>';
    var box=document.getElementById('detailContent');if(box)box.innerHTML=html;
    document.querySelectorAll('#detailContent .detail-tabs button').forEach(function(b){b.onclick=function(){document.querySelectorAll('#detailContent .detail-tabs button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');document.querySelectorAll('#detailContent .detail-pane').forEach(function(p){p.hidden=p.getAttribute('data-pane')!==b.getAttribute('data-pane');});};});
    document.querySelectorAll('#detailContent .tl-copy').forEach(function(btn){btn.onclick=function(){var r=trail[parseInt(btn.getAttribute('data-track-index'),10)];var text=r?(r.cn||r.description||''):'';if(!text)return;copy(text,function(){markCopied(btn);});};});
    var ot=document.getElementById('operatorToggle');if(ot)ot.onchange=function(){var tc=document.querySelector('#detailContent .timeline-card');if(tc)tc.classList.toggle('show-operator',ot.checked);};
    var oc=document.getElementById('copyOrder');if(oc)oc.onclick=function(){copy(o.no,function(){markCopied(oc);});};
    var cc=document.getElementById('copyCurrent');if(cc)cc.onclick=function(){if(!hasTrack)return;copy('单号：'+o.no+'\n当前轨迹：'+latestText,function(){markCopied(cc);});};
    var ap=document.querySelector('#detailContent [data-all-pods]');if(ap)ap.onclick=function(){openDownloads('pod',ap,o);};
    var ai=document.querySelector('#detailContent [data-all-images]');if(ai)ai.onclick=function(){openDownloads('img',ai,o);};
    var ex=document.querySelector('#detailContent [data-export-box]');if(ex)ex.onclick=function(){exportBoxes(o);};
    document.getElementById('copyBottom').disabled=!hasTrack;
    document.getElementById('copyBottom').onclick=function(){if(hasTrack)copy(replyText(o));};
    document.getElementById('podBottom').onclick=function(){if(o.pods.length)window.open(o.pods[0].filePath,'_blank');else toast('这票暂无 POD');};
  }
  function replyText(o){
    var cur=currentAlerts(o);var a=latestCurrentAlert(o);
    if(!cur.length||!a)return '【'+o.no+'】您好，最新轨迹：'+(o.latest?(o.latest.cn||''):'')+'。当前状态：'+o.status+'，我司会继续跟进，有进展第一时间同步。';
    return '【'+o.no+'】您好，最新轨迹显示'+a.label+'：'+a.text+'。'+actionFor(o)+'，有最新进展会第一时间同步您，感谢理解。';
  }
  function copy(t,onDone){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){toast('已复制');if(onDone)onDone();}).catch(function(){fallback(t,onDone);});}else fallback(t,onDone);}
  function fallback(t,onDone){var a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.left='-9999px';document.body.appendChild(a);a.select();try{document.execCommand('copy');toast('已复制');if(onDone)onDone();}catch(e){toast('复制失败');}a.remove();}
  var copyIcon='<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>复制</span>';
  var checkIcon='<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 7"/></svg><span>已复制</span>';
  function markCopied(btn){
    if(btn.dataset.copying==='1')return;
    btn.dataset.copying='1';
    var original=btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML=checkIcon;
    if(navigator.vibrate)try{navigator.vibrate(10);}catch(e){}
    setTimeout(function(){btn.classList.remove('copied');btn.innerHTML=original;btn.dataset.copying='0';},1500);
  }
  function allFiles(kind,onlyOrder){
    var out=[];
    orders.forEach(function(o){
      if(onlyOrder&&o!==onlyOrder)return;
      if(kind==='pod')o.pods.forEach(function(p){out.push({order:o.no,name:p.fileName||'POD',url:p.filePath});});
      else o.photos.forEach(function(p){out.push({order:o.no,name:p.name||'过机图',url:p.src||''});});
    });
    return out;
  }
  function setDownloadProgress(pct){
    var bar=document.querySelector('#downloadProgress i');if(bar)bar.style.width=pct+'%';
    var arc=document.getElementById('ringArc');if(arc){var c=188.5;arc.style.strokeDashoffset=c*(1-pct/100);}
    var p=document.getElementById('ringPct');if(p)p.textContent=Math.round(pct)+'%';
  }
  function setDownloadState(text,state){
    var s=document.getElementById('dlState');if(s)s.textContent=text;
    var hero=document.getElementById('dlHero');if(hero){hero.classList.toggle('done',state==='done');hero.classList.toggle('empty',state==='empty');}
  }
  function pulseDownloadButton(btn,label){
    if(!btn)return;
    var old=btn.innerHTML;btn.classList.add('loading');btn.innerHTML='<span class="btn-spinner"></span>'+(label||'准备中');btn.disabled=true;
    setTimeout(function(){btn.classList.remove('loading');btn.innerHTML=old;btn.disabled=false;},650);
  }
  function openDownloads(kind,triggerBtn,onlyOrder){
    toast(kind==='pod'?'正在读取 POD…':'正在读取过机图片…');
    var sheet=document.getElementById('downloadSheet');
    document.getElementById('downloadTitle').textContent=kind==='pod'?'全部 POD 下载':'全部过机图片';
    document.getElementById('downloadSub').textContent='正在整理文件…';
    document.getElementById('downloadList').innerHTML='<div class="download-loading"><span class="spinner"></span>正在读取文件清单</div>';
    document.getElementById('downloadAllBtn').disabled=true;
    setDownloadState('正在读取文件','loading');
    sheet.hidden=false;
    setDownloadProgress(8);
    pulseDownloadButton(triggerBtn,kind==='pod'?'读取 POD':'读取图片');
    setTimeout(function(){
      var files=allFiles(kind,onlyOrder);
      setDownloadProgress(100);
      document.getElementById('downloadAllBtn').disabled=!files.length;
      if(!files.length){
        setDownloadState('没有可下载文件','empty');
        document.getElementById('downloadSub').textContent=kind==='pod'?'本次结果没有可下载的 POD':'本次结果没有可下载的过机图片';
        document.getElementById('downloadList').innerHTML='<div class="download-empty"><b>没有文件</b><span>'+(kind==='pod'?'这些票的 POD 还没有回传，或接口未返回文件。':'这些票没有过机图片。')+'</span></div>';
        return;
      }
      setDownloadState('已找到 '+files.length+' 个文件','done');
      document.getElementById('downloadSub').textContent='可逐个下载，或点「全部下载」';
      document.getElementById('downloadList').innerHTML=files.map(function(f,i){return '<div class="download-item" style="--i:'+i+'"><div><b>'+esc(f.order)+'</b><span>'+esc(f.name)+'</span></div>'+(f.url?'<a href="'+esc(f.url)+'" target="_blank" rel="noopener" class="download-one">下载</a>':'<span class="download-one muted-file">示例</span>')+'</div>';}).join('');
      document.getElementById('downloadAllBtn').onclick=function(){
        var real=files.filter(function(f){return !!f.url;});
        if(!real.length){toast('当前为示例数据，没有可下载文件');return;}
        setDownloadState('正在下载文件','loading');
        setDownloadProgress(5);
        real.forEach(function(f,i){setTimeout(function(){
          var a=document.createElement('a');a.href=f.url;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
          var pct=Math.round((i+1)/real.length*100);setDownloadProgress(pct);
          document.getElementById('downloadSub').textContent='正在下载 '+(i+1)+' / '+real.length;
          setDownloadState('正在下载 '+(i+1)+' / '+real.length,'loading');
          if(i+1===real.length)setTimeout(function(){setDownloadState('已发起 '+real.length+' 个下载','done');document.getElementById('downloadSub').textContent='浏览器可能会拦截连续弹窗，可逐个下载';},400);
        },i*450);});
      };
    },520);
  }
  function exportRows(kind){
    if(kind==='summary'){
      return [['单号','渠道','下单仓库','目的仓','收货人','国家','邮编','件数','状态','最新轨迹','最新时间','POD','图片'],
        ...orders.map(function(o){return [o.no,o.channel,o.origin,o.receipt.warehouse,o.receipt.name,o.receipt.country,o.receipt.zip,o.pieceCount||0,o.status,currentTrackText(o),o.latest?fmt(o.latest.optionTime):'',o.pods.length,o.imageCount];})];
    }
    if(kind==='detail'){
      var rows=[['单号','状态','时间','地点','轨迹内容','操作人']];
      orders.forEach(function(o){
        o.routes.slice().sort(function(a,b){return (b.optionTime||0)-(a.optionTime||0);}).forEach(function(r){rows.push([o.no,routeLabel(r),r.optionTime?fmt(r.optionTime):'',r.city||r.country||'',r.cn||r.description||'',r.createUserName||r.updateUserName||'']);});
      });
      return rows;
    }
    var sla=[['单号','状态','节点数','开始时间','最新时间','时效天数']];
    orders.forEach(function(o){
      var rs=o.routes.slice().sort(function(a,b){return (a.optionTime||0)-(b.optionTime||0);});var first=rs.length?rs[0].optionTime:0;var last=rs.length?rs[rs.length-1].optionTime:0;
      sla.push([o.no,o.status,rs.length,first?fmt(first):'',last?fmt(last):'',first&&last?((last-first)/86400000).toFixed(1):'']);
    });
    return sla;
  }
  function downloadXls(name,rows){
    var html='<html><head><meta charset="utf-8"></head><body><table border="1">'+rows.map(function(r){return '<tr>'+r.map(function(v){return '<td>'+esc(v==null?'':v)+'</td>';}).join('')+'</tr>';}).join('')+'</table></body></html>';
    var blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},1500);toast('表格已导出');
  }
  function openExportSheet(){document.getElementById('exportSheet').hidden=false;}
  function exportBoxes(o){
    var head='<tr>'+['箱号','长','宽','高','重量','体积'].map(function(v){return '<th>'+v+'</th>';}).join('')+'</tr>';
    var body=o.boxes.map(function(b){return '<tr>'+[b.boxNumber,b.length,b.width,b.height,b.weight,b.volume].map(function(v){return '<td>'+String(v==null?'':v)+'</td>';}).join('')+'</tr>';}).join('');
    var html='<html><head><meta charset="utf-8"></head><body><table border="1">'+head+body+'</table></body></html>';
    var blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=o.no+'-箱规.xls';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},1500);toast('箱规表格已导出');
  }
  function toast(m){var d=document.createElement('div');d.className='toast ios-toast';d.textContent=m;document.body.appendChild(d);setTimeout(function(){d.classList.add('on');},10);setTimeout(function(){d.classList.remove('on');d.remove();},1800);}

  async function runQuery(nums){
    if(!nums.length){toast('请先输入单号');return;}
    var btn=document.getElementById('queryBtn');if(btn){btn.disabled=true;btn.textContent='查询中…';}
    try{var res=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(nums)});var data=await res.json();orders=(data.data||[]).map(buildOrder);if(!orders.length)toast(data.msg||'没有查询到轨迹');renderResults();show('results');}
    catch(e){toast('查询失败，请检查网络');}
    if(btn){btn.disabled=false;btn.textContent='查询';}
  }
  function openBatch(){var s=document.getElementById('batchSheet');if(s)s.hidden=false;}
  function closeBatch(){var s=document.getElementById('batchSheet');if(s)s.hidden=true;}
  function showDemo(which){
    orders=DEMO.slice();
    if(which==='detail'){renderResults();show('results');activeOrder=DEMO[0];renderDetail();show('detail');}
    else{renderResults();show('results');}
  }

  document.getElementById('queryBtn').onclick=function(){runQuery([document.getElementById('noInput').value.trim()].filter(Boolean));};
  document.getElementById('noInput').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('queryBtn').click();});
  document.getElementById('clearBtn').onclick=function(){document.getElementById('noInput').value='';};
  document.getElementById('batchBtn').onclick=openBatch;
  document.querySelectorAll('.quick')[0].onclick=openBatch;
  document.getElementById('cancelBatch').onclick=closeBatch;
  document.getElementById('doBatch').onclick=function(){var vals=document.getElementById('batchNumbers').value.split(/[\s,，;；]+/).map(function(x){return x.trim();}).filter(Boolean);closeBatch();runQuery(vals);};
  document.getElementById('allPodBtn').onclick=function(){openDownloads('pod',this);};
  document.getElementById('allImgBtn').onclick=function(){openDownloads('img',this);};
  document.getElementById('exportBtn').onclick=function(){if(!orders.length){toast('请先查询');return;}openExportSheet();};
  document.getElementById('cancelExport').onclick=function(){document.getElementById('exportSheet').hidden=true;};
  document.querySelectorAll('#exportSheet [data-export]').forEach(function(b){b.onclick=function(){var kind=b.getAttribute('data-export');var names={summary:'轨迹概要',detail:'轨迹明细',sla:'时效统计'};downloadXls(names[kind]+'-'+new Date().toISOString().slice(0,10)+'.xls',exportRows(kind));document.getElementById('exportSheet').hidden=true;};});
  document.getElementById('cancelDownload').onclick=function(){document.getElementById('downloadSheet').hidden=true;};
  document.querySelectorAll('[data-back]').forEach(function(b){b.onclick=function(){goBack(b.getAttribute('data-back'));};});
  document.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){showDemo(b.getAttribute('data-go'));};});
  document.getElementById('resultList').addEventListener('click',function(e){var c=e.target.closest('[data-order]');if(!c)return;activeOrder=orders[parseInt(c.getAttribute('data-order'),10)];renderDetail();show('detail');});
  document.querySelectorAll('.filter-row .filter').forEach(function(b,i){b.onclick=function(){filterMode=i===1?'alert':i===2?'done':'all';document.querySelectorAll('.filter-row .filter').forEach(function(x){x.classList.remove('on');});b.classList.add('on');renderResults();};});
  document.querySelectorAll('.tabbar button').forEach(function(b){b.onclick=function(){document.querySelectorAll('.tabbar button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');};});
  if(!nativeApp&&'serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js').catch(function(){});}
  document.getElementById('noInput').value='FBA00DEMO01';
  try{history.replaceState({screen:'query'},'',location.pathname+location.search);}catch(e){}
  window.addEventListener('popstate',function(e){var s=(e.state&&e.state.screen)||'query';show(s,true);});
  if(platform==='ios'){
    var edgeX=0,edgeY=0,edgeOn=false;
    document.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;var t=e.touches[0];edgeOn=t.clientX<24;edgeX=t.clientX;edgeY=t.clientY;},{passive:true});
    document.addEventListener('touchend',function(e){if(!edgeOn)return;edgeOn=false;if(!document.getElementById('batchSheet').hidden)return;var t=e.changedTouches[0];if(t.clientX-edgeX>70&&Math.abs(t.clientY-edgeY)<45)goBack();},{passive:true});
  }
  if(demoMode==='results')showDemo('results');else if(demoMode==='detail')showDemo('detail');else show('query');
})();
