// Preview bug scanner: load demo, check diagnose, test seek + drag + ratios.
(async function () {
  const log = (k, v) => { window.__r1Result = (window.__r1Result || '') + k + '=' + JSON.stringify(v) + '\n'; };
  async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  try {
    // 1. navigate to a project+episode's editor
    if (typeof showView === 'function') { showView('home'); }
    await wait(300);
    const cards = document.querySelectorAll('.project-card');
    log('projectCards', cards.length);
    if (cards.length) { cards[0].click(); await wait(800); }
    const eps = document.querySelectorAll('.vp-ep-card');
    log('episodes', eps.length);
    if (eps.length) { eps[0].click(); await wait(1500); }
    const editorTab = document.querySelector('[data-stage="assembly"]');
    log('editorTabFound', !!editorTab);
    if (editorTab) { editorTab.click(); await wait(2500); }

    // 2. diagnose state
    const diag = typeof window.__nfEditorDiagnose === 'function' ? JSON.parse(window.__nfEditorDiagnose()) : null;
    log('diagnose', diag);

    window.__screenshot('/Users/Zhuanz/bigbang/NextFrame/tmp/preview-initial.png');

    // 3. stage scaling check (16:9)
    const stage = document.getElementById('preview-stage');
    const canvas = document.querySelector('.ed-preview-canvas');
    if (stage && canvas) {
      const sr = stage.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      log('canvas', { w: cr.width, h: cr.height });
      log('stageRect', { w: sr.width, h: sr.height, left: sr.left - cr.left, top: sr.top - cr.top });
      log('stageStyle', { w: stage.style.width, h: stage.style.height, transform: stage.style.transform });
      // overflow check: stage bottom-right must be within canvas
      log('overflowRight', sr.right > cr.right + 1);
      log('overflowBottom', sr.bottom > cr.bottom + 1);
    } else {
      log('stageOrCanvas', 'MISSING');
    }

    // 4. seek test — click ruler middle
    const ruler = document.getElementById('ed-tl-ruler2');
    if (ruler) {
      const r = ruler.getBoundingClientRect();
      const ev = new MouseEvent('click', { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, bubbles: true });
      ruler.dispatchEvent(ev);
      await wait(500);
      const st = window.previewEngine && window.previewEngine.getState ? window.previewEngine.getState() : null;
      log('afterSeekState', st);
      window.__screenshot('/Users/Zhuanz/bigbang/NextFrame/tmp/preview-after-seek.png');
    } else {
      log('ruler', 'MISSING');
    }

    // 5. playhead drag test
    const playhead = document.getElementById('ed-tl-playhead2');
    const hit = playhead ? playhead.querySelector('.ed-tl-playhead-hit') : null;
    log('playheadHit', !!hit);
    if (hit) {
      const tl = document.querySelector('.ed-timeline');
      const tlr = tl.getBoundingClientRect();
      const downX = tlr.left + 100 + (tlr.width - 100) * 0.2;
      const upX = tlr.left + 100 + (tlr.width - 100) * 0.8;
      hit.dispatchEvent(new PointerEvent('pointerdown', { clientX: downX, clientY: tlr.top + 10, bubbles: true, pointerId: 1 }));
      await wait(50);
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: upX, clientY: tlr.top + 10, bubbles: true, pointerId: 1 }));
      await wait(200);
      document.dispatchEvent(new PointerEvent('pointerup', { clientX: upX, clientY: tlr.top + 10, bubbles: true, pointerId: 1 }));
      await wait(500);
      const st2 = window.previewEngine && window.previewEngine.getState ? window.previewEngine.getState() : null;
      log('afterDragState', st2);
      window.__screenshot('/Users/Zhuanz/bigbang/NextFrame/tmp/preview-after-drag.png');
    }

    // 6. ratio test — load a 9:16 timeline
    try {
      const resp = await fetch('data/demo-timeline-9x16.json', { cache: 'no-store' });
      const data = await resp.json();
      log('load9x16', { w: data.width, h: data.height });
      if (typeof window.loadEditorTimeline === 'function') {
        await window.loadEditorTimeline(data);
        await wait(1500);
        const stage2 = document.getElementById('preview-stage');
        const canvas2 = document.querySelector('.ed-preview-canvas');
        if (stage2 && canvas2) {
          const sr2 = stage2.getBoundingClientRect();
          const cr2 = canvas2.getBoundingClientRect();
          log('9x16StageRect', { w: sr2.width, h: sr2.height, transform: stage2.style.transform });
          log('9x16overflow', sr2.right > cr2.right + 1 || sr2.bottom > cr2.bottom + 1);
        }
        window.__screenshot('/Users/Zhuanz/bigbang/NextFrame/tmp/preview-9x16.png');
      }
    } catch (e) { log('9x16Err', String(e)); }
  } catch (e) {
    log('ERR', String(e) + (e.stack || ''));
  } finally {
    window.__evalDone = true;
  }
})();
