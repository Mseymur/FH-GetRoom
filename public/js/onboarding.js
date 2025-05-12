// public/js/onboarding.js
(function() {
    console.log("onboarding.js: Script started (Scenario Aligned)");

    const buildingSelector = document.getElementById('buildingSelector');
    const setBuildingBtn = document.getElementById('setBuildingBtn');
    const onboardingStatusEl = document.getElementById('onboardingStatus');

    function showStatusMessage(message, isError = false) {
        // Auto-redirect if we already know the building
        const saved = localStorage.getItem('currentBuilding');
        if (saved) {
            window.location.href = '/index.html';
            return;
        }
        if (!onboardingStatusEl) {
            console.error("onboarding.js: onboardingStatusEl not found.");
            return;
        }
        onboardingStatusEl.textContent = message;
        onboardingStatusEl.className = 'status-message';
        if (isError) {
            onboardingStatusEl.classList.add('error');
        } else {
            onboardingStatusEl.classList.add('success');
        }
        onboardingStatusEl.style.display = 'block';
    }

    const storedBuilding = localStorage.getItem('currentBuilding');
    if (storedBuilding && buildingSelector) {
        buildingSelector.value = storedBuilding;
        console.log(`onboarding.js: Pre-selected building ${storedBuilding} from localStorage.`);
    }

    if (setBuildingBtn && buildingSelector) {
        setBuildingBtn.addEventListener('click', async () => {
            const selectedBuilding = buildingSelector.value;
            if (!selectedBuilding) {
                showStatusMessage("Please select a building.", true);
                return;
            }

            console.log(`onboarding.js: Setting building to ${selectedBuilding}`);
            showStatusMessage(`Fetching data for building ${selectedBuilding}... This may take a moment.`, false);
            setBuildingBtn.disabled = true;
            setBuildingBtn.textContent = 'Processing...';

            try {
                const response = await fetch('/api/set-building', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    body: JSON.stringify({ buildingCode: selectedBuilding }),
                });

                const contentType = response.headers.get("content-type");
                let result;
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    result = await response.json();
                } else {
                    const textResponse = await response.text();
                    throw new Error(`Server returned non-JSON response (Status: ${response.status}). Response: ${textResponse.substring(0, 200)}...`);
                }

                if (!response.ok) {
                    throw new Error(result.error || `HTTP error ${response.status}`);
                }

                showStatusMessage(result.message || `Successfully set data for building ${selectedBuilding}. Redirecting to schedule...`, false);
                localStorage.setItem('currentBuilding', selectedBuilding);
                document.cookie = `currentBuilding=${selectedBuilding}; Path=/; Max-Age=${60*60*24*365}`;

                setTimeout(() => { window.location.href = '/index.html'; }, 1500);

            } catch (error) {
                console.error("onboarding.js: Error setting building:", error);
                showStatusMessage(`Error: ${error.message}. Please ensure the server is running and try again.`, true);
            } finally { // Ensure button is re-enabled unless successful redirect is certain
                if (window.location.pathname.includes('onboarding.html')) { // Avoid re-enabling if redirect started
                    setBuildingBtn.disabled = false;
                    setBuildingBtn.textContent = 'Continue';
                }
            }
        });
    } else {
        console.error("onboarding.js: Could not find buildingSelector or setBuildingBtn elements.");
        if(onboardingStatusEl) showStatusMessage("Page setup error: Critical elements missing.", true);
    }
})();
