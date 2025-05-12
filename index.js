// index.js
const express      = require('express');
const cookieParser = require('cookie-parser');
const bodyParser   = require('body-parser');
const path         = require('path');

let currentBuildingCode = 'AP152'; // default if nothing set
const PUBLIC_DIR       = path.join(__dirname, 'public');
const DATA_FILE_PREFIX = 'data_';
const PORT             = process.env.PORT || 3100;

let rawData   = [];
let structure = { building: currentBuildingCode, floors: {} };

const app = express();

// parse cookies & JSON bodies
app.use(cookieParser());
app.use(bodyParser.json());

// ensure public folder exists
if (!require('fs').existsSync(PUBLIC_DIR)) {
    require('fs').mkdirSync(PUBLIC_DIR, { recursive: true });
}

// ********** Onboarding vs Schedule **********

app.get('/', (req, res) => {
    const cookie = req.cookies.currentBuilding;
    if (cookie) {
        // user already picked a building → go to main schedule
        return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    }
    // new user → onboarding
    res.sendFile(path.join(PUBLIC_DIR, 'onboarding.html'));
});

// now serve all your static assets, but don't auto-serve index.html
app.use(express.static(PUBLIC_DIR, { index: false }));

// ********** Data Fetch & Structure Logic **********

function escapeRegExp(string) {
    return string ? string.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') : '';
}

// parse room details out of an event
function parseRoomDetails(event, building) {
    if (!building) return null;
    const esc = escapeRegExp(building);
    const RX = new RegExp(`\\b(${esc})\\.([A-Za-z0-9]{1,3})\\.([A-Za-z0-9]{3}[A-Za-z]?)\\b`);
    let text = event.title || '';
    if (Array.isArray(event.className)) text += ' '+event.className.join(' ');
    else if (event.className) text += ' '+event.className;
    const m = text.match(RX);
    return m ? { fullCode:m[0], building:m[1], floor:m[2], roomNum:m[3] } : null;
}

async function updateData(building) {
    const url  = `https://almaty.fh-joanneum.at/stundenplan/json.php?submit=Suche&q=${building}`;
    const file = path.join(PUBLIC_DIR, `${DATA_FILE_PREFIX}${building}.json`);
    console.log(new Date().toISOString(), 'Fetching for', building, 'from', url);
    try {
        const fetchFn = typeof fetch==='undefined'
            ? (await import('node-fetch')).default
            : fetch;
        const res = await fetchFn(url);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        require('fs').writeFileSync(file, JSON.stringify(json, null,2));
        console.log(new Date().toISOString(), 'Saved', file);
        // If it's our active building, load it into memory
        if (building===currentBuildingCode) {
            rawData = json;
            rebuildStructure(building);
        }
        return { success:true };
    } catch(err) {
        console.error('Fetch failed:', err);
        if (building===currentBuildingCode) {
            rawData = [];
            structure = { building, floors:{} };
        }
        return { success:false, error:err.message };
    }
}

function rebuildStructure(building) {
    console.log('Rebuilding structure for', building);
    const map = new Map();
    if (!rawData.length) {
        structure = { building, floors:{} };
        return;
    }
    rawData.forEach(ev => {
        const d = parseRoomDetails(ev, building);
        if (d && d.building===building) {
            if (!map.has(d.floor)) map.set(d.floor, new Set());
            map.get(d.floor).add(d.roomNum);
        }
    });
    const floors = {};
    Array.from(map.keys()).sort().forEach(f => {
        floors[f] = Array.from(map.get(f)).sort();
    });
    structure = { building, floors };
}

// initial load for default building
(async()=>{ await updateData(currentBuildingCode); })();

// ********** API Endpoints **********

// set-building: invoked from onboarding.js
app.post('/api/set-building', async (req, res) => {
    const b = req.body.buildingCode;
    if (!b) return res.status(400).json({ error:'Missing buildingCode' });
    currentBuildingCode = b;
    // set cookie so root "/" will know
    res.cookie('currentBuilding', b, { maxAge:365*24*60*60*1000, path:'/' });
    const result = await updateData(b);
    if (result.success) return res.json({ message:`Building set to ${b}` });
    res.status(500).json({ error: result.error });
});

// current-selection-info: for client to display current building
app.get('/api/current-selection-info', (req, res) => {
    res.json({ campus:'FH JOANNEUM Graz', building:currentBuildingCode });
});

// rooms list
app.get('/api/rooms', (req, res) => {
    if (!rawData.length) {
        return res.status(503).json({ error:`No data for ${currentBuildingCode}` });
    }
    res.json(rawData);
});

// structure (floors/rooms)
app.get('/api/structure', (req, res) => {
    if (!structure.floors || !Object.keys(structure.floors).length) {
        // try a rebuild if stale
        if (rawData.length) rebuildStructure(currentBuildingCode);
        if (!Object.keys(structure.floors).length) {
            return res.status(503).json({ error:`No structure for ${currentBuildingCode}` });
        }
    }
    res.json(structure);
});

// start server
app.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT} (building=${currentBuildingCode})`);
});