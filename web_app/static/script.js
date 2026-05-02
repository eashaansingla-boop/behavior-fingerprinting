const TARGET_PHRASE = "In the realm of cybersecurity, traditional passwords are no longer sufficient. Behavioral fingerprinting analyzes the unique microscopic rhythm of your typing. By measuring dwell times and flight times across paragraphs, we create an immutable signature.";
let activeKeys = {};
let currentKeystrokes = [];

let flightChartInstance = null;
let dwellChartInstance = null;

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    if (tabId === 'enroll') {
        document.querySelector('.tab[onclick="switchTab(\'enroll\')"]').classList.add('active');
        document.getElementById('enrollSection').classList.add('active');
        resetInput('enroll');
    } else {
        document.querySelector('.tab[onclick="switchTab(\'auth\')"]').classList.add('active');
        document.getElementById('authSection').classList.add('active');
        resetInput('auth');
    }
}

function resetInput(mode) {
    currentKeystrokes = [];
    activeKeys = {};
    const inputId = mode === 'enroll' ? 'enrollInput' : 'authInput';
    const statusId = mode === 'enroll' ? 'enrollStatus' : 'authStatus';
    const btnId = mode === 'enroll' ? 'enrollBtn' : 'authBtn';
    
    document.getElementById(inputId).value = '';
    document.getElementById(inputId).disabled = false;
    document.getElementById(statusId).textContent = 'Awaiting input...';
    document.getElementById(btnId).disabled = true;
}

function handleInputEvents(e, mode) {
    const input = e.target;
    const val = input.value;
    const statusId = mode === 'enroll' ? 'enrollStatus' : 'authStatus';
    const btnId = mode === 'enroll' ? 'enrollBtn' : 'authBtn';
    const statusEl = document.getElementById(statusId);
    const btnEl = document.getElementById(btnId);

    if (e.type === 'keydown') {
        if (!activeKeys[e.key]) {
            activeKeys[e.key] = Date.now();
        }
    } else if (e.type === 'keyup') {
        if (activeKeys[e.key]) {
            currentKeystrokes.push({
                key: e.key,
                pressTime: activeKeys[e.key],
                releaseTime: Date.now()
            });
            delete activeKeys[e.key];
        }

        if (val === TARGET_PHRASE) {
            statusEl.textContent = 'Phrase matched!';
            statusEl.style.color = 'var(--success)';
            btnEl.disabled = false;
        } else if (TARGET_PHRASE.startsWith(val)) {
            statusEl.textContent = `Typing... (${val.length}/${TARGET_PHRASE.length})`;
            statusEl.style.color = 'var(--primary)';
            btnEl.disabled = true;
        } else {
            statusEl.textContent = 'Typo detected.';
            statusEl.style.color = 'var(--danger)';
            btnEl.disabled = true;
        }
    }
}

['enrollInput', 'authInput'].forEach(id => {
    const el = document.getElementById(id);
    const mode = id.replace('Input', '');
    el.addEventListener('keydown', (e) => handleInputEvents(e, mode));
    el.addEventListener('keyup', (e) => handleInputEvents(e, mode));
});

document.getElementById('enrollBtn').addEventListener('click', async () => {
    const username = document.getElementById('enrollUsername').value.trim();
    if (!username) return alert('Please enter a username');

    const response = await fetch('/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, sample: currentKeystrokes })
    });
    
    const data = await response.json();
    if (data.success) {
        alert(data.message);
        switchTab('auth');
        document.getElementById('authUsername').value = username;
    }
});

document.getElementById('authBtn').addEventListener('click', async () => {
    const username = document.getElementById('authUsername').value.trim();
    const response = await fetch('/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, sample: currentKeystrokes })
    });
    
    const data = await response.json();
    if (data.success) {
        document.getElementById('resultsPanel').classList.remove('hidden');
        
        // Update stats
        document.getElementById('scoreValue').textContent = data.score + '%';
        document.getElementById('dwellValue').textContent = data.current.avg_dwell.toFixed(3);
        document.getElementById('flightValue').textContent = data.current.avg_flight.toFixed(3);
        document.getElementById('thresholdValue').textContent = data.threshold + '%';
        
        const resultStatus = document.getElementById('resultStatus');
        const panel = document.getElementById('resultsPanel');
        
        if (data.authenticated) {
            resultStatus.textContent = 'VERIFIED';
            resultStatus.style.color = 'var(--success)';
            panel.style.borderColor = 'var(--success)';
        } else {
            resultStatus.textContent = 'REJECTED';
            resultStatus.style.color = 'var(--danger)';
            panel.style.borderColor = 'var(--danger)';
        }

        renderComparisonChart('dwellChart', data.baseline.raw_dwell, data.current.raw_dwell, 'Dwell Time', dwellChartInstance, (inst) => dwellChartInstance = inst);
        renderComparisonChart('flightChart', data.baseline.raw_flight, data.current.raw_flight, 'Flight Time', flightChartInstance, (inst) => flightChartInstance = inst);
    }
});

function renderComparisonChart(canvasId, baselineData, testData, label, existingInstance, setInstance) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (existingInstance) existingInstance.destroy();
    
    const newInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: Math.max(baselineData.length, testData.length)}, (_, i) => i + 1),
            datasets: [
                {
                    label: 'Registered Baseline',
                    data: baselineData,
                    borderColor: '#00f0ff',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Current Attempt',
                    data: testData,
                    borderColor: '#ff003c',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { display: true, title: { display: true, text: 'Seconds' } }
            }
        }
    });
    setInstance(newInstance);
}
