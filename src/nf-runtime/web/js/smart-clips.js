// Smart clips tab runtime for source browsing, clip cards, and modal playback.
const scSourceSpecs={'dario-interview-full.mp4':{durationSec:1404,durationLabel:'23:24',resolution:'1080p',sizeLabel:'85MB',codec:'h264',fps:'30fps'}};
const scClipSpecs={
  'clip_01-指数快到头.mp4':{startSec:135,endSec:197,linkedSegment:'段1·痛点',reason:'Dario 用数据论证指数增长拐点，适合做开场冲击。',tags:['exponential','growth'],quality:'A',confidence:0.92},
  'clip_02-天才之国.mp4':{startSec:510,endSec:595,linkedSegment:'段2·方案',reason:'观点切换明确，适合承接第二段论据。',tags:['talent','genius'],quality:'A',confidence:0.88},
  'clip_03-端到端写代码.mp4':{startSec:920,endSec:1025,linkedSegment:'段3·原理',reason:'端到端叙述完整，适合作为技术观点切片。',tags:['AI','coding'],quality:'B+',confidence:0.85},
};
const scSubtitleFallbacks={
  22:'我写那篇文章时，GPT-1 才刚刚发布，对吧？',
  23:'所以那只是众多方向中的一个，对吧？',
  84:'然后我认为，我们会越来越多地获得泛化能力。',
  85:'这样一来，RL 和预训练之间的那种对立就没那么重要了。',
  142:'我几乎可以确定，我们有一条可靠的路径能走到那里，但如果说还存在一点点不确定性，那也确实还在。',
  143:'所以对十年这个时间尺度，我大概有 90% 把握，这已经接近你能有的最高确定性了。',
};
const scTimelineColors=['var(--accent)','#60a5fa','#34d399','#f97316'];
let scSources=[]; let scActiveSource=0; let scClips=[]; let scTranscript=[]; let scRenderedClips=[]; let scPlayerCleanup=null;

function scEscape(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function scNormalizeStem(name){return String(name||'').replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,'-');}
function scNfUrl(path){if(!path)return'';const marker=path.indexOf('/projects/');return marker<0?path:'nfdata://localhost/'+encodeURI(path.slice(marker+'/projects/'.length));}
function scFormatBytes(bytes){if(!Number.isFinite(bytes)||bytes<=0)return'—';const mb=bytes/(1024*1024);return mb>=100?Math.round(mb)+'MB':mb.toFixed(1)+'MB';}
function scLangLabel(key){const labels={zh:'中',ja:'日',ko:'韩',fr:'FR',es:'ES',de:'DE'};return labels[key]||String(key||'').slice(0,2).toUpperCase();}
function scFormatClock(totalSeconds,withTenths){if(!Number.isFinite(totalSeconds)||totalSeconds<0)return withTenths?'00:00.0':'00:00';const hours=Math.floor(totalSeconds/3600);const minutes=Math.floor((totalSeconds%3600)/60);const seconds=totalSeconds%60;if(withTenths){const base=String(minutes).padStart(2,'0')+':'+seconds.toFixed(1).padStart(4,'0');return hours>0?String(hours).padStart(2,'0')+':'+base:base;}const mm=hours>0?Math.floor((totalSeconds%3600)/60):Math.floor(totalSeconds/60);const ss=Math.floor(totalSeconds%60);const core=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');return hours>0?String(hours).padStart(2,'0')+':'+core:core;}

function scPickSentencesFile(videoName,sentenceEntries){
  if(!sentenceEntries.length)return null;
  const stem=scNormalizeStem(videoName);
  const direct=sentenceEntries.find((entry)=>scNormalizeStem(entry.name).startsWith(stem));
  if(direct)return direct;
  const tokens=stem.split('-').filter((token)=>token.length>2);
  const partial=sentenceEntries.find((entry)=>{const entryStem=scNormalizeStem(entry.name).replace(/-sentences$/,'');return tokens.some((token)=>entryStem.includes(token));});
  return partial||(sentenceEntries.length===1?sentenceEntries[0]:null);
}

function scExtractLanguageRows(sentence){
  const rows=[]; const translations=sentence.translations&&typeof sentence.translations==='object'?sentence.translations:{};
  const zhText=translations.zh||sentence.zh||scSubtitleFallbacks[sentence.id]||'';
  if(sentence.text)rows.push({label:'EN',text:sentence.text,primary:true});
  if(zhText)rows.push({label:'中',text:zhText,primary:false});
  Object.keys(translations).forEach((key)=>{if(key!=='zh'&&translations[key])rows.push({label:scLangLabel(key),text:translations[key],primary:false});});
  ['ja','ko','fr','es','de'].forEach((key)=>{if(sentence[key]&&!translations[key])rows.push({label:scLangLabel(key),text:sentence[key],primary:false});});
  return rows;
}

function scGetSourceDuration(source){const spec=scSourceSpecs[source.name]||{};return spec.durationSec||0;}
function scGetClipSpec(clip){return scClipSpecs[clip.name]||null;}
function scPickPreviewSentences(sentences){
  const translated=sentences.filter((sentence)=>sentence.languageRows.length>1);
  if(translated[0])return [translated[0]];
  return sentences.slice(0,1);
}

function scBuildClipModels(){
  const source=scSources[scActiveSource]; if(!source)return[];
  const sourceDuration=scGetSourceDuration(source);
  return scClips.map((clip,index)=>{
    const spec=scGetClipSpec(clip); if(!spec)return null;
    const sentences=scTranscript.filter((sentence)=>sentence.end>spec.startSec&&sentence.start<spec.endSec).map((sentence)=>({
      id:sentence.id,startSec:sentence.start-spec.startSec,endSec:sentence.end-spec.startSec,durationSec:Math.max(0,sentence.end-sentence.start),languageRows:scExtractLanguageRows(sentence),
    }));
    const firstSentence=sentences[0]; const lastSentence=sentences[sentences.length-1];
    return {
      clip,index,startSec:spec.startSec,endSec:spec.endSec,durationSec:spec.endSec-spec.startSec,sourceDurationSec:sourceDuration,nfUrl:scNfUrl(clip.path),sizeLabel:scFormatBytes(clip.size),
      timecodeLabel:scFormatClock(spec.startSec,false)+' → '+scFormatClock(spec.endSec,false),sentences,linkedSegment:spec.linkedSegment,tags:spec.tags,reason:spec.reason,quality:spec.quality,confidence:spec.confidence,
      previewSentences:scPickPreviewSentences(sentences),sentenceRange:firstSentence&&lastSentence?firstSentence.id+'-'+lastSentence.id:'—',
    };
  }).filter(Boolean);
}

function scRenderSidebar(){
  const root=document.getElementById('sc-source-list'); if(!root)return;
  let html='<div class="sc-sidebar-title">源视频</div>';
  if(!scSources.length){root.innerHTML=html+'<div class="sc-empty">暂无源视频</div>';return;}
  html+=scSources.map((source,index)=>{
    const active=index===scActiveSource?' active':''; const spec=scSourceSpecs[source.name]||{}; const clipCount=index===scActiveSource?scRenderedClips.length:scClips.length;
    return '<button class="sc-src-item'+active+'" type="button" data-nf-action="select-smart-source" onclick="scSelectSource('+index+')">'+
      '<span class="sc-src-name">'+scEscape(source.name)+'</span>'+
      '<span class="sc-src-meta"><span>'+scEscape(spec.durationLabel||'—')+'</span><span>'+scEscape(spec.resolution||'—')+'</span></span>'+
      '<span class="sc-src-count">'+clipCount+' clips · '+(source.totalSentences||0)+' 句</span></button>';
  }).join('');
  root.innerHTML=html;
}

function scRenderTimeline(clips,source){
  const durationSec=scGetSourceDuration(source);
  if(!durationSec)return'';
  const ticks=Array.from({length:6},(_,index)=>scFormatClock(durationSec*(index/5),false));
  const regions=clips.map((clipModel)=>{
    const left=(clipModel.startSec/durationSec)*100; const width=((clipModel.endSec-clipModel.startSec)/durationSec)*100; const color=scTimelineColors[clipModel.index%scTimelineColors.length];
    return '<button class="sc-tl-region" type="button" data-nf-action="focus-smart-clip" onclick="document.getElementById(\'sc-clip-'+clipModel.index+'\')?.scrollIntoView({block:\'start\',behavior:\'smooth\'})" style="left:'+left.toFixed(2)+'%;width:'+width.toFixed(2)+'%;background:'+color+'"><span class="sc-tl-region-label">'+String(clipModel.index+1).padStart(2,'0')+'</span></button>';
  }).join('');
  return '<div class="glass sc-timeline"><div class="sc-tl-label">时间轴 · 切片分布</div><div class="sc-tl-bar">'+regions+'</div><div class="sc-tl-ticks">'+ticks.map((tick)=>'<span class="sc-tl-tick">'+tick+'</span>').join('')+'</div></div>';
}

function scRenderClipSentence(sentence,index){
  const rows=sentence.languageRows.length?sentence.languageRows.map((row)=>'<div class="sc-sent-lang-row"><span class="sc-sent-lang-label">'+row.label+'</span><span class="'+(row.primary?'sc-sent-text':'sc-sent-trans')+'">'+scEscape(row.text)+'</span></div>').join(''):'<div class="sc-sent-lang-row"><span class="sc-sent-lang-label">EN</span><span class="sc-sent-text">字幕缺失</span></div>';
  return '<div class="sc-sent-row'+(index===0?' active':'')+'"><span class="sc-sent-tc">'+scFormatClock(sentence.startSec,true)+'</span><div class="sc-sent-content">'+rows+'</div><span class="sc-sent-dur">'+sentence.durationSec.toFixed(1)+'s</span></div>';
}

function scRenderMain(){
  const root=document.getElementById('sc-main'); if(!root)return;
  const source=scSources[scActiveSource]; if(!source){root.innerHTML='<div class="sc-empty">暂无源视频</div>';return;}
  scRenderedClips=scBuildClipModels(); scRenderSidebar();
  const spec=scSourceSpecs[source.name]||{};
  const tagHtml=[
    '<span class="sc-tag sc-tag-warm">'+scEscape(spec.durationLabel||'—')+'</span>',
    '<span class="sc-tag sc-tag-default">'+scEscape(spec.resolution||'—')+'</span>',
    '<span class="sc-tag sc-tag-default">'+scEscape(spec.codec||'—')+'</span>',
    '<span class="sc-tag sc-tag-default">'+scEscape(spec.fps||'—')+'</span>',
    '<span class="sc-tag sc-tag-warm">'+scEscape(spec.sizeLabel||'—')+'</span>',
    '<span class="sc-tag sc-tag-accent">'+(source.totalSentences||0)+' sentences</span>',
    '<span class="sc-tag sc-tag-accent">'+scRenderedClips.length+' clips</span>',
  ].join('');
  const timelineHtml=scRenderedClips.length?scRenderTimeline(scRenderedClips,source):'';
  const cardsHtml=scRenderedClips.length?scRenderedClips.map((clipModel)=>'<div class="sc-clip-card'+(clipModel.index===0?' active':'')+'" id="sc-clip-'+clipModel.index+'">'+
      '<div class="sc-clip-top"><span class="sc-clip-num">'+(clipModel.index+1)+'</span><span class="sc-clip-name">'+scEscape(clipModel.clip.name)+'</span><span class="sc-clip-dur">'+Math.round(clipModel.durationSec)+'s</span><span class="sc-clip-tc">'+clipModel.timecodeLabel+'</span></div>'+
      '<div class="sc-clip-body"><button class="sc-clip-video" type="button" data-nf-action="preview-smart-clip" onclick="scOpenPlayer('+clipModel.index+')"><video src="'+scEscape(clipModel.nfUrl)+'" preload="metadata" muted playsinline></video><span class="sc-play-overlay"><span class="sc-play-circle">&#9654;</span></span></button><div class="sc-sentences">'+clipModel.previewSentences.map(scRenderClipSentence).join('')+'</div></div>'+
      '<div class="sc-meta-bar"><span class="sc-meta-tag">关联: '+scEscape(clipModel.linkedSegment)+'</span><span class="sc-meta-tag">标签: '+scEscape(clipModel.tags.join(', '))+'</span><span class="sc-meta-tag">'+clipModel.sentences.length+' 句</span><button class="sc-more-btn" type="button" data-nf-action="open-smart-clip-meta" onclick="scOpenMeta('+clipModel.index+')">更多 ↗</button></div></div>').join(''):'<div class="sc-empty">暂无切片数据</div>';
  root.innerHTML='<div class="sc-detail-header"><div class="sc-detail-top"><div><div class="sc-detail-name">'+scEscape(source.name)+'</div><div class="sc-detail-meta">'+scRenderedClips.length+' clips · '+(source.totalSentences||0)+' sentences</div></div><button class="sc-preview-btn" type="button" data-nf-action="preview-smart-source" onclick="scOpenSourcePlayer()">&#9654; 预览原视频</button></div><div class="sc-detail-path">'+scEscape(source.path)+'</div><div class="sc-detail-tags">'+tagHtml+'</div></div>'+timelineHtml+'<div class="sc-clip-scroll">'+cardsHtml+'</div>';
}

function scRenderModalSubtitle(sentence,emptyText){
  if(!sentence)return'<div class="sc-modal-sub-lang-row"><span class="sc-modal-sub-original">'+scEscape(emptyText||'···')+'</span></div>';
  return sentence.languageRows.map((row)=>'<div class="sc-modal-sub-lang-row"><span class="sc-modal-sub-lang-label">'+row.label+'</span><span class="'+(row.primary?'sc-modal-sub-original':'sc-modal-sub-trans')+'">'+scEscape(row.text)+'</span></div>').join('');
}

function scBindPlayer(video,subtitles,title,explicitDuration,emptyText){
  const subtitleEl=document.getElementById('sc-modal-subtitle'); const currentEl=document.getElementById('sc-modal-current'); const totalEl=document.getElementById('sc-modal-total'); const fillEl=document.getElementById('sc-modal-progress-fill');
  const titleEl=document.getElementById('sc-modal-title'); const progressEl=document.getElementById('sc-modal-progress'); if(!video||!subtitleEl||!currentEl||!totalEl||!fillEl||!titleEl||!progressEl)return;
  titleEl.textContent=title;
  function sync(){
    const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:explicitDuration; const current=Number.isFinite(video.currentTime)?video.currentTime:0;
    currentEl.textContent=scFormatClock(current,true); totalEl.textContent=scFormatClock(duration||0,true); fillEl.style.width=duration?((current/duration)*100).toFixed(2)+'%':'0%';
    const active=subtitles.find((sentence)=>current>=sentence.startSec&&current<sentence.endSec)||null; subtitleEl.innerHTML=scRenderModalSubtitle(active,emptyText);
  }
  const onTimeUpdate=()=>sync(); const onLoaded=()=>sync();
  const onProgressClick=(event)=>{const rect=progressEl.getBoundingClientRect(); const ratio=Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)); const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:explicitDuration; if(duration)video.currentTime=ratio*duration;};
  video.addEventListener('timeupdate',onTimeUpdate); video.addEventListener('loadedmetadata',onLoaded); progressEl.addEventListener('click',onProgressClick); sync();
  scPlayerCleanup=function(){video.pause(); video.removeEventListener('timeupdate',onTimeUpdate); video.removeEventListener('loadedmetadata',onLoaded); progressEl.removeEventListener('click',onProgressClick);};
}

function scOpenPlayer(index){
  const clipModel=scRenderedClips[index]; const overlay=document.getElementById('sc-player-modal'); const panel=document.getElementById('sc-player-panel'); if(!clipModel||!overlay||!panel)return;
  if(typeof scPlayerCleanup==='function')scPlayerCleanup();
  panel.innerHTML='<button class="sc-modal-close" type="button" data-nf-action="close-smart-player" onclick="scClosePlayer()">&times;</button><div class="sc-modal-video-shell"><video id="sc-modal-video" src="'+scEscape(clipModel.nfUrl)+'" controls autoplay playsinline></video></div><div class="sc-modal-subtitle" id="sc-modal-subtitle"></div><div class="sc-modal-transport"><div class="sc-modal-progress" id="sc-modal-progress"><div class="sc-modal-progress-fill" id="sc-modal-progress-fill"></div></div><div class="sc-modal-meta"><span class="sc-modal-tc" id="sc-modal-current">00:00.0</span><span class="sc-modal-clip-name" id="sc-modal-title"></span><span class="sc-modal-tc" id="sc-modal-total">00:00.0</span></div></div>';
  overlay.classList.add('open'); scBindPlayer(document.getElementById('sc-modal-video'),clipModel.sentences,clipModel.clip.name,clipModel.durationSec,'···');
}

function scOpenSourcePlayer(){
  const source=scSources[scActiveSource]; const overlay=document.getElementById('sc-player-modal'); const panel=document.getElementById('sc-player-panel'); const spec=source?(scSourceSpecs[source.name]||{}):null;
  if(!source||!overlay||!panel)return; if(typeof scPlayerCleanup==='function')scPlayerCleanup();
  panel.innerHTML='<button class="sc-modal-close" type="button" data-nf-action="close-smart-player" onclick="scClosePlayer()">&times;</button><div class="sc-modal-video-shell"><video id="sc-modal-video" src="'+scEscape(scNfUrl(source.path))+'" controls autoplay playsinline></video></div><div class="sc-modal-subtitle" id="sc-modal-subtitle"></div><div class="sc-modal-transport"><div class="sc-modal-progress" id="sc-modal-progress"><div class="sc-modal-progress-fill" id="sc-modal-progress-fill"></div></div><div class="sc-modal-meta"><span class="sc-modal-tc" id="sc-modal-current">00:00.0</span><span class="sc-modal-clip-name" id="sc-modal-title"></span><span class="sc-modal-tc" id="sc-modal-total">00:00.0</span></div></div>';
  overlay.classList.add('open'); scBindPlayer(document.getElementById('sc-modal-video'),[],source.name+' · '+(spec&&spec.resolution?spec.resolution:'源视频'),spec&&spec.durationSec?spec.durationSec:0,'原视频预览');
}

function scClosePlayer(){const overlay=document.getElementById('sc-player-modal'); if(typeof scPlayerCleanup==='function'){scPlayerCleanup(); scPlayerCleanup=null;} if(overlay)overlay.classList.remove('open');}

function scOpenMeta(index){
  const clipModel=scRenderedClips[index]; const overlay=document.getElementById('sc-meta-modal'); const panel=document.getElementById('sc-meta-panel'); if(!clipModel||!overlay||!panel)return;
  const rows=[['切片原因',clipModel.reason],['linked_segment',clipModel.linkedSegment],['source_timecode',clipModel.timecodeLabel],['source_sentence_ids',clipModel.sentenceRange],['sentence_count',String(clipModel.sentences.length)],['quality',clipModel.quality],['confidence',clipModel.confidence.toFixed(2)],['tags',clipModel.tags.join(', ')],['file_size',clipModel.sizeLabel],['path',clipModel.clip.path]];
  panel.innerHTML='<button class="sc-modal-close" type="button" data-nf-action="close-smart-clip-meta" onclick="scCloseMeta()">&times;</button><div class="sc-meta-title">'+scEscape(clipModel.clip.name)+' · 元信息</div>'+rows.map((row)=>'<div class="sc-meta-row"><span class="sc-meta-key">'+scEscape(row[0])+'</span><span class="sc-meta-val">'+scEscape(row[1])+'</span></div>').join('');
  overlay.classList.add('open');
}

function scCloseMeta(){const overlay=document.getElementById('sc-meta-modal'); if(overlay)overlay.classList.remove('open');}
function scHandlePlayerOverlay(event){if(event.target&&event.target.id==='sc-player-modal')scClosePlayer();}
function scHandleMetaOverlay(event){if(event.target&&event.target.id==='sc-meta-modal')scCloseMeta();}

function scSelectSource(index){
  scActiveSource=index; const source=scSources[index]; scTranscript=[];
  if(!source||!source.sentencesPath||typeof bridgeCall!=='function'){scRenderMain();return;}
  bridgeCall('fs.read',{path:source.sentencesPath}).then((data)=>{const parsed=JSON.parse(data.contents||'{}'); scTranscript=Array.isArray(parsed.sentences)?parsed.sentences:[]; source.totalSentences=parsed.total_sentences||scTranscript.length; scRenderMain();}).catch(()=>{scTranscript=[]; scRenderMain();});
}

function loadSmartClips(){
  const sidebar=document.getElementById('sc-source-list'); const main=document.getElementById('sc-main'); if(!sidebar||!main)return;
  if(typeof bridgeCall!=='function'||!window.currentEpisodePath){sidebar.innerHTML='<div class="sc-sidebar-title">源视频</div><div class="sc-empty">桌面桥接未就绪</div>'; main.innerHTML='<div class="sc-empty">无法读取当前剧集数据</div>'; return;}
  const sourcesDir=window.currentEpisodePath+'/sources';
  Promise.all([bridgeCall('fs.listDir',{path:sourcesDir}).catch(()=>({entries:[]})),bridgeCall('source.clips',{episode:window.currentEpisodePath}).catch(()=>({clips:[]}))]).then((result)=>{
    const entries=Array.isArray(result[0].entries)?result[0].entries:[]; const videos=entries.filter((entry)=>/\.(mp4|mov|mkv|webm)$/i.test(entry.name||'')); const transcriptFiles=entries.filter((entry)=>/sentences\.json$/i.test(entry.name||''));
    scSources=videos.map((video)=>{const transcript=scPickSentencesFile(video.name,transcriptFiles); return {name:video.name,path:video.path,sentencesPath:transcript?transcript.path:'',totalSentences:0};});
    scClips=Array.isArray(result[1].clips)?result[1].clips:[]; scActiveSource=0; scRenderedClips=[]; scRenderSidebar(); if(!scSources.length){scRenderMain(); return;} scSelectSource(0);
  });
}

window.loadSmartClips=loadSmartClips; window.scSelectSource=scSelectSource; window.scOpenPlayer=scOpenPlayer; window.scOpenSourcePlayer=scOpenSourcePlayer; window.scClosePlayer=scClosePlayer;
window.scOpenMeta=scOpenMeta; window.scCloseMeta=scCloseMeta; window.scHandlePlayerOverlay=scHandlePlayerOverlay; window.scHandleMetaOverlay=scHandleMetaOverlay;
