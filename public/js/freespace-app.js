// public/js/freespace-app.js
// Building-aware Free Rooms with Floor & Room Filters + Modal
;(function(){
    // --- Building selection ---
    const urlParams         = new URLSearchParams(window.location.search);
    const currentBuilding   = urlParams.get('building') || localStorage.getItem('currentBuilding') || 'AP152';
    localStorage.setItem('currentBuilding', currentBuilding);
    console.log('Using building:', currentBuilding);

    // --- Config & DOM refs ---
    const API_ROOMS_URL     = `/api/rooms?building=${encodeURIComponent(currentBuilding)}`;
    const API_STRUCTURE_URL = `/api/structure?building=${encodeURIComponent(currentBuilding)}`;
    const ITEMS_PER_LOAD    = 5;
    const WORK_START_TIME   = '08:00';
    const WORK_END_TIME     = '18:15';
    const MIN_SOON_DURATION = 45;

    // DOM Elements
    const dateEl            = document.getElementById('date');
    const timeEl            = document.getElementById('time');
    const floorEl           = document.getElementById('floor');
    const roomEl            = document.getElementById('room');
    const loadingEl         = document.getElementById('loading-indicator');
    const errorEl           = document.getElementById('error-message');
    const buildingDisplayEl = document.getElementById('currentBuildingDisplayFreespace');

    const freeNowTimeEl     = document.getElementById('free-now-time-display');
    const freeNowListEl     = document.getElementById('free-now-list');
    const freeNowMoreBtn    = document.getElementById('free-now-show-more');

    const soonTimeEl        = document.getElementById('available-soon-time-display');
    const soonListEl        = document.getElementById('available-soon-list');
    const soonMoreBtn       = document.getElementById('available-soon-show-more');

    const modalEl           = document.getElementById('room-schedule-modal');
    const modalCloseBtn     = document.getElementById('modal-close-button');
    const modalNameEl       = document.getElementById('modal-room-name');
    const modalDateEl       = document.getElementById('modal-room-date');
    const modalListEl       = document.getElementById('modal-room-schedule-list');
    const modalNoEl         = document.getElementById('modal-no-events');

    // State
    let rawData         = [];
    let structure       = { floors: {} };
    let allSlots        = [];
    let freeNowSlots    = [];
    let freeSoonSlots   = [];
    let counts          = { now:0, soon:0 };

    // Helpers
    function showLoading(on){ loadingEl.style.display = on ? 'block' : 'none'; if(on) errorEl.style.display = 'none'; }
    function showError(msg){ errorEl.textContent = msg; errorEl.style.display = msg ? 'block' : 'none'; }
    function todayISO(){ return new Date().toISOString().slice(0,10); }
    function minutesBetween(a,b){ const [h0,m0]=a.split(':').map(Number), [h1,m1]=b.split(':').map(Number); return (h1*60+m1)-(h0*60+m0); }
    function fmtMin(m){ const h=Math.floor(m/60), mm=m%60; return (h? h+'h ':'') + (mm? mm+'m':''); }
    function extractRoom(e){ const rx=new RegExp(`\\b${currentBuilding}\\.\\d{2}\\.\\w+\\b`); const m=(e.title||'').match(rx); return m?m[0]:null; }

    // Display building
    if(buildingDisplayEl) buildingDisplayEl.textContent = currentBuilding;


    // Fetch JSON utility
    async function fetchJSON(url){ const res = await fetch(url); if(!res.ok) throw new Error(res.statusText); return res.json(); }

    // Load structure & events
    async function loadData(){
        try{
            structure = await fetchJSON(API_STRUCTURE_URL);
            rawData    = await fetchJSON(API_ROOMS_URL);
            buildFilters();
        } catch(err){
            showError('Load error: '+err.message);
            structure = { floors: {} };
            rawData = [];
        }
    }

    // Build floor & room dropdowns
    function buildFilters(){
        // Floor select
        floorEl.innerHTML = '<option value="">All Floors</option>';
        Object.keys(structure.floors || {}).sort().forEach(f=>{
            const opt = document.createElement('option'); opt.value=f; opt.text = `Floor ${f}`;
            floorEl.append(opt);
        });
        populateRooms();
    }
    function populateRooms(){
        const selFloor = floorEl.value;
        roomEl.innerHTML = '<option value="">All Rooms</option>';
        const rooms = new Set();
        Object.entries(structure.floors || {}).forEach(([f,rs])=>{
            if(!selFloor || selFloor===f) rs.forEach(r=>rooms.add(r));
        });
        Array.from(rooms).sort().forEach(r=>{
            const opt = document.createElement('option'); opt.value=r; opt.text=r;
            roomEl.append(opt);
        });
    }

    // Compute free slots with floor/room filter
    function computeSlots(dateISO){
        allSlots = [];
        const dot = dateISO.split('-').reverse().join('.');
        Object.entries(structure.floors).forEach(([floor, rooms])=>{
            rooms.forEach(roomNum=>{
                // apply floor/room filter
                if(floorEl.value && floorEl.value!==floor) return;
                if(roomEl.value && roomEl.value!==roomNum) return;
                const code = `${currentBuilding}.${floor}.${roomNum}`;
                let evs = rawData.filter(e=>extractRoom(e)===code && e.start.slice(0,10).split('-').reverse().join('.')===dot)
                    .map(e=>({ start:e.start.slice(11,16), end:e.end.slice(11,16) }))
                    .sort((a,b)=>a.start.localeCompare(b.start));
                let cursor = WORK_START_TIME;
                if(!evs.length){
                    allSlots.push({ code, start:WORK_START_TIME, end:WORK_END_TIME, mins:minutesBetween(WORK_START_TIME,WORK_END_TIME) });
                } else {
                    evs.forEach(ev=>{
                        if(ev.start>cursor) allSlots.push({ code, start:cursor, end:ev.start, mins:minutesBetween(cursor,ev.start) });
                        if(ev.end>cursor) cursor=ev.end;
                    });
                    if(cursor<WORK_END_TIME) allSlots.push({ code, start:cursor, end:WORK_END_TIME, mins:minutesBetween(cursor,WORK_END_TIME) });
                }
            });
        });
        allSlots.sort((a,b)=>b.mins-a.mins);
    }

    // Paginated render of a section
    function renderSection(listEl, btnEl, slots, key){
        if(counts[key]===0) listEl.innerHTML='';
        let i = counts[key], end = i+ITEMS_PER_LOAD;
        for(; i<end && i<slots.length; i++){
            const s=slots[i], li=document.createElement('li');
            li.innerHTML=`<span class="room">${s.code}</span>`+
                `<span class="interval">${s.start}–${s.end}</span>`+
                `<span class="duration">${fmtMin(s.mins)}</span>`;
            li.addEventListener('click', ()=> openModal(s.code));
            listEl.append(li);
        }
        counts[key]=i;
        btnEl.style.display = i<slots.length?'block':'none';
    }

    // Section renderers
    function showFreeNow(){
        const t = timeEl.value;
        freeNowTimeEl.textContent = `at ${t}`;
        freeNowSlots = allSlots
          .filter(s => s.start <= t && t < s.end)
          .map(s => ({ ...s, start: t, mins: minutesBetween(t, s.end) }))
          .filter(s => s.mins > 0);
      
        // clear out any old items
        freeNowListEl.innerHTML = '';
        counts.now = 0;
      
        if (freeNowSlots.length === 0) {
          // **fallback** when there's nothing to show
          freeNowListEl.innerHTML =
            '<li class="no-rooms">Only from 8:00 Uhr to 18:15 Uhr Rooms are visible. Change the time in the top left corner to see the schedule.</li>';
          freeNowMoreBtn.style.display = 'none';
        } else {
          // render the normal paginated list
          renderSection(freeNowListEl, freeNowMoreBtn, freeNowSlots, 'now');
        }
      }
    function showFreeSoon(){
        const t=timeEl.value; soonTimeEl.textContent=`after ${t}`;
        freeSoonSlots = allSlots.filter(s=>s.start>t && s.mins>=MIN_SOON_DURATION)
            .sort((a,b)=>minutesBetween(t,a.start)-minutesBetween(t,b.start));
        counts.soon=0; renderSection(soonListEl, soonMoreBtn, freeSoonSlots, 'soon');
    }
    

    // Modal logic
    function openModal(code){
        modalNameEl.textContent=code;
        modalDateEl.textContent=dateEl.value;
        modalListEl.innerHTML='';
        modalNoEl.style.display='none';
        const evs = rawData.filter(e=>extractRoom(e)===code && e.start.slice(0,10)===dateEl.value);
        if(!evs.length) modalNoEl.style.display='block'; else evs.forEach(ev=>{
            const li=document.createElement('li');
            li.innerHTML=`<strong>${ev.start.slice(11,16)}–${ev.end.slice(11,16)}</strong> ${ev.title}`;
            modalListEl.append(li);
        });
        modalEl.style.display='block';
    }
    modalCloseBtn.addEventListener('click', ()=> modalEl.style.display='none');
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') modalEl.style.display='none'; });
    document.querySelector('#room-schedule-modal .modal-backdrop').addEventListener('click', ()=> modalEl.style.display='none');

    // Main refresh
    async function refresh(){
        showLoading(true);
        computeSlots(dateEl.value);
        showFreeNow();
        showFreeSoon();
        showLoading(false);
    }

    // Init
    (async()=>{
        dateEl.value = todayISO();
        timeEl.value = dateEl.value===todayISO() ? new Date().toTimeString().slice(0,5) : WORK_START_TIME;
        await loadData();
        floorEl.addEventListener('change', () => { populateRooms(); refresh(); });
        roomEl.addEventListener('change', refresh);
        dateEl.addEventListener('change', refresh);
        timeEl.addEventListener('change', refresh);
        freeNowMoreBtn.addEventListener('click', ()=> renderSection(freeNowListEl, freeNowMoreBtn, freeNowSlots, 'now'));
        soonMoreBtn.addEventListener('click', ()=> renderSection(soonListEl, soonMoreBtn, freeSoonSlots, 'soon'));
        refresh();
    })();
})();