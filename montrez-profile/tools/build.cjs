/* Build the Montrez company profile PDF and run the in-browser quality gate.
 *
 *   node tools/build.cjs [--out <pdf>] [--report <json>] [--variable-fonts]
 *
 * 1. Opens montrez-company-profile.html in Chromium with print media.
 * 2. Waits for the Google Fonts (document.fonts.ready) and the ticket frames.
 * 3. Checks every printed string against tools/copy.json, the 10 mm edge
 *    rule, the 20 mm side margins, overflow, overlaps, single-word last lines,
 *    equal card heights, and measures empty space on every page.
 * 4. Prints A4 with backgrounds and the CSS page size, tagged.
 * 5. Sets the viewer title preference and runs tools/qa_pdf.py on the
 *    finished PDF (copy, links, fonts, title, page size).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const outPdf = path.resolve(opt('--out', path.join(root, 'Montrez-Company-Profile-Zimbabwe.pdf')));
const reportPath = opt('--report', null);
const copy = JSON.parse(fs.readFileSync(path.join(__dirname, 'copy.json'), 'utf8'));

(async () => {
  const browser = await chromium.launch();
  // Google Fonts sends modern browsers variable fonts, which Chromium's PDF
  // backend can only embed as Type 3 glyph procedures.  Identifying as a
  // browser without variable-font support makes Google send the static
  // instances of the same families, which embed as real TrueType subsets
  // (crisp, searchable, preflight-clean).  The HTML itself is unchanged.
  const context = await browser.newContext(Object.assign(
    { viewport: { width: 1000, height: 1400 } },
    args.includes('--variable-fonts') ? {} : {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:60.0) Gecko/20100101 Firefox/60.0',
    }));
  const page = await context.newPage();
  await page.emulateMedia({ media: 'print' });
  await page.goto('file://' + path.join(root, 'montrez-company-profile.html'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ready') === '1');
  await page.evaluate(() => document.fonts.ready);

  const report = await page.evaluate((copy) => {
    const MM = 96 / 25.4;
    const out = { errors: [], warnings: [], fonts: [], pages: {}, metrics: {} };
    const err = (m) => out.errors.push(m);
    const norm = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

    // ---- fonts actually in use -------------------------------------------
    document.fonts.forEach((f) => {
      if (f.status === 'loaded') out.fonts.push(`${f.family} ${f.weight} ${f.style}`);
    });
    const need = ['300 10pt "Jost"', '400 10pt "Jost"', '300 10pt "Cormorant Garamond"',
      '400 10pt "Cormorant Garamond"', 'italic 300 10pt "Cormorant Garamond"', 'italic 400 10pt "Cormorant Garamond"'];
    need.forEach((n) => { if (!document.fonts.check(n)) err('font not loaded: ' + n); });

    const sections = [...document.querySelectorAll('section.page')];
    if (sections.length !== 4) err('expected 4 pages, found ' + sections.length);

    sections.forEach((sec) => {
      const pn = sec.dataset.page;
      const pr = sec.getBoundingClientRect();
      const P = { copy: [], runts: [], textRects: 0 };
      out.pages[pn] = P;

      // ---- copy match -----------------------------------------------------
      const expected = copy.pages[pn] || [];
      const seen = new Set();
      expected.forEach(([key, text]) => {
        const els = sec.querySelectorAll(`[data-copy="${key}"]`);
        if (els.length !== 1) { err(`p${pn}: ${key} found ${els.length} times`); return; }
        const got = norm(els[0].textContent);
        if (got !== text) err(`p${pn}: ${key} mismatch\n   got: ${got}\n  want: ${text}`);
        seen.add(key);
      });
      sec.querySelectorAll('[data-copy]').forEach((el) => {
        const k = el.dataset.copy;
        if (el.parentElement.closest('[data-copy]')) err(`p${pn}: nested data-copy ${k}`);
        if (seen.has(k)) return;
        const t = norm(el.textContent);
        if (k === 'footer' && t === copy.allowed_additions[4]) return;
        if (k === 'folio' && t === '0' + pn) return;
        err(`p${pn}: unexpected printed text [${k}] "${t}"`);
      });
      // stray text outside any approved element
      const tw = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = tw.nextNode())) {
        if (!norm(node.textContent)) continue;
        if (node.parentElement.closest('script,style')) continue;
        if (!node.parentElement.closest('[data-copy]')) err(`p${pn}: stray text "${norm(node.textContent)}"`);
      }

      // ---- text geometry ---------------------------------------------------
      const rects = [];
      const tw2 = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      while ((node = tw2.nextNode())) {
        if (!norm(node.textContent)) continue;
        const owner = node.parentElement.closest('[data-copy]');
        const r = document.createRange();
        r.selectNodeContents(node);
        [...r.getClientRects()].forEach((cr) => {
          if (cr.width < 0.5) return;
          rects.push({ owner, key: owner ? owner.dataset.copy : '?',
            x0: (cr.left - pr.left) / MM, x1: (cr.right - pr.left) / MM,
            y0: (cr.top - pr.top) / MM, y1: (cr.bottom - pr.top) / MM });
        });
      }
      P.textRects = rects.length;
      rects.forEach((q) => {
        if (q.x0 < 10 || q.x1 > 200 || q.y0 < 10 || q.y1 > 287)
          err(`p${pn}: text within 10 mm of edge [${q.key}] x ${q.x0.toFixed(1)}-${q.x1.toFixed(1)} y ${q.y0.toFixed(1)}-${q.y1.toFixed(1)}`);
        if (q.x0 < 19.6 || q.x1 > 190.4)
          err(`p${pn}: text outside 20 mm side margins [${q.key}] x ${q.x0.toFixed(2)}-${q.x1.toFixed(2)}`);
      });
      // overlaps between different elements
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.owner === b.owner) continue;
          const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          if (ox > 0.2 && oy > 0.2) err(`p${pn}: overlap [${a.key}] x [${b.key}] (${ox.toFixed(1)} x ${oy.toFixed(1)} mm)`);
        }
      }

      // ---- overflow ----------------------------------------------------------
      sec.querySelectorAll('*').forEach((el) => {
        if (el.closest('svg')) return;
        const cs = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline' && el.clientWidth > 0)
          err(`p${pn}: horizontal overflow in <${el.tagName.toLowerCase()} class="${el.className}">`);
      });
      const pb = sec.getBoundingClientRect();
      sec.querySelectorAll('[data-copy]').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.bottom > pb.bottom + 0.5 || b.right > pb.right + 0.5) err(`p${pn}: ${el.dataset.copy} leaves the page`);
      });
      // text must stay inside its card / band / column container
      sec.querySelectorAll('.desk, .circle-in, .p2-col, .p2-main, .p4-letter, .p4-dark, .cta, .board-row').forEach((box) => {
        const bb = box.getBoundingClientRect();
        box.querySelectorAll('[data-copy]').forEach((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          [...r.getClientRects()].forEach((cr) => {
            if (cr.width < 0.5) return;
            if (cr.left < bb.left - 0.5 || cr.right > bb.right + 0.5 || cr.top < bb.top - 0.5 || cr.bottom > bb.bottom + 0.5)
              err(`p${pn}: ${el.dataset.copy} spills out of .${box.className.split(' ')[0]}`);
          });
        });
      });

      // ---- single-word last lines (runts) and line counts --------------------
      sec.querySelectorAll('[data-copy]').forEach((el) => {
        const words = [];
        const w3 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let tn;
        while ((tn = w3.nextNode())) {
          const s = tn.textContent;
          const re = /\S+/g;
          let m;
          while ((m = re.exec(s))) {
            const r = document.createRange();
            r.setStart(tn, m.index);
            r.setEnd(tn, m.index + m[0].length);
            const cr = r.getBoundingClientRect();
            words.push({ w: m[0], top: cr.top, bottom: cr.bottom });
          }
        }
        if (!words.length) return;
        // group words into lines by vertical overlap
        const lines = [];
        words.forEach((w) => {
          const L = lines[lines.length - 1];
          const mid = (w.top + w.bottom) / 2;
          if (L && mid > L.top - 1 && mid < L.bottom + 1) { L.words.push(w.w); L.top = Math.min(L.top, w.top); L.bottom = Math.max(L.bottom, w.bottom); }
          else lines.push({ top: w.top, bottom: w.bottom, words: [w.w] });
        });
        P.copy.push({ key: el.dataset.copy, lines: lines.length, last: lines[lines.length - 1].words.join(' ') });
        if (lines.length > 1 && lines[lines.length - 1].words.length === 1) {
          P.runts.push(el.dataset.copy);
          err(`p${pn}: single-word last line in ${el.dataset.copy}: "${lines[lines.length - 1].words[0]}"`);
        }
      });

      // ---- empty space: 0.5 mm grid, text dilated by 1 mm --------------------
      const G = 0.5, GW = Math.round(210 / G), GH = Math.round(297 / G);
      const grid = new Uint8Array(GW * GH);
      const mark = (x0, y0, x1, y1) => {
        const a = Math.max(0, Math.floor(x0 / G)), b = Math.min(GW, Math.ceil(x1 / G));
        const c = Math.max(0, Math.floor(y0 / G)), d = Math.min(GH, Math.ceil(y1 / G));
        for (let y = c; y < d; y++) for (let x = a; x < b; x++) grid[y * GW + x] = 1;
      };
      const box = (el, pad) => {
        const b = el.getBoundingClientRect();
        mark((b.left - pr.left) / MM - pad, (b.top - pr.top) / MM - pad, (b.right - pr.left) / MM + pad, (b.bottom - pr.top) / MM + pad);
      };
      rects.forEach((q) => mark(q.x0 - 1, q.y0 - 1, q.x1 + 1, q.y1 + 1));
      sec.querySelectorAll('img, .btn, .circle, .arc, .chrome-rule').forEach((el) => box(el, 0.5));
      // hairlines and frames count as ink, not their empty interiors
      sec.querySelectorAll('.pr, .desk-list li, .board, .board-row').forEach((el) => {
        const b = el.getBoundingClientRect();
        const x0 = (b.left - pr.left) / MM, x1 = (b.right - pr.left) / MM, y0 = (b.top - pr.top) / MM, y1 = (b.bottom - pr.top) / MM;
        mark(x0, y0 - 0.5, x1, y0 + 0.5);
        if (el.classList.contains('board-row')) mark(x0, y1 - 0.5, x1, y1 + 0.5);
      });
      sec.querySelectorAll('.desk').forEach((el) => {
        const b = el.getBoundingClientRect();
        const x0 = (b.left - pr.left) / MM, x1 = (b.right - pr.left) / MM, y0 = (b.top - pr.top) / MM, y1 = (b.bottom - pr.top) / MM;
        mark(x0 - 0.5, y0 - 0.5, x1 + 0.5, y0 + 0.5); mark(x0 - 0.5, y1 - 0.5, x1 + 0.5, y1 + 0.5);
        mark(x0 - 0.5, y0, x0 + 0.5, y1); mark(x1 - 0.5, y0, x1 + 0.5, y1);
        const st = el.querySelector('.desk-stub').getBoundingClientRect();
        mark(x0, (st.top - pr.top) / MM - 0.5, x1, (st.top - pr.top) / MM + 0.5);
      });
      let used = 0;
      for (let i = 0; i < grid.length; i++) used += grid[i];
      P.emptyPct = +(100 * (1 - used / grid.length)).toFixed(1);
      if (P.emptyPct < 35) err(`p${pn}: empty space ${P.emptyPct}% < 35%`);
    });

    // ---- equal card heights ------------------------------------------------
    const hs = [...document.querySelectorAll('.desk')].map((d) => +(d.getBoundingClientRect().height / MM).toFixed(2));
    out.metrics.cardHeights = hs;
    if (Math.max(...hs) - Math.min(...hs) > 0.1) err('card heights differ: ' + hs.join(', '));

    // ---- key positions for manual alignment review -------------------------
    const pos = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const sec = el.closest('section.page').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { x0: +((b.left - sec.left) / MM).toFixed(2), y0: +((b.top - sec.top) / MM).toFixed(2), x1: +((b.right - sec.left) / MM).toFixed(2), y1: +((b.bottom - sec.top) / MM).toFixed(2) };
    };
    const baseline = (sel, which) => {
      // baseline of the first or last line, via a zero-size inline-block probe
      const el = document.querySelector(sel);
      if (!el) return null;
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      if (which === 'last') el.appendChild(probe); else el.insertBefore(probe, el.firstChild);
      const sec = el.closest('section.page').getBoundingClientRect();
      const y = (probe.getBoundingClientRect().top - sec.top) / MM;
      probe.remove();
      return +y.toFixed(2);
    };
    out.metrics.pos = {};
    ['.cover-logo', '.cover-title', '.cover-base', '.p2-head', '.p2-pull', '.lead', '.how', '.promise', '.p2 .foot',
      '.p3-head', '.desks', '.circle', '.board', '.p3 .foot', '.p4-mark', '.letter', '.signoff', '.begin-head',
      '.begin-line', '.cta', '.btn', '.reg', '.p4 .foot', '.p4-note', '.sig-title', '.desk'].forEach((s) => { out.metrics.pos[s] = pos(s); });
    out.metrics.baselines = {
      p2_head_first: baseline('.p2-head', 'first'),
      p2_lead_first: baseline('.lead', 'first'),
      p2_pull_last: baseline('.pull', 'last'),
      p2_promise_last_left: baseline('.pr:nth-child(5) .pr-d', 'last'),
      p2_promise_last_right: baseline('.pr:nth-child(6) .pr-d', 'last'),
      p2_footer: baseline('.p2 .foot span', 'last'),
      p4_wa: baseline('.contact:nth-of-type(1) a', 'last'),
      p4_email: baseline('.contact:nth-of-type(2) a', 'last'),
      p4_btn_text: baseline('.btn', 'last'),
      p3_footer: baseline('.p3 .foot span', 'last'),
      p4_footer: baseline('.p4 .foot span', 'last'),
    };
    return out;
  }, copy);

  const rawPdf = outPdf.replace(/\.pdf$/i, '') + '.raw.pdf';
  await page.pdf({ path: rawPdf, format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true });
  await browser.close();

  // viewer title preference, then the PDF-level gate on the finished file
  const { execFileSync } = require('child_process');
  execFileSync('python3', ['-I', path.join(__dirname, 'finish_pdf.py'), rawPdf, outPdf], { stdio: 'ignore' });
  fs.unlinkSync(rawPdf);
  let pdfGate;
  try {
    pdfGate = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'qa_pdf.py'), outPdf]).toString());
  } catch (e) {
    pdfGate = JSON.parse(e.stdout.toString());
  }
  report.errors.push(...pdfGate.errors.map((m) => 'pdf: ' + m));

  const summary = {
    pdf: outPdf,
    errors: report.errors,
    emptySpace: Object.fromEntries(Object.entries(report.pages).map(([k, v]) => [k, v.emptyPct + '%'])),
    cardHeights: report.metrics.cardHeights,
    links: pdfGate.links.map(([pg, uri]) => `p${pg} ${uri}`),
    fonts: pdfGate.fonts,
    baselines: report.metrics.baselines,
  };
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = report.errors.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(2); });
