// index.js
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const DATA_URL  = 'https://almaty.fh-joanneum.at/stundenplan/json.php?submit=Suche&q=AP152';
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT      = process.env.PORT || 3000;

let rawData = [];
let structure = { floors: {} };

// 1) fetch & cache, then rebuild structure
async function updateData() {
    try {
        const res  = await fetch(DATA_URL);
        const json = await res.json();
        fs.writeFileSync(DATA_FILE, JSON.stringify(json, null, 2));
        rawData = json;
        rebuildStructure();
        console.log(new Date().toISOString(), '– data.json & structure updated');
    } catch (err) {
        console.error(new Date().toISOString(), '– fetch failed:', err);
    }
}

function rebuildStructure() {
    const floors = {};
    const CODE_RX = /\b([A-Za-z]{2}\d{3})\.([A-Za-z0-9]{2})\.([A-Za-z0-9]{3}[A-Za-z]?)\b/;

    rawData.forEach(e => {
        let m = e.description.match(CODE_RX);
        if (!m) return;
        let [ , building, floor, roomNum ] = m[0].split('.');
        if (building !== 'AP152') return;

        floors[floor] = floors[floor] || new Set();
        floors[floor].add(roomNum);
    });

    // convert sets → arrays and sort
    structure.floors = {};
    for (let [floor, rooms] of Object.entries(floors)) {
        structure.floors[floor] = Array.from(rooms).sort();
    }
}

// initial load + every 2h
updateData();
setInterval(updateData, 2 * 60 * 60 * 1000);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// serve the cached JSON if needed
app.get('/api/rooms', (req, res) => {
    if (!rawData.length) return res.status(503).json({error:'no data yet'});
    res.json(rawData);
});

// **new**: structure endpoint
app.get('/api/structure', (req, res) => {
    res.json(structure);
});

app.listen(PORT, () =>
    console.log(`Listening on http://localhost:${PORT}`)
);