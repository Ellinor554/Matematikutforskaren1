    // ===================== GLOBAL =====================
    let currentView = 'home';
    let selectedItem = null;
    let posVisibleCols = { tusental: true, hundratal: true, tiotal: true, ental: true };
    let posShowColumns = true;
    const POS_COL_DEFS = [
        { key: 'tusental',  label: 'Tusental',  color: '#1565C0', bg: 'rgba(30,136,229,0.06)',  border: 'rgba(21,101,192,0.25)' },
        { key: 'hundratal', label: 'Hundratal', color: '#2E7D32', bg: 'rgba(56,142,60,0.06)',   border: 'rgba(46,125,50,0.25)' },
        { key: 'tiotal',    label: 'Tiotal',    color: '#92700A', bg: 'rgba(249,168,37,0.06)',  border: 'rgba(146,112,10,0.25)' },
        { key: 'ental',     label: 'Ental',     color: '#C62828', bg: 'rgba(229,57,53,0.06)',   border: 'rgba(198,40,40,0.25)' }
    ];
    let zIndexCounter = 100;
    let isDragging = false;
    let dragTarget = null;
    let startX, startY, initialX, initialY;

    function initApp() {
        initFractionButtons();
        setNumberLine(0,10,1);
        initClock();
        initStats();
        initKoord();
        initPosSystem();
        initDecimaltal();
        initUppstallning();
    }

    /**
     * Per-view lifecycle hooks. Add an entry here when creating a new view.
     * @type {Object.<string, {onEnter?: () => void, onResize?: () => void}>}
     */
    const VIEW_REGISTRY = {
        counting:   { onEnter: () => { if (countingMode === 'friends') initTenFriends(); else buildMathGrid(countingMode === 'multiplication'); } },
        statistics: { onEnter: renderChart,            onResize: renderChart },
        clock:      { onEnter: initClockDragIfNeeded },
        koordinat:  { onEnter: renderKoord,            onResize: renderKoord },
        volym:      { onEnter: updateVolumeUI },
        decimaltal: { onEnter: decOnEnter,         onResize: () => { decPositionTokens(false); decRenderNL(); } },
        uppstallning: { onEnter: initUppstallning },
    };

    /**
     * Switch the visible view and set up its header controls.
     * @param {string} viewId - One of the view IDs ('home','fractions','numberlines',…)
     */
    function switchView(viewId) {
        if(currentView==='counting' && viewId!=='counting') document.querySelectorAll('.ten-friend-item').forEach(e=>e.remove());
        // Exit presentation mode when leaving any view
        if (currentView !== 'home' && viewId !== currentView) {
            if (document.fullscreenElement) document.exitFullscreen();
            const oldSection = document.getElementById('view-' + currentView);
            if (oldSection) oldSection.classList.remove('presenting', 'panel-visible');
            document.getElementById('controls-area').innerHTML = '';
        }
        document.querySelectorAll('.view-section').forEach(el=>el.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
        const btnHome = document.getElementById('btn-home');
        const title = document.getElementById('app-title');
        if (viewId==='home') {
            btnHome.classList.add('hidden');
            title.innerHTML = `<i class="fas fa-shapes text-soft-blue mr-2"></i> Matematikutforskaren`;
            cleanup3D();
        } else {
            btnHome.classList.remove('hidden');
            const titles = {fractions:'Bråk',numberlines:'Tallinjer',geometry:'Geometriska objekt',counting:'Räkning',clock:'Klockan',statistics:'Statistik',koordinat:'Koordinatsystem',positionssystem:'Positionssystemet',volym:'Volym',decimaltal:'Decimaltal',uppstallning:'Uppställning'};
            title.innerText = titles[viewId];
            // Run the view's onEnter hook if registered
            const onEnter = VIEW_REGISTRY[viewId]?.onEnter;
            if (onEnter) setTimeout(onEnter, 80);
            // Add fullscreen/smartboard button to the header for all views
            const fsBtnColors = {
                fractions: 'bg-soft-pink text-white',
                numberlines: 'bg-soft-blue text-white',
                geometry: 'bg-soft-green text-white',
                counting: 'bg-soft-yellowDark text-white',
                clock: 'bg-soft-purple text-white',
                statistics: 'bg-soft-teal text-white',
                koordinat: 'bg-soft-purple text-white',
                positionssystem: 'bg-soft-blue text-white',
                volym: 'bg-soft-blue text-white',
                decimaltal: 'bg-soft-teal text-white',
                uppstallning: 'bg-soft-blue text-white'
            };
            const colorCls = fsBtnColors[viewId] || 'bg-soft-blue text-white';
            document.getElementById('controls-area').innerHTML =
                `<button onclick="toggleViewFullscreen()" id="${viewId}-fs-btn" class="flex items-center gap-2 px-4 py-2 ${colorCls} font-bold rounded-xl text-sm hover:opacity-90 transition-opacity shadow-sm">
                    <i class="fas fa-expand"></i> Helskärm
                </button>`;
        }
        currentView = viewId;
    }

    document.getElementById('btn-home').addEventListener('click',()=>{ document.querySelectorAll('.ten-friend-item').forEach(e=>e.remove()); });

    // ===================== DRAG ENGINE =====================
    // Geo 2D shapes use left/top + scale(s) only (no translate, avoids origin issues)
    window.updateTransform = function(el) {
        const x=parseFloat(el.dataset.x)||0, y=parseFloat(el.dataset.y)||0;
        const rot=parseFloat(el.dataset.rot)||0, s=parseFloat(el.dataset.scale)||1;
        el.style.left = x + 'px';
        el.style.top  = y + 'px';
        el.style.transform = `rotate(${rot}deg) scale(${s})`;
    };
    function updateTransform(el) { window.updateTransform(el); }

    function makeDraggable(element, workspaceId, onDragEndCallback=null) {
        element.classList.add('draggable-item');
        if (element.dataset.x === undefined || element.dataset.x === '') element.dataset.x = 0;
        if (element.dataset.y === undefined || element.dataset.y === '') element.dataset.y = 0;
        if (!element.dataset.rot) element.dataset.rot = 0;
        window.updateTransform(element);

        let _startX, _startY, _initX, _initY;
        element.addEventListener('pointerdown',(e)=>{
            if(e.button!==0 && e.type!=='touchstart') return;
            if(e.target.classList && (e.target.classList.contains('geo-resize-handle') || e.target.classList.contains('frac-resize-handle'))) return;
            isDragging=true; dragTarget=element;
            if(selectedItem && selectedItem!==element) selectedItem.classList.remove('selected');
            selectedItem=element; element.classList.add('selected');
            element.style.zIndex = ++zIndexCounter;
            _startX=e.clientX; _startY=e.clientY;
            _initX=parseFloat(element.dataset.x)||0; _initY=parseFloat(element.dataset.y)||0;
            element.setPointerCapture(e.pointerId); e.preventDefault();
        });
        element.addEventListener('pointermove',(e)=>{
            if(!isDragging||dragTarget!==element) return;
            element.dataset.x = _initX+(e.clientX-_startX);
            element.dataset.y = _initY+(e.clientY-_startY);
            window.updateTransform(element);
        });
        element.addEventListener('pointerup',(e)=>{
            if(!isDragging||dragTarget!==element) return;
            if(element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
            if(element.onDragEndCallback) element.onDragEndCallback(element);
            isDragging=false; dragTarget=null;
        });
        element.onDragEndCallback = onDragEndCallback;
    }
    function rotateSelectedPiece(deg) { if(selectedItem){ selectedItem.dataset.rot=(parseFloat(selectedItem.dataset.rot)||0)+deg; updateTransform(selectedItem); } }
    function deleteSelectedPiece() { if(selectedItem&&selectedItem.parentNode){ selectedItem.parentNode.removeChild(selectedItem); selectedItem=null; } }
    function clearWorkspace(wsId) { document.getElementById(wsId).querySelectorAll('.draggable-item').forEach(i=>i.remove()); selectedItem=null; }

    // ===================== FRACTIONS =====================
    const FRAC_DEFS = [
        {d:1,  color:'#6a6281', label:'Hel (1/1)'},
        {d:2,  color:'#a85c72', label:'Halvor (1/2)'},
        {d:3,  color:'#5b80a5', label:'Tredjedelar (1/3)'},
        {d:4,  color:'#4f7c75', label:'Fjärdedelar (1/4)'},
        {d:5,  color:'#dec894', label:'Femtedelar (1/5)'},
        {d:6,  color:'#8db1d1', label:'Sjättedelar (1/6)'},
        {d:8,  color:'#8bb39c', label:'Åttondelar (1/8)'},
        {d:10, color:'#d58b99', label:'Tiondelar (1/10)'},
        {d:12, color:'#938db3', label:'Tolftedelar (1/12)'},
    ];
    const FRAC_R = 72;
    const FRAC_SVG = FRAC_R * 2 + 8;
    const FRAC_BOARD_SCALE = 1.5; // Scale applied to circles placed on the board

    // Single global frac drag state (mode: 'move' | 'resize')
    let fracDrag = null;

    // Display options: show decimals and/or percentages alongside fractions
    let fracShowDecimal = false;
    let fracShowPercent = false;

    // Format 1/d as a decimal with Swedish comma notation (e.g. 0,25)
    function formatFracDecimal(d) {
        const val = 1 / d;
        let str = val.toFixed(3);
        // Remove trailing zeros but keep at least one decimal place
        str = str.replace(/(\.\d*[1-9])0+$/, '$1').replace(/\.(0+)$/, '.0');
        return str.replace('.', ',');
    }

    // Format 1/d as a percentage with Swedish comma notation (e.g. 25% or 33,3%)
    function formatFracPercent(d) {
        const pct = 100 / d;
        if (Number.isInteger(pct)) return pct + '%';
        return pct.toFixed(1).replace('.', ',') + '%';
    }

    // Return array of display labels for 1/d based on current display options
    function getFracLabels(d) {
        const labels = [];
        if (d === 1) {
            labels.push('1');
            if (fracShowDecimal) labels.push('1,0');
            if (fracShowPercent) labels.push('100%');
        } else {
            labels.push('1/' + d);
            if (fracShowDecimal) labels.push(formatFracDecimal(d));
            if (fracShowPercent) labels.push(formatFracPercent(d));
        }
        return labels;
    }

    // Build SVG <text> elements for vertically stacked labels centered at (px, py)
    function buildStackedLabels(px, py, labels, fs, textColor) {
        if (labels.length === 0) return '';
        const spacing = fs * 1.3;
        let result = '';
        for (let i = 0; i < labels.length; i++) {
            const centerY = py - (labels.length - 1) / 2 * spacing + i * spacing;
            const y = centerY + fs * 0.35;
            result += `<text x="${px}" y="${y}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="${fs}" font-weight="800" fill="${textColor}" pointer-events="none">${labels[i]}</text>`;
        }
        return result;
    }

    // Re-render all circles/slices in the workspace when display options change
    function setFracDisplayOptions() {
        fracShowDecimal = document.getElementById('frac-show-decimal').checked;
        fracShowPercent = document.getElementById('frac-show-percent').checked;
        const ws = document.getElementById('workspace-fractions');
        ws.querySelectorAll('.frac-piece').forEach(el => {
            const d = parseInt(el.dataset.d);
            const color = el.dataset.color;
            if (d && color) {
                // Full circle – replace the SVG
                const oldSvg = el.querySelector('svg');
                if (oldSvg) {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = buildCircleSVG(d, color);
                    oldSvg.replaceWith(tmp.firstElementChild);
                    // Re-attach slice drag listeners for the new SVG
                    if (d > 1) {
                        const slices = el.querySelectorAll('.frac-slice');
                        slices.forEach((slice, i) => {
                            let sliceDownX, sliceDownY, pulled = false, looseEl = null;
                            slice.addEventListener('pointerdown', (e) => {
                                if (e.button !== 0) return;
                                e.preventDefault(); e.stopPropagation();
                                sliceDownX = e.clientX; sliceDownY = e.clientY;
                                pulled = false; looseEl = null;
                                function onSliceMove(ev) {
                                    if (ev.pointerId !== e.pointerId) return;
                                    const dx = ev.clientX - sliceDownX, dy = ev.clientY - sliceDownY;
                                    if (!pulled && Math.sqrt(dx*dx+dy*dy) > 10) {
                                        pulled = true;
                                        looseEl = spawnLooseSlice(d, i, color, ev.clientX, ev.clientY, ws, parseFloat(el.dataset.scale));
                                        fracStartDrag(looseEl, ev);
                                    }
                                }
                                function onSliceUp(ev) {
                                    if (ev.pointerId !== e.pointerId) return;
                                    document.removeEventListener('pointermove', onSliceMove);
                                    document.removeEventListener('pointerup', onSliceUp);
                                    document.removeEventListener('pointercancel', onSliceUp);
                                    if (!pulled) fracDrag = null;
                                }
                                document.addEventListener('pointermove', onSliceMove);
                                document.addEventListener('pointerup', onSliceUp);
                                document.addEventListener('pointercancel', onSliceUp);
                            });
                        });
                    }
                }
            } else if (el.dataset.isLoose === 'true') {
                // Loose slice – replace the SVG
                const ld = parseInt(el.dataset.looseD);
                const li = parseInt(el.dataset.looseSlice);
                const lcolor = el.dataset.looseColor;
                if (!isNaN(ld) && !isNaN(li) && lcolor) {
                    const oldSvg = el.querySelector('svg');
                    if (oldSvg) {
                        const tmp = document.createElement('div');
                        tmp.innerHTML = buildLooseSliceSVG(ld, li, lcolor);
                        oldSvg.replaceWith(tmp.firstElementChild);
                    }
                }
            }
        });
    }

    function fracOnMove(e) {
        if (!fracDrag || fracDrag.pointerId !== e.pointerId) return;
        if (fracDrag.mode === 'resize') {
            const el = fracDrag.el;
            const dx = e.clientX - fracDrag.sx;
            const dy = e.clientY - fracDrag.sy;
            const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy);
            const newScale = Math.max(0.4, Math.min(4, fracDrag.startScale + delta / FRAC_SVG));
            el.dataset.scale = newScale;
            applyFracTransform(el);
        } else {
            const nx = fracDrag.ox + (e.clientX - fracDrag.sx);
            const ny = fracDrag.oy + (e.clientY - fracDrag.sy);
            fracDrag.el.dataset.x = nx;
            fracDrag.el.dataset.y = ny;
            applyFracTransform(fracDrag.el);
        }
    }

    function fracOnUp(e) {
        if (!fracDrag || fracDrag.pointerId !== e.pointerId) return;
        if (fracDrag.mode !== 'resize') fracDrag.el.style.cursor = 'grab';
        fracDrag = null;
    }

    function fracStartDrag(el, e) {
        el.style.zIndex = ++zIndexCounter;
        el.style.cursor = 'grabbing';
        fracDrag = {
            el, mode: 'move',
            ox: parseFloat(el.dataset.x) || 0,
            oy: parseFloat(el.dataset.y) || 0,
            sx: e.clientX, sy: e.clientY,
            pointerId: e.pointerId
        };
    }

    function applyFracTransform(el) {
        const x = parseFloat(el.dataset.x) || 0;
        const y = parseFloat(el.dataset.y) || 0;
        const s = parseFloat(el.dataset.scale) || 1;
        el.style.left = x + 'px';
        el.style.top  = y + 'px';
        el.style.transform = 'scale(' + s + ')';
        el.style.transformOrigin = 'top left';
    }

    function addMoveHandle(el) {
        const handle = document.createElement('div');
        handle.style.cssText = 'position:absolute;top:-28px;left:50%;transform:translateX(-50%);height:22px;padding:0 12px;background:white;border:1.5px solid #c8c9ce;border-radius:8px;cursor:grab;display:flex;align-items:center;justify-content:center;font-size:14px;color:#6a6b70;user-select:none;touch-action:none;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.12);';
        handle.setAttribute('role', 'button');
        handle.setAttribute('aria-label', 'Flytta hela cirkeln');
        handle.textContent = '\u28bf';
        handle.title = 'Dra för att flytta hela cirkeln';
        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            fracStartDrag(el, e);
        });
        el.appendChild(handle);
    }

    function addResizeHandle(el) {
        const handle = document.createElement('div');
        handle.style.cssText = 'position:absolute;bottom:-4px;right:-4px;width:22px;height:22px;background:white;border:2px solid #8c8d92;border-radius:5px;cursor:nwse-resize;display:flex;align-items:center;justify-content:center;font-size:15px;color:#4a4b50;user-select:none;touch-action:none;z-index:10;opacity:0.9;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.15);';
        handle.textContent = '\u231f';
        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            el.style.zIndex = ++zIndexCounter;
            fracDrag = {
                el, mode: 'resize',
                startScale: parseFloat(el.dataset.scale) || 1,
                sx: e.clientX, sy: e.clientY,
                pointerId: e.pointerId
            };
        });
        el.appendChild(handle);
    }

    function initFractionButtons() {
        const container = document.getElementById('fraction-buttons');
        container.innerHTML = '';
        FRAC_DEFS.forEach(f => {
            const btn = document.createElement('button');
            btn.className = 'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border border-soft-border bg-soft-bg hover:bg-white hover:shadow-sm transition-all text-left';
            const ps = 28, pr = ps/2 - 2;
            let prev = '';
            if (f.d === 1) {
                prev = `<circle cx="${ps/2}" cy="${ps/2}" r="${pr}" fill="${f.color}"/>`;
            } else {
                const a = 360/f.d;
                prev = `<circle cx="${ps/2}" cy="${ps/2}" r="${pr}" fill="${f.color}" opacity="0.25"/>`;
                for (let i=0; i<f.d; i++) {
                    const p1 = fracPolarXY(ps/2, ps/2, pr, i*a);
                    const p2 = fracPolarXY(ps/2, ps/2, pr, (i+1)*a);
                    prev += `<path d="M${ps/2},${ps/2} L${p1.x},${p1.y} A${pr},${pr},0,${a>180?1:0},1,${p2.x},${p2.y}Z" fill="${f.color}" stroke="white" stroke-width="0.8"/>`;
                }
            }
            btn.innerHTML = `
                <svg width="${ps}" height="${ps}" viewBox="0 0 ${ps} ${ps}" class="shrink-0 drop-shadow-sm">${prev}</svg>
                <div>
                    <div class="text-sm font-bold text-soft-text">${f.label}</div>
                    <div class="text-xs text-soft-muted">Klicka för att lägga till</div>
                </div>`;
            btn.onclick = () => addFractionCircle(f.d, f.color);
            container.appendChild(btn);
        });

        // Global pointer handlers for ALL fraction dragging
        const ws = document.getElementById('workspace-fractions');
        ws.addEventListener('pointermove', fracOnMove);
        ws.addEventListener('pointerup',   fracOnUp);
        ws.addEventListener('pointercancel', fracOnUp);
        // Also catch moves that escape the workspace
        document.addEventListener('pointermove', fracOnMove);
        document.addEventListener('pointerup',   fracOnUp);
        document.addEventListener('pointercancel', fracOnUp);
    }

    function fracPolarXY(cx, cy, r, deg) {
        const rad = (deg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    function buildCircleSVG(d, color) {
        const cx = FRAC_R + 4, cy = FRAC_R + 4, r = FRAC_R;
        const textColor = (color === '#dec894') ? '#5a4a1a' : '#ffffff';
        const angleStep = 360 / d;
        const labels = getFracLabels(d);
        let paths = '';
        if (d === 1) {
            paths  = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="white" stroke-width="2.5"/>`;
            const fs = labels.length <= 1 ? 22 : labels.length === 2 ? 18 : 14;
            paths += buildStackedLabels(cx, cy, labels, fs, textColor);
        } else {
            for (let i = 0; i < d; i++) {
                const startA = i * angleStep, endA = startA + angleStep;
                const p1 = fracPolarXY(cx, cy, r, startA);
                const p2 = fracPolarXY(cx, cy, r, endA);
                const lg = angleStep > 180 ? 1 : 0;
                paths += `<path d="M${cx},${cy} L${p1.x},${p1.y} A${r},${r},0,${lg},1,${p2.x},${p2.y}Z" fill="${color}" stroke="white" stroke-width="2.5" data-slice="${i}" class="frac-slice"/>`;
                const lp = fracPolarXY(cx, cy, r * 0.62, startA + angleStep/2);
                const fsBase = d <= 4 ? 16 : d <= 8 ? 13 : 11;
                const fs = labels.length >= 3 ? Math.max(8, fsBase - 2) : fsBase;
                paths += buildStackedLabels(lp.x, lp.y, labels, fs, textColor);
            }
        }
        return `<svg width="${FRAC_SVG}" height="${FRAC_SVG}" viewBox="0 0 ${FRAC_SVG} ${FRAC_SVG}" style="overflow:visible;display:block;">${paths}</svg>`;
    }

    function makeFracElement(el, x, y) {
        el.className = 'frac-piece';
        el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${FRAC_SVG}px;height:${FRAC_SVG}px;cursor:grab;user-select:none;touch-action:none;filter:drop-shadow(0 4px 10px rgba(74,75,80,0.2));z-index:${++zIndexCounter};transform-origin:top left;`;
        el.dataset.x = x;
        el.dataset.y = y;
        el.dataset.scale = 1;
    }

    function addFracDragListener(el) {
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            // Check if this is a slice pointerdown — handled by slice logic instead
            if (el.dataset.isSliceSource === 'true') return;
            e.preventDefault();
            e.stopPropagation();
            fracStartDrag(el, e);
        });
    }

    function addFractionCircle(d, color) {
        const ws = document.getElementById('workspace-fractions');
        const x = ws.clientWidth/2 - FRAC_SVG * FRAC_BOARD_SCALE / 2 + (Math.random()*80 - 40);
        const y = ws.clientHeight - FRAC_SVG * FRAC_BOARD_SCALE - 24 + (Math.random()*30 - 15);

        const wrapper = document.createElement('div');
        makeFracElement(wrapper, x, y);
        wrapper.dataset.scale = FRAC_BOARD_SCALE;
        wrapper.dataset.d = d;
        wrapper.dataset.color = color;
        wrapper.innerHTML = buildCircleSVG(d, color);
        ws.appendChild(wrapper);
        applyFracTransform(wrapper);
        addMoveHandle(wrapper);
        addResizeHandle(wrapper);

        if (d === 1) {
            // Whole circle — just drag the whole thing
            addFracDragListener(wrapper);
        } else {
            // Drag circle body (non-slice area) moves the whole circle
            wrapper.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                if (e.target.classList.contains('frac-slice')) return; // slices handle themselves
                e.preventDefault();
                e.stopPropagation();
                fracStartDrag(wrapper, e);
            });

            // Each slice can be pulled out
            const slices = wrapper.querySelectorAll('.frac-slice');
            slices.forEach((slice, i) => {
                let sliceDownX, sliceDownY, pulled = false, looseEl = null;

                slice.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    sliceDownX = e.clientX;
                    sliceDownY = e.clientY;
                    pulled = false;
                    looseEl = null;

                    // Temporarily listen on the document for this pointer
                    function onSliceMove(ev) {
                        if (ev.pointerId !== e.pointerId) return;
                        const dx = ev.clientX - sliceDownX;
                        const dy = ev.clientY - sliceDownY;
                        const dist = Math.sqrt(dx*dx + dy*dy);

                        if (!pulled && dist > 10) {
                            pulled = true;
                            // Spawn loose slice at current pointer position
                            looseEl = spawnLooseSlice(d, i, color, ev.clientX, ev.clientY, ws, parseFloat(wrapper.dataset.scale));
                            // Hand off to global frac drag
                            fracStartDrag(looseEl, ev);
                        }
                        // Once pulled, global fracOnMove handles movement
                    }

                    function onSliceUp(ev) {
                        if (ev.pointerId !== e.pointerId) return;
                        document.removeEventListener('pointermove', onSliceMove);
                        document.removeEventListener('pointerup',   onSliceUp);
                        document.removeEventListener('pointercancel', onSliceUp);
                        // If never pulled far enough, treat as tap (no-op)
                        if (!pulled) {
                            fracDrag = null;
                        }
                    }

                    document.addEventListener('pointermove', onSliceMove);
                    document.addEventListener('pointerup',   onSliceUp);
                    document.addEventListener('pointercancel', onSliceUp);
                });
            });
        }
    }

    function buildLooseSliceSVG(d, sliceIndex, color) {
        const cx = FRAC_R + 4, cy = FRAC_R + 4, r = FRAC_R;
        const textColor = (color === '#dec894') ? '#5a4a1a' : '#ffffff';
        const angleStep = 360 / d;
        const startA = sliceIndex * angleStep;
        const p1 = fracPolarXY(cx, cy, r, startA);
        const p2 = fracPolarXY(cx, cy, r, startA + angleStep);
        const lg = angleStep > 180 ? 1 : 0;
        const lp = fracPolarXY(cx, cy, r * 0.62, startA + angleStep/2);
        const labels = getFracLabels(d);
        const fsBase = d <= 4 ? 16 : d <= 8 ? 13 : 11;
        const fs = labels.length >= 3 ? Math.max(8, fsBase - 2) : fsBase;
        const path = `<path d="M${cx},${cy} L${p1.x},${p1.y} A${r},${r},0,${lg},1,${p2.x},${p2.y}Z" fill="${color}" stroke="white" stroke-width="2.5"/>`;
        return `<svg width="${FRAC_SVG}" height="${FRAC_SVG}" viewBox="0 0 ${FRAC_SVG} ${FRAC_SVG}" style="overflow:visible;display:block;">${path}${buildStackedLabels(lp.x, lp.y, labels, fs, textColor)}</svg>`;
    }

    function spawnLooseSlice(d, sliceIndex, color, clientX, clientY, ws, scale) {
        const wsRect = ws.getBoundingClientRect();
        const s = scale || 1;
        const el = document.createElement('div');
        const nx = clientX - wsRect.left - FRAC_SVG * s / 2;
        const ny = clientY - wsRect.top  - FRAC_SVG * s / 2;
        makeFracElement(el, nx, ny);
        el.dataset.scale = s;
        el.dataset.isLoose = 'true';
        el.dataset.looseD = d;
        el.dataset.looseSlice = sliceIndex;
        el.dataset.looseColor = color;
        el.innerHTML = buildLooseSliceSVG(d, sliceIndex, color);
        ws.appendChild(el);
        applyFracTransform(el);

        // Loose slice gets normal drag on subsequent pointerdown
        addFracDragListener(el);
        addResizeHandle(el);
        return el;
    }

    function clearFractionWorkspace() {
        const ws = document.getElementById('workspace-fractions');
        ws.querySelectorAll('.frac-piece').forEach(el => el.remove());
        fracDrag = null;
    }


    // ===================== NUMBER LINES =====================
    let nlState = null; // current number line state

    // Toggle the custom number line panel
    function toggleCustomNLPanel() {
        const panel = document.getElementById('nl-custom-panel');
        panel.classList.toggle('hidden');
        panel.classList.toggle('flex');
    }

    // Apply user-configured number line
    function applyCustomNumberLine() {
        const from = parseFloat(document.getElementById('nl-from').value);
        const to   = parseFloat(document.getElementById('nl-to').value);
        const checkedStep = document.querySelector('input[name="nl-step"]:checked');
        const stepVal = checkedStep ? parseFloat(checkedStep.value) : 1;
        if (isNaN(from) || isNaN(to) || to <= from) {
            alert('Ange giltiga värden: "Från" måste vara mindre än "Till".');
            return;
        }
        let step, decimalPlaces;
        if (stepVal === 0.01) {
            step = 0.01; decimalPlaces = 2;
        } else if (stepVal === 0.1) {
            step = 0.1;  decimalPlaces = 1;
        } else {
            step = stepVal; decimalPlaces = 0;
        }
        setNumberLine(from, to, step, decimalPlaces);
    }

    // setNumberLine(min, max, step, decimalPlaces=0)
    //   decimalPlaces: 0 = integers, 1 = tenths (0,1), 2 = hundredths (0,01)
    function setNumberLine(min, max, step, decimalPlaces=0) {
        // Accept legacy boolean true/false for decimalPlaces
        if (decimalPlaces === true)  decimalPlaces = 1;
        if (decimalPlaces === false) decimalPlaces = 0;

        nlState = {min, max, step, decimalPlaces};
        const container = document.getElementById('numberline-container');
        container.innerHTML = '';

        const W = 960, H = 130, lineY = 65, pad = 55;
        const numTicks = Math.round((max - min) / step);
        const pxPerTick = (W - 2*pad) / numTicks;
        const markerSize = 44;

        // SVG
        const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.setAttribute("class", "w-full drop-shadow-sm");
        svg.style.cssText = "overflow:visible;display:block;flex-shrink:0;";

        // Defs first so marker is defined before it is referenced
        const defs = document.createElementNS("http://www.w3.org/2000/svg","defs");
        defs.innerHTML = `<marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,8 L10,4 Z" fill="#4a4b50"/></marker>`;
        svg.appendChild(defs);

        // Arrow line — end point well past the last tick so the arrowhead clears it
        const arrow = document.createElementNS("http://www.w3.org/2000/svg","line");
        arrow.setAttribute("x1", pad-10); arrow.setAttribute("y1", lineY);
        arrow.setAttribute("x2", W-pad+28); arrow.setAttribute("y2", lineY);
        arrow.setAttribute("stroke","#4a4b50"); arrow.setAttribute("stroke-width","4");
        arrow.setAttribute("marker-end","url(#arrow)"); svg.appendChild(arrow);

        // Helper: determine whether tick i is a "major" (labelled) tick
        function isMajorTick(val, i) {
            if (decimalPlaces === 2) {
                // hundredths: label at every tenth (0.1 boundary), use tolerance for float precision
                return Math.abs(val * 10 - Math.round(val * 10)) < 0.001;
            }
            if (decimalPlaces === 1) {
                if (numTicks <= 30)  return true;            // ≤30 ticks: all
                if (numTicks <= 100) return Math.abs((val * 10) - Math.round(val * 10 / 5) * 5) < 0.001; // every 0.5
                return Math.abs(val - Math.round(val)) < step / 2; // whole numbers
            }
            // integers
            if (numTicks > 20) return val % 10 === 0;
            if (numTicks > 10) return val % 5 === 0;
            return true;
        }

        // Ticks and labels
        for (let i = 0; i <= numTicks; i++) {
            const val = parseFloat((min + i*step).toFixed(10));
            const x = pad + i * pxPerTick;
            const major = isMajorTick(val, i);
            const tickH = major ? 16 : 8;

            const tick = document.createElementNS("http://www.w3.org/2000/svg","line");
            tick.setAttribute("x1", x); tick.setAttribute("y1", lineY - tickH);
            tick.setAttribute("x2", x); tick.setAttribute("y2", lineY + tickH);
            tick.setAttribute("stroke","#4a4b50");
            tick.setAttribute("stroke-width", major ? "2.5" : "1.2");
            svg.appendChild(tick);

            if (major) {
                const fontSize = decimalPlaces === 2 ? 11 : decimalPlaces === 1 ? 13 : 15;
                const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
                txt.setAttribute("x", x); txt.setAttribute("y", lineY + 36);
                txt.setAttribute("text-anchor","middle");
                txt.setAttribute("font-family","Nunito,sans-serif");
                txt.setAttribute("font-weight","bold");
                txt.setAttribute("font-size", fontSize);
                txt.setAttribute("fill","#4a4b50");
                txt.textContent = decimalPlaces > 0 ? val.toFixed(decimalPlaces).replace('.',',') : val;
                svg.appendChild(txt);
            }
        }

        container.appendChild(svg);

        // Display box — shows current value and delta
        const display = document.createElement('div');
        display.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;margin-top:12px;';
        display.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <div id="nl-display" style="font-family:Nunito,sans-serif;font-size:2rem;font-weight:900;color:#1a2e5a;background:#f0f3f8;border:2px solid #8db1d1;border-radius:14px;padding:6px 22px;min-width:90px;text-align:center;">0</div>
            </div>
            <div id="nl-delta" style="font-family:Nunito,sans-serif;font-size:1rem;font-weight:700;color:#4f7c75;min-height:1.4rem;"></div>
        `;
        container.appendChild(display);

        // Draggable arrow marker (points down to the number line)
        const marker = document.createElement('div');
        marker.style.cssText = `position:absolute;width:${markerSize}px;top:0;left:0;cursor:grab;user-select:none;touch-action:none;display:flex;flex-direction:column;align-items:center;`;
        marker.innerHTML = `
            <div style="background:#1a2e5a;color:white;font-family:Nunito,sans-serif;font-size:13px;font-weight:900;padding:3px 8px;border-radius:8px;box-shadow:0 3px 10px rgba(26,46,90,0.35);white-space:nowrap;" id="nl-arrow-label">0</div>
            <div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:12px solid #1a2e5a;margin-top:-1px;filter:drop-shadow(0 2px 3px rgba(26,46,90,0.2));"></div>
        `;
        container.appendChild(marker);

        function fmtVal(v) {
            return decimalPlaces > 0 ? v.toFixed(decimalPlaces).replace('.', ',') : v;
        }

        // Position helpers — convert between value and pixel x within container
        function valToContainerX(v) {
            const svgEl = container.querySelector('svg');
            const svgRect = svgEl.getBoundingClientRect();
            const conRect = container.getBoundingClientRect();
            const svgOffsetX = svgRect.left - conRect.left;
            const ratio = svgRect.width / W;
            return svgOffsetX + (pad + ((v - min)/step) * pxPerTick) * ratio - markerSize/2;
        }

        function containerXToVal(px) {
            const svgEl = container.querySelector('svg');
            const svgRect = svgEl.getBoundingClientRect();
            const conRect = container.getBoundingClientRect();
            const svgOffsetX = svgRect.left - conRect.left;
            const ratio = svgRect.width / W;
            const raw = (px + markerSize/2 - svgOffsetX) / ratio;
            const tickIndex = Math.round((raw - pad) / pxPerTick);
            const clamped = Math.max(0, Math.min(numTicks, tickIndex));
            return parseFloat((min + clamped * step).toFixed(10));
        }

        let currentVal = min;
        let prevVal = null;

        function updateDisplay(val, snap=true) {
            const snappedVal = snap ? containerXToVal(valToContainerX(val) + markerSize/2 - markerSize/2) : val;
            const dispX = valToContainerX(snappedVal);
            marker.style.left = dispX + 'px';
            const svgEl = container.querySelector('svg');
            const svgRect = svgEl.getBoundingClientRect();
            const topOffset = svgRect.top - container.getBoundingClientRect().top;
            const arrowH = 38;
            marker.style.top = (topOffset + (lineY / H) * svgRect.height - arrowH) + 'px';

            const dispEl = document.getElementById('nl-display');
            const arrowLabel = document.getElementById('nl-arrow-label');
            const deltaEl = document.getElementById('nl-delta');
            const valStr = fmtVal(snappedVal);
            if (dispEl) dispEl.textContent = valStr;
            if (arrowLabel) arrowLabel.textContent = valStr;
            if (deltaEl && prevVal !== null && snappedVal !== prevVal) {
                const diff = parseFloat((snappedVal - prevVal).toFixed(10));
                const sign = diff > 0 ? '+' : '';
                deltaEl.textContent = `${fmtVal(prevVal)} ${diff>0?'→':'←'} ${fmtVal(snappedVal)}  (${sign}${fmtVal(diff)})`;
                deltaEl.style.color = diff > 0 ? '#4f7c75' : '#a85c72';
            } else if (deltaEl && prevVal === null) {
                deltaEl.textContent = '';
            }
            currentVal = snappedVal;
        }

        // Drag interaction
        let dragging = false, dragStartX, markerStartLeft;
        marker.addEventListener('pointerdown', (e) => {
            dragging = true;
            dragStartX = e.clientX;
            markerStartLeft = parseFloat(marker.style.left) || 0;
            prevVal = currentVal;
            marker.setPointerCapture(e.pointerId);
            marker.style.cursor = 'grabbing';
            e.preventDefault();
        });
        marker.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const newLeft = markerStartLeft + (e.clientX - dragStartX);
            const rawVal = containerXToVal(newLeft);
            marker.style.left = valToContainerX(rawVal) + 'px';
            const dispEl = document.getElementById('nl-display');
            const arrowLbl = document.getElementById('nl-arrow-label');
            if (dispEl) dispEl.textContent = fmtVal(rawVal);
            if (arrowLbl) arrowLbl.textContent = fmtVal(rawVal);
            currentVal = rawVal;
        });
        marker.addEventListener('pointerup', (e) => {
            dragging = false;
            marker.style.cursor = 'grab';
            marker.releasePointerCapture(e.pointerId);
            updateDisplay(currentVal);
        });

        // Initial placement after layout
        setTimeout(() => {
            updateDisplay(min);
            prevVal = null;
            const deltaEl = document.getElementById('nl-delta');
            if (deltaEl) deltaEl.textContent = '';
        }, 80);
    }

    // ===================== GEOMETRY =====================
    // Track all independent 3D scenes (one per card)
    let geo3DCards = []; // [{el, scene, camera, renderer, mesh, animId, isDragging, prevX, prevY}]
    let geo3DAutoRotate = true;
    function toggleGeo3DSpin() {
        geo3DAutoRotate = !geo3DAutoRotate;
        const lbl = document.getElementById('lbl-3d-spin');
        if (lbl) lbl.textContent = `Rotation: ${geo3DAutoRotate ? 'PÅ' : 'AV'}`;
    }

    // --- 2D shapes ---
    function add2DShape(type) {
        const ws = document.getElementById('workspace-geometry');
        const size = 200;
        const x = ws.clientWidth / 2 - size / 2 + (Math.random() * 60 - 30);
        const y = ws.clientHeight - size - 20 + (Math.random() * 30 - 15);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;transform-origin:center center;`;
        wrapper.dataset.x = x; wrapper.dataset.y = y; wrapper.dataset.rot = 0; wrapper.dataset.scale = 1;
        let s = '';
        if (type === 'square')        s = `<rect x="10" y="10" width="100" height="100" fill="#ffffff" stroke="#000000" stroke-width="2"/>`;
        else if (type === 'circle')   s = `<circle cx="60" cy="60" r="50" fill="#ffffff" stroke="#000000" stroke-width="2"/>`;
        else if (type === 'triangle') s = `<polygon points="60,10 110,100 10,100" fill="#ffffff" stroke="#000000" stroke-width="2" stroke-linejoin="round"/>`;
        else if (type === 'rectangle')s = `<rect x="5" y="25" width="110" height="70" fill="#ffffff" stroke="#000000" stroke-width="2"/>`;
        else if (type === 'pentagon') { const pts=Array.from({length:5},(_,i)=>{const a=(i*72-90)*Math.PI/180;return `${60+50*Math.cos(a)},${60+50*Math.sin(a)}`;}).join(' '); s=`<polygon points="${pts}" fill="#ffffff" stroke="#000000" stroke-width="2"/>`; }
        else if (type === 'hexagon')  { const pts=Array.from({length:6},(_,i)=>{const a=(i*60-90)*Math.PI/180;return `${60+50*Math.cos(a)},${60+50*Math.sin(a)}`;}).join(' '); s=`<polygon points="${pts}" fill="#ffffff" stroke="#000000" stroke-width="2"/>`; }
        else if (type === 'rhombus')  s = `<polygon points="60,8 110,60 60,112 10,60" fill="#ffffff" stroke="#000000" stroke-width="2"/>`;
        else if (type === 'parallelogram') s = `<polygon points="25,100 5,20 95,20 115,100" fill="#ffffff" stroke="#000000" stroke-width="2"/>`;
        wrapper.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 120 120">${s}</svg>`;
        ws.appendChild(wrapper);
        addGeoResizeHandle(wrapper);
        makeDraggable(wrapper, 'workspace-geometry');
    }

    function addGeoResizeHandle(el) {
        const handle = document.createElement('div');
        handle.className = 'geo-resize-handle';
        handle.textContent = '⌟';
        let resizing = false, startScale, startDist, pointerId;
        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            resizing = true; pointerId = e.pointerId;
            startScale = parseFloat(el.dataset.scale) || 1;
            startDist = e.clientX;
            const baseSize = parseFloat(el.style.width) || 120;
            function onMove(ev) {
                if (ev.pointerId !== pointerId) return;
                const delta = ev.clientX - startDist;
                const newScale = Math.max(0.3, Math.min(5, startScale + delta / baseSize));
                el.dataset.scale = newScale;
                window.updateTransform(el);
            }
            function onUp(ev) {
                if (ev.pointerId !== pointerId) return;
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
            }
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
        el.appendChild(handle);
    }

    // updateTransform now handles scale natively via window.updateTransform

    // --- Angle tool ---
    function addAngleTool() {
        const ws = document.getElementById('workspace-geometry');
        const cardW = 260, cardTotalH = 258;
        const headerH = 28, svgH = 170;
        const x = ws.clientWidth / 2 - cardW / 2 + (Math.random() * 60 - 30);
        const y = Math.max(10, ws.clientHeight - cardTotalH - 20 + (Math.random() * 30 - 15));

        const card = document.createElement('div');
        card.className = 'angle-card';
        card.style.cssText = `width:${cardW}px;height:${cardTotalH}px;left:0;top:0;position:absolute;transform-origin:top left;`;
        card.dataset.x = x; card.dataset.y = y; card.dataset.rot = 0; card.dataset.scale = 1;
        let angleDeg = 45;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `width:100%;height:${headerH}px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#6a6b70;user-select:none;cursor:move;background:rgba(91,128,165,0.12);border-bottom:1px solid #d6d4d0;border-radius:14px 14px 0 0;box-sizing:border-box;`;
        header.textContent = '⠿ Vinkel';
        card.appendChild(header);

        // SVG canvas
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', cardW);
        svg.setAttribute('height', svgH);
        svg.setAttribute('viewBox', '-10 0 270 170');
        svg.style.cssText = 'display:block;overflow:visible;';
        card.appendChild(svg);

        // SVG constants
        const vx = 115, vy = 155;   // vertex position
        const rayLen = 120;          // movable ray length
        const fixedLen = 128;        // fixed ray length (goes right)
        const arcR = 40;             // arc radius
        const sq = 15;               // right-angle square size

        // Fixed ray (horizontal)
        const fixedRay = document.createElementNS(svgNS, 'line');
        fixedRay.setAttribute('x1', vx); fixedRay.setAttribute('y1', vy);
        fixedRay.setAttribute('x2', vx + fixedLen); fixedRay.setAttribute('y2', vy);
        fixedRay.setAttribute('stroke', '#4f7c75'); fixedRay.setAttribute('stroke-width', '3');
        fixedRay.setAttribute('stroke-linecap', 'round');
        svg.appendChild(fixedRay);

        // Vertex dot
        const vertexDot = document.createElementNS(svgNS, 'circle');
        vertexDot.setAttribute('cx', vx); vertexDot.setAttribute('cy', vy);
        vertexDot.setAttribute('r', '4'); vertexDot.setAttribute('fill', '#4a4b50');
        svg.appendChild(vertexDot);

        // Arc / right-angle symbol
        const arcPath = document.createElementNS(svgNS, 'path');
        arcPath.setAttribute('fill', 'none');
        arcPath.setAttribute('stroke', '#5b80a5');
        arcPath.setAttribute('stroke-width', '2.5');
        arcPath.setAttribute('stroke-linecap', 'round');
        svg.appendChild(arcPath);

        // Movable ray
        const movableRay = document.createElementNS(svgNS, 'line');
        movableRay.setAttribute('stroke', '#a85c72'); movableRay.setAttribute('stroke-width', '3');
        movableRay.setAttribute('stroke-linecap', 'round');
        svg.appendChild(movableRay);

        // Degree label near arc
        const degLabel = document.createElementNS(svgNS, 'text');
        degLabel.setAttribute('text-anchor', 'middle');
        degLabel.setAttribute('fill', '#5b80a5');
        degLabel.setAttribute('font-size', '13');
        degLabel.setAttribute('font-weight', '700');
        degLabel.setAttribute('font-family', 'Nunito, sans-serif');
        degLabel.setAttribute('pointer-events', 'none');
        svg.appendChild(degLabel);

        // Draggable handle at movable ray tip
        const handle = document.createElementNS(svgNS, 'circle');
        handle.setAttribute('r', '10');
        handle.setAttribute('fill', '#a85c72');
        handle.setAttribute('fill-opacity', '0.2');
        handle.setAttribute('stroke', '#a85c72');
        handle.setAttribute('stroke-width', '2');
        handle.style.cursor = 'grab';
        svg.appendChild(handle);

        // UI area (input + category)
        const uiArea = document.createElement('div');
        uiArea.style.cssText = 'padding:8px 12px;display:flex;flex-direction:column;gap:5px;background:white;border-top:1px solid #f0f0ee;border-radius:0 0 14px 14px;';
        uiArea.addEventListener('pointerdown', (e) => e.stopPropagation());
        card.appendChild(uiArea);

        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const inputLabel = document.createElement('label');
        inputLabel.textContent = 'Grader:';
        inputLabel.style.cssText = 'font-size:12px;font-weight:700;color:#4a4b50;white-space:nowrap;';

        const inputField = document.createElement('input');
        inputField.type = 'number';
        inputField.min = '1'; inputField.max = '179'; inputField.step = '1';
        inputField.style.cssText = 'width:56px;border:1.5px solid #d6d4d0;border-radius:8px;padding:3px 6px;font-size:13px;font-weight:700;color:#4a4b50;text-align:center;outline:none;font-family:Nunito,sans-serif;';

        const degSign = document.createElement('span');
        degSign.textContent = '°';
        degSign.style.cssText = 'font-size:13px;font-weight:700;color:#4a4b50;';

        inputRow.appendChild(inputLabel);
        inputRow.appendChild(inputField);
        inputRow.appendChild(degSign);
        uiArea.appendChild(inputRow);

        const catLabel = document.createElement('div');
        catLabel.style.cssText = 'font-size:12px;font-weight:700;text-align:center;padding:3px 8px;border-radius:8px;';
        uiArea.appendChild(catLabel);

        // Snap-to-common-angles
        const SNAP_ANGLES = [30, 45, 60, 90, 120, 135, 150];
        const SNAP_THRESH = 4;
        function snapAngle(deg) {
            for (const s of SNAP_ANGLES) {
                if (Math.abs(deg - s) <= SNAP_THRESH) return s;
            }
            return Math.round(deg);
        }

        function getCategory(deg) {
            if (deg === 90) return { text: 'Rät vinkel ∟', color: '#4f7c75', bg: 'rgba(139,179,156,0.22)' };
            if (deg < 90)  return { text: 'Spetsig vinkel', color: '#5b80a5', bg: 'rgba(141,177,209,0.22)' };
            return { text: 'Trubbig vinkel', color: '#a85c72', bg: 'rgba(213,139,153,0.22)' };
        }

        function updateAngleTool(deg, skipInput) {
            deg = Math.max(1, Math.min(179, Math.round(deg)));
            angleDeg = deg;
            const rad = deg * Math.PI / 180;
            const ex = vx + rayLen * Math.cos(rad);
            const ey = vy - rayLen * Math.sin(rad);

            // Movable ray
            movableRay.setAttribute('x1', vx); movableRay.setAttribute('y1', vy);
            movableRay.setAttribute('x2', ex);  movableRay.setAttribute('y2', ey);

            // Handle
            handle.setAttribute('cx', ex); handle.setAttribute('cy', ey);

            // Arc or right-angle square
            if (deg === 90) {
                arcPath.setAttribute('d', `M ${vx+sq},${vy} L ${vx+sq},${vy-sq} L ${vx},${vy-sq}`);
            } else {
                const bx = vx + arcR * Math.cos(rad);
                const by = vy - arcR * Math.sin(rad);
                arcPath.setAttribute('d', `M ${vx+arcR},${vy} A ${arcR},${arcR},0,0,0,${bx.toFixed(2)},${by.toFixed(2)}`);
            }

            // Degree label midway along arc
            const halfRad = (deg / 2) * Math.PI / 180;
            const lr = arcR + 18;
            degLabel.setAttribute('x', (vx + lr * Math.cos(halfRad)).toFixed(2));
            degLabel.setAttribute('y', (vy - lr * Math.sin(halfRad) + 5).toFixed(2));
            degLabel.textContent = deg + '\u00b0';

            // Category
            const cat = getCategory(deg);
            catLabel.textContent = cat.text;
            catLabel.style.color = cat.color;
            catLabel.style.background = cat.bg;

            if (!skipInput) inputField.value = deg;
        }

        // Input field handlers
        inputField.addEventListener('input', () => {
            const v = parseInt(inputField.value, 10);
            if (!isNaN(v) && v >= 1 && v <= 179) updateAngleTool(v, true);
        });
        inputField.addEventListener('blur', () => {
            let v = parseInt(inputField.value, 10);
            if (isNaN(v) || v < 1) v = 1;
            if (v > 179) v = 179;
            updateAngleTool(v, false);
            inputField.style.borderColor = '#d6d4d0';
        });
        inputField.addEventListener('focus', () => { inputField.style.borderColor = '#5b80a5'; });

        // Handle drag for movable ray
        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            handle.setPointerCapture(e.pointerId);
            handle.style.cursor = 'grabbing';
            function onMove(ev) {
                const rect = svg.getBoundingClientRect();
                // viewBox: x from -10, width 270, height 170
                const mx = (ev.clientX - rect.left) / rect.width * 270 - 10;
                const my = (ev.clientY - rect.top)  / rect.height * 170;
                const dx = mx - vx;
                const dy = vy - my; // invert y (SVG y-axis goes down)
                let deg = Math.atan2(dy, dx) * 180 / Math.PI;
                deg = Math.max(1, Math.min(179, deg));
                deg = snapAngle(deg);
                updateAngleTool(deg);
            }
            function onUp(ev) {
                handle.releasePointerCapture(ev.pointerId);
                handle.style.cursor = 'grab';
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
            }
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });

        // Resize handle
        const rh = document.createElement('div');
        rh.className = 'geo-resize-handle';
        rh.textContent = '⌟';
        let rhStart, rhScale, rhPid;
        rh.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            rhPid = e.pointerId;
            rhStart = e.clientX; rhScale = parseFloat(card.dataset.scale) || 1;
            function onMove(ev) {
                if (ev.pointerId !== rhPid) return;
                const ns = Math.max(0.4, Math.min(4, rhScale + (ev.clientX - rhStart) / cardW));
                card.dataset.scale = ns;
                window.updateTransform(card);
            }
            function onUp(ev) {
                if (ev.pointerId !== rhPid) return;
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
            }
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
        card.appendChild(rh);

        ws.appendChild(card);
        makeDraggable(card, 'workspace-geometry');
        updateAngleTool(angleDeg);
    }

    // --- 3D cards (independent mini Three.js scenes) ---
    function add3DCard(type) {
        const ws = document.getElementById('workspace-geometry');
        const cardSize = 240;
        const headerH = 24;
        const x = ws.clientWidth / 2 - cardSize / 2 + (Math.random() * 80 - 40);
        const y = ws.clientHeight - (cardSize + headerH) - 20 + (Math.random() * 30 - 15);

        const card = document.createElement('div');
        card.className = 'geo-3d-card';
        card.style.cssText = `width:${cardSize}px;height:${cardSize + headerH}px;left:0;top:0;position:absolute;transform-origin:top left;`;
        card.dataset.x = x; card.dataset.y = y; card.dataset.scale = 1;

        // Header strip – used to drag/move the card
        const typeLabels = {cylinder:'Cylinder', cube:'Kub', cuboid:'Rätblock', sphere:'Klot', pyramid:'Pyramid', cone:'Kon'};
        const header = document.createElement('div');
        header.style.cssText = `width:100%;height:${headerH}px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#6a6b70;user-select:none;cursor:move;background:rgba(100,110,130,0.12);border-radius:10px 10px 0 0;`;
        header.textContent = `⠿ ${typeLabels[type] || type}`;
        card.appendChild(header);

        ws.appendChild(card);

        // Three.js mini scene
        const state = initMini3D(card, type, cardSize);
        geo3DCards.push(state);

        // Rotate overlay – covers canvas area, allows drag-to-rotate the 3D mesh
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:absolute;top:${headerH}px;left:0;width:100%;height:${cardSize}px;z-index:5;cursor:grab;`;
        let rot3D = false, prevX3D = 0, prevY3D = 0;
        overlay.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            overlay.setPointerCapture(e.pointerId);
            rot3D = true;
            state.manualRotating = true;
            prevX3D = e.clientX; prevY3D = e.clientY;
            overlay.style.cursor = 'grabbing';
        });
        overlay.addEventListener('pointermove', (e) => {
            if (!rot3D) return;
            const dx = e.clientX - prevX3D, dy = e.clientY - prevY3D;
            state.mesh.rotation.y += dx * 0.01;
            state.mesh.rotation.x += dy * 0.01;
            prevX3D = e.clientX; prevY3D = e.clientY;
        });
        overlay.addEventListener('pointerup', () => { rot3D = false; state.manualRotating = false; overlay.style.cursor = 'grab'; });
        card.appendChild(overlay);

        // Resize handle
        const rh = document.createElement('div');
        rh.className = 'geo-resize-handle';
        rh.textContent = '⌟';
        let rStart, rScale, rPid;
        rh.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            rPid = e.pointerId;
            rStart = e.clientX; rScale = parseFloat(card.dataset.scale)||1;
            function onMove(ev) {
                if (ev.pointerId !== rPid) return;
                const ns = Math.max(0.4, Math.min(4, rScale + (ev.clientX - rStart) / cardSize));
                card.dataset.scale = ns;
                window.updateTransform(card);
            }
            function onUp(ev) {
                if (ev.pointerId !== rPid) return;
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
            }
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
        card.appendChild(rh);

        makeDraggable(card, 'workspace-geometry');
    }

    function applyCardTransform(card) {
        const x = parseFloat(card.dataset.x)||0, y = parseFloat(card.dataset.y)||0;
        const s = parseFloat(card.dataset.scale)||1;
        card.style.left = x + 'px';
        card.style.top  = y + 'px';
        card.style.transform = `scale(${s})`;
    }

    function initMini3D(card, type, size) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000); camera.position.z = 5;
        const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
        renderer.setSize(size, size); renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x000000, 0);
        const canvas = renderer.domElement;
        canvas.style.cssText = `display:block;width:${size}px;height:${size}px;pointer-events:none;`;
        card.appendChild(canvas);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(5,5,5); scene.add(dl);
        const dl2 = new THREE.DirectionalLight(0xffffff, 0.3); dl2.position.set(-5,-3,5); scene.add(dl2);

        const shapeMap = {
            cube:     [new THREE.BoxGeometry(2,2,2),     0x4f7c75, false],
            cuboid:   [new THREE.BoxGeometry(2.8,1.8,1.6),0x5b80a5, false],
            sphere:   [new THREE.SphereGeometry(1.5,32,32), 0xa85c72, false],
            pyramid:  [new THREE.ConeGeometry(1.5,2,4),  0xdec894, true],
            cylinder: [new THREE.CylinderGeometry(1,1,2.5,32), 0x5b80a5, false],
            cone:     [new THREE.ConeGeometry(1,2.5,32), 0x938db3, false]
        };
        const [geo, color, flat] = shapeMap[type] || shapeMap['cube'];
        // polygonOffset pushes faces slightly back so edge lines render cleanly on top
        const mat = new THREE.MeshPhongMaterial({color, flatShading:flat, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1});
        const mesh = new THREE.Mesh(geo, mat);
        // Only add edge lines on hard-edged shapes (cube, cuboid, pyramid)
        if (type === 'cube' || type === 'cuboid' || type === 'pyramid') {
            mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0x333333, transparent:true, opacity:0.6})));
        }
        mesh.rotation.x = 0.4; mesh.rotation.y = 0.5;
        scene.add(mesh);

        const state = {card, scene, camera, renderer, mesh, canvas, animId: null, manualRotating: false};
        function animate() {
            state.animId = requestAnimationFrame(animate);
            if (geo3DAutoRotate && !state.manualRotating) {
                mesh.rotation.y += 0.006; mesh.rotation.x += 0.002;
            }
            renderer.render(scene, camera);
        }
        animate();
        return state;
    }

    function clearGeoWorkspace() {
        // Stop all 3D animations and dispose
        geo3DCards.forEach(s => {
            cancelAnimationFrame(s.animId);
            s.renderer.dispose();
        });
        geo3DCards = [];
        // Remove all shapes
        const ws = document.getElementById('workspace-geometry');
        ws.querySelectorAll('.draggable-item, .geo-3d-card').forEach(el => el.remove());
        selectedItem = null;
    }

    // Legacy stubs (no longer used but keep switchView from breaking)
    function setGeometryMode(mode) {}
    function init3D() {}
    function set3DShape(type) {}
    function animate3D() {}
    function onWindowResize3D() {}
    function cleanup3D() {}
    // ===================== COUNTING =====================
    let countingMode='friends';
    function setCountingMode(mode) {
        countingMode=mode;
        const fv=document.getElementById('counting-friends'), gv=document.getElementById('counting-grid');
        if(mode==='friends') { fv.classList.remove('hidden'); fv.classList.add('flex'); gv.classList.add('hidden'); gv.classList.remove('flex'); document.querySelectorAll('.ten-friend-item').forEach(e=>e.remove()); initTenFriends(); }
        else { fv.classList.add('hidden'); fv.classList.remove('flex'); gv.classList.remove('hidden'); gv.classList.add('flex'); document.querySelectorAll('.ten-friend-item').forEach(e=>e.remove()); buildMathGrid(mode==='multiplication'); }
    }
    function initTenFriends() {
        document.querySelectorAll('.ten-friend-item').forEach(e=>e.remove());
        const z1=document.getElementById('zone-1'), z2=document.getElementById('zone-2');
        for(let i=0;i<10;i++) {
            const ball=document.createElement('div');
            ball.className='w-12 h-12 rounded-full shadow-md cursor-grab active:cursor-grabbing border-2 border-white draggable-item ten-friend-item';
            ball.style.backgroundColor=i<5?'#a85c72':'#5b80a5'; ball.style.position='absolute'; ball.dataset.zone=i<5?'1':'2';
            makeDraggable(ball,null,(el)=>{
                const r1=z1.getBoundingClientRect(), r2=z2.getBoundingClientRect(), br=el.getBoundingClientRect();
                const cx=br.left+br.width/2, cy=br.top+br.height/2;
                if(isInside(cx,cy,r1)){ el.dataset.zone='1'; el.style.backgroundColor='#a85c72'; }
                else if(isInside(cx,cy,r2)){ el.dataset.zone='2'; el.style.backgroundColor='#5b80a5'; }
                updateTenFriendsCount();
            });
            setTimeout(()=>{ const tz=i<5?z1:z2, rect=tz.getBoundingClientRect(), idx=i%5; ball.dataset.x=rect.left+20+idx*55; ball.dataset.y=rect.top+20; updateTransform(ball); },150);
            document.body.appendChild(ball);
        }
        updateTenFriendsCount();
    }
    function isInside(x,y,rect){ return x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom; }
    function updateTenFriendsCount() { let c1=0,c2=0; document.querySelectorAll('.ten-friend-item').forEach(el=>{ if(el.dataset.zone==='1') c1++; else c2++; }); document.getElementById('friend-count-1').innerText=c1; document.getElementById('friend-count-2').innerText=c2; }
    function buildMathGrid(isMultiplication) {
        const container=document.getElementById('math-table-container'), eq=document.getElementById('grid-equation'); container.innerHTML='';
        const table=document.createElement('table'); table.className='border-collapse';
        let pinned=null, pinnedEq='';
        for(let i=0;i<=10;i++) {
            const tr=document.createElement('tr');
            for(let j=0;j<=10;j++) {
                const td=document.createElement(i===0||j===0?'th':'td');
                td.className=`w-12 h-12 text-center border border-soft-border math-grid-cell cursor-pointer ${i===0||j===0?'bg-soft-bg text-soft-muted font-bold':'text-soft-text'}`;
                let val='';
                if(i===0&&j===0) val=isMultiplication?'×':'÷';
                else if(i===0) val=j; else if(j===0) val=i; else val=i*j;
                td.innerText=val;
                if(i>0&&j>0) {
                    const eqHtml=isMultiplication?`${i} <span class="text-soft-muted">×</span> ${j} <span class="text-soft-muted">=</span> <span class="text-2xl">${i*j}</span>`:`${i*j} <span class="text-soft-muted">÷</span> ${i} <span class="text-soft-muted">=</span> <span class="text-2xl">${j}</span>`;
                    td.onmouseenter=()=>{ Array.from(table.rows).forEach(r=>{if(r.cells[j])r.cells[j].classList.add('highlight-row-col');}); Array.from(tr.cells).forEach(c=>c.classList.add('highlight-row-col')); eq.innerHTML=eqHtml; };
                    td.onmouseleave=()=>{ if(pinned!==td){ Array.from(table.rows).forEach(r=>{if(r.cells[j])r.cells[j].classList.remove('highlight-row-col');}); Array.from(tr.cells).forEach(c=>c.classList.remove('highlight-row-col')); eq.innerHTML=pinned?pinnedEq:'För musen över eller tryck på rutorna'; } };
                    td.onclick=()=>{ table.querySelectorAll('.highlight-row-col').forEach(el=>el.classList.remove('highlight-row-col')); if(pinned===td){pinned=null;pinnedEq='';}else{pinned=td;pinnedEq=eqHtml;} Array.from(table.rows).forEach(r=>{if(r.cells[j])r.cells[j].classList.add('highlight-row-col');}); Array.from(tr.cells).forEach(c=>c.classList.add('highlight-row-col')); eq.innerHTML=eqHtml; };
                }
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        // Touch support: show equation when moving finger over cells
        let touchHoverTd = null;
        const getTdFromPoint = (x, y) => { const el = document.elementFromPoint(x, y); return el ? (el.tagName === 'TD' ? el : (el.closest ? el.closest('td') : null)) : null; };
        const setTouchHover = (td) => { if (td === touchHoverTd) return; if (touchHoverTd && touchHoverTd.onmouseleave) touchHoverTd.onmouseleave(); touchHoverTd = td; if (td && td.onmouseenter) td.onmouseenter(); };
        table.addEventListener('touchstart', (e) => { if (!e.touches.length) return; const t = e.touches[0]; setTouchHover(getTdFromPoint(t.clientX, t.clientY)); }, { passive: true });
        table.addEventListener('touchmove', (e) => { if (!e.touches.length) return; const t = e.touches[0]; setTouchHover(getTdFromPoint(t.clientX, t.clientY)); }, { passive: true });
        table.addEventListener('touchend', () => { touchHoverTd = null; }, { passive: true });
        table.addEventListener('touchcancel', () => { if (touchHoverTd && touchHoverTd.onmouseleave) touchHoverTd.onmouseleave(); touchHoverTd = null; }, { passive: true });
        container.appendChild(table);
    }

    // ===================== CLOCK =====================
    let clockTime = new Date(); clockTime.setHours(10, 10, 0, 0);
    let clockTotalMinutes = 10 * 60 + 10; // track as float to avoid Date rounding issues

    // Layer visibility: layer1=1-12, layer2=13-24, layer3=minute ring, layer4=digital clock
    let clockLayers = { layer1: true, layer2: false, layer3: false, layer4: true };

    function toggleClockLayer(layer) {
        clockLayers[layer] = !clockLayers[layer];
        applyClockLayers();
    }

    function applyClockLayers() {
        const g12         = document.getElementById('clock-numbers-12');
        const g24         = document.getElementById('clock-numbers-24');
        const tealRing    = document.getElementById('clock-teal-ring');
        const minRing     = document.getElementById('clock-minute-ring');
        const digitalSect = document.getElementById('clock-digital-section');

        if (g12)         g12.style.display         = clockLayers.layer1 ? '' : 'none';
        if (g24)         g24.style.display         = clockLayers.layer2 ? '' : 'none';
        if (tealRing)    tealRing.style.display    = clockLayers.layer3 ? '' : 'none';
        if (minRing)     minRing.style.display     = clockLayers.layer3 ? '' : 'none';
        if (digitalSect) digitalSect.style.display = clockLayers.layer4 ? '' : 'none';

        // Update button visuals
        const styles = [
            { id: 'clock-layer-btn-1', active: clockLayers.layer1, color: '#1a2e5a' },
            { id: 'clock-layer-btn-2', active: clockLayers.layer2, color: '#c07000' },
            { id: 'clock-layer-btn-3', active: clockLayers.layer3, color: '#1a6060' },
            { id: 'clock-layer-btn-4', active: clockLayers.layer4, color: '#6d28d9' },
        ];
        styles.forEach(({ id, active, color }) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.style.background   = active ? color  : '#f4f3ef';
            btn.style.color        = active ? 'white' : '#4a4b50';
            btn.style.borderColor  = active ? color  : '#d6d4d0';
        });
    }

    // Convert degrees (0=top, clockwise) to x,y on circle of given radius centred at cx,cy
    function clockXY(cx, cy, r, deg) {
        const rad = (deg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    let clockDragInitialized = false;

    function initClock() {
        drawClockFace();
        applyClockLayers();
        updateClockView();
        // Drag setup deferred — SVG must be visible for getScreenCTM() to work
    }

    function initClockDragIfNeeded() {
        if (clockDragInitialized) return;
        clockDragInitialized = true;
        setupClockDrag(document.getElementById('hand-minute'), 'minute');
        setupClockDrag(document.getElementById('hand-hour'),   'hour');
    }

    function drawClockFace() {
        const CX = 170, CY = 170;

        // ── Minute ring (teal outer band) ──────────────────────────────
        const minRing = document.getElementById('clock-minute-ring');
        minRing.innerHTML = '';
        for (let m = 0; m < 60; m++) {
            const angle = m * 6;
            const isFive = m % 5 === 0;

            // Tick lines between the number bubbles
            if (!isFive) {
                const inner = clockXY(CX, CY, 148, angle);
                const outer = clockXY(CX, CY, 158, angle);
                const tick = document.createElementNS("http://www.w3.org/2000/svg","line");
                tick.setAttribute("x1", inner.x); tick.setAttribute("y1", inner.y);
                tick.setAttribute("x2", outer.x); tick.setAttribute("y2", outer.y);
                tick.setAttribute("stroke","rgba(255,255,255,0.7)"); tick.setAttribute("stroke-width","1.5");
                minRing.appendChild(tick);
            } else {
                // White bubble with minute label  :00 :05 :10 …
                const bPos = clockXY(CX, CY, 154, angle);
                const mins = m === 0 ? ':00' : `:${String(m).padStart(2,'0')}`;

                const circ = document.createElementNS("http://www.w3.org/2000/svg","circle");
                circ.setAttribute("cx", bPos.x); circ.setAttribute("cy", bPos.y);
                circ.setAttribute("r","11"); circ.setAttribute("fill","white");
                circ.setAttribute("opacity","0.92");
                minRing.appendChild(circ);

                const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
                txt.setAttribute("x", bPos.x); txt.setAttribute("y", bPos.y + 4);
                txt.setAttribute("text-anchor","middle");
                txt.setAttribute("font-family","Nunito,sans-serif");
                txt.setAttribute("font-size","8.5");
                txt.setAttribute("font-weight","800");
                txt.setAttribute("fill","#1a6060");
                txt.textContent = mins;
                minRing.appendChild(txt);
            }
        }

        // ── Inner face ticks ────────────────────────────────────────────
        const ticksG = document.getElementById('clock-ticks');
        ticksG.innerHTML = '';
        for (let i = 0; i < 60; i++) {
            const angle = i * 6;
            const isHour = i % 5 === 0;
            const r1 = isHour ? 118 : 125;
            const r2 = 136;
            const p1 = clockXY(CX, CY, r1, angle);
            const p2 = clockXY(CX, CY, r2, angle);
            const line = document.createElementNS("http://www.w3.org/2000/svg","line");
            line.setAttribute("x1",p1.x); line.setAttribute("y1",p1.y);
            line.setAttribute("x2",p2.x); line.setAttribute("y2",p2.y);
            line.setAttribute("stroke", isHour ? "#c8c4be" : "#e0ddd8");
            line.setAttribute("stroke-width", isHour ? "2.5" : "1");
            ticksG.appendChild(line);
        }

        // ── 24h numbers (outer ring, amber/orange) — only 13–24 ────────
        const g24 = document.getElementById('clock-numbers-24');
        g24.innerHTML = '';
        // 13 sits at the same position as 1, i.e. angle = 1*30 = 30°
        // 24 sits at the same position as 12, i.e. angle = 0°
        for (let h = 13; h <= 24; h++) {
            const hour12 = h === 24 ? 0 : h - 12; // maps 13→1, 14→2 … 24→0(12)
            const angle  = hour12 * 30;            // same angles as the 12h ring
            const pos = clockXY(CX, CY, 103, angle);
            const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
            txt.setAttribute("x", pos.x); txt.setAttribute("y", pos.y + 4.5);
            txt.setAttribute("text-anchor","middle");
            txt.setAttribute("font-family","Nunito,sans-serif");
            txt.setAttribute("font-size", h === 24 ? "12" : "10.5");
            txt.setAttribute("font-weight","700");
            txt.setAttribute("fill","#c07000");
            txt.textContent = String(h);
            g24.appendChild(txt);
        }

        // ── 12h numbers (inner ring, dark navy) ──────────────────────────
        const g12 = document.getElementById('clock-numbers-12');
        g12.innerHTML = '';
        for (let h = 1; h <= 12; h++) {
            const angle = h * 30;
            const pos = clockXY(CX, CY, 76, angle);
            const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
            txt.setAttribute("x", pos.x); txt.setAttribute("y", pos.y + 6);
            txt.setAttribute("text-anchor","middle");
            txt.setAttribute("font-family","Nunito,sans-serif");
            txt.setAttribute("font-size","18");
            txt.setAttribute("font-weight","800");
            txt.setAttribute("fill","#1a2e5a");
            txt.textContent = String(h);
            g12.appendChild(txt);
        }
    }

    function setupClockDrag(element, type) {
        let draggingHand = false, lastAngle = 0;

        element.addEventListener('pointerdown', (e) => {
            const svgEl = document.getElementById('analog-clock');
            if (!svgEl.getScreenCTM()) return; // SVG not yet visible
            draggingHand = true;
            element.setPointerCapture(e.pointerId);
            const pt = getSVGPoint(e, svgEl);
            lastAngle = Math.atan2(pt.y - 170, pt.x - 170) * 180 / Math.PI;
            e.preventDefault();
        });
        element.addEventListener('pointermove', (e) => {
            if (!draggingHand) return;
            const svgEl = document.getElementById('analog-clock');
            const ctm = svgEl.getScreenCTM();
            if (!ctm) return;
            const pt = getSVGPoint(e, svgEl);
            let cur = Math.atan2(pt.y - 170, pt.x - 170) * 180 / Math.PI;
            let diff = cur - lastAngle;
            if (diff >  180) diff -= 360;
            if (diff < -180) diff += 360;
            lastAngle = cur;
            if (type === 'minute') clockTotalMinutes += diff / 6;
            else                   clockTotalMinutes += (diff / 30) * 60;
            // Sync Date object from float
            const totalMins = Math.round(clockTotalMinutes);
            clockTime.setHours(Math.floor(((totalMins % 1440) + 1440) % 1440 / 60));
            clockTime.setMinutes(((totalMins % 60) + 60) % 60);
            updateClockView();
        });
        element.addEventListener('pointerup', (e) => {
            draggingHand = false;
            element.releasePointerCapture(e.pointerId);
            // Snap to nearest whole minute
            clockTotalMinutes = Math.round(clockTotalMinutes);
            const snapMins = ((clockTotalMinutes % 60) + 60) % 60;
            const snapHours = Math.floor(((clockTotalMinutes % 1440) + 1440) % 1440 / 60);
            clockTime.setHours(snapHours);
            clockTime.setMinutes(snapMins);
            updateClockView();
        });
    }

    function getSVGPoint(e, svg) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    function updateClockView() {
        const h = clockTime.getHours();
        const m = clockTime.getMinutes();
        const s = clockTime.getSeconds();

        // Rotate hands (centred at 170,170)
        document.getElementById('hand-minute').setAttribute('transform', `rotate(${(m + s/60)*6} 170 170)`);
        document.getElementById('hand-hour').setAttribute('transform',   `rotate(${((h%12) + m/60)*30} 170 170)`);

        const mm = String(m).padStart(2,'0');
        const isFM = h < 12; // förmiddag = 00–11, eftermiddag = 12–23

        // Förmiddag panel — always shows the AM equivalent time (h as-is, 00–11)
        document.getElementById('digital-h-fm').innerText = String(h < 12 ? h : h - 12).padStart(2,'0');
        document.getElementById('digital-m-fm').innerText = mm;

        // Eftermiddag panel — always shows the PM/24h time (12–23)
        document.getElementById('digital-h-em').innerText = String(h >= 12 ? h : h + 12).padStart(2,'0');
        document.getElementById('digital-m-em').innerText = mm;

        // Highlight the active panel, dim the other
        const panelFM = document.getElementById('panel-fm');
        const panelEM = document.getElementById('panel-em');
        if (isFM) {
            panelFM.style.opacity = '1';
            panelFM.style.borderColor = '#1a2e5a';
            panelFM.style.background = '#f0f3f8';
            panelEM.style.opacity = '0.38';
            panelEM.style.borderColor = '#d6d4d0';
            panelEM.style.background = 'white';
        } else {
            panelEM.style.opacity = '1';
            panelEM.style.borderColor = '#1a2e5a';
            panelEM.style.background = '#f0f3f8';
            panelFM.style.opacity = '0.38';
            panelFM.style.borderColor = '#d6d4d0';
            panelFM.style.background = 'white';
        }

        // Highlight minute bubble in ring and Swedish label
        highlightMinuteBubble(m);
        highlightSwedishLabel(m);
    }

    function highlightMinuteBubble(currentMinute) {
        // Round to nearest 5
        const nearest5 = Math.round(currentMinute / 5) * 5 % 60;
        const ringG = document.getElementById('clock-minute-ring');
        if (!ringG) return;
        // Reset all bubble circles to white
        ringG.querySelectorAll('circle').forEach(c => {
            c.setAttribute('fill','white');
            c.setAttribute('opacity','0.92');
        });
        // Highlight the matching one — find by index (each 5th = bubble, index 0..11)
        const bubbleIndex = nearest5 / 5; // 0..11
        const bubbles = ringG.querySelectorAll('circle');
        if (bubbles[bubbleIndex]) {
            bubbles[bubbleIndex].setAttribute('fill','#ffe066');
            bubbles[bubbleIndex].setAttribute('opacity','1');
        }
    }

    function highlightSwedishLabel(currentMinute) {
        const nearest5 = (Math.round(currentMinute / 5) * 5) % 60;
        const ids = ['00','05','10','15','20','25','30','35','40','45','50','55'];
        ids.forEach(id => {
            const el = document.getElementById('label-' + id);
            if (!el) return;
            el.style.background = parseInt(id, 10) === nearest5 ? '#ffe066' : '';
        });
    }

    function adjustTime(minutes) {
        clockTotalMinutes += minutes;
        const totalMins = Math.round(clockTotalMinutes);
        clockTime.setHours(Math.floor(((totalMins % 1440) + 1440) % 1440 / 60));
        clockTime.setMinutes(((totalMins % 60) + 60) % 60);
        updateClockView();
    }


    // ===================== STATISTICS =====================
    const CHART_COLORS = ['#5b80a5','#a85c72','#4f7c75','#dec894','#938db3','#d58b99','#8bb39c','#8db1d1'];
    let chartType = 'bar';
    let statData = [
        {label:'Äpplen', value:8},
        {label:'Bananer', value:5},
        {label:'Päron', value:3},
        {label:'Apelsiner', value:7},
        {label:'Druvor', value:6}
    ];

    function saveStatData() {
        try {
            localStorage.setItem('matutf_statdata', JSON.stringify(statData));
            localStorage.setItem('matutf_charttype', chartType);
            const titleEl = document.getElementById('chart-title-input');
            if (titleEl) localStorage.setItem('matutf_charttitle', titleEl.value);
        } catch(e) {}
    }

    function initStats() {
        try {
            const saved = localStorage.getItem('matutf_statdata');
            if (saved) statData = JSON.parse(saved);
            const savedType = localStorage.getItem('matutf_charttype');
            if (savedType) chartType = savedType;
            const savedTitle = localStorage.getItem('matutf_charttitle');
            const titleEl = document.getElementById('chart-title-input');
            if (savedTitle && titleEl) titleEl.value = savedTitle;
        } catch(e) {}
        // Sync tab UI with loaded chartType
        ['bar','line','pie'].forEach(t => {
            const tab = document.getElementById(`tab-${t}`);
            if (tab) tab.classList.toggle('active', t === chartType);
        });
        document.getElementById('bar-options').style.display = chartType === 'pie' ? 'none' : '';
        document.getElementById('pie-options').style.display = chartType === 'pie' ? 'flex' : 'none';
        renderStatRows();
        renderChart();
    }

    function setChartType(type) {
        chartType = type;
        ['bar','line','pie'].forEach(t => {
            const tab = document.getElementById(`tab-${t}`);
            tab.classList.toggle('active', t===type);
        });
        const tips = {
            bar: 'Dra i staplarna uppåt/nedåt för att ändra värdet direkt i diagrammet!',
            line: 'Dra i punkterna uppåt/nedåt för att ändra värdet direkt i linjediagrammet!',
            pie: 'Ändra värdena i sidopanelen för att se hur cirkelns delar förändras.'
        };
        document.getElementById('chart-tip').textContent = tips[type];
        document.getElementById('bar-options').style.display = type === 'pie' ? 'none' : '';
        document.getElementById('pie-options').style.display = type === 'pie' ? 'flex' : 'none';
        renderChart();
        saveStatData();
    }

    function renderStatRows() {
        const container = document.getElementById('stat-rows');
        container.innerHTML = '';
        statData.forEach((row, i) => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 bg-soft-bg rounded-lg px-2 py-1 border border-soft-border';
            const colorDot = document.createElement('div');
            colorDot.className = 'w-3 h-3 rounded-full shrink-0';
            colorDot.style.backgroundColor = CHART_COLORS[i % CHART_COLORS.length];
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.value = row.label;
            labelInput.className = 'stat-input flex-1 text-xs';
            labelInput.placeholder = 'Etikett';
            labelInput.oninput = (e) => { statData[i].label = e.target.value; renderChart(); saveStatData(); };
            const valueInput = document.createElement('input');
            valueInput.type = 'number';
            valueInput.value = row.value;
            valueInput.min = 0; valueInput.max = 100;
            valueInput.className = 'stat-input w-14 text-xs font-bold';
            valueInput.oninput = (e) => { statData[i].value = Math.max(0, parseFloat(e.target.value)||0); renderChart(); saveStatData(); };
            div.appendChild(colorDot); div.appendChild(labelInput); div.appendChild(valueInput);
            container.appendChild(div);
        });
    }

    function addStatRow() {
        if(statData.length >= 8) return;
        statData.push({label: `Kategori ${statData.length+1}`, value: Math.floor(Math.random()*8)+2});
        renderStatRows(); renderChart(); saveStatData();
    }

    function removeLastStatRow() {
        if(statData.length <= 2) return;
        statData.pop();
        renderStatRows(); renderChart(); saveStatData();
    }

    function renderChart() {
        if(chartType==='bar') renderBarChart();
        else if(chartType==='line') renderLineChart();
        else if(chartType==='pie') renderPieChart();
    }

    function getChartDimensions() {
        const svg = document.getElementById('stat-chart');
        const rect = svg.parentElement.getBoundingClientRect();
        const W = Math.max(rect.width || 600, 400);
        const H = Math.max(rect.height || 420, 300);
        return {W, H};
    }

    function renderBarChart() {
        const svg = document.getElementById('stat-chart');
        const {W, H} = getChartDimensions();
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const showValues = document.getElementById('show-values').checked;
        const showGrid = document.getElementById('show-grid').checked;
        const title = document.getElementById('chart-title-input').value;
        const padLeft=55, padRight=20, padTop=55, padBottom=55;
        const chartW=W-padLeft-padRight, chartH=H-padTop-padBottom;
        const maxVal = Math.max(...statData.map(d=>d.value), 1);
        const yMax = Math.ceil(maxVal*1.2/5)*5 || 10;
        const barW = (chartW / statData.length) * 0.6;
        const barGap = chartW / statData.length;

        let html = `<rect x="0" y="0" width="${W}" height="${H}" fill="white" rx="16"/>`;
        // Title
        html += `<text x="${W/2}" y="32" text-anchor="middle" font-family="Nunito,sans-serif" font-size="18" font-weight="800" fill="#4a4b50">${title}</text>`;
        // Grid & Y axis labels
        const gridLines = 5;
        for(let g=0;g<=gridLines;g++) {
            const gy = padTop + chartH - (g/gridLines)*chartH;
            const gv = Math.round((g/gridLines)*yMax);
            if(showGrid && g>0) html += `<line x1="${padLeft}" y1="${gy}" x2="${W-padRight}" y2="${gy}" stroke="#e8e6e2" stroke-width="1" stroke-dasharray="4,4"/>`;
            html += `<text x="${padLeft-8}" y="${gy+5}" text-anchor="end" font-family="Nunito,sans-serif" font-size="12" fill="#8c8d92" font-weight="600">${gv}</text>`;
        }
        // X axis line
        html += `<line x1="${padLeft}" y1="${padTop+chartH}" x2="${W-padRight}" y2="${padTop+chartH}" stroke="#d6d4d0" stroke-width="2"/>`;
        // Y axis line
        html += `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop+chartH}" stroke="#d6d4d0" stroke-width="2"/>`;

        // Bars
        statData.forEach((d,i) => {
            const bh = (d.value/yMax)*chartH;
            const bx = padLeft + i*barGap + (barGap-barW)/2;
            const by = padTop + chartH - bh;
            const color = CHART_COLORS[i%CHART_COLORS.length];
            const rx = 6;
            // Bar with rounded top
            html += `<rect class="stat-bar" x="${bx}" y="${by}" width="${barW}" height="${Math.max(bh,2)}" fill="${color}" rx="${rx}" data-idx="${i}" style="cursor:ns-resize;"/>`;
            // Value label
            if(showValues && d.value > 0) html += `<text x="${bx+barW/2}" y="${by-6}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="13" font-weight="700" fill="${color}">${d.value}</text>`;
            // X label
            const labelY = padTop+chartH+22;
            html += `<text x="${bx+barW/2}" y="${labelY}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="12" font-weight="600" fill="#4a4b50">${d.label}</text>`;
        });

        svg.innerHTML = html;

        // Drag to change bar values
        statData.forEach((d,i) => {
            const barEl = svg.querySelector(`rect[data-idx="${i}"]`);
            if(!barEl) return;
            let draggingBar = false, startYBar, startValBar;
            barEl.addEventListener('pointerdown',(e)=>{ draggingBar=true; startYBar=e.clientY; startValBar=d.value; barEl.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault(); });
            barEl.addEventListener('pointermove',(e)=>{ if(!draggingBar) return; const dy=startYBar-e.clientY; const newVal=Math.max(0,Math.min(100,Math.round(startValBar+(dy/chartH)*yMax))); if(newVal!==statData[i].value){ statData[i].value=newVal; renderStatRows(); renderBarChart(); } });
            barEl.addEventListener('pointerup',(e)=>{ draggingBar=false; barEl.releasePointerCapture(e.pointerId); });
        });
    }

    function renderLineChart() {
        const svg = document.getElementById('stat-chart');
        const {W, H} = getChartDimensions();
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const showValues = document.getElementById('show-values').checked;
        const showGrid = document.getElementById('show-grid').checked;
        const title = document.getElementById('chart-title-input').value;
        const padLeft=55, padRight=20, padTop=55, padBottom=55;
        const chartW=W-padLeft-padRight, chartH=H-padTop-padBottom;
        const maxVal = Math.max(...statData.map(d=>d.value), 1);
        const yMax = Math.ceil(maxVal*1.2/5)*5 || 10;
        const n = statData.length;

        let html = `<rect x="0" y="0" width="${W}" height="${H}" fill="white" rx="16"/>`;
        html += `<text x="${W/2}" y="32" text-anchor="middle" font-family="Nunito,sans-serif" font-size="18" font-weight="800" fill="#4a4b50">${title}</text>`;
        const gridLines = 5;
        for(let g=0;g<=gridLines;g++) {
            const gy = padTop + chartH - (g/gridLines)*chartH;
            const gv = Math.round((g/gridLines)*yMax);
            if(showGrid && g>0) html += `<line x1="${padLeft}" y1="${gy}" x2="${W-padRight}" y2="${gy}" stroke="#e8e6e2" stroke-width="1" stroke-dasharray="4,4"/>`;
            html += `<text x="${padLeft-8}" y="${gy+5}" text-anchor="end" font-family="Nunito,sans-serif" font-size="12" fill="#8c8d92" font-weight="600">${gv}</text>`;
        }
        html += `<line x1="${padLeft}" y1="${padTop+chartH}" x2="${W-padRight}" y2="${padTop+chartH}" stroke="#d6d4d0" stroke-width="2"/>`;
        html += `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop+chartH}" stroke="#d6d4d0" stroke-width="2"/>`;

        // Points
        const pts = statData.map((d,i) => ({
            x: padLeft + (n===1 ? chartW/2 : (i/(n-1))*chartW),
            y: padTop + chartH - (d.value/yMax)*chartH
        }));

        // Area fill
        if(pts.length > 1) {
            let areaPath = `M ${pts[0].x} ${padTop+chartH}`;
            pts.forEach(p => areaPath += ` L ${p.x} ${p.y}`);
            areaPath += ` L ${pts[pts.length-1].x} ${padTop+chartH} Z`;
            html += `<path d="${areaPath}" fill="#5b80a5" opacity="0.08"/>`;
        }

        // Line
        if(pts.length > 1) {
            let linePath = `M ${pts[0].x} ${pts[0].y}`;
            // Smooth bezier
            for(let i=1;i<pts.length;i++) {
                const cpx = (pts[i-1].x+pts[i].x)/2;
                linePath += ` C ${cpx} ${pts[i-1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
            }
            html += `<path d="${linePath}" fill="none" stroke="#5b80a5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
        }

        // Dots & labels
        pts.forEach((p,i) => {
            html += `<circle class="line-dot" cx="${p.x}" cy="${p.y}" r="6" fill="#5b80a5" stroke="white" stroke-width="2.5" data-idx="${i}" style="cursor:ns-resize;"/>`;
            if(showValues && statData[i].value > 0) html += `<text x="${p.x}" y="${p.y-14}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="13" font-weight="700" fill="#5b80a5">${statData[i].value}</text>`;
            html += `<text x="${p.x}" y="${padTop+chartH+22}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="12" font-weight="600" fill="#4a4b50">${statData[i].label}</text>`;
        });

        svg.innerHTML = html;

        // Drag dots
        statData.forEach((d,i) => {
            const dot = svg.querySelector(`circle[data-idx="${i}"]`);
            if(!dot) return;
            let draggingDot=false, startYDot, startValDot;
            dot.addEventListener('pointerdown',(e)=>{ draggingDot=true; startYDot=e.clientY; startValDot=d.value; dot.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault(); });
            dot.addEventListener('pointermove',(e)=>{ if(!draggingDot) return; const dy=startYDot-e.clientY; const newVal=Math.max(0,Math.min(100,Math.round(startValDot+(dy/chartH)*yMax))); if(newVal!==statData[i].value){ statData[i].value=newVal; renderStatRows(); renderLineChart(); } });
            dot.addEventListener('pointerup',(e)=>{ draggingDot=false; dot.releasePointerCapture(e.pointerId); });
        });
    }

    function gcd(a, b) {
        a = Math.abs(Math.round(a));
        b = Math.abs(Math.round(b));
        while (b) { const t = b; b = a % b; a = t; }
        return a || 1;
    }

    function renderPieChart() {
        const svg = document.getElementById('stat-chart');
        const {W, H} = getChartDimensions();
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const title = document.getElementById('chart-title-input').value;
        const showCount    = document.getElementById('pie-show-count').checked;
        const showPercent  = document.getElementById('pie-show-percent').checked;
        const showFraction = document.getElementById('pie-show-fraction').checked;

        const cx = W * 0.42, cy = H/2 + 10;
        const r = Math.min(W*0.33, H*0.4, 160);
        const total = statData.reduce((s,d)=>s+Math.max(d.value,0),0) || 1;

        const LINE_H = 16, FRAC_H = 28, GAP = 2;
        const FRAC_CHAR_W = 7, FRAC_BAR_PAD = 6;

        let html = `<rect x="0" y="0" width="${W}" height="${H}" fill="white" rx="16"/>`;
        html += `<text x="${W/2}" y="32" text-anchor="middle" font-family="Nunito,sans-serif" font-size="18" font-weight="800" fill="#4a4b50">${title}</text>`;

        let startAngle = -Math.PI/2;
        statData.forEach((d,i) => {
            const val = Math.max(d.value, 0);
            const angle = (val/total)*2*Math.PI;
            if(angle === 0) { startAngle += angle; return; }
            const endAngle = startAngle + angle;
            const x1=cx+r*Math.cos(startAngle), y1=cy+r*Math.sin(startAngle);
            const x2=cx+r*Math.cos(endAngle), y2=cy+r*Math.sin(endAngle);
            const largeArc = angle > Math.PI ? 1 : 0;
            const color = CHART_COLORS[i%CHART_COLORS.length];
            html += `<path class="pie-slice" d="M${cx},${cy} L${x1},${y1} A${r},${r},0,${largeArc},1,${x2},${y2}Z" fill="${color}" stroke="white" stroke-width="2.5" data-idx="${i}"/>`;

            // Build label items for this slice
            const pct = Math.round(val/total*100);
            if(pct >= 5) {
                const midAngle = startAngle + angle/2;
                const lr = r*0.65;
                const lx = cx + lr*Math.cos(midAngle);
                const ly = cy + lr*Math.sin(midAngle);

                const labelItems = [];
                if(showCount) labelItems.push({type:'text', text: String(val)});
                if(showPercent) labelItems.push({type:'text', text: pct + '%'});
                if(showFraction && val > 0) {
                    const g = gcd(val, total);
                    const num = val / g;
                    const den = total / g;
                    if(den === 1) {
                        labelItems.push({type:'text', text: String(num)});
                    } else {
                        labelItems.push({type:'frac', num, den});
                    }
                }

                if(labelItems.length > 0) {
                    let totalH = labelItems.reduce((s, item, ii) =>
                        s + (item.type === 'frac' ? FRAC_H : LINE_H) + (ii < labelItems.length - 1 ? GAP : 0), 0);
                    let curY = ly - totalH / 2;
                    labelItems.forEach(item => {
                        if(item.type === 'frac') {
                            const barW = Math.max(String(item.num).length, String(item.den).length) * FRAC_CHAR_W + FRAC_BAR_PAD;
                            html += `<text x="${lx}" y="${curY + 11}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="11" font-weight="800" fill="white">${item.num}</text>`;
                            html += `<line x1="${lx - barW/2}" y1="${curY + 15}" x2="${lx + barW/2}" y2="${curY + 15}" stroke="white" stroke-width="1.5"/>`;
                            html += `<text x="${lx}" y="${curY + 27}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="11" font-weight="800" fill="white">${item.den}</text>`;
                            curY += FRAC_H + GAP;
                        } else {
                            html += `<text x="${lx}" y="${curY + 11}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="13" font-weight="800" fill="white">${item.text}</text>`;
                            curY += LINE_H + GAP;
                        }
                    });
                }
            }
            startAngle = endAngle;
        });

        // Legend
        const legendX = W*0.76, legendStartY = H/2 - (statData.length*22)/2;
        statData.forEach((d,i) => {
            const ly = legendStartY + i*26;
            const color = CHART_COLORS[i%CHART_COLORS.length];
            html += `<rect x="${legendX}" y="${ly}" width="14" height="14" fill="${color}" rx="3"/>`;
            html += `<text x="${legendX+20}" y="${ly+11}" font-family="Nunito,sans-serif" font-size="12" font-weight="600" fill="#4a4b50">${d.label} (${d.value})</text>`;
        });

        svg.innerHTML = html;
    }

    // ===================== KOORDINATSYSTEM =====================
    let koordMode = 'q1'; // 'q1' = first quadrant (0-10), 'all' = all quadrants (-10 to 10)
    let koordPoints = [];  // {x, y, label, id}
    let koordNextId = 1;
    let koordDrag = null;  // {id} while dragging a point
    const KOORD_COLORS = ['#5b80a5','#a85c72','#4f7c75','#b8a36e','#938db3','#d58b99','#3d8a8a','#8db1d1'];

    function getKoordRange() {
        return koordMode === 'q1' ? { min: 0, max: 10 } : { min: -10, max: 10 };
    }

    // Map grid coordinate to SVG pixel (viewBox 0-600)
    function koordToSvg(gx, gy) {
        const { min, max } = getKoordRange();
        const pad = 52, size = 600, plot = size - 2 * pad, range = max - min;
        return { sx: pad + (gx - min) / range * plot, sy: pad + (max - gy) / range * plot };
    }

    // Map SVG pixel to grid coordinate
    function svgToKoord(sx, sy) {
        const { min, max } = getKoordRange();
        const pad = 52, size = 600, plot = size - 2 * pad, range = max - min;
        return { gx: min + (sx - pad) / plot * range, gy: max - (sy - pad) / plot * range };
    }

    function renderKoord() {
        const svg = document.getElementById('koord-svg');
        if (!svg) return;
        const { min, max } = getKoordRange();
        const showGrid = document.getElementById('koord-show-grid')?.checked !== false;
        const showLabels = document.getElementById('koord-show-labels')?.checked !== false;
        // Use larger visual elements when in presentation/fullscreen mode
        const presenting = document.getElementById('view-koordinat')?.classList.contains('presenting') ?? false;
        const numFontSize = presenting ? 16 : 12;
        const axisLabelSize = presenting ? 22 : 16;
        const tickWidth = presenting ? 2.5 : 1.5;
        const tickLen = presenting ? 7 : 5;
        const pointR = presenting ? 12 : 8;
        const pointRDrag = presenting ? 15 : 10;
        const ptLabelSize = presenting ? 17 : 13;
        const axisStrokeW = presenting ? 3 : 2;
        const gridStrokeW = presenting ? 1.2 : 0.8;

        const { sx: ox, sy: oy } = koordToSvg(0, 0);
        const pad = 52, size = 600;

        let h = '';

        // Grid lines
        for (let v = min; v <= max; v++) {
            const { sx } = koordToSvg(v, 0);
            const { sy } = koordToSvg(0, v);
            const isAxis = v === 0;
            if (showGrid || isAxis) {
                h += `<line x1="${sx}" y1="${pad}" x2="${sx}" y2="${size-pad}" stroke="${isAxis ? '#8c8d92' : '#e8e5e0'}" stroke-width="${isAxis ? axisStrokeW : gridStrokeW}"/>`;
                h += `<line x1="${pad}" y1="${sy}" x2="${size-pad}" y2="${sy}" stroke="${isAxis ? '#8c8d92' : '#e8e5e0'}" stroke-width="${isAxis ? axisStrokeW : gridStrokeW}"/>`;
            }
        }

        // Tick marks and axis number labels
        for (let v = min; v <= max; v++) {
            const { sx } = koordToSvg(v, 0);
            const { sy } = koordToSvg(0, v);
            h += `<line x1="${sx}" y1="${oy-tickLen}" x2="${sx}" y2="${oy+tickLen}" stroke="#4a4b50" stroke-width="${tickWidth}"/>`;
            h += `<line x1="${ox-tickLen}" y1="${sy}" x2="${ox+tickLen}" y2="${sy}" stroke="#4a4b50" stroke-width="${tickWidth}"/>`;
            if (v !== 0) {
                h += `<text x="${sx}" y="${oy+20}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="${numFontSize}" fill="#4a4b50" font-weight="600">${v}</text>`;
                h += `<text x="${ox-10}" y="${sy+5}" text-anchor="end" font-family="Nunito,sans-serif" font-size="${numFontSize}" fill="#4a4b50" font-weight="600">${v}</text>`;
            }
        }
        // Origin label
        h += `<text x="${ox-10}" y="${oy+20}" text-anchor="end" font-family="Nunito,sans-serif" font-size="${numFontSize}" fill="#4a4b50" font-weight="600">0</text>`;

        // Axis arrows
        h += `<polygon points="${size-pad+2},${oy} ${size-pad-8},${oy-5} ${size-pad-8},${oy+5}" fill="#4a4b50"/>`;
        h += `<polygon points="${ox},${pad-2} ${ox-5},${pad+8} ${ox+5},${pad+8}" fill="#4a4b50"/>`;
        // Axis labels
        h += `<text x="${size-pad+12}" y="${oy+5}" font-family="Nunito,sans-serif" font-size="${axisLabelSize}" fill="#4a4b50" font-weight="800">x</text>`;
        h += `<text x="${ox}" y="${pad-12}" text-anchor="middle" font-family="Nunito,sans-serif" font-size="${axisLabelSize}" fill="#4a4b50" font-weight="800">y</text>`;

        // Points (render below labels, circles on top)
        koordPoints.forEach((pt, idx) => {
            const { sx, sy } = koordToSvg(pt.x, pt.y);
            if (sx < pad-10 || sx > size-pad+10 || sy < pad-10 || sy > size-pad+10) return;
            const color = KOORD_COLORS[idx % KOORD_COLORS.length];
            const isDragged = koordDrag && koordDrag.id === pt.id;
            h += `<circle cx="${sx}" cy="${sy}" r="${isDragged ? pointRDrag : pointR}" fill="${color}" stroke="white" stroke-width="2.5" class="koord-point" data-id="${pt.id}" style="cursor:grab;"/>`;
            if (showLabels) {
                h += `<text x="${sx + pointR + 5}" y="${sy-10}" font-family="Nunito,sans-serif" font-size="${ptLabelSize}" fill="${color}" font-weight="800">${pt.label} (${pt.x}, ${pt.y})</text>`;
            }
        });

        svg.innerHTML = h;
    }

    function nextAutoLabel() {
        const used = new Set(koordPoints.map(p => p.label));
        for (let i = 0; i < 26; i++) {
            const lbl = String.fromCharCode(65 + (koordNextId - 1 + i) % 26);
            if (!used.has(lbl)) return lbl;
        }
        let n = 1;
        while (used.has(`P${n}`)) n++;
        return `P${n}`;
    }

    function initKoord() {
        const svg = document.getElementById('koord-svg');
        if (!svg) return;

        svg.addEventListener('pointerdown', (e) => {
            const params = getKoordRange();
            if (e.target.classList.contains('koord-point')) {
                koordDrag = { id: parseInt(e.target.dataset.id) };
                svg.setPointerCapture(e.pointerId);
                e.preventDefault();
            } else {
                // Click on background adds a new point
                const rect = svg.getBoundingClientRect();
                const scaleX = 600 / rect.width, scaleY = 600 / rect.height;
                const { gx, gy } = svgToKoord((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
                const ix = Math.round(gx), iy = Math.round(gy);
                if (ix >= params.min && ix <= params.max && iy >= params.min && iy <= params.max) {
                    const lbl = document.getElementById('koord-label-input')?.value.trim() ||
                        nextAutoLabel();
                    koordPoints.push({ x: ix, y: iy, label: lbl, id: koordNextId++ });
                    // Auto-advance single uppercase letter names
                    const li = document.getElementById('koord-label-input');
                    if (li && /^[A-Z]$/.test(li.value)) {
                        li.value = String.fromCharCode(li.value.charCodeAt(0) < 90 ? li.value.charCodeAt(0) + 1 : 65);
                    }
                    updateKoordPointList();
                    renderKoord();
                }
            }
        });

        svg.addEventListener('pointermove', (e) => {
            if (!koordDrag) return;
            const params = getKoordRange();
            const rect = svg.getBoundingClientRect();
            const scaleX = 600 / rect.width, scaleY = 600 / rect.height;
            const { gx, gy } = svgToKoord((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
            const ix = Math.round(Math.max(params.min, Math.min(params.max, gx)));
            const iy = Math.round(Math.max(params.min, Math.min(params.max, gy)));
            const pt = koordPoints.find(p => p.id === koordDrag.id);
            if (pt && (pt.x !== ix || pt.y !== iy)) {
                pt.x = ix; pt.y = iy;
                updateKoordPointList();
                renderKoord();
            }
        });

        svg.addEventListener('pointerup', (e) => {
            if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
            koordDrag = null;
        });

        svg.addEventListener('pointercancel', () => { koordDrag = null; });

        renderKoord();
    }

    function setKoordMode(mode) {
        koordMode = mode;
        const activeClass = 'px-4 py-2 bg-soft-purpleLight/30 text-soft-purple font-bold rounded-xl border border-soft-purpleLight/50 text-sm';
        const inactiveClass = 'px-4 py-2 bg-soft-bg text-soft-text font-bold rounded-xl border border-soft-border text-sm hover:bg-soft-surface';
        document.getElementById('koord-btn-q1').className = mode === 'q1' ? activeClass : inactiveClass;
        document.getElementById('koord-btn-all').className = mode === 'all' ? activeClass : inactiveClass;
        // Remove any points that are outside the new range
        const { min, max } = getKoordRange();
        koordPoints = koordPoints.filter(p => p.x >= min && p.x <= max && p.y >= min && p.y <= max);
        updateKoordPointList();
        renderKoord();
    }

    function addKoordPoint() {
        const { min, max } = getKoordRange();
        const xEl = document.getElementById('koord-x-input');
        const yEl = document.getElementById('koord-y-input');
        const lblEl = document.getElementById('koord-label-input');
        const x = parseInt(xEl?.value) || 0;
        const y = parseInt(yEl?.value) || 0;
        if (x < min || x > max || y < min || y > max) return;
        const lbl = lblEl?.value.trim() || nextAutoLabel();
        koordPoints.push({ x, y, label: lbl, id: koordNextId++ });
        if (lblEl && /^[A-Z]$/.test(lblEl.value)) {
            lblEl.value = String.fromCharCode(lblEl.value.charCodeAt(0) < 90 ? lblEl.value.charCodeAt(0) + 1 : 65);
        }
        updateKoordPointList();
        renderKoord();
    }

    function removeKoordPoint(id) {
        koordPoints = koordPoints.filter(p => p.id !== id);
        updateKoordPointList();
        renderKoord();
    }

    function clearKoordPoints() {
        koordPoints = [];
        koordNextId = 1;
        const lblEl = document.getElementById('koord-label-input');
        if (lblEl) lblEl.value = 'A';
        updateKoordPointList();
        renderKoord();
    }

    function updateKoordPointList() {
        const list = document.getElementById('koord-point-list');
        if (!list) return;
        list.innerHTML = '';
        koordPoints.forEach((pt, idx) => {
            const color = KOORD_COLORS[idx % KOORD_COLORS.length];
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 bg-soft-bg rounded-lg px-2 py-1 border border-soft-border text-xs';
            row.innerHTML = `<div class="w-3 h-3 rounded-full shrink-0" style="background:${color}"></div><span class="font-bold text-soft-text">${pt.label}</span><span class="text-soft-muted flex-1">(${pt.x}, ${pt.y})</span><button onclick="removeKoordPoint(${pt.id})" class="text-soft-pink hover:opacity-70 ml-1"><i class="fas fa-times"></i></button>`;
            list.appendChild(row);
        });
    }

    // ─── Smartboard / Presentation mode ───────────────────────────────────────

    /** Toggle fullscreen for the entire page. Works for all views. */
    function toggleViewFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    }

    /**
     * Toggle the slide-in control panel for the given view in presenting mode.
     * @param {string} viewId - The view whose panel should be toggled.
     */
    function toggleViewSidebar(viewId) {
        const viewSection = document.getElementById('view-' + viewId);
        if (!viewSection) return;
        const isVisible = viewSection.classList.toggle('panel-visible');
        const lbl = document.getElementById(viewId + '-ctrl-lbl');
        if (lbl) lbl.textContent = isVisible ? 'Dölj' : 'Kontroller';
        const panel = document.getElementById(viewId + '-float-panel');
        if (panel) {
            const toggleBtn = panel.querySelector('button:first-child');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
        }
    }

    document.addEventListener('fullscreenchange', () => {
        const isFs = !!document.fullscreenElement;
        const viewSection = document.getElementById('view-' + currentView);
        if (viewSection) {
            viewSection.classList.toggle('presenting', isFs);
            if (!isFs) {
                viewSection.classList.remove('panel-visible');
                const lbl = document.getElementById(currentView + '-ctrl-lbl');
                if (lbl) lbl.textContent = 'Kontroller';
            }
        }
        const btn = document.getElementById(currentView + '-fs-btn');
        if (btn) {
            btn.innerHTML = isFs
                ? '<i class="fas fa-compress"></i> Avsluta helskärm'
                : '<i class="fas fa-expand"></i> Helskärm';
        }
        // Re-render views that depend on canvas size after fullscreen toggle
        VIEW_REGISTRY[currentView]?.onResize && setTimeout(VIEW_REGISTRY[currentView].onResize, 80);
    });

    // ===================== POSITIONSSYSTEM =====================
    function initPosSystem() {
        const ws = document.getElementById('workspace-positionssystem');
        if (!ws) return;
        // Add column headers and dividers (remove any existing ones first)
        ws.querySelectorAll('.pos-col-header, .pos-col-divider').forEach(el => el.remove());
        if (!posShowColumns) { updatePosCounter(); return; }
        const cols = POS_COL_DEFS.filter(c => posVisibleCols[c.key]);
        const n = cols.length;
        if (n === 0) { updatePosCounter(); return; }
        const colPct = 100 / n;
        cols.forEach((col, i) => {
            const hdr = document.createElement('div');
            hdr.className = 'pos-col-header';
            hdr.style.cssText = `left:${i*colPct}%; width:${colPct}%; color:${col.color}; border-color:${col.border}; background:${col.bg};`;
            hdr.textContent = col.label;
            ws.appendChild(hdr);
            if (i > 0) {
                const dv = document.createElement('div');
                dv.className = 'pos-col-divider';
                dv.style.cssText = `left:${i*colPct}%; background:${col.border};`;
                ws.appendChild(dv);
            }
        });
        updatePosCounter();
    }

    function togglePosColumn(col) {
        const ws = document.getElementById('workspace-positionssystem');
        const checkbox = document.getElementById(`pos-col-${col}`);
        if (!checkbox) return;
        if (!checkbox.checked) {
            const pieces = ws ? Array.from(ws.querySelectorAll(`[data-pos-type="${col}"]`)) : [];
            if (pieces.length > 0) {
                const colDef = POS_COL_DEFS.find(c => c.key === col);
                const ok = confirm(`Kolumnen "${colDef.label}" innehåller ${pieces.length} objekt. Vill du dölja kolumnen och ta bort dessa objekt?`);
                if (!ok) {
                    checkbox.checked = true;
                    return;
                }
                pieces.forEach(el => el.remove());
            }
            posVisibleCols[col] = false;
        } else {
            posVisibleCols[col] = true;
        }
        updatePosSidebarVisibility();
        initPosSystem();
    }

    function togglePosShowColumns() {
        const cb = document.getElementById('pos-show-columns');
        posShowColumns = cb ? cb.checked : true;
        const colSection = document.getElementById('pos-visible-cols-section');
        if (colSection) colSection.style.display = posShowColumns ? '' : 'none';
        initPosSystem();
    }

    function updatePosSidebarVisibility() {
        const sidebar = document.getElementById('positionssystem-sidebar');
        if (!sidebar) return;
        sidebar.querySelectorAll('[data-pos-col]').forEach(el => {
            el.style.display = posVisibleCols[el.dataset.posCol] ? '' : 'none';
        });
        sidebar.querySelectorAll('[data-pos-col-row]').forEach(el => {
            el.style.display = posVisibleCols[el.dataset.posColRow] ? '' : 'none';
        });
    }

    // Returns {x, y} for the next available slot in the column for the given type
    function getPosColumnPlacement(type) {
        const ws = document.getElementById('workspace-positionssystem');
        if (!ws) return { x: 40, y: 40 };
        const rect = ws.getBoundingClientRect();
        const wsWidth = rect.width > 0 ? rect.width : 800;
        // Default block sizes
        const pieceSizes = {
            tusental: { w: 121, h: 122 },
            hundratal: { w: 121, h: 68 },
            tiotal: { w: 116, h: 70 },
            ental: { w: 36, h: 40 }
        };
        const sz = pieceSizes[type] || { w: 80, h: 60 };
        const GRID = 40; // matches cm-grid background-size
        if (!posShowColumns) {
            // Free-form placement: snap to 40px grid and flow items across workspace
            const count = ws.querySelectorAll(`[data-pos-type="${type}"]`).length;
            const snappedW = Math.ceil(sz.w / GRID) * GRID;
            const snappedH = Math.ceil(sz.h / GRID) * GRID;
            const pad = GRID;
            // How many grid-snapped pieces fit per row within the workspace (minus padding on both sides)
            const maxPerRow = Math.max(1, Math.floor((wsWidth - pad * 2 + GRID) / (snappedW + GRID)));
            const row = Math.floor(count / maxPerRow);
            const col = count % maxPerRow;
            return {
                x: pad + col * (snappedW + GRID),
                y: pad + row * (snappedH + GRID)
            };
        }
        const visibleCols = POS_COL_DEFS.filter(c => posVisibleCols[c.key]).map(c => c.key);
        const col = visibleCols.indexOf(type);
        if (col === -1) return { x: GRID, y: GRID };
        const n = visibleCols.length;
        const colW = wsWidth / n;
        const gap = 8;
        const pad = 10;
        const headerH = 44; // 40px header height + 4px gap before first piece
        const count = ws.querySelectorAll('[data-pos-type="' + type + '"]').length;
        const maxPerRow = Math.max(1, Math.floor((colW - pad * 2 + gap) / (sz.w + gap)));
        const row = Math.floor(count / maxPerRow);
        const colInRow = count % maxPerRow;
        const x = col * colW + pad + colInRow * (sz.w + gap);
        const y = headerH + row * (sz.h + gap);
        return { x, y };
    }

    // Snap a positionssystem piece to the 40px cm-grid on drag end
    function snapPosToGrid(el) {
        const GRID = 40;
        el.dataset.x = Math.round((parseFloat(el.dataset.x) || 0) / GRID) * GRID;
        el.dataset.y = Math.round((parseFloat(el.dataset.y) || 0) / GRID) * GRID;
        updateTransform(el);
    }

    function createPosMoneySVG(type) {
        if (type === 'tusental') {
            return `<svg viewBox="0 0 90 52" width="90" height="52" style="display:block">
                <rect x="1" y="1" width="88" height="50" rx="4" fill="#1E88E5" stroke="#1565C0" stroke-width="1.5"/>
                <rect x="5" y="5" width="80" height="42" rx="3" fill="none" stroke="#64B5F6" stroke-width="1"/>
                <circle cx="12" cy="12" r="5" fill="none" stroke="#64B5F6" stroke-width="0.8"/>
                <circle cx="78" cy="40" r="5" fill="none" stroke="#64B5F6" stroke-width="0.8"/>
                <text x="45" y="23" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="bold" fill="white" font-family="Nunito,sans-serif">1000</text>
                <text x="45" y="39" text-anchor="middle" font-size="9" fill="#90CAF9" font-family="Nunito,sans-serif">kronor</text>
            </svg>`;
        }
        if (type === 'hundratal') {
            return `<svg viewBox="0 0 90 52" width="90" height="52" style="display:block">
                <rect x="1" y="1" width="88" height="50" rx="4" fill="#388E3C" stroke="#2E7D32" stroke-width="1.5"/>
                <rect x="5" y="5" width="80" height="42" rx="3" fill="none" stroke="#81C784" stroke-width="1"/>
                <circle cx="12" cy="12" r="5" fill="none" stroke="#81C784" stroke-width="0.8"/>
                <circle cx="78" cy="40" r="5" fill="none" stroke="#81C784" stroke-width="0.8"/>
                <text x="45" y="23" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="bold" fill="white" font-family="Nunito,sans-serif">100</text>
                <text x="45" y="39" text-anchor="middle" font-size="9" fill="#A5D6A7" font-family="Nunito,sans-serif">kronor</text>
            </svg>`;
        }
        if (type === 'tiotal') {
            return `<svg viewBox="0 0 60 60" width="60" height="60" style="display:block">
                <circle cx="30" cy="30" r="28" fill="#F9A825" stroke="#92700A" stroke-width="1.5"/>
                <circle cx="30" cy="30" r="23" fill="none" stroke="#FFD54F" stroke-width="1"/>
                <text x="30" y="27" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="bold" fill="#3a2000" font-family="Nunito,sans-serif">10</text>
                <text x="30" y="43" text-anchor="middle" font-size="10" fill="#3a2000" font-family="Nunito,sans-serif">kr</text>
            </svg>`;
        }
        if (type === 'ental') {
            return `<svg viewBox="0 0 46 46" width="46" height="46" style="display:block">
                <circle cx="23" cy="23" r="21" fill="#b87333" stroke="#7a4010" stroke-width="1.5"/>
                <circle cx="23" cy="23" r="16" fill="none" stroke="#d4956a" stroke-width="1"/>
                <text x="23" y="21" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="bold" fill="white" font-family="Nunito,sans-serif">1</text>
                <text x="23" y="35" text-anchor="middle" font-size="9" fill="#FFD9B8" font-family="Nunito,sans-serif">kr</text>
            </svg>`;
        }
        return '';
    }

    function createPosPieceSVG(type, mode) {
        if (mode === 'pengar') return createPosMoneySVG(type);
        let lines = '';
        if (type === 'ental') {
            return `<svg viewBox="0 0 30 33" width="36" height="40" style="display:block">
                <polygon points="15,2 28,9 15,16 2,9" fill="#EF9A9A" stroke="#C62828" stroke-width="1"/>
                <polygon points="2,9 2,23 15,30 15,16" fill="#C62828" stroke="#C62828" stroke-width="1"/>
                <polygon points="15,16 28,9 28,23 15,30" fill="#E53935" stroke="#C62828" stroke-width="1"/>
            </svg>`;
        }
        if (type === 'tiotal') {
            for (let i = 1; i <= 9; i++) {
                // top face grid: lines dividing length (front→back)
                lines += `<line x1="${6+5*i}" y1="${1+2.5*i}" x2="${1+5*i}" y2="${3.5+2.5*i}" stroke="#92700A" stroke-width="0.6"/>`;
                // front face grid: division lines going front-to-back
                lines += `<line x1="${6+5*i}" y1="${6+2.5*i}" x2="${6+5*i}" y2="${1+2.5*i}" stroke="#92700A" stroke-width="0.6"/>`;
            }
            return `<svg viewBox="0 0 58 35" width="116" height="70" style="display:block">
                <polygon points="56,31 51,33.5 51,28.5 56,26" fill="#F57F17" stroke="#92700A" stroke-width="0.8"/>
                <polygon points="1,8.5 51,33.5 56,31 6,6" fill="#E65100" stroke="#92700A" stroke-width="0.8"/>
                <polygon points="6,6 56,31 56,26 6,1" fill="#F9A825" stroke="#92700A" stroke-width="0.8"/>
                <polygon points="6,1 56,26 51,28.5 1,3.5" fill="#FFD54F" stroke="#92700A" stroke-width="0.8"/>
                <polygon points="6,1 1,3.5 1,8.5 6,6" fill="#F57F17" stroke="#92700A" stroke-width="0.8"/>
                ${lines}
            </svg>`;
        }
        if (type === 'hundratal') {
            for (let i = 1; i <= 9; i++) {
                // top face grid
                lines += `<line x1="${60+6*i}" y1="${1+3*i}" x2="${6*i}" y2="${31+3*i}" stroke="#2E7D32" stroke-width="0.5"/>`;
                lines += `<line x1="${60-6*i}" y1="${1+3*i}" x2="${120-6*i}" y2="${31+3*i}" stroke="#2E7D32" stroke-width="0.5"/>`;
            }
            return `<svg viewBox="0 0 121 68" width="121" height="68" style="display:block">
                <polygon points="120,37 60,67 60,61 120,31" fill="#2E7D32" stroke="#2E7D32" stroke-width="0.8"/>
                <polygon points="0,31 0,37 60,67 60,61" fill="#388E3C" stroke="#2E7D32" stroke-width="0.8"/>
                <polygon points="60,1 120,31 60,61 0,31" fill="#81C784" stroke="#2E7D32" stroke-width="0.8"/>
                ${lines}
            </svg>`;
        }
        if (type === 'tusental') {
            for (let i = 1; i <= 9; i++) {
                // top face grid
                lines += `<line x1="${60+6*i}" y1="${1+3*i}" x2="${6*i}" y2="${31+3*i}" stroke="#1565C0" stroke-width="0.5"/>`;
                lines += `<line x1="${60-6*i}" y1="${1+3*i}" x2="${120-6*i}" y2="${31+3*i}" stroke="#1565C0" stroke-width="0.5"/>`;
                // front-left face grid
                lines += `<line x1="${6*i}" y1="${31+3*i}" x2="${6*i}" y2="${91+3*i}" stroke="#1565C0" stroke-width="0.5"/>`;
                lines += `<line x1="0" y1="${31+6*i}" x2="60" y2="${61+6*i}" stroke="#1565C0" stroke-width="0.5"/>`;
                // right face grid
                lines += `<line x1="${60+6*i}" y1="${61-3*i}" x2="${60+6*i}" y2="${121-3*i}" stroke="#1565C0" stroke-width="0.5"/>`;
                lines += `<line x1="60" y1="${61+6*i}" x2="120" y2="${31+6*i}" stroke="#1565C0" stroke-width="0.5"/>`;
            }
            return `<svg viewBox="0 0 121 122" width="121" height="122" style="display:block">
                <polygon points="120,91 60,121 60,61 120,31" fill="#1565C0" stroke="#1565C0" stroke-width="0.8"/>
                <polygon points="0,31 0,91 60,121 60,61" fill="#1E88E5" stroke="#1565C0" stroke-width="0.8"/>
                <polygon points="60,1 120,31 60,61 0,31" fill="#64B5F6" stroke="#1565C0" stroke-width="0.8"/>
                ${lines}
            </svg>`;
        }
        return '';
    }

    function _attachPosPieceEvents(div) {
        div.addEventListener('dblclick', () => { div.remove(); updatePosCounter(); checkAutoExchange(); });
        div.addEventListener('wheel', (e) => {
            e.preventDefault();
            const s = Math.max(0.3, Math.min(5, (parseFloat(div.dataset.scale) || 1) + (e.deltaY < 0 ? 0.1 : -0.1)));
            div.dataset.scale = s.toFixed(2);
            window.updateTransform(div);
        }, { passive: false });
    }

    function addPosPiece(type, mode) {
        mode = mode || 'block';
        const ws = document.getElementById('workspace-positionssystem');
        if (!ws) return;
        const div = document.createElement('div');
        div.className = 'draggable-item';
        div.dataset.posType = type;
        div.dataset.posMode = mode;
        const pos = getPosColumnPlacement(type);
        div.dataset.x = pos.x;
        div.dataset.y = pos.y;
        div.dataset.rot = 0;
        div.dataset.scale = 1;
        div.innerHTML = createPosPieceSVG(type, mode);
        _attachPosPieceEvents(div);
        ws.appendChild(div);
        updateTransform(div);
        makeDraggable(div, 'workspace-positionssystem', snapPosToGrid);
        addGeoResizeHandle(div);
        updatePosCounter();
        checkAutoExchange();
    }

    function checkAutoExchange() {
        const toggle = document.getElementById('pos-auto-exchange');
        if (!toggle || !toggle.checked) return;
        const ws = document.getElementById('workspace-positionssystem');
        if (!ws) return;
        let changed = true;
        while (changed) {
            changed = false;
            const items = ws.querySelectorAll('.draggable-item');
            let ones = [], tens = [], hundreds = [];
            items.forEach(el => {
                if (el.dataset.posType === 'ental') ones.push(el);
                else if (el.dataset.posType === 'tiotal') tens.push(el);
                else if (el.dataset.posType === 'hundratal') hundreds.push(el);
            });
            if (ones.length >= 10) {
                const mode = ones.some(el => el.dataset.posMode === 'pengar') ? 'pengar' : 'block';
                ones.slice(0, 10).forEach(el => el.remove());
                _addPosPieceAt('tiotal', mode);
                changed = true;
            } else if (tens.length >= 10) {
                const mode = tens.some(el => el.dataset.posMode === 'pengar') ? 'pengar' : 'block';
                tens.slice(0, 10).forEach(el => el.remove());
                _addPosPieceAt('hundratal', mode);
                changed = true;
            } else if (hundreds.length >= 10) {
                const mode = hundreds.some(el => el.dataset.posMode === 'pengar') ? 'pengar' : 'block';
                hundreds.slice(0, 10).forEach(el => el.remove());
                _addPosPieceAt('tusental', mode);
                changed = true;
            }
        }
        updatePosCounter();
    }

    function _addPosPieceAt(type, mode) {
        mode = mode || 'block';
        const ws = document.getElementById('workspace-positionssystem');
        if (!ws) return;
        const div = document.createElement('div');
        div.className = 'draggable-item';
        div.dataset.posType = type;
        div.dataset.posMode = mode;
        const pos = getPosColumnPlacement(type);
        div.dataset.x = pos.x;
        div.dataset.y = pos.y;
        div.dataset.rot = 0;
        div.dataset.scale = 1;
        div.innerHTML = createPosPieceSVG(type, mode);
        _attachPosPieceEvents(div);
        ws.appendChild(div);
        updateTransform(div);
        makeDraggable(div, 'workspace-positionssystem', snapPosToGrid);
        addGeoResizeHandle(div);
    }

    function updatePosCounter() {
        const ws = document.getElementById('workspace-positionssystem');
        if (!ws) return;
        let thousands = 0, hundreds = 0, tens = 0, ones = 0;
        ws.querySelectorAll('.draggable-item').forEach(el => {
            const t = el.dataset.posType;
            if (t === 'tusental') thousands++;
            else if (t === 'hundratal') hundreds++;
            else if (t === 'tiotal') tens++;
            else if (t === 'ental') ones++;
        });
        const total = thousands * 1000 + hundreds * 100 + tens * 10 + ones;
        const elT = document.getElementById('pos-thousands');
        const elH = document.getElementById('pos-hundreds');
        const elTe = document.getElementById('pos-tens');
        const elO = document.getElementById('pos-ones');
        const elTot = document.getElementById('pos-total');
        if (elT) elT.textContent = thousands;
        if (elH) elH.textContent = hundreds;
        if (elTe) elTe.textContent = tens;
        if (elO) elO.textContent = ones;
        if (elTot) elTot.textContent = total;
    }

    function clearPosWorkspace() {
        const ws = document.getElementById('workspace-positionssystem');
        if (ws) ws.querySelectorAll('.draggable-item').forEach(el => el.remove());
        updatePosCounter();
    }

    // ===================== VOLYM (VOLUME) =====================
    let volymMl = 0; // total volume in millilitres

    const BEAKER_H = 500;       // px – height of each beaker body
    const BEAKER_W = 200;       // px – width of each beaker body
    const SCALE_W  = 68;        // px – width of scale column
    const BEAKER_BORDER_B = 3;  // px – bottom border of .vol-beaker-outer (border-box)
    const BEAKER_INNER_H = BEAKER_H - BEAKER_BORDER_B; // usable inner liquid height
    const MAX_ML_PER_BEAKER = 1000; // 1 litre per beaker

    /** Build scale tick-mark HTML string for one beaker (0.0 L – 1.0 L, 11 marks). */
    function buildScaleHTML() {
        let html = '';
        for (let i = 0; i <= 10; i++) {
            const liters = (10 - i) / 10; // 1.0 at top, 0.0 at bottom
            // Offset by BEAKER_BORDER_B so marks align with the liquid inside the border-box beaker
            const topPx  = Math.round((i / 10) * BEAKER_INNER_H);
            const lineW  = liters % 0.5 === 0 ? 14 : 8;
            html += `<div class="vol-scale-mark" style="top:${topPx}px; right:0; left:0; justify-content:flex-end;">` +
                    `<span class="vol-scale-label" style="min-width:36px; text-align:right;">${liters.toFixed(1)}</span>` +
                    `<span class="vol-scale-line" style="width:${lineW}px;"></span>` +
                    `</div>`;
        }
        return html;
    }

    /** Build HTML for one beaker assembly (scale + rim + body). */
    function buildBeakerHTML(fillPct, labelText, showLabel) {
        const fillPx      = (fillPct / 100) * BEAKER_INNER_H;
        const labelBottom = Math.max(fillPx + 4, 4);
        return `<div class="relative flex items-end gap-0">` +
            `<div class="relative shrink-0" style="width:${SCALE_W}px; height:${BEAKER_H}px;">` +
                `<div class="absolute inset-0">${buildScaleHTML()}</div>` +
            `</div>` +
            `<div class="relative" style="flex-shrink:0;">` +
                `<div style="width:${BEAKER_W}px; height:6px; border-left:3px solid rgba(91,128,165,0.55); border-right:3px solid rgba(91,128,165,0.55); border-top:3px solid rgba(91,128,165,0.55); border-radius:4px 4px 0 0; background:transparent;"></div>` +
                `<div class="vol-beaker-outer">` +
                    `<div class="vol-liquid" style="height:${fillPct}%;"></div>` +
                    `<div class="vol-surface-label" style="bottom:${labelBottom}px; display:${showLabel ? 'block' : 'none'};">${labelText}</div>` +
                `</div>` +
            `</div>` +
        `</div>`;
    }

    /** ml contained in beaker at index i, based on current volymMl. */
    function beakerMl(i) {
        return Math.min(MAX_ML_PER_BEAKER, Math.max(0, volymMl - i * MAX_ML_PER_BEAKER));
    }

    /** Render or update beaker assemblies based on current volymMl. */
    function renderBeakers() {
        const row = document.getElementById('vol-beakers-row');
        if (!row) return;

        const fullBeakers  = Math.floor(volymMl / MAX_ML_PER_BEAKER);
        const remainder    = volymMl % MAX_ML_PER_BEAKER;
        const totalBeakers = Math.max(1, fullBeakers + (remainder > 0 ? 1 : 0));

        const current = row.querySelectorAll('.vol-beaker-outer');
        if (current.length !== totalBeakers) {
            // Number of beakers changed – re-render all
            let html = '';
            for (let i = 0; i < totalBeakers; i++) {
                const ml  = beakerMl(i);
                const pct = (ml / MAX_ML_PER_BEAKER) * 100;
                html += buildBeakerHTML(pct, formatLiters(ml), ml > 0);
            }
            row.innerHTML = html;
        } else {
            // Same count – update only the last beaker in-place (keeps CSS transition)
            const lastBeaker = current[totalBeakers - 1];
            const ml         = beakerMl(totalBeakers - 1);
            const pct        = (ml / MAX_ML_PER_BEAKER) * 100;
            const fillPx     = (pct / 100) * BEAKER_INNER_H;
            const liquid     = lastBeaker.querySelector('.vol-liquid');
            const lbl        = lastBeaker.querySelector('.vol-surface-label');
            if (liquid) liquid.style.height = pct + '%';
            if (lbl) {
                lbl.textContent   = formatLiters(ml);
                lbl.style.bottom  = Math.max(fillPx + 4, 4) + 'px';
                lbl.style.display = ml > 0 ? 'block' : 'none';
            }
        }
    }

    /** Format ml as Swedish decimal string in Liters, e.g. 1200 → "1,2 L". */
    function formatLiters(ml) {
        const liters = ml / 1000;
        return liters.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) + ' L';
    }

    /** Add millilitres to the tank and refresh UI. */
    function addVolume(ml) {
        volymMl += ml;
        updateVolumeUI();
    }

    /** Empty the tank. */
    function resetVolume() {
        volymMl = 0;
        updateVolumeUI();
    }

    /** Re-render all volume UI elements based on current volymMl. */
    function updateVolumeUI() {
        // Render beaker(s)
        renderBeakers();

        // Representation boxes – place-value breakdown
        const liters = Math.floor(volymMl / 1000);
        const dl     = Math.floor((volymMl % 1000) / 100);
        const cl     = Math.floor((volymMl % 100) / 10);
        const ml     = volymMl % 10;

        function setReprDigit(id, value) {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = value;
            el.classList.toggle('active', value > 0);
        }
        setReprDigit('vol-repr-L',  liters);
        setReprDigit('vol-repr-dl', dl);
        setReprDigit('vol-repr-cl', cl);
        setReprDigit('vol-repr-ml', ml);

        // Total display
        const totalEl = document.getElementById('vol-total-display');
        if (totalEl) totalEl.textContent = formatLiters(volymMl);

        // Extra info panel – show conversion hint when volume > 0
        const infoEl = document.getElementById('vol-info-extra');
        if (infoEl) {
            if (volymMl > 0) {
                const totalDl = (volymMl / 100).toLocaleString('sv-SE', { maximumFractionDigits: 1 });
                const totalCl = Math.round(volymMl / 10).toLocaleString('sv-SE');
                infoEl.innerHTML = `
                    ${formatLiters(volymMl)} =
                    <strong>${totalDl} dl</strong> =
                    <strong>${totalCl} cl</strong> =
                    <strong>${volymMl.toLocaleString('sv-SE')} ml</strong>
                `;
                infoEl.classList.remove('hidden');
            } else {
                infoEl.classList.add('hidden');
            }
        }
    }

    /** Toggle visibility of the Enhetsrelationer info box. */
    function toggleEnhetsrelationer() {
        const body = document.getElementById('vol-enhets-body');
        const icon = document.getElementById('vol-enhets-icon');
        const btn  = document.getElementById('vol-enhets-toggle');
        if (!body) return;
        const isHidden = body.classList.toggle('hidden');
        if (icon) {
            icon.classList.toggle('fa-chevron-up', !isHidden);
            icon.classList.toggle('fa-chevron-down', isHidden);
        }
        if (btn) btn.setAttribute('aria-expanded', String(!isHidden));
    }

    // ===================== DECIMALTAL =====================
    /**
     * Column definitions for the place value table.
     * pos: power of 10 (3=thousands, 0=ones, -1=tenths, etc.)
     */
    const DEC_COL_DEFS = [
        { pos: 3,  key: 'tusental',    label: 'Tusental',    abbr: 'T',  color: '#1565C0', bg: 'rgba(30,136,229,0.09)',  border: '#1565C0' },
        { pos: 2,  key: 'hundratal',   label: 'Hundratal',   abbr: 'H',  color: '#2E7D32', bg: 'rgba(56,142,60,0.09)',   border: '#2E7D32' },
        { pos: 1,  key: 'tiotal',      label: 'Tiotal',      abbr: 'Ti', color: '#92700A', bg: 'rgba(249,168,37,0.11)',  border: '#92700A' },
        { pos: 0,  key: 'ental',       label: 'Ental',       abbr: 'E',  color: '#C62828', bg: 'rgba(229,57,53,0.09)',   border: '#C62828' },
        { pos: -1, key: 'tiondelar',   label: 'Tiondelar',   abbr: '',   color: '#6a1b9a', bg: 'rgba(106,27,154,0.09)', border: '#6a1b9a' },
        { pos: -2, key: 'hundradelar', label: 'Hundradelar', abbr: '',   color: '#00695c', bg: 'rgba(0,105,92,0.09)',   border: '#00695c' },
        { pos: -3, key: 'tusendelar',  label: 'Tusendelar',  abbr: '',   color: '#4527a0', bg: 'rgba(69,39,160,0.09)',  border: '#4527a0' },
        // Note: color is used for col-head text/border; bg/border for head background.
        // Digit tokens render as plain solid-black – column colors are not applied to tokens.
    ];

    let decDigits      = [];           // [{pos, val}, …]
    let decBlocksState = {ones:0, tenths:0, hundredths:0};
    let decTool        = 'blocks';
    let decZoomRange   = [0, 10];      // number line visible range [start, end]
    let decNlPinnedPoints = [];        // [{value, color, label}, …] – multi-point comparison
    let decTableDragX  = null;
    let decTableDragShift = 0;
    let decTableReady  = false;        // guard against duplicate event-listener registration

    /** Build the static column structure of the place value table. */
    function decBuildTable() {
        const table = document.getElementById('dec-table');
        if (!table) return;
        // Remove old columns/separator (keep the token layer)
        Array.from(table.children).forEach(ch => { if (ch.id !== 'dec-tokens-layer') ch.remove(); });

        DEC_COL_DEFS.forEach((col, i) => {
            if (i === 4) {
                // Decimal separator before tiondelar
                const sep = document.createElement('div');
                sep.className = 'dec-sep';
                sep.innerHTML = '<div class="dec-dot"></div>';
                table.insertBefore(sep, document.getElementById('dec-tokens-layer'));
            }
            const colDiv = document.createElement('div');
            colDiv.className = 'dec-col';
            colDiv.id = `dec-col-${col.key}`;

            const head = document.createElement('div');
            head.className = 'dec-col-head';
            head.innerHTML = `${col.abbr ? `<span class="cab">${col.abbr}</span>` : ''}<span class="cnm">${col.label}</span><span class="cval"></span>`;

            const body = document.createElement('div');
            body.className = 'dec-col-body';
            body.id = `dec-body-${col.pos}`;

            colDiv.appendChild(head);
            colDiv.appendChild(body);
            table.insertBefore(colDiv, document.getElementById('dec-tokens-layer'));
        });

        // Wire up drag-to-shift on the table (only once)
        if (!decTableReady) {
            table.addEventListener('pointerdown', decOnTableDragStart, { passive: false });
            table.addEventListener('pointermove', decOnTableDragMove, { passive: false });
            table.addEventListener('pointerup',   decOnTableDragEnd);
            table.addEventListener('pointercancel', decOnTableDragEnd);
            decTableReady = true;
        }
    }

    /** Parse a user-typed decimal string into an array of {pos, val} digit objects. */
    function decParseInput(str) {
        str = (str || '').trim().replace(',', '.').replace(/\s/g, '');
        if (!str || isNaN(parseFloat(str)) || !isFinite(parseFloat(str))) return [];
        const absStr = str.startsWith('-') ? str.slice(1) : str;
        const [intPart = '0', fracPart = ''] = absStr.split('.');
        const result = [];
        // Integer digits (right-to-left → ascending position)
        for (let i = 0; i < intPart.length; i++) {
            const pos = intPart.length - 1 - i;
            if (pos > 3) continue;
            const val = parseInt(intPart[i], 10);
            if (!isNaN(val)) result.push({ pos, val });
        }
        // Fractional digits
        for (let i = 0; i < fracPart.length && i < 3; i++) {
            const val = parseInt(fracPart[i], 10);
            if (!isNaN(val)) result.push({ pos: -(i + 1), val });
        }
        return result;
    }

    /** Get the current numeric value from decDigits. */
    function decGetValue() {
        return decDigits.reduce((s, d) => s + d.val * Math.pow(10, d.pos), 0);
    }

    /** Format a number for Swedish locale display. */
    function decFmtSE(n, maxFrac) {
        return n.toLocaleString('sv-SE', { maximumFractionDigits: maxFrac ?? 6, minimumFractionDigits: 0 });
    }

    /**
     * Shift all digits left (positive steps = multiply by 10^steps)
     * or right (negative steps = divide by 10^|steps|).
     * Uses absolute-position transition for smooth sliding.
     */
    function decShift(steps) {
        if (!steps || decDigits.length === 0) return;
        decDigits = decDigits.map(d => ({ ...d, pos: d.pos + steps }));
        decInsertPlaceholderZeros();
        decRenderAll();
        decSyncBlocksFromDigits();
        decRenderBlocks();
        decRenderNL();
        decUpdateValueDisplay();
        decUpdateHeaders();
    }

    /**
     * Insert placeholder zeros for any missing integer column between pos=0
     * and the highest occupied position. This ensures e.g. 1,5 × 100 shows
     * digits 1, 5, 0 in Hundreds, Tens, Ones rather than leaving Ones empty.
     * Also inserts a leading zero in the Ones column when all digits have
     * shifted into fractional positions (e.g. 1,4 ÷ 10 → 0,14).
     */
    function decInsertPlaceholderZeros() {
        if (decDigits.length === 0) return;
        const maxPos = Math.max(...decDigits.map(d => d.pos));
        // If all digits are in fractional positions, add a leading zero in the Ones column
        if (maxPos < 0) {
            decDigits.push({ pos: 0, val: 0 });
        }
        if (maxPos <= 0) return; // all digits at/below ones, no integer gap possible
        for (let pos = 0; pos < maxPos; pos++) {
            if (!decDigits.some(d => d.pos === pos)) {
                decDigits.push({ pos, val: 0 });
            }
        }
    }

    /** Position digit tokens over the correct column using CSS left transition. */
    function decPositionTokens(animate) {
        const layer = document.getElementById('dec-tokens-layer');
        if (!layer) return;
        const layerRect = layer.getBoundingClientRect();
        if (!layerRect.width) return;

        const TOKEN_SIZE = 80;
        const table = document.getElementById('dec-table');
        if (!table) return;
        const headEl = table.querySelector('.dec-col-head');
        const headH  = headEl ? headEl.offsetHeight : 52;
        const tableH = table.offsetHeight;
        const tokenTop = headH + Math.max(0, (tableH - headH - TOKEN_SIZE) / 2);

        decDigits.forEach((digit, i) => {
            const token = document.getElementById(`dec-token-${i}`);
            if (!token) return;
            const col = DEC_COL_DEFS.find(c => c.pos === digit.pos);

            if (!col) {
                // Out of visible range
                if (animate) token.style.transition = 'left 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s';
                else         token.style.transition = 'none';
                token.style.opacity = '0.15';
                token.style.left = (digit.pos > 3 ? layerRect.width - TOKEN_SIZE : 0) + 'px';
            } else {
                const colEl = document.getElementById(`dec-col-${col.key}`);
                if (!colEl) return;
                const colRect = colEl.getBoundingClientRect();
                const centerX = colRect.left - layerRect.left + colRect.width / 2;
                const newLeft = Math.round(centerX - TOKEN_SIZE / 2);

                if (animate) token.style.transition = 'left 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s';
                else         token.style.transition = 'none';
                token.style.opacity = '1';
                token.style.left = newLeft + 'px';
                token.style.top  = tokenTop + 'px';
            }
        });
    }

    /** (Re-)create all digit token DOM elements and position them without animation. */
    function decRenderAll() {
        const layer = document.getElementById('dec-tokens-layer');
        if (!layer) return;
        layer.querySelectorAll('.dec-token').forEach(t => t.remove());

        decDigits.forEach((digit, i) => {
            const token = document.createElement('div');
            token.id        = `dec-token-${i}`;
            token.className = 'dec-token';
            token.textContent = digit.val;
            token.style.transition = 'none';
            layer.appendChild(token);
        });
        decPositionTokens(false);
    }

    /** Update the value display label and out-of-range warning. */
    function decUpdateValueDisplay() {
        const val = decGetValue();
        const el  = document.getElementById('dec-value-display');
        if (el) el.textContent = decDigits.length === 0 ? '—' : decFmtSE(val);
        const warn = document.getElementById('dec-range-warning');
        if (warn) warn.classList.toggle('hidden', !decDigits.some(d => d.pos < -3 || d.pos > 3));
    }

    /** Update each column header's value span based on current decDigits. */
    function decUpdateHeaders() {
        DEC_COL_DEFS.forEach(col => {
            const valSpan = document.querySelector(`#dec-col-${col.key} .cval`);
            if (!valSpan) return;
            const digit = decDigits.find(d => d.pos === col.pos);
            if (!digit) { valSpan.textContent = ''; return; }
            // col.pos: 3=thousands, 0=ones, -1=tenths, etc. 10^pos gives place value.
            const contribution = digit.val * Math.pow(10, col.pos);
            // Max decimal places = -col.pos (0 for integers, 1 for tenths, 2 for hundredths…)
            valSpan.textContent = decFmtSE(contribution, Math.max(0, -col.pos));
        });
    }

    // ── Table drag (manual shift) ─────────────────────────────────────────────
    function decOnTableDragStart(e) {
        if (e.button !== 0) return;
        decTableDragX     = e.clientX;
        decTableDragShift = 0;
        this.setPointerCapture(e.pointerId);
        e.preventDefault();
    }
    function decOnTableDragMove(e) {
        if (decTableDragX === null) return;
        const table  = document.getElementById('dec-table');
        // 7 cols + 1 separator = 8 layout units; use as column-width approximation
        const colW   = table ? Math.max(48, table.offsetWidth / (DEC_COL_DEFS.length + 1)) : 80;
        const dx     = e.clientX - decTableDragX;
        // Right drag → divide (−), left drag → multiply (+)
        const newShift = -Math.round(dx / colW);
        if (newShift !== decTableDragShift) {
            decShift(newShift - decTableDragShift);
            decTableDragShift = newShift;
        }
    }
    function decOnTableDragEnd() { decTableDragX = null; decTableDragShift = 0; }

    // ── Input handler ─────────────────────────────────────────────────────────
    function decHandleInput() {
        const raw = document.getElementById('dec-input')?.value || '';
        decDigits = decParseInput(raw);
        decRenderAll();
        decSyncBlocksFromDigits();
        decRenderBlocks();
        decRenderNL();
        decUpdateValueDisplay();
        decUpdateHeaders();
    }

    // ── Tool toggle (Show/Hide each panel independently) ──────────────────────
    let decToolVisible = { blocks: true, numberline: false };
    let decColumnsVisible = true;
    let decSplitVisible   = false;

    function decToggleTool(tool) {
        decToolVisible[tool] = !decToolVisible[tool];
        const panel = document.getElementById(`dec-panel-${tool}`);
        const btn   = document.getElementById(`dec-tool-btn-${tool}`);
        const visible = decToolVisible[tool];
        if (panel) panel.classList.toggle('active', visible);
        if (btn) {
            const icon = btn.querySelector('i');
            if (visible) {
                btn.style.cssText = 'background:rgba(61,138,138,0.15);border-color:#3d8a8a;color:#3d8a8a;';
                if (icon) { icon.className = 'fas fa-eye text-sm'; }
            } else {
                btn.style.cssText = 'background:rgba(91,128,165,0.08);border-color:#8c8d92;color:#8c8d92;';
                if (icon) { icon.className = 'fas fa-eye-slash text-sm'; }
            }
        }
        if (tool === 'numberline' && visible) decRenderNL();
    }

    function decToggleColumns() {
        decColumnsVisible = !decColumnsVisible;
        const table = document.getElementById('dec-table');
        const btn   = document.getElementById('dec-tool-btn-columns');
        if (table) table.classList.toggle('hide-dividers', !decColumnsVisible);
        if (btn) {
            const icon = btn.querySelector('i');
            if (decColumnsVisible) {
                btn.style.cssText = 'background:rgba(61,138,138,0.15);border-color:#3d8a8a;color:#3d8a8a;';
                if (icon) { icon.className = 'fas fa-eye text-sm'; }
            } else {
                btn.style.cssText = 'background:rgba(91,128,165,0.08);border-color:#8c8d92;color:#8c8d92;';
                if (icon) { icon.className = 'fas fa-eye-slash text-sm'; }
            }
        }
    }

    function decToggleSplit() {
        decSplitVisible = !decSplitVisible;
        const btn = document.getElementById('dec-tool-btn-split');
        if (btn) {
            const icon = btn.querySelector('i');
            if (decSplitVisible) {
                btn.style.cssText = 'background:rgba(61,138,138,0.15);border-color:#3d8a8a;color:#3d8a8a;';
                if (icon) { icon.className = 'fas fa-eye text-sm'; }
            } else {
                btn.style.cssText = 'background:rgba(91,128,165,0.08);border-color:#8c8d92;color:#8c8d92;';
                if (icon) { icon.className = 'fas fa-eye-slash text-sm'; }
            }
        }
        decRenderBlocks();
    }

    // ── Reset ─────────────────────────────────────────────────────────────────
    function decReset() {
        decDigits      = [];
        decBlocksState = {ones:0, tenths:0, hundredths:0};
        decZoomRange   = [0, 10];
        const inp = document.getElementById('dec-input');
        if (inp) inp.value = '';
        decRenderAll();
        decRenderBlocks();
        decRenderNL();
        decUpdateValueDisplay();
        decUpdateHeaders();
    }

    // ═══════════════════════════════════════════════════════════════════
    // BLOCKS TOOL
    // ═══════════════════════════════════════════════════════════════════

    function decSyncBlocksFromDigits() {
        decBlocksState = {ones:0, tenths:0, hundredths:0};
        decDigits.forEach(d => {
            if (d.pos === 0)  decBlocksState.ones       = d.val;
            if (d.pos === -1) decBlocksState.tenths     = d.val;
            if (d.pos === -2) decBlocksState.hundredths = d.val;
        });
    }

    function decSplitOne() {
        if (decBlocksState.ones <= 0) return;
        decBlocksState.ones--;
        decBlocksState.tenths += 10;
        decRenderBlocks(true);
    }
    function decMergeTenths() {
        if (decBlocksState.tenths < 10) return;
        decBlocksState.tenths -= 10;
        decBlocksState.ones++;
        decRenderBlocks(true);
    }
    function decSplitTenth() {
        if (decBlocksState.tenths <= 0) return;
        decBlocksState.tenths--;
        decBlocksState.hundredths += 10;
        decRenderBlocks(true);
    }
    function decMergeHundredths() {
        if (decBlocksState.hundredths < 10) return;
        decBlocksState.hundredths -= 10;
        decBlocksState.tenths++;
        decRenderBlocks(true);
    }

    /**
     * Draw a 3D-style block as an inline SVG element.
     * Uses a simple axonometric projection: front face + top face + right face.
     * @param {number} faceW  Width of the front face in pixels
     * @param {number} faceH  Height of the front face in pixels
     * @param {number} depth  Depth offset (thickness of top/right faces)
     * @param {string} cFront Front face fill color
     * @param {string} cTop   Top face fill color (lighter)
     * @param {string} cRight Right face fill color (darker)
     * @returns {SVGElement}
     */
    function decMake3DBlock(faceW, faceH, depth, cFront, cTop, cRight) {
        const ns   = 'http://www.w3.org/2000/svg';
        const svgW = faceW + depth;
        const svgH = faceH + depth;
        const svg  = document.createElementNS(ns, 'svg');
        svg.setAttribute('width',   svgW);
        svg.setAttribute('height',  svgH);
        svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
        svg.style.display  = 'block';
        svg.style.overflow = 'visible';
        const stroke = '#1a1a1a';
        const sw     = '1';

        // Front face (bottom-left quadrant)
        const front = document.createElementNS(ns, 'rect');
        front.setAttribute('x', 0);
        front.setAttribute('y', depth);
        front.setAttribute('width',  faceW);
        front.setAttribute('height', faceH);
        front.setAttribute('fill',   cFront);
        front.setAttribute('stroke', stroke);
        front.setAttribute('stroke-width', sw);
        svg.appendChild(front);

        // Top face (parallelogram, upper area)
        const top = document.createElementNS(ns, 'polygon');
        top.setAttribute('points',
            `0,${depth} ${depth},0 ${faceW + depth},0 ${faceW},${depth}`);
        top.setAttribute('fill',   cTop);
        top.setAttribute('stroke', stroke);
        top.setAttribute('stroke-width', sw);
        svg.appendChild(top);

        // Right face (parallelogram, right area)
        const right = document.createElementNS(ns, 'polygon');
        right.setAttribute('points',
            `${faceW},${depth} ${faceW + depth},0 ${faceW + depth},${faceH} ${faceW},${faceH + depth}`);
        right.setAttribute('fill',   cRight);
        right.setAttribute('stroke', stroke);
        right.setAttribute('stroke-width', sw);
        svg.appendChild(right);

        return svg;
    }

    /**
     * Draw a 2D flat plate as an inline SVG element.
     * Solid fill with sharp black outline – no 3D perspective.
     * @param {number} faceW  Width in pixels
     * @param {number} faceH  Height in pixels
     * @param {string} color  Fill color
     * @returns {SVGElement}
     */
    function decMakeFlatPlate(faceW, faceH, color) {
        const ns  = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width',   faceW);
        svg.setAttribute('height',  faceH);
        svg.setAttribute('viewBox', `0 0 ${faceW} ${faceH}`);
        svg.style.display  = 'block';
        svg.style.overflow = 'visible';

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', 0);
        rect.setAttribute('y', 0);
        rect.setAttribute('width',  faceW);
        rect.setAttribute('height', faceH);
        rect.setAttribute('fill',   color);
        rect.setAttribute('stroke', '#1a1a1a');
        rect.setAttribute('stroke-width', '1.5');
        svg.appendChild(rect);

        return svg;
    }

    function decRenderBlocks(newItems) {
        const area    = document.getElementById('dec-blocks-area');
        const actions = document.getElementById('dec-blocks-actions');
        if (!area || !actions) return;
        area.innerHTML    = '';
        actions.innerHTML = '';

        // Block sizes – proportionally correct: 10 tenths = 1 ones (area)
        // Ones: 120×120, Tenth: 12×120 (vertical rod), Hundredth: 12×12
        const ONE_W = 120, ONE_H = 120;
        const TENTH_W = 12, TENTH_H = 120;
        const HUNDREDTH_W = 12, HUNDREDTH_H = 12;

        // Flat-color fill for each denomination
        const COLOR = {
            ones:       '#2E7D32',
            tenths:     '#6A1B9A',
            hundredths: '#00695C'
        };

        function makeWrapper(title, anim) {
            const w = document.createElement('div');
            w.className   = anim ? 'dec-blk-enter' : '';
            w.style.cssText = 'display:inline-block; line-height:0;';
            w.title = title;
            return w;
        }

        const isEmpty = decBlocksState.ones === 0 && decBlocksState.tenths === 0 && decBlocksState.hundredths === 0;

        if (isEmpty) {
            const msg = document.createElement('p');
            msg.className = 'text-soft-muted text-sm italic px-4 py-4';
            msg.textContent = 'Skriv ett decimaltal för att se basmaterialet.';
            area.appendChild(msg);
        } else {
            // Build column-aligned layout mirroring the place-value table
            DEC_COL_DEFS.forEach((col, i) => {
                if (i === 4) {
                    // Decimal separator slot – matches .dec-sep width (28px)
                    const sep = document.createElement('div');
                    sep.className = 'dec-blocks-sep';
                    area.appendChild(sep);
                }

                const colDiv = document.createElement('div');
                colDiv.className = 'dec-blocks-col';

                if (col.key === 'ental' && decBlocksState.ones > 0) {
                    const lbl = document.createElement('div');
                    lbl.className = 'text-xs font-bold uppercase tracking-wide mb-1';
                    lbl.style.color = COLOR.ones;
                    lbl.textContent = `Ental ×${decBlocksState.ones}`;
                    colDiv.appendChild(lbl);
                    const row = document.createElement('div');
                    row.className = 'dec-blk-row';
                    for (let j = 0; j < decBlocksState.ones; j++) {
                        const w = makeWrapper('En ental (1)', !!newItems && j === decBlocksState.ones - 1);
                        w.appendChild(decMakeFlatPlate(ONE_W, ONE_H, COLOR.ones));
                        row.appendChild(w);
                    }
                    colDiv.appendChild(row);

                } else if (col.key === 'tiondelar' && decBlocksState.tenths > 0) {
                    const maxShow = 30;
                    const lbl = document.createElement('div');
                    lbl.className = 'text-xs font-bold uppercase tracking-wide mb-1';
                    lbl.style.color = COLOR.tenths;
                    lbl.textContent = `Tiondelar ×${decBlocksState.tenths}${decBlocksState.tenths > maxShow ? ' (max 30)' : ''}`;
                    colDiv.appendChild(lbl);
                    const row = document.createElement('div');
                    row.className = 'dec-blk-row';
                    for (let j = 0; j < Math.min(decBlocksState.tenths, maxShow); j++) {
                        const w = makeWrapper('En tiondel (0,1)', !!newItems && j === decBlocksState.tenths - 1);
                        w.appendChild(decMakeFlatPlate(TENTH_W, TENTH_H, COLOR.tenths));
                        row.appendChild(w);
                    }
                    colDiv.appendChild(row);

                } else if (col.key === 'hundradelar' && decBlocksState.hundredths > 0) {
                    const maxShow = 100;
                    const lbl = document.createElement('div');
                    lbl.className = 'text-xs font-bold uppercase tracking-wide mb-1';
                    lbl.style.color = COLOR.hundredths;
                    lbl.textContent = `Hundradelar ×${decBlocksState.hundredths}${decBlocksState.hundredths > maxShow ? ' (max 100)' : ''}`;
                    colDiv.appendChild(lbl);
                    const row = document.createElement('div');
                    row.className = 'dec-blk-row';
                    // Group into rows of 10 for a neat grid
                    row.style.maxWidth = (HUNDREDTH_W * 10 + 3 * 9) + 'px';
                    for (let j = 0; j < Math.min(decBlocksState.hundredths, maxShow); j++) {
                        const w = makeWrapper('En hundradel (0,01)', !!newItems);
                        w.appendChild(decMakeFlatPlate(HUNDREDTH_W, HUNDREDTH_H, COLOR.hundredths));
                        row.appendChild(w);
                    }
                    colDiv.appendChild(row);
                }

                area.appendChild(colDiv);
            });
        }

        // ── Split / Merge action buttons (only shown when decSplitVisible) ──────
        if (decSplitVisible) {
            const btnStyle = 'px-3 py-1.5 rounded font-bold text-xs border-2 cursor-pointer transition-all hover:opacity-80 font-[Nunito]';
            if (decBlocksState.ones > 0) {
                const b = document.createElement('button');
                b.className = btnStyle;
                b.style.cssText = 'background:#C8E6C9;border-color:#2E7D32;color:#1B5E20;';
                b.innerHTML = '<i class="fas fa-expand-arrows-alt mr-1"></i>Dela 1 ental → 10 tiondelar';
                b.onclick = decSplitOne;
                actions.appendChild(b);
            }
            if (decBlocksState.tenths >= 10) {
                const b = document.createElement('button');
                b.className = btnStyle;
                b.style.cssText = 'background:#C8E6C9;border-color:#2E7D32;color:#1B5E20;';
                b.innerHTML = '<i class="fas fa-compress-arrows-alt mr-1"></i>Slå ihop 10 tiondelar → 1 ental';
                b.onclick = decMergeTenths;
                actions.appendChild(b);
            }
            if (decBlocksState.tenths > 0) {
                const b = document.createElement('button');
                b.className = btnStyle;
                b.style.cssText = 'background:#E1BEE7;border-color:#6A1B9A;color:#4A148C;';
                b.innerHTML = '<i class="fas fa-expand-arrows-alt mr-1"></i>Dela 1 tiondel → 10 hundradelar';
                b.onclick = decSplitTenth;
                actions.appendChild(b);
            }
            if (decBlocksState.hundredths >= 10) {
                const b = document.createElement('button');
                b.className = btnStyle;
                b.style.cssText = 'background:#E1BEE7;border-color:#6A1B9A;color:#4A148C;';
                b.innerHTML = '<i class="fas fa-compress-arrows-alt mr-1"></i>Slå ihop 10 hundradelar → 1 tiondel';
                b.onclick = decMergeHundredths;
                actions.appendChild(b);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // NUMBER LINE TOOL (Micro-Zoom)
    // ═══════════════════════════════════════════════════════════════════

    function decRenderNL() {
        const svgEl = document.getElementById('dec-nl-svg');
        if (!svgEl || !decToolVisible?.numberline) return;

        const parent = svgEl.parentElement;
        const W = Math.max(300, parent ? parent.offsetWidth - 32 : 600);
        const H = 130;
        svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svgEl.setAttribute('width', W);
        svgEl.setAttribute('height', H);
        svgEl.innerHTML = '';

        const [start, end] = decZoomRange;
        const range  = end - start;
        const pad    = 36;
        const axisW  = W - 2 * pad;
        const axisY  = 80;

        // Helper: value → x pixel
        const vx = v => pad + (v - start) / range * axisW;

        // Background axis line – dark, high-contrast
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', pad); line.setAttribute('y1', axisY);
        line.setAttribute('x2', pad + axisW); line.setAttribute('y2', axisY);
        line.setAttribute('stroke', '#222'); line.setAttribute('stroke-width', '3');
        svgEl.appendChild(line);

        // Determine number of divisions: prefer 10 minor ticks per major
        const numMajor = 10;
        const step = range / numMajor;

        // Draw segments (clickable for zoom)
        for (let i = 0; i < numMajor; i++) {
            const segStart = start + i * step;
            const segEnd   = start + (i + 1) * step;
            const x1 = vx(segStart);
            const x2 = vx(segEnd);

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x1 + 1); rect.setAttribute('y', axisY - 14);
            rect.setAttribute('width', x2 - x1 - 2); rect.setAttribute('height', 28);
            rect.setAttribute('fill', i % 2 === 0 ? 'rgba(91,128,165,0.07)' : 'rgba(91,128,165,0.14)');
            rect.setAttribute('rx', '3');
            rect.classList.add('dec-nl-segment');
            rect.style.cursor = 'pointer';
            rect.addEventListener('click', () => {
                decZoomRange = [segStart, segEnd];
                decRenderNL();
            });
            svgEl.appendChild(rect);
        }

        // Major ticks and labels – dark, high-contrast
        for (let i = 0; i <= numMajor; i++) {
            const val = start + i * step;
            const x   = vx(val);
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', x); tick.setAttribute('y1', axisY - 12);
            tick.setAttribute('x2', x); tick.setAttribute('y2', axisY + 12);
            tick.setAttribute('stroke', '#222'); tick.setAttribute('stroke-width', '2');
            svgEl.appendChild(tick);

            const frac = step < 0.01 ? 4 : step < 0.1 ? 3 : step < 1 ? 2 : step < 10 ? 1 : 0;
            const lbl  = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lbl.setAttribute('x', x); lbl.setAttribute('y', axisY + 28);
            lbl.setAttribute('text-anchor', 'middle');
            lbl.setAttribute('font-size', '11'); lbl.setAttribute('font-weight', '700');
            lbl.setAttribute('fill', '#333'); lbl.setAttribute('font-family', 'Nunito,sans-serif');
            lbl.textContent = val.toLocaleString('sv-SE', { maximumFractionDigits: frac });
            svgEl.appendChild(lbl);
        }

        // Arrow caps
        const makeArrow = (x, y, dir) => {
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const d = dir === 'right' ? `${x},${y} ${x-8},${y-5} ${x-8},${y+5}` : `${x},${y} ${x+8},${y-5} ${x+8},${y+5}`;
            p.setAttribute('points', d); p.setAttribute('fill', '#222');
            svgEl.appendChild(p);
        };
        makeArrow(pad + axisW + 6, axisY, 'right');

        // Palette for pinned points (distinct colors)
        const PIN_COLORS = ['#e53935','#1565C0','#2E7D32','#F57F17','#6A1B9A','#00695C','#AD1457'];

        // Render pinned points below the axis
        decNlPinnedPoints.forEach((pt, idx) => {
            if (pt.value < start || pt.value > end) return;
            const xp = vx(pt.value);
            const color = PIN_COLORS[idx % PIN_COLORS.length];
            // Pin marker (triangle above axis)
            const pin = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            pin.setAttribute('points', `${xp},${axisY-16} ${xp-6},${axisY-28} ${xp+6},${axisY-28}`);
            pin.setAttribute('fill', color);
            svgEl.appendChild(pin);
            // Pin label above
            const pl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            pl.setAttribute('x', xp); pl.setAttribute('y', axisY - 32);
            pl.setAttribute('text-anchor', 'middle');
            pl.setAttribute('font-size', '11'); pl.setAttribute('font-weight', '900');
            pl.setAttribute('fill', color); pl.setAttribute('font-family', 'Nunito,sans-serif');
            pl.textContent = pt.label;
            svgEl.appendChild(pl);
        });

        // Mark current value on the number line
        const val = decGetValue();
        if (decDigits.length > 0 && val >= start && val <= end) {
            const xv = vx(val);
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', xv); dot.setAttribute('cy', axisY);
            dot.setAttribute('r', '8'); dot.setAttribute('fill', '#3d8a8a');
            dot.setAttribute('stroke', 'white'); dot.setAttribute('stroke-width', '2');
            svgEl.appendChild(dot);

            const lbl2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lbl2.setAttribute('x', xv); lbl2.setAttribute('y', axisY - 20);
            lbl2.setAttribute('text-anchor', 'middle');
            lbl2.setAttribute('font-size', '12'); lbl2.setAttribute('font-weight', '900');
            lbl2.setAttribute('fill', '#3d8a8a'); lbl2.setAttribute('font-family', 'Nunito,sans-serif');
            lbl2.textContent = decFmtSE(val, 4);
            svgEl.appendChild(lbl2);
        }

        // Update range label
        const rl = document.getElementById('dec-nl-range-label');
        const frac2 = step < 0.01 ? 4 : step < 0.1 ? 3 : step < 1 ? 2 : step < 10 ? 1 : 0;
        if (rl) rl.textContent = `Visar: ${decFmtSE(start, frac2)} – ${decFmtSE(end, frac2)} (steg: ${decFmtSE(step, frac2)})`;
    }

    function decNlZoomOut() {
        const [s, e] = decZoomRange;
        const range = e - s;
        decZoomRange = [
            parseFloat((s - range * 4.5).toFixed(6)),
            parseFloat((e + range * 4.5).toFixed(6))
        ];
        // Clamp to a sane maximum range (avoid infinitely small tick labels)
        const MAX_ZOOM_RANGE = 10000;
        if (decZoomRange[1] - decZoomRange[0] > MAX_ZOOM_RANGE) decZoomRange = [0, 10];
        decRenderNL();
    }

    /** Pin the current value as a named point on the number line for multi-value comparison. */
    function decNlPinCurrent() {
        const val = decGetValue();
        if (decDigits.length === 0) return;
        const frac = Math.abs(val) < 0.001 ? 4 : Math.abs(val) < 0.01 ? 3 : Math.abs(val) < 0.1 ? 2 : 1;
        const label = decFmtSE(val, frac);
        // Avoid exact duplicates
        if (!decNlPinnedPoints.some(p => p.value === val)) {
            decNlPinnedPoints.push({ value: val, label });
        }
        decRenderNL();
    }

    /** Clear all pinned points from the number line. */
    function decNlClearPins() {
        decNlPinnedPoints = [];
        decRenderNL();
    }

    // ═══════════════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════════════

    function initDecimaltal() {
        decBuildTable();
        decRenderAll();
        decSyncBlocksFromDigits();
        decRenderBlocks();
        decUpdateValueDisplay();
    }

    /** Lightweight re-entry: re-position tokens and refresh active tool (no DOM rebuild). */
    function decOnEnter() {
        decPositionTokens(false);
        decRenderBlocks();
        if (decToolVisible.numberline) decRenderNL();
    }

// ===================== UPPSTÄLLNING =====================
let uppstallningMode = 'addition';

function initUppstallning() {
    renderUppstallning();
}

function setUppstallningMode(mode) {
    uppstallningMode = mode;
    renderUppstallning();
}

function renderUppstallning() {
    const container = document.getElementById('uppstallning-grid-container');
    if (!container) return;
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'mx-auto border-separate';
    table.style.borderSpacing = '10px';

    const labels = ['Tusental', 'Hundratal', 'Tiotal', 'Ental'];
    const shortLabels = ['T', 'H', 'Ti', 'E'];

    // 1. RAD FÖR MINNESSIFFROR / VÄXLING (+10)
    const rowMemory = document.createElement('tr');
    for (let i = 0; i < 4; i++) {
        const td = document.createElement('td');
        td.className = 'text-center align-bottom h-12';
        
        // Addition: Visa inte ruta över Ental (index 3)
        if (uppstallningMode === 'addition' && i === 3) {
            // Tomt över entalen i addition
        } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 2;
            // Olika färger beroende på mode
            input.className = `w-10 h-10 text-center border-2 rounded-lg font-bold transition-all ${
                uppstallningMode === 'addition' 
                ? 'border-red-200 text-red-600 focus:border-red-500' 
                : 'border-blue-200 text-blue-600 focus:border-blue-500'
            }`;
            input.placeholder = uppstallningMode === 'subtraktion' ? '+10' : '';
            td.appendChild(input);
        }
        rowMemory.appendChild(td);
    }
    table.appendChild(rowMemory);

    // 2. RADER FÖR TALEN (TVÅ RADER)
    for (let r = 0; r < 2; r++) {
        const row = document.createElement('tr');
        for (let i = 0; i < 4; i++) {
            const td = document.createElement('td');
            td.className = 'relative p-1';
            
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'w-16 h-16 text-3xl text-center border-2 border-gray-300 rounded-xl font-bold focus:border-soft-blue outline-none';
            
            // Vid subtraktion: Lägg till klick-funktion för att dra ett streck (växla)
            if (uppstallningMode === 'subtraktion') {
                input.addEventListener('click', function() {
                    this.classList.toggle('line-through');
                    this.classList.toggle('text-red-500');
                });
                input.title = "Klicka för att markera som växlad/lånad";
            }

            td.appendChild(input);
            row.appendChild(td);
        }
        table.appendChild(row);
    }

    // 3. RESULTATRAD (MED LINJE)
    const rowResult = document.createElement('tr');
    for (let i = 0; i < 4; i++) {
        const td = document.createElement('td');
        td.className = 'pt-4 border-t-4 border-gray-800';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'w-16 h-16 text-3xl text-center border-2 border-green-400 bg-green-50 rounded-xl font-bold focus:border-green-600 outline-none';
        td.appendChild(input);
        rowResult.appendChild(td);
    }
    table.appendChild(rowResult);

    container.appendChild(table);

    // Lägg till symbol (+ eller -)
    const symbol = document.createElement('div');
    symbol.className = 'absolute left-0 top-1/2 -translate-y-1/2 text-4xl font-bold text-gray-400 ml-4';
    symbol.innerText = uppstallningMode === 'addition' ? '+' : '−';
    container.style.position = 'relative';
    container.appendChild(symbol);
}
