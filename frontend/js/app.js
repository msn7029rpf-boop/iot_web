// Configuration
const API_BASE_URL = window.location.origin.includes('http') 
    ? window.location.origin 
    : 'http://localhost:3000';

let tempChart = null;
let humChart = null;
let countdownValue = 10;
let countdownTimer = null;
let lastTelemetryData = null;
let cachedDailyData = [];
let activeToasts = {};

// Thresholds State with LocalStorage Persistence
let thresholds = {
    tempLow: 15,
    tempHigh: 35,
    humLow: 40,
    humHigh: 90,
    updatedAt: 0
};

function loadThresholds() {
    try {
        const saved = localStorage.getItem('iot_thresholds');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.tempLow !== undefined && !isNaN(parsed.tempLow)) thresholds.tempLow = Number(parsed.tempLow);
            if (parsed.tempHigh !== undefined && !isNaN(parsed.tempHigh)) thresholds.tempHigh = Number(parsed.tempHigh);
            if (parsed.humLow !== undefined && !isNaN(parsed.humLow)) thresholds.humLow = Number(parsed.humLow);
            if (parsed.humHigh !== undefined && !isNaN(parsed.humHigh)) thresholds.humHigh = Number(parsed.humHigh);
            if (parsed.updatedAt !== undefined && !isNaN(parsed.updatedAt)) thresholds.updatedAt = Number(parsed.updatedAt);
        }
    } catch (e) {
        console.error('Error loading thresholds from localStorage:', e);
    }

    updateThresholdUI();
    syncServerThresholds();
}

async function syncServerThresholds() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/environment/thresholds`);
        if (response.ok) {
            const result = await response.json();
            if (result.status === 'success' && result.data) {
                const serverData = result.data;
                const serverUpdatedAt = Number(serverData.updatedAt) || 0;

                // If server has newer threshold settings from another device (mobile or desktop), adopt them!
                if (serverUpdatedAt > (thresholds.updatedAt || 0)) {
                    thresholds.tempLow = Number(serverData.tempLow);
                    thresholds.tempHigh = Number(serverData.tempHigh);
                    thresholds.humLow = Number(serverData.humLow);
                    thresholds.humHigh = Number(serverData.humHigh);
                    thresholds.updatedAt = serverUpdatedAt;

                    saveLocalThresholds();
                    updateThresholdUI();
                    fetchDailyMaxData();
                    if (lastTelemetryData) updateCurrentUI(lastTelemetryData);
                } else if ((thresholds.updatedAt || 0) > serverUpdatedAt && (thresholds.updatedAt || 0) > 0) {
                    // Local thresholds are newer, sync up to server instance
                    fetch(`${API_BASE_URL}/api/environment/thresholds`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(thresholds)
                    }).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.warn('Could not sync thresholds from server:', e);
    }
}

function saveLocalThresholds() {
    try {
        localStorage.setItem('iot_thresholds', JSON.stringify(thresholds));
    } catch (e) {}
}

async function saveThresholds() {
    thresholds.updatedAt = Date.now();
    saveLocalThresholds();

    // Send updated thresholds with timestamp to backend server for global synchronization
    try {
        await fetch(`${API_BASE_URL}/api/environment/thresholds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(thresholds)
        });
    } catch (e) {
        console.error('Error saving global thresholds to server:', e);
    }
}

// DOM Elements
const tempValueEl = document.getElementById('temp-value');
const humValueEl = document.getElementById('hum-value');
const tempStatusEl = document.getElementById('temp-status');
const humStatusEl = document.getElementById('hum-status');
const lastUpdateTimeEl = document.getElementById('last-update-time');
const countdownEl = document.getElementById('countdown');
const connectionStatusEl = document.getElementById('connection-status');
const statusTextEl = document.getElementById('status-text');
const refreshBtn = document.getElementById('refresh-btn');
const toastContainer = document.getElementById('alert-toast-container');

// Export & Date Inputs DOM Elements
const startDateEl = document.getElementById('export-start-date');
const endDateEl = document.getElementById('export-end-date');
const exportBtn = document.getElementById('export-btn');

// Threshold Badge Elements
const tempBadgeLow = document.getElementById('temp-badge-low');
const tempBadgeNormal = document.getElementById('temp-badge-normal');
const tempBadgeHigh = document.getElementById('temp-badge-high');
const btnEditTemp = document.getElementById('btn-edit-temp');
const tempBadgesContainer = document.getElementById('temp-threshold-badges');

const humBadgeLow = document.getElementById('hum-badge-low');
const humBadgeNormal = document.getElementById('hum-badge-normal');
const humBadgeHigh = document.getElementById('hum-badge-high');
const btnEditHum = document.getElementById('btn-edit-hum');
const humBadgesContainer = document.getElementById('hum-threshold-badges');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadThresholds();
    updateThresholdUI();
    initDatePickers();
    initCharts();
    setupThresholdEventListeners();
    fetchCurrentData();
    fetchDailyMaxData();
    startCountdown();

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchCurrentData();
            fetchDailyMaxData();
            resetCountdown();
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportDataToCSV();
        });
    }
});

// Initialize Date Range Inputs (Start = 30 days ago, End = Today)
function initDatePickers() {
    if (!startDateEl || !endDateEl) return;

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const formatDate = (date) => date.toISOString().split('T')[0];

    startDateEl.value = formatDate(thirtyDaysAgo);
    endDateEl.value = formatDate(today);
}

// Export Filtered Daily Data to CSV File on Local Computer
function exportDataToCSV() {
    if (!cachedDailyData || cachedDailyData.length === 0) {
        alert('⚠️ ไม่พบข้อมูลสำหรับส่งออก กรุณารอระบบโหลดข้อมูลสักครู่');
        return;
    }

    const startVal = startDateEl ? startDateEl.value : '';
    const endVal = endDateEl ? endDateEl.value : '';

    if (startVal && endVal && startVal > endVal) {
        alert('❌ วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
        return;
    }

    // Filter data by selected date range
    const filteredData = cachedDailyData.filter(item => {
        if (startVal && item.date < startVal) return false;
        if (endVal && item.date > endVal) return false;
        return true;
    });

    if (filteredData.length === 0) {
        alert('⚠️ ไม่พบข้อมูลในช่วงวันที่เลือก');
        return;
    }

    // Construct CSV Rows
    const headers = ['"วันที่"', '"อุณหภูมิสูงสุด (°C)"', '"สถานะอุณหภูมิ"', '"ความชื้นสัมพัทธ์สูงสุด (% RH)"', '"สถานะความชื้น"'];
    const rows = [headers.join(',')];

    filteredData.forEach(item => {
        const temp = item.maxTemp;
        const hum = item.maxHumidity;

        // Status evaluation based on active user thresholds
        let tempStatus = 'ปกติ';
        if (temp > thresholds.tempHigh) tempStatus = 'ร้อนจัด';
        else if (temp < thresholds.tempLow) tempStatus = 'เย็นเกินไป';

        let humStatus = 'ความชื้นพอเหมาะ';
        if (hum > thresholds.humHigh) humStatus = 'ชื้นสูง';
        else if (hum < thresholds.humLow) humStatus = 'แห้งเกินไป';

        const row = [
            `"${item.date}"`,
            `"${temp.toFixed(1)}"`,
            `"${tempStatus}"`,
            `"${hum.toFixed(1)}"`,
            `"${humStatus}"`
        ];
        rows.push(row.join(','));
    });

    // UTF-8 BOM (\uFEFF) for perfect Thai language encoding in Microsoft Excel
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Dynamic file download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `iot_environment_data_${startVal || 'all'}_to_${endVal || 'all'}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Update Threshold Badges Text in HTML
function updateThresholdUI() {
    if (tempBadgeLow) tempBadgeLow.textContent = `❄️ น้อยเกินไป (< ${thresholds.tempLow}°C)`;
    if (tempBadgeNormal) tempBadgeNormal.textContent = `🌿 ปกติ (${thresholds.tempLow}–${thresholds.tempHigh}°C)`;
    if (tempBadgeHigh) tempBadgeHigh.textContent = `☀️ ร้อนเกินไป (> ${thresholds.tempHigh}°C)`;

    if (humBadgeLow) humBadgeLow.textContent = `🌵 น้อยเกินไป (< ${thresholds.humLow}%)`;
    if (humBadgeNormal) humBadgeNormal.textContent = `💧 ปกติ (${thresholds.humLow}–${thresholds.humHigh}%)`;
    if (humBadgeHigh) humBadgeHigh.textContent = `🌧️ ชื้นเกินไป (> ${thresholds.humHigh}%)`;
}

// Setup Event Listeners for Interactive Editing on all 3 badges
function setupThresholdEventListeners() {
    // Temperature Badges
    if (tempBadgeLow) tempBadgeLow.addEventListener('click', (e) => { e.stopPropagation(); editTempLowThreshold(); });
    if (tempBadgeNormal) tempBadgeNormal.addEventListener('click', (e) => { e.stopPropagation(); editTempThresholds(); });
    if (tempBadgeHigh) tempBadgeHigh.addEventListener('click', (e) => { e.stopPropagation(); editTempHighThreshold(); });
    if (btnEditTemp) btnEditTemp.addEventListener('click', (e) => { e.stopPropagation(); editTempThresholds(); });
    
    const tempCanvas = document.getElementById('tempChart');
    if (tempCanvas) tempCanvas.addEventListener('click', () => editTempThresholds());

    // Humidity Badges
    if (humBadgeLow) humBadgeLow.addEventListener('click', (e) => { e.stopPropagation(); editHumLowThreshold(); });
    if (humBadgeNormal) humBadgeNormal.addEventListener('click', (e) => { e.stopPropagation(); editHumThresholds(); });
    if (humBadgeHigh) humBadgeHigh.addEventListener('click', (e) => { e.stopPropagation(); editHumHighThreshold(); });
    if (btnEditHum) btnEditHum.addEventListener('click', (e) => { e.stopPropagation(); editHumThresholds(); });

    const humCanvas = document.getElementById('humChart');
    if (humCanvas) humCanvas.addEventListener('click', () => editHumThresholds());
}

// Edit Specifically Temperature Low Threshold (< °C)
function editTempLowThreshold() {
    const val = prompt(`[ปรับเกณฑ์อุณหภูมิ - น้อยเกินไป]\nกรอกค่าเกณฑ์ต่ำสุด (เย็นเกินไป < °C):`, thresholds.tempLow);
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num)) {
        alert('❌ กรุณากรอกตัวเลขที่ถูกต้อง');
        return;
    }
    if (num >= thresholds.tempHigh) {
        alert(`❌ เกณฑ์ต่ำสุด (${num}°C) ต้องน้อยกว่าเกณฑ์สูงสุด (${thresholds.tempHigh}°C)`);
        return;
    }
    thresholds.tempLow = num;
    applyThresholdUpdate();
}

// Edit Specifically Temperature High Threshold (> °C)
function editTempHighThreshold() {
    const val = prompt(`[ปรับเกณฑ์อุณหภูมิ - ร้อนเกินไป]\nกรอกค่าเกณฑ์สูงสุด (ร้อนเกินไป > °C):`, thresholds.tempHigh);
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num)) {
        alert('❌ กรุณากรอกตัวเลขที่ถูกต้อง');
        return;
    }
    if (num <= thresholds.tempLow) {
        alert(`❌ เกณฑ์สูงสุด (${num}°C) ต้องมากกว่าเกณฑ์ต่ำสุด (${thresholds.tempLow}°C)`);
        return;
    }
    thresholds.tempHigh = num;
    applyThresholdUpdate();
}

// Edit Specifically Humidity Low Threshold (< %)
function editHumLowThreshold() {
    const val = prompt(`[ปรับเกณฑ์ความชื้น - น้อยเกินไป]\nกรอกค่าเกณฑ์ต่ำสุด (แห้งเกินไป < %):`, thresholds.humLow);
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num)) {
        alert('❌ กรุณากรอกตัวเลขที่ถูกต้อง');
        return;
    }
    if (num >= thresholds.humHigh) {
        alert(`❌ เกณฑ์ต่ำสุด (${num}%) ต้องน้อยกว่าเกณฑ์สูงสุด (${thresholds.humHigh}%)`);
        return;
    }
    thresholds.humLow = num;
    applyThresholdUpdate();
}

// Edit Specifically Humidity High Threshold (> %)
function editHumHighThreshold() {
    const val = prompt(`[ปรับเกณฑ์ความชื้น - ชื้นเกินไป]\nกรอกค่าเกณฑ์สูงสุด (ชื้นเกินไป > %):`, thresholds.humHigh);
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num)) {
        alert('❌ กรุณากรอกตัวเลขที่ถูกต้อง');
        return;
    }
    if (num <= thresholds.humLow) {
        alert(`❌ เกณฑ์สูงสุด (${num}%) ต้องมากกว่าเกณฑ์ต่ำสุด (${thresholds.humLow}%)`);
        return;
    }
    thresholds.humHigh = num;
    applyThresholdUpdate();
}

// Helper to save and refresh UI after threshold edits
function applyThresholdUpdate() {
    saveThresholds();
    updateThresholdUI();
    fetchDailyMaxData();
    if (lastTelemetryData) updateCurrentUI(lastTelemetryData);
}

// Interactive Temperature Threshold Prompt Editor (Both Low & High)
function editTempThresholds() {
    const newLowStr = prompt(`[ปรับเกณฑ์อุณหภูมิ]\n1. กรอกค่าเกณฑ์ต่ำสุด (เย็นเกินไป < °C):`, thresholds.tempLow);
    if (newLowStr === null) return;
    const newLow = parseFloat(newLowStr);

    const newHighStr = prompt(`[ปรับเกณฑ์อุณหภูมิ]\n2. กรอกค่าเกณฑ์สูงสุด (ร้อนเกินไป > °C):`, thresholds.tempHigh);
    if (newHighStr === null) return;
    const newHigh = parseFloat(newHighStr);

    if (isNaN(newLow) || isNaN(newHigh)) {
        alert('❌ กรุณากรอกตัวเลขที่ถูกต้อง');
        return;
    }

    if (newLow >= newHigh) {
        alert('❌ เกณฑ์ต่ำสุด (เย็นเกินไป) ต้องน้อยกว่าเกณฑ์สูงสุด (ร้อนเกินไป)');
        return;
    }

    thresholds.tempLow = newLow;
    thresholds.tempHigh = newHigh;
    applyThresholdUpdate();
}

// Interactive Humidity Threshold Prompt Editor (Both Low & High)
function editHumThresholds() {
    const newLowStr = prompt(`[ปรับเกณฑ์ความชื้น]\n1. กรอกค่าเกณฑ์ต่ำสุด (แห้งเกินไป < %):`, thresholds.humLow);
    if (newLowStr === null) return;
    const newLow = parseFloat(newLowStr);

    const newHighStr = prompt(`[ปรับเกณฑ์ความชื้น]\n2. กรอกค่าเกณฑ์สูงสุด (ชื้นเกินไป > %):`, thresholds.humHigh);
    if (newHighStr === null) return;
    const newHigh = parseFloat(newHighStr);

    if (isNaN(newLow) || isNaN(newHigh)) {
        alert('❌ กรุณากรอกตัวเลขที่ถูกต้อง');
        return;
    }

    if (newLow >= newHigh) {
        alert('❌ เกณฑ์ต่ำสุด (แห้งเกินไป) ต้องน้อยกว่าเกณฑ์สูงสุด (ชื้นเกินไป)');
        return;
    }

    thresholds.humLow = newLow;
    thresholds.humHigh = newHigh;
    applyThresholdUpdate();
}

// Fetch Current Environmental Metrics (Every 10s)
async function fetchCurrentData() {
    try {
        // Continuous timestamp-based threshold sync across devices (Mobile <-> Desktop)
        syncServerThresholds();

        const response = await fetch(`${API_BASE_URL}/api/environment/current`);
        if (!response.ok) throw new Error('Network response failed');
        
        const result = await response.json();
        if (result.status === 'success' && result.data) {
            lastTelemetryData = result.data;
            updateCurrentUI(result.data);
            setConnectedStatus(true);
        }
    } catch (error) {
        console.error('Error fetching current environment data:', error);
        setConnectedStatus(false);
    }
}

// Side Popup Alert Toast System (Stays until closed)
function showAlertToast(id, type, title, message, iconClass) {
    if (!toastContainer) return;
    
    // If toast with this ID is already displayed on screen, update its message
    const existingToast = document.getElementById(`toast-${id}`);
    if (existingToast) {
        const msgEl = existingToast.querySelector('.toast-message');
        if (msgEl) msgEl.textContent = message;
        return;
    }

    const toastEl = document.createElement('div');
    toastEl.id = `toast-${id}`;
    toastEl.className = `alert-toast ${type}`;
    toastEl.innerHTML = `
        <div class="toast-icon"><i class="${iconClass}"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-btn-close" title="ปิดการแจ้งเตือน">&times;</button>
    `;

    const closeBtn = toastEl.querySelector('.toast-btn-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeToast(id);
        });
    }

    toastContainer.appendChild(toastEl);
    activeToasts[id] = true;
}

function closeToast(id) {
    const toastEl = document.getElementById(`toast-${id}`);
    if (toastEl) {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateX(50px)';
        setTimeout(() => {
            if (toastEl.parentNode) {
                toastEl.parentNode.removeChild(toastEl);
            }
        }, 300);
    }
    delete activeToasts[id];
}

// Update UI with real-time telemetry cards and check threshold breaches
function updateCurrentUI(data) {
    const temp = data.temperature;
    const hum = data.humidity;

    // Numbers animation effect
    tempValueEl.textContent = temp.toFixed(1);
    humValueEl.textContent = hum.toFixed(1);

    // Temperature status evaluation against custom thresholds
    if (temp > thresholds.tempHigh) {
        tempStatusEl.textContent = 'ร้อนจัด ☀️';
        tempStatusEl.style.color = '#ef4444';
        showAlertToast('temp-high', 'high', '🚨 เตือนภัย! อุณหภูมิร้อนเกินเกณฑ์', `อุณหภูมิปัจจุบัน ${temp.toFixed(1)}°C สูงกว่าเกณฑ์ที่กำหนด (${thresholds.tempHigh.toFixed(1)}°C)`, 'fa-solid fa-triangle-exclamation');
        if (activeToasts['temp-low']) closeToast('temp-low');
    } else if (temp < thresholds.tempLow) {
        tempStatusEl.textContent = ' อากาศเย็น ❄️';
        tempStatusEl.style.color = '#38bdf8';
        showAlertToast('temp-low', 'low', '❄️ เตือนภัย! อุณหภูมิเย็นเกินเกณฑ์', `อุณหภูมิปัจจุบัน ${temp.toFixed(1)}°C ต่ำกว่าเกณฑ์ที่กำหนด (${thresholds.tempLow.toFixed(1)}°C)`, 'fa-solid fa-snowflake');
        if (activeToasts['temp-high']) closeToast('temp-high');
    } else {
        tempStatusEl.textContent = ' สบาย/ปกติ 🌿';
        tempStatusEl.style.color = '#10b981';
        if (activeToasts['temp-high']) closeToast('temp-high');
        if (activeToasts['temp-low']) closeToast('temp-low');
    }

    // Humidity status evaluation against custom thresholds
    if (hum > thresholds.humHigh) {
        humStatusEl.textContent = 'ชื้นสูง 🌧️';
        humStatusEl.style.color = '#ef4444';
        showAlertToast('hum-high', 'high', '🌧️ เตือนภัย! ความชื้นสูงเกินเกณฑ์', `ความชื้นปัจจุบัน ${hum.toFixed(1)}% สูงกว่าเกณฑ์ที่กำหนด (${thresholds.humHigh.toFixed(1)}%)`, 'fa-solid fa-cloud-showers-heavy');
        if (activeToasts['hum-low']) closeToast('hum-low');
    } else if (hum < thresholds.humLow) {
        humStatusEl.textContent = ' อากาศแห้ง 🌵';
        humStatusEl.style.color = '#f59e0b';
        showAlertToast('hum-low', 'warn', '🌵 เตือนภัย! ความชื้นแห้งเกินเกณฑ์', `ความชื้นปัจจุบัน ${hum.toFixed(1)}% ต่ำกว่าเกณฑ์ที่กำหนด (${thresholds.humLow.toFixed(1)}%)`, 'fa-solid fa-sun');
        if (activeToasts['hum-high']) closeToast('hum-high');
    } else {
        humStatusEl.textContent = ' ความชื้นพอเหมาะ 💧';
        humStatusEl.style.color = '#10b981';
        if (activeToasts['hum-high']) closeToast('hum-high');
        if (activeToasts['hum-low']) closeToast('hum-low');
    }

    // Time updated
    const now = new Date(data.timestamp);
    lastUpdateTimeEl.textContent = now.toLocaleTimeString('th-TH');
}

// Fetch 30-Day Daily Maximum Data for Charts
async function fetchDailyMaxData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/environment/weekly-max`);
        if (!response.ok) throw new Error('Daily max API failed');

        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
            cachedDailyData = result.data;
            updateChartsData(result.data);
        }
    } catch (error) {
        console.error('Error fetching 30-day daily max data:', error);
    }
}

// Initialize Separate Temperature & Humidity Charts with Dynamic Thresholds
function initCharts() {
    // 1. Temperature Chart
    const ctxTemp = document.getElementById('tempChart').getContext('2d');
    const tempGradient = ctxTemp.createLinearGradient(0, 0, 0, 300);
    tempGradient.addColorStop(0, 'rgba(255, 94, 98, 0.35)');
    tempGradient.addColorStop(1, 'rgba(255, 94, 98, 0.0)');

    tempChart = new Chart(ctxTemp, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'อุณหภูมิสูงสุด (°C)',
                    data: [],
                    backgroundColor: tempGradient,
                    borderColor: '#ff5e62',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#ff5e62',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 3.5,
                    pointHoverRadius: 7
                },
                {
                    label: `เกณฑ์ร้อนเกินไป (> ${thresholds.tempHigh}°C)`,
                    data: [],
                    borderColor: 'rgba(239, 68, 68, 0.75)',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: `เกณฑ์เย็นเกินไป (< ${thresholds.tempLow}°C)`,
                    data: [],
                    borderColor: 'rgba(56, 189, 248, 0.75)',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: '#f8fafc', font: { family: 'Kanit', size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Kanit', size: 11 }, maxRotation: 45 }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'อุณหภูมิ (°C)', color: '#ff9966', font: { family: 'Kanit', size: 12 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#ff9966', font: { family: 'Outfit' } },
                    suggestedMin: 10,
                    suggestedMax: 45
                }
            }
        }
    });

    // 2. Humidity Chart
    const ctxHum = document.getElementById('humChart').getContext('2d');
    const humGradient = ctxHum.createLinearGradient(0, 0, 0, 300);
    humGradient.addColorStop(0, 'rgba(0, 198, 255, 0.35)');
    humGradient.addColorStop(1, 'rgba(0, 198, 255, 0.0)');

    humChart = new Chart(ctxHum, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'ความชื้นสัมพัทธ์สูงสุด (% RH)',
                    data: [],
                    backgroundColor: humGradient,
                    borderColor: '#00c6ff',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#00c6ff',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 3.5,
                    pointHoverRadius: 7
                },
                {
                    label: `เกณฑ์ชื้นเกินไป (> ${thresholds.humHigh}%)`,
                    data: [],
                    borderColor: 'rgba(239, 68, 68, 0.75)',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: `เกณฑ์แห้งเกินไป (< ${thresholds.humLow}%)`,
                    data: [],
                    borderColor: 'rgba(245, 158, 11, 0.75)',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: '#f8fafc', font: { family: 'Kanit', size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Kanit', size: 11 }, maxRotation: 45 }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'ความชื้น (% RH)', color: '#00c6ff', font: { family: 'Kanit', size: 12 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#00c6ff', font: { family: 'Outfit' } },
                    suggestedMin: 20,
                    suggestedMax: 100
                }
            }
        }
    });
}

// Update 30-Day Daily Max Data in Both Charts with Dynamic 3-Zone Threshold Lines
function updateChartsData(dailyData) {
    if (!tempChart || !humChart) return;

    const labels = dailyData.map(item => item.label);
    const maxTemps = dailyData.map(item => item.maxTemp);
    const maxHums = dailyData.map(item => item.maxHumidity);

    const dataLength = labels.length;

    // Update Temperature Chart
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = maxTemps;
    tempChart.data.datasets[1].label = `เกณฑ์ร้อนเกินไป (> ${thresholds.tempHigh}°C)`;
    tempChart.data.datasets[1].data = new Array(dataLength).fill(thresholds.tempHigh);
    tempChart.data.datasets[2].label = `เกณฑ์เย็นเกินไป (< ${thresholds.tempLow}°C)`;
    tempChart.data.datasets[2].data = new Array(dataLength).fill(thresholds.tempLow);
    tempChart.update();

    // Update Humidity Chart
    humChart.data.labels = labels;
    humChart.data.datasets[0].data = maxHums;
    humChart.data.datasets[1].label = `เกณฑ์ชื้นเกินไป (> ${thresholds.humHigh}%)`;
    humChart.data.datasets[1].data = new Array(dataLength).fill(thresholds.humHigh);
    humChart.data.datasets[2].label = `เกณฑ์แห้งเกินไป (< ${thresholds.humLow}%)`;
    humChart.data.datasets[2].data = new Array(dataLength).fill(thresholds.humLow);
    humChart.update();
}

// 10-Second Countdown Timer for Real-Time Metrics
function startCountdown() {
    countdownValue = 10;
    countdownEl.textContent = countdownValue;

    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(() => {
        countdownValue--;
        if (countdownValue <= 0) {
            countdownValue = 10;
            fetchCurrentData();
            fetchDailyMaxData();
        }
        countdownEl.textContent = countdownValue;
    }, 1000);
}

function resetCountdown() {
    countdownValue = 10;
    countdownEl.textContent = countdownValue;
}

// Network Status Indicator
function setConnectedStatus(isConnected) {
    if (isConnected) {
        connectionStatusEl.className = 'status-badge connected';
        statusTextEl.textContent = 'ออนไลน์ (เรียลไทม์)';
    } else {
        connectionStatusEl.className = 'status-badge disconnected';
        statusTextEl.textContent = 'ขาดการเชื่อมต่อกับเซิร์ฟเวอร์';
    }
}

