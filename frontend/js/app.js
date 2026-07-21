// Configuration
const API_BASE_URL = window.location.origin.includes('http') 
    ? window.location.origin 
    : 'http://localhost:3000';

let tempChart = null;
let humChart = null;
let countdownValue = 10;
let countdownTimer = null;
let lastTelemetryData = null;

// Thresholds State with LocalStorage Persistence
let thresholds = {
    tempLow: 15,
    tempHigh: 35,
    humLow: 40,
    humHigh: 90
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
        }
    } catch (e) {
        console.error('Error loading thresholds from localStorage:', e);
    }
}

function saveThresholds() {
    try {
        localStorage.setItem('iot_thresholds', JSON.stringify(thresholds));
    } catch (e) {
        console.error('Error saving thresholds to localStorage:', e);
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
});

// Update Threshold Badges Text in HTML
function updateThresholdUI() {
    if (tempBadgeLow) tempBadgeLow.textContent = `❄️ น้อยเกินไป (< ${thresholds.tempLow}°C)`;
    if (tempBadgeNormal) tempBadgeNormal.textContent = `🌿 ปกติ (${thresholds.tempLow}–${thresholds.tempHigh}°C)`;
    if (tempBadgeHigh) tempBadgeHigh.textContent = `☀️ ร้อนเกินไป (> ${thresholds.tempHigh}°C)`;

    if (humBadgeLow) humBadgeLow.textContent = `🌵 น้อยเกินไป (< ${thresholds.humLow}%)`;
    if (humBadgeNormal) humBadgeNormal.textContent = `💧 ปกติ (${thresholds.humLow}–${thresholds.humHigh}%)`;
    if (humBadgeHigh) humBadgeHigh.textContent = `🌧️ ชื้นเกินไป (> ${thresholds.humHigh}%)`;
}

// Setup Event Listeners for Interactive Editing
function setupThresholdEventListeners() {
    const triggerTempEdit = () => editTempThresholds();
    const triggerHumEdit = () => editHumThresholds();

    if (tempBadgesContainer) tempBadgesContainer.addEventListener('click', triggerTempEdit);
    if (btnEditTemp) btnEditTemp.addEventListener('click', (e) => { e.stopPropagation(); triggerTempEdit(); });
    
    const tempCanvas = document.getElementById('tempChart');
    if (tempCanvas) tempCanvas.addEventListener('click', triggerTempEdit);

    if (humBadgesContainer) humBadgesContainer.addEventListener('click', triggerHumEdit);
    if (btnEditHum) btnEditHum.addEventListener('click', (e) => { e.stopPropagation(); triggerHumEdit(); });

    const humCanvas = document.getElementById('humChart');
    if (humCanvas) humCanvas.addEventListener('click', triggerHumEdit);
}

// Interactive Temperature Threshold Prompt Editor
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
    saveThresholds();
    updateThresholdUI();
    fetchDailyMaxData();
    if (lastTelemetryData) updateCurrentUI(lastTelemetryData);
}

// Interactive Humidity Threshold Prompt Editor
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
    saveThresholds();
    updateThresholdUI();
    fetchDailyMaxData();
    if (lastTelemetryData) updateCurrentUI(lastTelemetryData);
}

// Fetch Current Environmental Metrics (Every 10s)
async function fetchCurrentData() {
    try {
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

// Update UI with real-time telemetry cards based on active thresholds
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
    } else if (temp < thresholds.tempLow) {
        tempStatusEl.textContent = ' อากาศเย็น ❄️';
        tempStatusEl.style.color = '#38bdf8';
    } else {
        tempStatusEl.textContent = ' สบาย/ปกติ 🌿';
        tempStatusEl.style.color = '#10b981';
    }

    // Humidity status evaluation against custom thresholds
    if (hum > thresholds.humHigh) {
        humStatusEl.textContent = 'ชื้นสูง 🌧️';
        humStatusEl.style.color = '#ef4444';
    } else if (hum < thresholds.humLow) {
        humStatusEl.textContent = ' อากาศแห้ง 🌵';
        humStatusEl.style.color = '#f59e0b';
    } else {
        humStatusEl.textContent = ' ความชื้นพอเหมาะ 💧';
        humStatusEl.style.color = '#10b981';
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

