"use strict";
// Smart clips tab runtime for source browsing, real clip data, and word-level karaoke playback.
const scTimelineColors = ['var(--accent)', '#60a5fa', '#34d399', '#f97316'];
let scSources = [];
let scActiveSource = 0;
let scRenderedClips = [];
let scPlayerCleanup = null;
let scLoadToken = 0;
function scRenderEmptySubtitle(text) { return '<div class="sc-modal-sub-lang-row"><span class="sc-modal-sub-original">' + escapeHtml(text || '···') + '</span></div>'; }
function scExtractLanguageRows(sentence) {
    const rows = [];
    const translations = sentence && sentence.translations && typeof sentence.translations === 'object' ? sentence.translations : {};
    if (sentence && sentence.text)
        rows.push({ label: 'EN', text: String(sentence.text), primary: true });
    ['zh', 'ja', 'ko', 'fr', 'es', 'de'].forEach((key) => { const text = translations[key] || sentence[key] || ''; if (text)
        rows.push({ label: langLabel(key), text: String(text), primary: false }); });
    return rows;
}
function scWordStart(word) { return Number(word && ((word.startSec != null) ? word.startSec : word.start)); }
function scWordEnd(word) { return Number(word && ((word.endSec != null) ? word.endSec : word.end)); }
function scNormalizeWord(word, timeOffset) {
    const startSec = scWordStart(word) - timeOffset;
    const endSec = scWordEnd(word) - timeOffset;
    return { text: String(word && word.text || ''), startSec: Number.isFinite(startSec) ? Math.max(0, startSec) : 0, endSec: Number.isFinite(endSec) ? Math.max(0, endSec) : Math.max(0, startSec || 0) };
}
function scReadJson(path, fallback) {
    if (typeof bridgeCall !== 'function' || !path)
        return Promise.resolve(fallback);
    return bridgeCall('fs.read', { path }).then((result) => { const data = result.ok === true ? result.value : {}; try {
        return JSON.parse(data && data.contents ? data.contents : 'null') || fallback;
    }
    catch (_error) {
        return fallback;
    } }).catch(() => fallback);
}
function scListDir(path) {
    if (typeof bridgeCall !== 'function' || !path)
        return Promise.resolve([]);
    return bridgeCall('fs.listDir', { path }).then((result) => { const data = result.ok === true ? result.value : {}; return Array.isArray(data && data.entries) ? data.entries : []; }).catch(() => []);
}
function scFindSourceVideo(entries) {
    return entries.find((entry) => /\.(mp4|mov|mkv|webm)$/i.test(String(entry.name || ''))) || entries.find((entry) => String(entry.name || '') === 'source.mp4') || null;
}
function scBuildSourceSentences(data, words) {
    const rawSentences = (Array.isArray(data && data.sentences) ? data.sentences : []);
    const rawWords = (Array.isArray(words && words.words) ? words.words : []);
    return rawSentences.map((sentence) => {
        const startSec = Number(sentence && sentence.start);
        const endSec = Number(sentence && sentence.end);
        const sentenceWords = (Array.isArray(sentence && sentence.words) ? sentence.words : rawWords.filter((word) => Number(word && word.end) > startSec && Number(word && word.start) < endSec)).map((word) => scNormalizeWord(word, 0));
        return {
            id: Number(sentence && sentence.id),
            startSec: Number.isFinite(startSec) ? startSec : 0,
            endSec: Number.isFinite(endSec) ? endSec : 0,
            durationSec: Math.max(0, (Number.isFinite(endSec) ? endSec : 0) - (Number.isFinite(startSec) ? startSec : 0)),
            text: String(sentence && sentence.text || ''),
            words: sentenceWords,
            languageRows: scExtractLanguageRows(sentence),
        };
    });
}
function scBuildSourceModel(dirEntry, fileEntries, meta, sentencesData, wordsData, planTitle, index) {
    const videoEntry = scFindSourceVideo(fileEntries);
    const videoPath = videoEntry ? String(videoEntry.path) : '';
    const words = (Array.isArray(wordsData && wordsData.words) ? wordsData.words : []);
    const sentences = scBuildSourceSentences(sentencesData, wordsData);
    const durationSec = Number(meta && meta.duration_sec);
    const fallbackDurationSec = Number(meta && meta.audio_duration_sec);
    const metaFormat = meta && typeof meta.format === 'string' ? meta.format : '';
    const ext = videoPath.split('.').pop() || '';
    return {
        index,
        slug: String(dirEntry.name || ''),
        dirPath: String(dirEntry.path || ''),
        path: videoPath,
        nfUrl: toNfdataUrl(videoPath),
        meta: meta && typeof meta === 'object' ? meta : {},
        title: '',
        planTitle: planTitle || '',
        durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : (Number.isFinite(fallbackDurationSec) && fallbackDurationSec > 0 ? fallbackDurationSec : 0),
        durationLabel: '—',
        formatLabel: metaFormat.trim() ? metaFormat.trim().toUpperCase() : (ext ? ext.toUpperCase() : '—'),
        resolutionLabel: '—',
        totalSentences: Number(sentencesData && sentencesData.total_sentences) || sentences.length,
        totalWords: Number(wordsData && wordsData.total_words) || words.length,
        sentences,
        words,
        clips: [],
    };
}
function scSourceOwnsClip(source, clip) {
    // 1. If cut_report carries explicit source slug → trust it (best signal)
    const clipSource = String(clip && (clip.source || clip.source_slug) || '').trim();
    if (clipSource)
        return clipSource === source.slug;
    // 2. Text-preview match: compare first 20 chars of clip.text_preview to source's sentence[from_id].text
    const fromId = Number(clip && clip.from_id);
    const toId = Number(clip && clip.to_id);
    const first = source.sentences.find((sentence) => sentence.id === fromId);
    const last = source.sentences.find((sentence) => sentence.id === toId);
    if (!first || !last)
        return false;
    const previewHead = String(clip && clip.text_preview || '').split('...')[0].trim().slice(0, 20).toLowerCase();
    const sentenceHead = String(first.text || '').trim().slice(0, 20).toLowerCase();
    if (previewHead && sentenceHead)
        return previewHead.startsWith(sentenceHead.slice(0, 12)) || sentenceHead.startsWith(previewHead.slice(0, 12));
    // 3. Fallback to time-range overlap
    const startSec = Number(clip && clip.start);
    const endSec = Number(clip && clip.end);
    return Number.isFinite(startSec) && Number.isFinite(endSec) && source.sentences.some((sentence) => sentence.endSec > startSec && sentence.startSec < endSec);
}
function scBuildClipModel(source, clip, fileMeta, planMeta, index) {
    const startSec = Number(clip && clip.start);
    const endSec = Number(clip && clip.end);
    const clipSentences = source.sentences.filter((sentence) => sentence.id >= Number(clip && clip.from_id) && sentence.id <= Number(clip && clip.to_id));
    const clipWords = source.words.filter((word) => word.endSec > startSec && word.startSec < endSec).map((word) => scNormalizeWord(word, startSec));
    const sentences = clipSentences.map((sentence) => ({
        id: sentence.id,
        startSec: Math.max(0, sentence.startSec - startSec),
        endSec: Math.max(0, sentence.endSec - startSec),
        absStartSec: sentence.startSec,
        absEndSec: sentence.endSec,
        durationSec: sentence.durationSec,
        text: sentence.text,
        words: (sentence.words.length ? sentence.words : source.words.filter((word) => word.endSec > sentence.startSec && word.startSec < sentence.endSec)).map((word) => scNormalizeWord(word, startSec)),
        languageRows: sentence.languageRows
    }));
    return {
        index,
        clipNum: Number(clip && clip.clip_num) || index + 1,
        title: String(clip && clip.title || planMeta && planMeta.title || fileMeta && fileMeta.name || 'Clip'),
        fileName: String(fileMeta && fileMeta.name || clip && clip.file || ('clip_' + String(index + 1).padStart(2, '0') + '.mp4')),
        path: String(fileMeta && fileMeta.path || ''),
        nfUrl: toNfdataUrl(String(fileMeta && fileMeta.path || '')),
        startSec: Number.isFinite(startSec) ? startSec : 0,
        endSec: Number.isFinite(endSec) ? endSec : 0,
        durationSec: Number(clip && clip.duration) || Math.max(0, (Number.isFinite(endSec) ? endSec : 0) - (Number.isFinite(startSec) ? startSec : 0)),
        timecodeLabel: formatClock(startSec, false) + ' → ' + formatClock(endSec, false),
        sentenceRange: '句 ' + String(clip && clip.from_id || '—') + '-' + String(clip && clip.to_id || '—'),
        fromId: Number(clip && clip.from_id) || 0,
        toId: Number(clip && clip.to_id) || 0,
        sizeLabel: formatBytes(Number(fileMeta && fileMeta.size)),
        textPreview: String(clip && clip.text_preview || ''),
        why: String(planMeta && planMeta.why || ''),
        sentences,
        words: clipWords,
        rawClip: clip && typeof clip === 'object' ? clip : {},
        rawPlan: planMeta && typeof planMeta === 'object' ? planMeta : {},
    };
}
function scAttachClipsToSources(sources, cutReport, plan, clipFiles) {
    const success = (Array.isArray(cutReport && cutReport.success) ? cutReport.success : []);
    const planClips = (Array.isArray(plan && plan.clips) ? plan.clips : []);
    const clipFileMap = {};
    clipFiles.forEach((clip) => { clipFileMap[String(clip.name)] = clip; });
    sources.forEach((source, index) => { source.title = formatSourceTitle(source, index); source.durationLabel = formatClock(source.durationSec, false); source.clips = []; });
    success.forEach((clip) => {
        const matchingSource = sources.find((source) => scSourceOwnsClip(source, clip)) || (sources.length === 1 ? sources[0] : null);
        if (!matchingSource)
            return;
        const planMeta = planClips.find((item) => Number(item && item.from) === Number(clip && clip.from_id) && Number(item && item.to) === Number(clip && clip.to_id)) || planClips.find((item) => Number(item && item.id) === Number(clip && clip.clip_num)) || null;
        matchingSource.clips.push(scBuildClipModel(matchingSource, clip, clipFileMap[String(clip && clip.file || '')] || null, planMeta, matchingSource.clips.length));
    });
    sources.forEach((source) => { source.clips.sort((left, right) => left.startSec - right.startSec || left.clipNum - right.clipNum); source.clips.forEach((clip, index) => { clip.index = index; }); });
    return sources;
}
function scWarmSourceMetadata(source) {
    if (!source || !source.nfUrl || source.metaProbeStarted)
        return;
    source.metaProbeStarted = true;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = source.nfUrl;
    const cleanup = () => { video.removeAttribute('src'); video.load(); };
    video.addEventListener('loadedmetadata', () => {
        if ((!source.durationSec || source.durationSec <= 0) && Number.isFinite(video.duration) && video.duration > 0) {
            source.durationSec = video.duration;
            source.durationLabel = formatClock(source.durationSec, false);
        }
        source.resolutionLabel = formatResolution(video.videoWidth, video.videoHeight);
        if (source.meta && typeof source.meta.format === 'string' && source.meta.format.trim())
            source.formatLabel = source.meta.format.trim();
        if (Number(source.meta && source.meta.duration_sec) > 0) {
            source.durationSec = Number(source.meta.duration_sec);
            source.durationLabel = formatClock(source.durationSec, false);
        }
        scRenderSidebar();
        if (scSources[scActiveSource] === source)
            scRenderMain();
        cleanup();
    }, { once: true });
    video.addEventListener('error', cleanup, { once: true });
}
function scRenderSidebar() {
    const root = document.getElementById('sc-source-list');
    if (!root)
        return;
    let html = '<div class="sc-sidebar-title">源视频</div>';
    if (!scSources.length) {
        root.innerHTML = html + '<div class="sc-empty">暂无源视频</div>';
        return;
    }
    html += scSources.map((source, index) => {
        const active = index === scActiveSource ? ' active' : '';
        return '<button class="sc-src-item' + active + '" type="button" data-nf-action="select-smart-source" onclick="scSelectSource(' + index + ')">' +
            '<span class="sc-src-name">' + escapeHtml(source.title) + '</span>' +
            '<span class="sc-src-meta"><span>' + escapeHtml(source.durationLabel || '—') + '</span><span>' + escapeHtml(source.resolutionLabel || '—') + '</span><span>' + escapeHtml(source.formatLabel || '—') + '</span></span>' +
            '<span class="sc-src-count">' + source.clips.length + ' clips · ' + (source.totalSentences || 0) + ' 句</span></button>';
    }).join('');
    root.innerHTML = html;
}
function scRenderTimeline(clips, source) {
    const durationSec = Number(source && source.durationSec);
    if (!Number.isFinite(durationSec) || durationSec <= 0)
        return '';
    const ticks = Array.from({ length: 6 }, (_item, index) => formatClock(durationSec * (index / 5), false));
    const regions = clips.map((clipModel) => {
        const left = (clipModel.startSec / durationSec) * 100;
        const width = ((clipModel.endSec - clipModel.startSec) / durationSec) * 100;
        const color = scTimelineColors[clipModel.index % scTimelineColors.length];
        return '<button class="sc-tl-region" type="button" data-nf-action="focus-smart-clip" onclick="document.getElementById(\'sc-clip-' + clipModel.index + '\')?.scrollIntoView({block:\'start\',behavior:\'smooth\'})" style="left:' + left.toFixed(2) + '%;width:' + Math.max(width, 1).toFixed(2) + '%;background:' + color + '"><span class="sc-tl-region-label">' + String(clipModel.clipNum).padStart(2, '0') + '</span></button>';
    }).join('');
    return '<div class="glass sc-timeline"><div class="sc-tl-label">时间轴 · 切片分布</div><div class="sc-tl-bar">' + regions + '</div><div class="sc-tl-ticks">' + ticks.map((tick) => '<span class="sc-tl-tick">' + tick + '</span>').join('') + '</div></div>';
}
function scRenderClipSentence(clipIndex, sentence, sentenceIndex) {
    const rows = (sentence.languageRows && sentence.languageRows.length ? sentence.languageRows : [{ label: 'EN', text: sentence.text || '字幕缺失', primary: true }]).filter((row) => row.primary || row.text).map((row) => '<div class="sc-sent-lang-row"><span class="sc-sent-lang-label">' + escapeHtml(row.label) + '</span><span class="' + (row.primary ? 'sc-sent-text' : 'sc-sent-trans') + '">' + escapeHtml(row.text) + '</span></div>').join('');
    return '<button class="sc-sent-row' + (sentenceIndex === 0 ? ' active' : '') + '" type="button" data-nf-action="seek-smart-sentence" onclick="scOpenClipSentence(' + clipIndex + ',' + sentenceIndex + ')"><span class="sc-sent-tc">' + formatClock(sentence.startSec, true) + '</span><div class="sc-sent-content">' + rows + '</div><span class="sc-sent-dur">' + sentence.durationSec.toFixed(1) + 's</span></button>';
}
function scRenderMain() {
    const root = document.getElementById('sc-main');
    if (!root)
        return;
    const source = scSources[scActiveSource];
    if (!source) {
        scRenderedClips = [];
        root.innerHTML = '<div class="sc-empty">暂无源视频</div>';
        return;
    }
    scRenderedClips = Array.isArray(source.clips) ? source.clips : [];
    scRenderSidebar();
    const tags = [
        '<span class="sc-tag sc-tag-warm">' + escapeHtml(source.durationLabel || '—') + '</span>',
        '<span class="sc-tag sc-tag-default">' + escapeHtml(source.resolutionLabel || '—') + '</span>',
        '<span class="sc-tag sc-tag-default">' + escapeHtml(source.formatLabel || '—') + '</span>',
        '<span class="sc-tag sc-tag-accent">' + (source.totalSentences || 0) + ' sentences</span>',
        '<span class="sc-tag sc-tag-accent">' + scRenderedClips.length + ' clips</span>',
    ].join('');
    const timelineHtml = scRenderedClips.length ? scRenderTimeline(scRenderedClips, source) : '';
    const cardsHtml = scRenderedClips.length ? scRenderedClips.map((clipModel) => '<div class="sc-clip-card' + (clipModel.index === 0 ? ' active' : '') + '" id="sc-clip-' + clipModel.index + '">' +
        '<div class="sc-clip-top"><span class="sc-clip-num">' + clipModel.clipNum + '</span><span class="sc-clip-name">' + escapeHtml(clipModel.title) + '</span><span class="sc-clip-dur">' + Math.round(clipModel.durationSec) + 's</span><span class="sc-clip-tc">' + clipModel.timecodeLabel + '</span></div>' +
        '<div class="sc-clip-body"><button class="sc-clip-video" type="button" data-nf-action="preview-smart-clip" onclick="scOpenPlayer(' + clipModel.index + ')"><video src="' + escapeHtml(clipModel.nfUrl) + '" preload="auto" muted playsinline onloadedmetadata="this.currentTime=0.1"></video><span class="sc-play-overlay"><span class="sc-play-circle">&#9654;</span></span></button><div class="sc-sentences">' + clipModel.sentences.map((sentence, sentenceIndex) => scRenderClipSentence(clipModel.index, sentence, sentenceIndex)).join('') + '</div></div>' +
        '<div class="sc-meta-bar"><span class="sc-meta-tag">' + escapeHtml(clipModel.sentenceRange) + '</span><span class="sc-meta-tag">duration ' + formatClock(clipModel.durationSec, true) + '</span><span class="sc-meta-tag">' + escapeHtml(clipModel.sizeLabel) + '</span><button class="sc-more-btn" type="button" data-nf-action="open-smart-clip-meta" onclick="scOpenMeta(' + clipModel.index + ')">更多 ↗</button></div></div>').join('') : '<div class="sc-empty">暂无切片数据</div>';
    root.innerHTML = '<div class="sc-detail-header"><div class="sc-detail-top"><div><div class="sc-detail-name">' + escapeHtml(source.title) + '</div><div class="sc-detail-meta">' + scRenderedClips.length + ' clips · ' + (source.totalSentences || 0) + ' sentences</div></div><button class="sc-preview-btn" type="button" data-nf-action="preview-smart-source" onclick="scOpenSourcePlayer()">&#9654; 预览原视频</button></div><div class="sc-detail-path">' + escapeHtml(source.path || source.dirPath) + '</div><div class="sc-detail-tags">' + tags + '</div></div>' + timelineHtml + '<div class="sc-clip-scroll">' + cardsHtml + '</div>';
}
function scRenderCurrentSentence(subtitleEl, sentence, emptyText) {
    const emptyResult = { words: [], spans: [], states: [], key: '' };
    if (!subtitleEl)
        return emptyResult;
    if (!sentence) {
        subtitleEl.innerHTML = scRenderEmptySubtitle(emptyText);
        return emptyResult;
    }
    const rows = (sentence.languageRows && sentence.languageRows.length ? sentence.languageRows : [{ label: 'EN', text: sentence.text || '', primary: true }]).filter((row) => row.primary || row.text);
    const primaryRow = rows.find((row) => row.primary) || rows[0] || { label: 'EN', text: sentence.text || '', primary: true };
    const translationRows = rows.filter((row) => row !== primaryRow && !row.primary && row.text);
    const words = (Array.isArray(sentence.words) && sentence.words.length ? sentence.words : [{ text: primaryRow.text || sentence.text || '···', startSec: sentence.startSec, endSec: sentence.endSec }]);
    subtitleEl.innerHTML = '<div class="sc-modal-sub-lang-row"><span class="sc-modal-sub-lang-label">' + escapeHtml(primaryRow.label || 'EN') + '</span><span class="sc-modal-sub-original">' + words.map((word) => '<span class="sc-modal-word sc-word-pending">' + escapeHtml(word.text) + '</span>').join(' ') + '</span></div>' + translationRows.map((row) => '<div class="sc-modal-sub-lang-row"><span class="sc-modal-sub-lang-label">' + escapeHtml(row.label) + '</span><span class="sc-modal-sub-trans">' + escapeHtml(row.text) + '</span></div>').join('');
    return { words, spans: Array.from(subtitleEl.querySelectorAll('.sc-modal-word')), states: words.map(() => ''), key: String(sentence.id) + '-' + String(sentence.startSec) };
}
function scBindPlayer(video, playback) {
    const subtitleEl = document.getElementById('sc-modal-subtitle');
    const currentEl = document.getElementById('sc-modal-current');
    const totalEl = document.getElementById('sc-modal-total');
    const fillEl = document.getElementById('sc-modal-progress-fill');
    const titleEl = document.getElementById('sc-modal-title');
    const progressEl = document.getElementById('sc-modal-progress');
    if (!video || !subtitleEl || !currentEl || !totalEl || !fillEl || !titleEl || !progressEl)
        return;
    const v = video;
    const curEl = currentEl;
    const totEl = totalEl;
    const fEl = fillEl;
    const pEl = progressEl;
    titleEl.textContent = playback.title || '';
    let subtitleState = { words: [], spans: [], states: [], key: '' };
    let rafId = 0;
    let pendingSeek = Number.isFinite(playback.seekSec) ? playback.seekSec : null;
    function activeSentenceAt(current) { return playback.sentences.find((sentence) => current >= sentence.startSec && current <= sentence.endSec) || null; }
    function updateWordClasses(current) {
        if (!subtitleState.words.length || subtitleState.words.length !== subtitleState.spans.length)
            return;
        subtitleState.words.forEach((word, index) => {
            const nextClass = word.endSec < current ? 'sc-word-done' : (word.startSec <= current && current <= word.endSec ? 'sc-word-now' : 'sc-word-pending');
            if (subtitleState.states[index] !== nextClass) {
                subtitleState.states[index] = nextClass;
                subtitleState.spans[index].className = 'sc-modal-word ' + nextClass;
            }
        });
    }
    function sync() {
        const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (Number(playback.durationSec) || 0);
        const current = Number.isFinite(v.currentTime) ? v.currentTime : 0;
        curEl.textContent = formatClock(current, true);
        totEl.textContent = formatClock(duration, true);
        fEl.style.width = duration ? ((current / duration) * 100).toFixed(2) + '%' : '0%';
        const sentence = activeSentenceAt(current);
        const sentenceKey = sentence ? String(sentence.id) + '-' + String(sentence.startSec) : '';
        if (sentenceKey !== subtitleState.key)
            subtitleState = scRenderCurrentSentence(subtitleEl, sentence, playback.emptyText || '···');
        updateWordClasses(current);
    }
    function tick() { sync(); rafId = window.requestAnimationFrame(tick); }
    function onLoaded() { const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (Number(playback.durationSec) || 0); if (pendingSeek != null) {
        v.currentTime = Math.max(0, Math.min(duration || pendingSeek, pendingSeek));
        pendingSeek = null;
    } sync(); }
    function onProgressClick(event) { const rect = pEl.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)); const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (Number(playback.durationSec) || 0); if (duration)
        v.currentTime = ratio * duration; }
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('seeked', sync);
    v.addEventListener('pause', sync);
    v.addEventListener('timeupdate', sync);
    pEl.addEventListener('click', onProgressClick);
    sync();
    tick();
    scPlayerCleanup = function () { window.cancelAnimationFrame(rafId); v.pause(); v.removeEventListener('loadedmetadata', onLoaded); v.removeEventListener('seeked', sync); v.removeEventListener('pause', sync); v.removeEventListener('timeupdate', sync); pEl.removeEventListener('click', onProgressClick); };
}
function scOpenPlayer(index, seekSec) {
    const clipModel = scRenderedClips[index];
    const overlay = document.getElementById('sc-player-modal');
    const panel = document.getElementById('sc-player-panel');
    if (!clipModel || !overlay || !panel)
        return;
    if (typeof scPlayerCleanup === 'function')
        scPlayerCleanup();
    panel.innerHTML = '<button class="sc-modal-close" type="button" data-nf-action="close-smart-player" onclick="scClosePlayer()">&times;</button><div class="sc-modal-video-shell"><video id="sc-modal-video" src="' + escapeHtml(clipModel.nfUrl) + '" controls autoplay playsinline></video></div><div class="sc-modal-subtitle" id="sc-modal-subtitle"></div><div class="sc-modal-transport"><div class="sc-modal-progress" id="sc-modal-progress"><div class="sc-modal-progress-fill" id="sc-modal-progress-fill"></div></div><div class="sc-modal-meta"><span class="sc-modal-tc" id="sc-modal-current">00:00.0</span><span class="sc-modal-clip-name" id="sc-modal-title"></span><span class="sc-modal-tc" id="sc-modal-total">00:00.0</span></div></div>';
    overlay.classList.add('open');
    scBindPlayer(document.getElementById('sc-modal-video'), { title: clipModel.title, sentences: clipModel.sentences, durationSec: clipModel.durationSec, seekSec: Number(seekSec), emptyText: '···' });
}
function scOpenClipSentence(clipIndex, sentenceIndex) {
    const clip = scRenderedClips[clipIndex];
    const sentence = clip && clip.sentences && clip.sentences[sentenceIndex];
    if (!clip || !sentence)
        return;
    scOpenPlayer(clipIndex, sentence.startSec);
}
function scOpenSourcePlayer(seekSec) {
    const source = scSources[scActiveSource];
    const overlay = document.getElementById('sc-player-modal');
    const panel = document.getElementById('sc-player-panel');
    if (!source || !overlay || !panel)
        return;
    if (typeof scPlayerCleanup === 'function')
        scPlayerCleanup();
    panel.innerHTML = '<button class="sc-modal-close" type="button" data-nf-action="close-smart-player" onclick="scClosePlayer()">&times;</button><div class="sc-modal-video-shell"><video id="sc-modal-video" src="' + escapeHtml(source.nfUrl) + '" controls autoplay playsinline></video></div><div class="sc-modal-subtitle" id="sc-modal-subtitle"></div><div class="sc-modal-transport"><div class="sc-modal-progress" id="sc-modal-progress"><div class="sc-modal-progress-fill" id="sc-modal-progress-fill"></div></div><div class="sc-modal-meta"><span class="sc-modal-tc" id="sc-modal-current">00:00.0</span><span class="sc-modal-clip-name" id="sc-modal-title"></span><span class="sc-modal-tc" id="sc-modal-total">00:00.0</span></div></div>';
    overlay.classList.add('open');
    scBindPlayer(document.getElementById('sc-modal-video'), { title: source.title + ' · ' + (source.resolutionLabel !== '—' ? source.resolutionLabel : source.formatLabel), sentences: source.sentences, durationSec: source.durationSec, seekSec: Number(seekSec), emptyText: '原视频预览' });
}
function scClosePlayer() { const overlay = document.getElementById('sc-player-modal'); if (typeof scPlayerCleanup === 'function') {
    scPlayerCleanup();
    scPlayerCleanup = null;
} if (overlay)
    overlay.classList.remove('open'); }
function scOpenMeta(index) {
    const clipModel = scRenderedClips[index];
    const overlay = document.getElementById('sc-meta-modal');
    const panel = document.getElementById('sc-meta-panel');
    if (!clipModel || !overlay || !panel)
        return;
    const metaObject = { title: clipModel.title, why: clipModel.why, source_sentence_range: clipModel.sentenceRange, source_timecode: clipModel.timecodeLabel, duration: formatClock(clipModel.durationSec, true), file_size: clipModel.sizeLabel, file: clipModel.fileName, path: clipModel.path, text_preview: clipModel.textPreview };
    Object.keys(clipModel.rawClip || {}).forEach((key) => { if (metaObject[key] == null || metaObject[key] === '')
        metaObject[key] = clipModel.rawClip[key]; });
    Object.keys(clipModel.rawPlan || {}).forEach((key) => { if (metaObject[key] == null || metaObject[key] === '')
        metaObject[key] = clipModel.rawPlan[key]; });
    const rows = Object.keys(metaObject).filter((key) => stringifyMeta(metaObject[key])).map((key) => [key, stringifyMeta(metaObject[key])]);
    panel.innerHTML = '<button class="sc-modal-close" type="button" data-nf-action="close-smart-clip-meta" onclick="scCloseMeta()">&times;</button><div class="sc-meta-title">' + escapeHtml(clipModel.fileName) + ' · 元信息</div>' + rows.map((row) => '<div class="sc-meta-row"><span class="sc-meta-key">' + escapeHtml(row[0]) + '</span><span class="sc-meta-val">' + escapeHtml(row[1]) + '</span></div>').join('');
    overlay.classList.add('open');
}
function scCloseMeta() { const overlay = document.getElementById('sc-meta-modal'); if (overlay)
    overlay.classList.remove('open'); }
function scHandlePlayerOverlay(event) { if (event.target && event.target.id === 'sc-player-modal')
    scClosePlayer(); }
function scHandleMetaOverlay(event) { if (event.target && event.target.id === 'sc-meta-modal')
    scCloseMeta(); }
function scSelectSource(index) { scActiveSource = index; scRenderMain(); }
async function loadSmartClips() {
    const sidebar = document.getElementById('sc-source-list');
    const main = document.getElementById('sc-main');
    if (!sidebar || !main)
        return;
    if (typeof bridgeCall !== 'function' || !window.currentEpisodePath) {
        sidebar.innerHTML = '<div class="sc-sidebar-title">源视频</div><div class="sc-empty">桌面桥接未就绪</div>';
        main.innerHTML = '<div class="sc-empty">无法读取当前剧集数据</div>';
        return;
    }
    const token = ++scLoadToken;
    const episodePath = window.currentEpisodePath;
    const sourcesDir = episodePath + '/sources';
    sidebar.innerHTML = '<div class="sc-sidebar-title">源视频</div><div class="sc-empty">加载中…</div>';
    main.innerHTML = '<div class="sc-empty">正在读取真实切片数据…</div>';
    const [sourceEntries, cutReport, plan, clipResult] = await Promise.all([
        scListDir(sourcesDir),
        scReadJson(episodePath + '/clips/cut_report.json', { success: [], failed: [] }),
        scReadJson(episodePath + '/plan.json', { clips: [] }),
        bridgeCall('source.clips', { episode: episodePath }).then((r) => r.ok === true ? r.value : { clips: [] }).catch(() => ({ clips: [] })),
    ]);
    if (token !== scLoadToken)
        return;
    const dirs = sourceEntries.filter((entry) => entry && entry.isDir && !String(entry.name || '').startsWith('.'));
    const planTitle = typeof (plan && plan.source) === 'string' ? plan.source : '';
    const sources = (await Promise.all(dirs.map(async (dirEntry, index) => {
        const fileEntries = await scListDir(String(dirEntry.path));
        const [meta, sentencesData, wordsData] = await Promise.all([
            scReadJson(String(dirEntry.path) + '/meta.json', {}),
            scReadJson(String(dirEntry.path) + '/sentences.json', { sentences: [] }),
            scReadJson(String(dirEntry.path) + '/words.json', { words: [] }),
        ]);
        return scBuildSourceModel(dirEntry, fileEntries, meta, sentencesData, wordsData, dirs.length === 1 ? planTitle : '', index);
    }))).filter((source) => source && source.path);
    if (token !== scLoadToken)
        return;
    const clipResultObj = clipResult;
    scSources = scAttachClipsToSources(sources, cutReport, plan, Array.isArray(clipResultObj && clipResultObj.clips) ? clipResultObj.clips : []);
    scActiveSource = 0;
    scRenderedClips = [];
    if (!scSources.length) {
        scRenderSidebar();
        scRenderMain();
        return;
    }
    await scLoadClipTranslations(episodePath);
    scSources.forEach(scWarmSourceMetadata);
    if (scSources.length === 1 && !scSources[0].title) {
        scSources[0].title = planTitle || humanizeSlug(scSources[0].slug);
    }
    if (!scSources[0].title)
        scSources[0].title = formatSourceTitle(scSources[0], 0);
    scSources.forEach((source, index) => { if (!source.title)
        source.title = formatSourceTitle(source, index); if (!source.durationLabel || source.durationLabel === '—')
        source.durationLabel = formatClock(source.durationSec, false); if (source.meta && typeof source.meta.format === 'string' && source.meta.format.trim())
        source.formatLabel = source.meta.format.trim(); });
    scRenderSidebar();
    scRenderMain();
}
// Load per-clip translation files (clip_NN.translations.<lang>.json) and merge into clip sentence languageRows.
// This supports the clips pipeline output format independent of sentences.json embedding.
async function scLoadClipTranslations(episodePath) {
    const clipsDir = episodePath + '/clips';
    let entries = [];
    try {
        const list = await bridgeCall('fs.listDir', { path: clipsDir });
        const listVal = list.ok === true ? list.value : null;
        entries = Array.isArray(listVal?.entries) ? listVal.entries : [];
    }
    catch (_e) { }
    const availableLangs = new Set();
    entries.forEach((entry) => { const m = String(entry && entry.name || '').match(/^clip_\d+\.translations\.([a-z]{2})\.json$/i); if (m)
        availableLangs.add(m[1].toLowerCase()); });
    if (!availableLangs.size)
        return;
    await Promise.all(scSources.flatMap((source) => source.clips.map(async (clip) => {
        const pad = String(clip.clipNum).padStart(2, '0');
        for (const lang of availableLangs) {
            const path = clipsDir + '/clip_' + pad + '.translations.' + lang + '.json';
            const data = await scReadJson(path, null);
            if (!data || !Array.isArray(data.segments))
                continue;
            const label = langLabel(String(lang));
            data.segments.forEach((seg) => {
                const sentence = clip.sentences.find((s) => s.id === seg.id);
                if (!sentence)
                    return;
                const cnCues = Array.isArray(seg.cn) ? seg.cn : [];
                const text = cnCues.map((cue) => typeof cue === 'string' ? cue : String(cue && cue.text || '')).join('');
                if (!text)
                    return;
                const existing = sentence.languageRows.find((r) => r.label === label);
                if (existing) {
                    existing.text = text;
                }
                else {
                    sentence.languageRows.push({ label, text, primary: false });
                }
            });
        }
    })));
}
window.loadSmartClips = loadSmartClips;
window.scSelectSource = scSelectSource;
window.scOpenPlayer = scOpenPlayer;
window.scOpenClipSentence = scOpenClipSentence;
window.scOpenSourcePlayer = scOpenSourcePlayer;
window.scClosePlayer = scClosePlayer;
window.scOpenMeta = scOpenMeta;
window.scCloseMeta = scCloseMeta;
window.scHandlePlayerOverlay = scHandlePlayerOverlay;
window.scHandleMetaOverlay = scHandleMetaOverlay;
