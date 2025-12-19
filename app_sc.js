document.addEventListener('DOMContentLoaded', () => {
    const initialsList = document.getElementById('initials-list');
    const finalsList = document.getElementById('finals-list');
    const tonesList = document.getElementById('tones-list');
    const contentDisplay = document.getElementById('content-display');
    const initialsTitle = document.getElementById('initials-title');
    const finalsTitle = document.getElementById('finals-title');
    const tonesTitle = document.getElementById('tones-title');
    
    let currentDirection = 'm2c'; // 'c2m' (Cantonese to Mandarin) or 'm2c' (Mandarin to Cantonese)
    let currentTab = 'initials'; // 'initials' or 'finals'

    // Generated reverse data
    let mandarinInitialsData = {};
    let mandarinFinalsData = {};
    let mandarinInitialsOrder = [];
    let mandarinFinalsOrder = [];
    let toneDataCantonese = {};
    let toneDataMandarin = {};
    let toneCrossC2M = {};
    let toneCrossM2C = {};
    let toneOrder = [];
    // audio cache for played jyutping
    const audioCache = {};

    // --- language switch / 简繁转换 support ---
    const SITE_LANG_KEY = 'siteLang';
    function getSiteLang() { return localStorage.getItem(SITE_LANG_KEY) || 'tc'; }
    function setSiteLang(l) { localStorage.setItem(SITE_LANG_KEY, l); applyLanguage(); }

    // minimal Traditional->Simplified mapping (extendable)
    const tc2sc = {
        '请': '请', '选择': '选择', '左侧': '左侧', '右侧': '右侧', '查询': '查询', '查询': '查询', '汉字': '汉字',
        '暂无数据': '暂无数据', '未找到汉字': '未找到汉字', '粤语': '粤语', '普通话': '普通话', '声母': '声母',
        '韵母': '韵母', '声调': '声调', '声': '声', '韵': '韵', '调': '调', '对应': '对应', '显示': '显示', '繁体中文': '繁体中文',
        '简体中文': '简体中文', '阴平': '阴平', '阴上': '阴上', '阴去': '阴去', '阳平': '阳平', '阳上': '阳上', '阳去': '阳去',
        '占比约': '占比约', '暂无': '暂无', '请选择': '请选择', '以查看其与': '以查看其与', '的对应关系': '的对应关系',
        '查汉字，例如：福': '查汉字，例如：福', '查询': '查询'
    };

    // prepare ordered keys for replacement (longer keys first)
    const tc2sc_keys = Object.keys(tc2sc).sort((a,b)=>b.length-a.length);

    function convertStringTcToSc(str) {
        if (!str || typeof str !== 'string') return str;
        let out = str;
        for (let k of tc2sc_keys) {
            if (out.indexOf(k) !== -1) out = out.split(k).join(tc2sc[k]);
        }
        return out;
    }

    function translateHTML(html) {
        return getSiteLang() === 'sc' ? convertStringTcToSc(html) : html;
    }

    function tText(s) {
        return getSiteLang() === 'sc' ? convertStringTcToSc(String(s)) : String(s);
    }

    function applyLanguage() {
        // keep select in sync and re-render UI parts
        const sel = document.getElementById('lang-select');
        if (sel) sel.value = getSiteLang();
        // re-render lists and current content so that dynamic HTML is translated
        renderLists();
        // if content area has welcome message or other HTML, try to translate it
        if (contentDisplay && contentDisplay.innerHTML) {
            contentDisplay.innerHTML = translateHTML(contentDisplay.innerHTML);
        }
    }

    // hook header language selector to perform static-file switch (A: static simplified files)
    const langSel = document.getElementById('lang-select');
    if (langSel) {
        // set initial value based on URL (if index_sc.html loaded)
        try {
            langSel.value = location.href.indexOf('_sc') !== -1 ? 'sc' : 'tc';
        } catch (e) {}
        langSel.addEventListener('change', () => {
            const v = langSel.value;
            const isSC = location.pathname.includes('_sc');
            const tcFile = 'index' + '.html';
            const scFile = 'index' + '_sc.html';
            if (v === 'sc' && !isSC) {
                location.href = new URL(scFile, location.href).href;
            } else if (v === 'tc' && isSC) {
                location.href = new URL(tcFile, location.href).href;
            }
        });
    }


    // extract jyutping like 'paang1' from fields such as '烹(paang1)' or 'paang1'
    function extractJyut(s) {
        if (!s) return '';
        const str = String(s);
        const m = str.match(/([a-zA-Z]+\d)/);
        if (m) return m[1];
        return str.replace(/[^a-zA-Z0-9]/g, '');
    }

    // play audio for a given jyutping (expects sound/<jyut>.wav)
    window.playJyutpingAudio = function(jyut) {
        if (!jyut) return;
        try {
            // build candidate absolute URLs robustly using URL() so it works under file:// and http(s)
            const rels = [
                `../sound/yue/${jyut}.wav`,
                `sound/yue/${jyut}.wav`,
                `./sound/yue/${jyut}.wav`,
                `/sound/yue/${jyut}.wav`
            ];

            const candidates = rels.map(r => {
                try { return new URL(r, location.href).href; } catch (e) { return r; }
            });

            let a = audioCache[jyut];
            let tried = 0;
            const tryPlay = () => {
                if (tried >= candidates.length) {
                    console.warn('[audio] no playable src for', jyut, candidates);
                    return Promise.reject(new Error('no-src'));
                }
                const src = candidates[tried];
                tried++;
                if (!a) {
                    a = new Audio();
                    audioCache[jyut] = a;
                }
                a.src = src;
                a.preload = 'auto';
                a.currentTime = 0;
                // attempt play; on error try next candidate
                return a.play().catch(err => {
                    console.warn('[audio] play failed for', src, err);
                    return tryPlay();
                });
            };

            tryPlay().catch(() => {});
        } catch (e) {
            console.warn('audio play error', e);
        }
    };

    // Order of initials in Jyutping
    const initialsOrder = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'ng', 'h', 'gw', 'kw', 'w', 'z', 'c', 's', 'j'];
    
    // Order of finals in Jyutping (approximate grouping)
    const finalsOrder = [
        'a', 'aai', 'aau', 'aam', 'aan', 'aang', 'aap', 'aat', 'aak',
        'ai', 'au', 'am', 'an', 'ang', 'ap', 'at', 'ak',
        'e', 'ei', 'eng', 'ek',
        'eoi', 'eon', 'eot', 'oe', 'oeng', 'oek',
        'o', 'oi', 'ou', 'on', 'ong', 'ot', 'ok',
        'i', 'iu', 'im', 'in', 'ing', 'ip', 'it', 'ik',
        'u', 'ui', 'un', 'ung', 'ut', 'uk',
        'yu', 'yun', 'yut'
    ];

    const toneMetaCantonese = {
        '1': '阴平',
        '2': '阴上',
        '3': '阴去',
        '4': '阳平',
        '5': '阳上',
        '6': '阳去'
    };

    const toneMetaMandarin = {
        '1': '阴平',
        '2': '阳平',
        '3': '上',
        '4': '去'
    };

    // Generate reverse data on load
    // dataType: 'initials' or 'finals'
    function generateReverseData(sourceData, dataType = 'initials') {
        const targetData = {};

        // Helper to extract mandarin final from pinyin (strip tone digits first)
        function extractMandarinFinal(pinyin) {
            if (!pinyin) return '';
            const cleaned = String(pinyin).replace(/\d/g, '');
            // remove leading consonants until first vowel
            return cleaned.replace(/^[^aeiou]+/, '');
        }

        // Iterate through all Cantonese keys (e.g., 'b' or 'aa')
        for (const cantoneseKey in sourceData) {
            const groups = sourceData[cantoneseKey];

            groups.forEach(group => {
                if (dataType === 'initials') {
                    const mandarinKey = group.mandarinInitial;

                    if (!targetData[mandarinKey]) targetData[mandarinKey] = [];

                    targetData[mandarinKey].push({
                        cantoneseInitial: cantoneseKey,
                        chars: group.chars
                    });
                } else {
                    // dataType === 'finals' -> we need to group by mandarin final extracted from each char's pinyin
                    group.chars.forEach(charObj => {
                        const mandarinFinal = extractMandarinFinal(charObj.pinyin || charObj.pinyin === 0 ? charObj.pinyin : '');
                        if (!mandarinFinal) return;

                        if (!targetData[mandarinFinal]) targetData[mandarinFinal] = [];

                        // find existing group for this cantoneseKey within mandarinFinal bucket
                        let existing = targetData[mandarinFinal].find(g => g.cantoneseFinal === cantoneseKey);
                        if (!existing) {
                            existing = { cantoneseFinal: cantoneseKey, chars: [] };
                            targetData[mandarinFinal].push(existing);
                        }
                        existing.chars.push(charObj);
                    });
                }
            });
        }

        // Calculate percentages for each Mandarin key
        for (const mandarinKey in targetData) {
            const groups = targetData[mandarinKey];
            let totalChars = 0;
            groups.forEach(g => totalChars += g.chars.length);

            groups.forEach(g => {
                g.percentage = totalChars > 0 ? ((g.chars.length / totalChars) * 100).toFixed(1) : 0;
            });

            // Sort groups by percentage descending
            groups.sort((a, b) => b.percentage - a.percentage);
        }

        return targetData;
    }

    // Build tone data from both initials and finals buckets to cover all chars
    function buildToneData(initialsSource, finalsSource, mode = 'cantonese') {
        const target = {};
        const addChar = (chObj) => {
            if (!chObj) return;
            let tone;
            if (mode === 'cantonese') {
                if (!chObj.jyutping) return;
                const m = String(chObj.jyutping).match(/([a-zA-Z]+)(\d)/);
                if (!m) return;
                tone = m[2];
                if (!toneMetaCantonese[tone]) return; // keep 1-6 only
            } else {
                if (!chObj.pinyin) return;
                const m = String(chObj.pinyin).match(/([a-zA-Z]+)(\d)/);
                if (!m) return;
                tone = m[2];
                if (!toneMetaMandarin[tone]) return; // keep 1-4 only
            }
            const key = tone;
            if (!target[key]) target[key] = [];
            // avoid dup chars per tone
            if (!target[key].some(c => c.char === chObj.char)) {
                target[key].push({
                    char: chObj.char,
                    jyutping: chObj.jyutping,
                    pinyin: chObj.pinyin
                });
            }
        };

        const consume = (data) => {
            for (const k in data) {
                data[k].forEach(group => {
                    (group.chars || []).forEach(addChar);
                });
            }
        };

        consume(initialsSource);
        consume(finalsSource);

        // sort chars within each tone by char
        for (const t in target) {
            target[t].sort((a, b) => a.char.localeCompare(b.char));
        }

        return target;
    }

    function buildToneCrossMaps(initialsSource, finalsSource) {
        const c2m = {};
        const m2c = {};

        const add = (ct, mt, chObj) => {
            if (toneMetaCantonese[ct] && toneMetaMandarin[mt]) {
                if (!c2m[ct]) c2m[ct] = {};
                if (!c2m[ct][mt]) c2m[ct][mt] = new Map();
                if (!c2m[ct][mt].has(chObj.char)) {
                    c2m[ct][mt].set(chObj.char, chObj);
                }
            }
            if (toneMetaMandarin[mt] && toneMetaCantonese[ct]) {
                if (!m2c[mt]) m2c[mt] = {};
                if (!m2c[mt][ct]) m2c[mt][ct] = new Map();
                if (!m2c[mt][ct].has(chObj.char)) {
                    m2c[mt][ct].set(chObj.char, chObj);
                }
            }
        };

        const consume = (data) => {
            for (const k in data) {
                data[k].forEach(group => {
                    (group.chars || []).forEach(chObj => {
                        const ctMatch = chObj.jyutping ? String(chObj.jyutping).match(/\d/) : null;
                        const mtMatch = chObj.pinyin ? String(chObj.pinyin).match(/\d/) : null;
                        const ct = ctMatch ? ctMatch[0] : null;
                        const mt = mtMatch ? mtMatch[0] : null;
                        if (ct && mt) add(ct, mt, chObj);
                    });
                });
            }
        };

        consume(initialsSource);
        consume(finalsSource);

        // convert maps to arrays sorted by char
        const mapToArray = (obj) => {
            const out = {};
            for (const k in obj) {
                out[k] = {};
                for (const sub in obj[k]) {
                    const arr = Array.from(obj[k][sub].values());
                    arr.sort((a, b) => a.char.localeCompare(b.char));
                    out[k][sub] = arr;
                }
            }
            return out;
        };

        return { c2m: mapToArray(c2m), m2c: mapToArray(m2c) };
    }

    mandarinInitialsData = generateReverseData(initialsData, 'initials');
    mandarinFinalsData = generateReverseData(finalsData, 'finals');
    toneDataCantonese = buildToneData(initialsData, finalsData, 'cantonese');
    toneDataMandarin = buildToneData(initialsData, finalsData, 'mandarin');
    const toneCross = buildToneCrossMaps(initialsData, finalsData);
    toneCrossC2M = toneCross.c2m;
    toneCrossM2C = toneCross.m2c;
    
    mandarinInitialsOrder = Object.keys(mandarinInitialsData).sort();
    mandarinFinalsOrder = Object.keys(mandarinFinalsData).sort();

    // Render lists based on current state
    function renderLists() {
        console.log('[app] renderLists() currentTab=', currentTab, 'currentDirection=', currentDirection);
        initialsList.innerHTML = '';
        finalsList.innerHTML = '';
        tonesList.innerHTML = '';

        const isC2M = currentDirection === 'c2m';
        
        // Update titles (translated if needed)
        initialsTitle.textContent = tText(isC2M ? '粤语声母' : '普通话声母');
        finalsTitle.textContent = tText(isC2M ? '粤语韵母' : '普通话韵母');
        // tones title (粤语 or 普通话 depending on direction)
        const tonesTitle = document.getElementById('tones-title');
        if (tonesTitle) tonesTitle.textContent = tText(isC2M ? '粤语声调' : '普通话声调');

        // tone-note paragraph show only for c2m (hide for 普通话查粤语)
        const toneNote = document.getElementById('tone-note');
        if (toneNote) toneNote.style.display = isC2M ? 'block' : 'none';

        const iOrder = isC2M ? initialsOrder : mandarinInitialsOrder;
        const fOrder = isC2M ? finalsOrder : mandarinFinalsOrder;

        console.log('[app] renderLists() initials order len=', iOrder.length, 'finals order len=', fOrder.length);
        iOrder.forEach(key => {
            const btn = document.createElement('a');
            btn.className = 'initial-btn';
            btn.textContent = key;
            btn.dataset.key = key;
            btn.dataset.type = 'initials';
            btn.onclick = () => loadData('initials', key);
            initialsList.appendChild(btn);
        });

        fOrder.forEach(key => {
            const btn = document.createElement('a');
            btn.className = 'initial-btn';
            btn.textContent = key;
            btn.dataset.key = key;
            btn.dataset.type = 'finals';
            btn.onclick = () => loadData('finals', key);
            finalsList.appendChild(btn);
        });
        const currentToneMeta = isC2M ? toneMetaCantonese : toneMetaMandarin;
        const currentToneOrder = Object.keys(currentToneMeta);
        toneOrder = currentToneOrder;

        currentToneOrder.forEach(key => {
            const btn = document.createElement('div');
            btn.className = 'tone-card';
            btn.textContent = key;
            const name = currentToneMeta[key] || '';
            const span = document.createElement('span');
            span.textContent = name;
            btn.appendChild(document.createElement('br'));
            btn.appendChild(span);
            btn.dataset.key = key;
            btn.dataset.type = 'tones';
            btn.onclick = () => loadData('tones', key);
            tonesList.appendChild(btn);
        });
        // change tone grid layout when direction is m2c: use 2 columns
        if (isC2M) {
            tonesList.classList.remove('two-cols');
        } else {
            tonesList.classList.add('two-cols');
        }
        console.log('[app] renderLists() appended initials=', initialsList.children.length, 'finals=', finalsList.children.length, 'tones=', tonesList.children.length);
    }

    // Search for a Chinese character across initialsData and finalsData
    function searchChar(ch) {
        if (!ch) return null;
        ch = String(ch).trim();

        // helper to search in a data object
        const findIn = (data) => {
            for (const key in data) {
                const groups = data[key];
                for (let i = 0; i < groups.length; i++) {
                    const group = groups[i];
                    const chars = group.chars || [];
                    for (let j = 0; j < chars.length; j++) {
                        const c = chars[j];
                        if (c && c.char === ch) return c;
                    }
                }
            }
            return null;
        };

        // search cantonese-side data (initials and finals)
        let result = findIn(initialsData) || findIn(finalsData);
        if (result) return result;

        // also search mandarin reverse structures if needed
        result = (function(){
            for (const k in mandarinInitialsData) {
                const groups = mandarinInitialsData[k];
                for (let gi=0; gi<groups.length; gi++){
                    const g = groups[gi];
                    for (let ci=0; ci<(g.chars||[]).length; ci++){
                        const c = g.chars[ci];
                        if (c && c.char === ch) return c;
                    }
                }
            }
            for (const k in mandarinFinalsData) {
                const groups = mandarinFinalsData[k];
                for (let gi=0; gi<groups.length; gi++){
                    const g = groups[gi];
                    for (let ci=0; ci<(g.chars||[]).length; ci++){
                        const c = g.chars[ci];
                        if (c && c.char === ch) return c;
                    }
                }
            }
            return null;
        })();

        return result;
    }

    // wire search input/button
    const searchInput = document.getElementById('char-search-input');
    const searchBtn = document.getElementById('char-search-btn');
    if (searchInput) {
        searchInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                const v = searchInput.value.trim();
                if (v) {
                    const res = searchChar(v);
                    if (res) {
                        showCharDetail(res.char, res.jyutping, res.pinyin);
                    } else {
                        // show not found message
                        contentDisplay.innerHTML = translateHTML(`<div class="welcome-message">未找到汉字：${v}</div>`);
                    }
                }
            }
        });
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const v = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
            if (!v) return;
            const res = searchChar(v);
            if (res) {
                showCharDetail(res.char, res.jyutping, res.pinyin);
                } else {
                contentDisplay.innerHTML = translateHTML(`<div class="welcome-message">未找到汉字：${v}</div>`);
            }
        });
    }

    // Initial render
    renderLists();

    // wire language selector and apply persisted choice
    const langSelectEl = document.getElementById('lang-select');
    if (langSelectEl) {
        langSelectEl.value = getSiteLang();
        langSelectEl.addEventListener('change', (ev) => {
            const v = ev && ev.target ? ev.target.value : 'tc';
            setSiteLang(v);
        });
    }
    // apply language on load (this will re-render titles and translate current content)
    applyLanguage();

    // Usage Instructions Modal
    const usageBtn = document.getElementById('usage-btn');
    if (usageBtn) {
        usageBtn.onclick = async () => {
            try {
                const response = await fetch('README.md');
                const text = await response.text();
                showUsageModal(text);
            } catch (e) {
                console.error('Failed to load README.md', e);
            }
        };
    }

    function showUsageModal(mdText) {
        const modalBody = document.getElementById('modal-body');
        const modalContent = modalBody.parentElement;
        modalContent.classList.add('wide');
        
        // Improved markdown to HTML conversion
        const lines = mdText.split('\n');
        let html = '';
        let inList = false;

        lines.forEach(line => {
            let trimmed = line.trim();
            if (!trimmed) {
                if (inList) { html += '</ul>'; inList = false; }
                return;
            }

            // Headers
            if (trimmed.startsWith('### ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h3>${trimmed.slice(4)}</h3>`;
            } else if (trimmed.startsWith('## ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h2>${trimmed.slice(3)}</h2>`;
            } else if (trimmed.startsWith('# ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h1>${trimmed.slice(2)}</h1>`;
            } 
            // Lists
            else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\. /.test(trimmed)) {
                if (!inList) { html += '<ul>'; inList = true; }
                const content = trimmed.replace(/^[*-] |\d+\. /, '');
                html += `<li>${parseInline(content)}</li>`;
            } 
            // Paragraphs
            else {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<p>${parseInline(trimmed)}</p>`;
            }
        });
        if (inList) html += '</ul>';

        function parseInline(text) {
            return text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; display: block; margin: 15px auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        }
        
        modalBody.innerHTML = `<div class="usage-content">${html}</div>`;
        document.getElementById('charModal').style.display = "block";
    }

    // Direction switching
    window.switchDirection = function(direction) {
        currentDirection = direction;
        renderLists();
        // Reset view
        contentDisplay.innerHTML = translateHTML(`<div class="welcome-message">请选择${currentDirection === 'c2m' ? '粤语' : '普通话'}${currentTab === 'initials' ? '声母' : '韵母'}以查看其与${currentDirection === 'c2m' ? '普通话' : '粤语'}${currentTab === 'initials' ? '声母' : '韵母'}的对应关系。</div>`);
    }

    // Tab switching
    window.switchTab = function(tabName) {
        currentTab = tabName;
        console.log('[app] switchTab()', tabName);
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.textContent === (tabName === 'initials' ? '声母' : tabName === 'finals' ? '韵母' : '声调')) {
                btn.classList.add('active');
            }
        });

        document.getElementById('initials-view').style.display = tabName === 'initials' ? 'block' : 'none';
        document.getElementById('finals-view').style.display = tabName === 'finals' ? 'block' : 'none';
        document.getElementById('tones-view').style.display = tabName === 'tones' ? 'block' : 'none';
        
        const itemLabel = tabName === 'initials' ? '声母' : tabName === 'finals' ? '韵母' : '声调';
        const leftLang = currentDirection === 'c2m' ? '粤语' : '普通话';
        const rightLang = currentDirection === 'c2m' ? '普通话' : '粤语';
        contentDisplay.innerHTML = translateHTML(`<div class="welcome-message">请选择${leftLang}${itemLabel}以查看其与${rightLang}${itemLabel}的对应关系。</div>`);
    }

    function loadData(type, key) {
        // Update active state
        console.log('[app] loadData()', type, key);
        document.querySelectorAll('.initial-btn, .tone-card').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-key="${key}"][data-type="${type}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        } else {
            console.warn('[app] active button not found for', type, key);
        }

        const isC2M = currentDirection === 'c2m';
        const currentToneMeta = isC2M ? toneMetaCantonese : toneMetaMandarin;
        const currentToneData = isC2M ? toneCrossC2M : toneCrossM2C;
        let data;
        
        if (type === 'tones') {
            data = currentToneData[key];
        } else if (isC2M) {
            data = type === 'initials' ? initialsData[key] : finalsData[key];
        } else {
            data = type === 'initials' ? mandarinInitialsData[key] : mandarinFinalsData[key];
        }
        
        if (!data) {
            contentDisplay.innerHTML = translateHTML('<div class="welcome-message">暂无数据</div>');
            return;
        }

        const toneLabel = type === 'tones' ? (currentToneMeta[key] ? `${currentToneMeta[key]} (${key})` : key) : key;
        if (type === 'tones') {
            // data is a map tone -> chars[]
            const groups = [];
            let total = 0;
            Object.keys(data).forEach(t => { total += data[t].length; });
            Object.keys(data).forEach(t => {
                const chars = data[t];
                const pct = total > 0 ? ((chars.length / total) * 100).toFixed(1) : '0.0';
                const targetToneLabel = isC2M
                    ? (toneMetaMandarin[t] ? `${toneMetaMandarin[t]} (${t})` : t)
                    : (toneMetaCantonese[t] ? `${toneMetaCantonese[t]} (${t})` : t);
                groups.push({
                    targetToneLabel,
                    percentage: pct,
                    chars: chars
                });
            });
            // sort groups by size desc
            groups.sort((a, b) => b.chars.length - a.chars.length);
            data = groups;
        }

        const sourceLang = type === 'tones' ? (isC2M ? '粤语' : '普通话') : (isC2M ? '粤语' : '普通话');
        const targetLang = type === 'tones' ? (isC2M ? '普通话' : '粤语') : (isC2M ? '普通话' : '粤语');
        const itemType = type === 'initials' ? '声母' : type === 'finals' ? '韵母' : '声调';

        let html = `<h2>${sourceLang}${itemType}: ${toneLabel}</h2>`;
        
        data.forEach(group => {
            const targetValue = type === 'tones'
                ? group.targetToneLabel
                : isC2M
                    ? group.mandarinInitial
                    : (type === 'initials' ? group.cantoneseInitial : group.cantoneseFinal);
            
            html += `
                <div class="correspondence-group">
                    <div class="mandarin-initial-header">
                        对应${targetLang}${itemType}: <span style="color: #AA3333;">${targetValue}</span>
                    </div>
                    <div class="char-list">
                        ${group.chars.map(charData => {
                            const jyut = extractJyut(charData.jyutping || charData.jyutping === 0 ? charData.jyutping : '');
                            return `
                            <div class="char-item">
                                <span class="char-symbol" onclick="showCharDetail('${charData.char}', '${charData.jyutping}', '${charData.pinyin}')">${charData.char}</span>
                                <button class="audio-btn" onclick="event.stopPropagation(); playJyutpingAudio('${jyut}')" title="播放粤拼">🔊</button>
                            </div>
                        `}).join('')}
                    </div>
                    <div class="stats">
                        占比约: ${group.percentage}%
                    </div>
                </div>
            `;
        });

        contentDisplay.innerHTML = translateHTML(html);
    }

    // Modal for character details

    // Modal for character details
    const modalHtml = `
        <div id="charModal" class="modal">
            <div class="modal-content">
                <span class="close">&times;</span>
                <div id="modal-body"></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById("charModal");
    const span = document.getElementsByClassName("close")[0];

    span.onclick = function() {
        modal.style.display = "none";
    }

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    window.showCharDetail = function(char, jyutping, pinyin) {
        const modalBody = document.getElementById('modal-body');
        const modalContent = modalBody.parentElement;
        modalContent.classList.remove('wide');
        
        const jyut = extractJyut(jyutping || '');
        modalBody.innerHTML = translateHTML(`
            <div class="detail-char">${char}</div>
            <div class="detail-info">
                <span>粤拼: ${jyut}</span>
                <button class="modal-audio-btn" onclick="event.stopPropagation(); playJyutpingAudio('${jyut}')" title="播放粤拼">🔊</button>
            </div>
            <div class="detail-info">普通话: ${pinyin}</div>
        `);
        modal.style.display = "block";
    }
});
