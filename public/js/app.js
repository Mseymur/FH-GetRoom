// public/js/app.js
// Onboarding Aware & Further Refined Version
(function () {
    console.log("app.js: Script started (Onboarding Aware - Further Refined)");

    // API Endpoints
    const API_ROOMS_URL = '/api/rooms';
    const API_STRUCTURE_URL = '/api/structure';
    const API_CURRENT_SELECTION_URL = '/api/current-selection-info';

    // DOM Elements
    const dateEl = document.getElementById('date');
    const refreshScheduleBtn = document.getElementById('refreshScheduleBtn');
    const navigateToFreeSpaceBtn = document.getElementById('navigateToFreeSpaceBtn');
    const floorEl = document.getElementById('floor');
    const roomEl = document.getElementById('room');
    const scheduleEl = document.getElementById('schedule');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageEl = document.getElementById('error-message');

    const currentBuildingDisplayEl = document.getElementById('currentBuildingDisplay');
    const editLocationBtn = document.getElementById('editLocationBtn');

    // State
    let rawData = [];
    let roomStructure = { building: null, floors: {} }; // Initialize with null building
    let currentClientBuilding = localStorage.getItem('currentBuilding') || null; // Client's idea of the building

    // --- Utility Functions ---
    function showMessage(element, message, isError = false) {
        if (element) {
            element.textContent = message;
            element.style.display = message ? 'block' : 'none';
            if (isError) element.classList.add('error');
            else element.classList.remove('error');
            // console.log(`app.js: showMessage (isError: ${isError}): ${message}`);
        } else {
            console.error("app.js: showMessage target element is null for message:", message);
        }
    }

    function showLoading(isLoading, message = 'Loading…') {
        if (loadingIndicator) {
            loadingIndicator.textContent = message;
            loadingIndicator.style.display = isLoading ? 'block' : 'none';
        }
        if (isLoading) {
            if(scheduleEl) scheduleEl.innerHTML = '';
            if(errorMessageEl && (message.toLowerCase().includes("initializing") || message.toLowerCase().includes("loading"))){
                showMessage(errorMessageEl, null);
            }
        }
        console.log(`app.js: showLoading: ${isLoading}, Message: ${message}`);
    }

    function formatDateForComparison(dateString) { return dateString; }

    function escapeRegExp(string) {
        if (!string) return '';
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractRoomDetails(event) {
        if (!roomStructure || !roomStructure.building) {
            console.warn("app.js: extractRoomDetails - roomStructure.building not defined. Cannot parse accurately.");
            return null;
        }
        const buildingCodeToParse = roomStructure.building; // Use building from the fetched structure
        const escapedBuildingCode = escapeRegExp(buildingCodeToParse);
        const RX = new RegExp(`\\b(${escapedBuildingCode})\\.([A-Za-z0-9]{1,3})\\.([A-Za-z0-9]{3}[A-Za-z]?)\\b`);

        let textToSearch = event.title || '';
        if (Array.isArray(event.className)) {
            textToSearch += ' ' + event.className.join(' ');
        } else if (event.className) {
            textToSearch += ' ' + event.className;
        }

        let m = textToSearch.match(RX);
        if (m) return { fullCode: m[0], building: m[1], floor: m[2], roomNum: m[3] };
        return null;
    }

    // --- Core Logic ---
    function updateLocationDisplay(buildingCode) {
        if (currentBuildingDisplayEl) {
            currentBuildingDisplayEl.textContent = buildingCode || 'N/A (Select via Edit)';
        } else {
            console.warn("app.js: currentBuildingDisplayEl not found, cannot update display.");
        }
    }

    async function fetchCurrentSelectionFromServer() {
        console.log("app.js: fetchCurrentSelectionFromServer - Getting current building from server.");
        try {
            const response = await fetch(API_CURRENT_SELECTION_URL);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error ${response.status}. Response: ${errorText.slice(0,100)}`);
            }
            const selectionInfo = await response.json();
            if (selectionInfo && selectionInfo.building) {
                currentClientBuilding = selectionInfo.building; // Update client's idea
                localStorage.setItem('currentBuilding', currentClientBuilding);
                console.log("app.js: Synced currentClientBuilding from server:", currentClientBuilding);
                updateLocationDisplay(currentClientBuilding);
                return currentClientBuilding; // Return the confirmed building
            } else {
                console.warn("app.js: Server did not return a current building via /api/current-selection-info.");
                updateLocationDisplay(currentClientBuilding); // Display localStorage value if any
                return currentClientBuilding; // Return client's idea
            }
        } catch (error) {
            console.error("app.js: Error fetching current selection from server:", error);
            updateLocationDisplay(currentClientBuilding); // Display localStorage value on error
            return currentClientBuilding; // Return client's idea
        }
    }

    function populateFloorOptions() {
        if (!floorEl) { console.error("app.js: populateFloorOptions - floorEl not found."); return; }
        floorEl.innerHTML = '<option value="">All Floors</option>';
        if (roomStructure.floors && typeof roomStructure.floors === 'object' && roomStructure.building === currentClientBuilding) {
            Object.keys(roomStructure.floors).sort().forEach(floorKey => {
                const option = new Option(`Floor ${floorKey}`, floorKey);
                floorEl.appendChild(option);
            });
        } else {
            console.warn(`app.js: populateFloorOptions - roomStructure.floors is invalid, empty, or for wrong building (${roomStructure.building} vs ${currentClientBuilding}).`);
        }
    }

    function populateRoomOptions() {
        if (!roomEl || !floorEl) { console.error("app.js: populateRoomOptions - roomEl or floorEl not found."); return; }
        const selectedFloor = floorEl.value;
        roomEl.innerHTML = '<option value="">All Rooms</option>';
        let roomsToDisplay = new Set();

        if (roomStructure.floors && typeof roomStructure.floors === 'object' && roomStructure.building === currentClientBuilding) {
            if (selectedFloor && roomStructure.floors[selectedFloor]) {
                roomStructure.floors[selectedFloor].forEach(room => roomsToDisplay.add(room));
            } else if (!selectedFloor) {
                Object.values(roomStructure.floors).forEach(floorRooms => {
                    if(Array.isArray(floorRooms)) {
                        floorRooms.forEach(room => roomsToDisplay.add(room));
                    }
                });
            }
        }
        Array.from(roomsToDisplay).sort().forEach(roomNum => {
            roomEl.appendChild(new Option(roomNum, roomNum));
        });
    }

    function renderSchedule() {
        console.log("app.js: renderSchedule called.");
        if (!scheduleEl || !dateEl || !floorEl || !roomEl) {
            console.error("app.js: renderSchedule - Missing critical DOM elements.");
            return;
        }

        const selectedDate = formatDateForComparison(dateEl.value);
        const selectedFloorFilter = floorEl.value;
        const selectedRoomFilter = roomEl.value;
        const eventsByRoom = {};

        console.log(`app.js: renderSchedule - Date: ${selectedDate}, Floor: ${selectedFloorFilter}, Room: ${selectedRoomFilter}, Building context: ${roomStructure.building}`);

        if (!rawData || rawData.length === 0) {
            console.log("app.js: renderSchedule - No rawData to display.");
            if (loadingIndicator && loadingIndicator.style.display === 'none' && errorMessageEl && errorMessageEl.style.display === 'none') {
                scheduleEl.innerHTML = '<li>No schedule data available for the selected building. Try refreshing or select a building via onboarding.</li>';
            }
            return;
        }
        if (!roomStructure.building) { // CRITICAL: Ensure we have a building context for parsing
            console.warn("app.js: renderSchedule - No building context in roomStructure. Cannot reliably parse room details. Please select a building.");
            scheduleEl.innerHTML = '<li>Building context not set. Please <a href="/onboarding.html">select a building</a>.</li>';
            return;
        }

        let eventsFoundForBuilding = 0;
        rawData.forEach(event => {
            const details = extractRoomDetails(event); // Uses roomStructure.building
            if (details) {
                eventsFoundForBuilding++;
                if (!event.start || formatDateForComparison(event.start.slice(0, 10)) !== selectedDate) return;
                if (selectedFloorFilter && details.floor !== selectedFloorFilter) return;
                if (selectedRoomFilter && details.roomNum !== selectedRoomFilter) return;

                if (!eventsByRoom[details.fullCode]) {
                    eventsByRoom[details.fullCode] = [];
                }
                eventsByRoom[details.fullCode].push(event);
            }
        });
        console.log(`app.js: renderSchedule - Found ${eventsFoundForBuilding} events potentially matching building ${roomStructure.building} in rawData.`);

        scheduleEl.innerHTML = '';
        if (Object.keys(eventsByRoom).length === 0) {
            console.log("app.js: renderSchedule - No events match current filters for the selected building and date.");
            if (loadingIndicator && loadingIndicator.style.display === 'none' && errorMessageEl && errorMessageEl.style.display === 'none') {
                scheduleEl.innerHTML = '<li>No classes match your filter criteria for the selected building and date.</li>';
            }
            return;
        }

        console.log(`app.js: renderSchedule - Rendering ${Object.keys(eventsByRoom).length} rooms for building ${roomStructure.building}.`);
        Object.keys(eventsByRoom).sort().forEach(roomCode => {
            const li = document.createElement('li');
            li.className = 'card';
            const events = eventsByRoom[roomCode];
            if (events[0]?.color) li.style.borderLeftColor = events[0].color;
            else li.style.borderLeftColor = 'var(--primary-color)';
            const header = document.createElement('div');
            header.className = 'card-header';
            header.textContent = roomCode;
            li.appendChild(header);
            const body = document.createElement('div');
            body.className = 'card-body';
            events.sort((a, b) => a.start.localeCompare(b.start)).forEach(ev => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'event';
                eventDiv.innerHTML = `
                    <span class="time">${ev.start.slice(11, 16)}–${ev.end.slice(11, 16)}</span>
                    <span class="title">${ev.title || 'Untitled Event'}</span>
                `;
                body.appendChild(eventDiv);
            });
            li.appendChild(body);
            scheduleEl.appendChild(li);
        });
    }

    async function fetchRoomStructure(buildingToFetchFor) {
        console.log(`app.js: fetchRoomStructure - Starting for building: ${buildingToFetchFor}`);
        try {
            const response = await fetch(API_STRUCTURE_URL);
            if (!response.ok) {
                let errorDetail = `Status: ${response.status} ${response.statusText}.`;
                try { errorDetail += ` Response: ${(await response.text()).slice(0,150)}`; } catch(e){}
                throw new Error(`Network error fetching room structure. ${errorDetail}`);
            }
            const fetchedStructure = await response.json();
            if (!fetchedStructure || !fetchedStructure.floors || !fetchedStructure.building) {
                throw new Error("Invalid room structure received from server (missing building or floors property).");
            }

            if (fetchedStructure.building !== buildingToFetchFor) {
                console.error(`app.js: fetchRoomStructure - Mismatch! Expected structure for ${buildingToFetchFor}, but server returned for ${fetchedStructure.building}. This indicates a server-side issue or race condition with /api/set-building.`);
                showMessage(errorMessageEl, `Data mismatch: Expected structure for ${buildingToFetchFor} but received for ${fetchedStructure.building}. Please try re-selecting building.`, true);
                return false;
            }

            roomStructure = fetchedStructure;
            console.log("app.js: fetchRoomStructure - Success. Structure now set for building:", roomStructure.building);
            populateFloorOptions();
            populateRoomOptions();
            return true;
        } catch (error) {
            console.error('app.js: Failed to fetch room structure:', error);
            showMessage(errorMessageEl, `Error loading room structure: ${error.message}.`, true);
            return false;
        }
    }

    async function fetchScheduleData(buildingToFetchFor) {
        console.log(`app.js: fetchScheduleData - Starting for building: ${buildingToFetchFor}`);
        try {
            const response = await fetch(API_ROOMS_URL);
            if (!response.ok) {
                let errorDetail = `Status: ${response.status} ${response.statusText}.`;
                try { errorDetail += ` Response: ${(await response.text()).slice(0,150)}`; } catch(e){}
                throw new Error(`Network error fetching schedule data. ${errorDetail}`);
            }
            rawData = await response.json();
            if (!rawData || typeof rawData.length === 'undefined') {
                throw new Error("Invalid schedule data received.");
            }
            console.log("app.js: fetchScheduleData - Success, items:", rawData.length);
            return true;
        } catch (error) {
            console.error('app.js: Failed to fetch schedule data:', error);
            showMessage(errorMessageEl, `Error loading schedule: ${error.message}.`, true);
            rawData = [];
            return false;
        }
    }

    async function loadInitialDataAndRender() {
        console.log("app.js: loadInitialDataAndRender - Starting.");

        let targetBuilding = currentClientBuilding; // From localStorage initially
        const serverConfirmedBuilding = await fetchCurrentSelectionFromServer(); // Sync with server
        if (serverConfirmedBuilding) {
            targetBuilding = serverConfirmedBuilding; // Prefer server's if available
        }

        if (!targetBuilding) {
            console.error("app.js: No building selected/determined. Redirecting to onboarding.");
            if(errorMessageEl) showMessage(errorMessageEl, "No building selected. Redirecting to setup...", true);
            if(scheduleEl) scheduleEl.innerHTML = '<li>Please <a href="/onboarding.html">select a building</a> to view schedules.</li>';
            showLoading(false);
            setTimeout(() => { if (window.location.pathname !== '/onboarding.html') window.location.href = '/onboarding.html'; }, 1500);
            return;
        }

        console.log(`app.js: loadInitialDataAndRender - Target building is ${targetBuilding}`);
        showLoading(true, `Loading data for ${targetBuilding}...`);
        updateLocationDisplay(targetBuilding);

        const structureSuccess = await fetchRoomStructure(targetBuilding);

        let scheduleSuccess = false;
        if (structureSuccess && roomStructure.building === targetBuilding) {
            scheduleSuccess = await fetchScheduleData(targetBuilding);
        } else {
            if (!structureSuccess) {
                console.error("app.js: loadInitialDataAndRender - Structure fetch failed. Cannot proceed to fetch schedule.");
            } else if (roomStructure.building !== targetBuilding) {
                console.error(`app.js: loadInitialDataAndRender - Structure fetched (${roomStructure.building}) does not match target building (${targetBuilding}). Schedule fetch aborted.`);
                if(errorMessageEl) showMessage(errorMessageEl, `Data consistency error. Expected ${targetBuilding}, got ${roomStructure.building}. Try re-selecting.`, true);
            }
        }

        if (structureSuccess && scheduleSuccess) {
            console.log("app.js: loadInitialDataAndRender - All data fetched successfully. Rendering schedule.");
        } else {
            console.warn("app.js: loadInitialDataAndRender - Not all data fetched successfully. Schedule might be empty or show errors.");
        }
        renderSchedule(); // Always attempt to render

        showLoading(false);
        console.log("app.js: loadInitialDataAndRender - Finished.");
    }

    // --- Event Listeners ---
    if(refreshScheduleBtn) {
        refreshScheduleBtn.addEventListener('click', loadInitialDataAndRender);
    } else { console.warn("app.js: refreshScheduleBtn not found."); }

    if(navigateToFreeSpaceBtn && dateEl) {
        navigateToFreeSpaceBtn.addEventListener('click', () => {
            const selectedDate = dateEl.value;
            window.location.href = `/freespace.html?date=${selectedDate || ''}`;
        });
    }  else { console.warn("app.js: navigateToFreeSpaceBtn or dateEl not found."); }

    if(editLocationBtn) {
        editLocationBtn.addEventListener('click', () => {
            console.log("app.js: Edit location button clicked.");
            window.location.href = '/onboarding.html';
        });
    } else { console.warn("app.js: editLocationBtn not found. Make sure its ID is correct in index.html."); }


    if(floorEl) { floorEl.addEventListener('change', () => { populateRoomOptions(); renderSchedule(); }); }
    if(roomEl) { roomEl.addEventListener('change', renderSchedule); }
    if(dateEl) { dateEl.addEventListener('change', renderSchedule); }


    // --- Initialization ---
    function initialize() {
        console.log("app.js: Initializing (Onboarding Aware & Fixed v3)...");
        if (!dateEl) {
            console.error("app.js: Date element not found during initialization. Aborting.");
            if(errorMessageEl) showMessage(errorMessageEl, "Page setup error: Date input missing.", true);
            return;
        }
        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            dateEl.value = `${year}-${month}-${day}`;
            console.log("app.js: Initial date set to: " + dateEl.value);
        } catch (e) {
            console.error("app.js: Error setting initial date:", e);
            if(errorMessageEl) showMessage(errorMessageEl, "Error setting initial date.", true);
        }

        loadInitialDataAndRender();
        console.log("app.js: Initialization complete.");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
