// Configuration
const API_BASE_URL = window.location.origin.includes('http') 
    ? window.location.origin 
    : 'http://localhost:3000';

let weeklyChart = null;
let countdownValue = 10;
let countdownTimer = null;

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

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    fetchCurrentData();
    fetchWeeklyMaxData();
    startCountdown();

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchCurrentData();
            fetchWeeklyMaxData();
            resetCountdown();
        });
    }
});

// Fetch Current Environmental Metrics (Every 10s)
async function fetchCurrentData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/environment/current`);
        if (!response.ok) throw new Error('Network response failed');
        
        const result = await response.json();
        if (result.status === 'success' && result.data) {
            updateCurrentUI(result.data);
            setConnectedStatus(true);
        }
    } catch (error) {
        console.error('Error fetching current environment data:', error);
        setConnectedStatus(false);
    }
}

// Update UI with real-time telemetry
function updateCurrentUI(data) {
    const temp = data.temperature;
    const hum = data.humidity;

    // Numbers animation effect
    tempValueEl.textContent = temp.toFixed(1);
    humValueEl.textContent = hum.toFixed(1);

    // Temperature status evaluation
    if (temp > 35) {
        tempStatusEl.textContent = 'ร้อนจัด ☀️';
        tempStatusEl.style.color = '#ef4444';
    } else if (temp > 30) {
        tempStatusEl.textContent = ' อากาศร้อน 🌤️';
        tempStatusEl.style.color = '#f59e0b';
    } else if (temp >= 24) {
        tempStatusEl.textContent = ' สบาย/ปกติ 🌿';
        tempStatusEl.style.color = '#10b981';
    } else {
        tempStatusEl.textContent = ' อากาศเย็น ❄️';
        tempStatusEl.style.color = '#38bdf8';
    }

    // Humidity status evaluation
    if (hum > 75) {
        humStatusEl.textContent = 'ชื้นสูง 🌧️';
        humStatusEl.style.color = '#3b82f6';
    } else if (hum >= 45) {
        humStatusEl.textContent = ' ความชื้นพอเหมาะ 💧';
        humStatusEl.style.color = '#10b981';
    } else {
        humStatusEl.textContent = ' อากาศแห้ง 🌵';
        humStatusEl.style.color = '#f59e0b';
    }

    // Time updated
    const now = new Date(data.timestamp);
    lastUpdateTimeEl.textContent = now.toLocaleTimeString('th-TH');
}

// Fetch 1-Week Daily Maximum Data for Chart
async function fetchWeeklyMaxData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/environment/weekly-max`);
        if (!response.ok) throw new Error('Weekly max API failed');

        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
            updateChartData(result.data);
        }
    } catch (error) {
        console.error('Error fetching weekly max data:', error);
    }
}

// Initialize Chart.js
function initChart() {
    const ctx = document.getElementById('weeklyMaxChart').getContext('2d');
    
    // Gradient definitions
    const tempGradient = ctx.createLinearGradient(0, 0, 0, 300);
    tempGradient.addColorStop(0, 'rgba(255, 94, 98, 0.35)');
    tempGradient.addColorStop(1, 'rgba(255, 94, 98, 0.0)');

    const humGradient = ctx.createLinearGradient(0, 0, 0, 300);
    humGradient.addColorStop(0, 'rgba(0, 198, 255, 0.35)');
    humGradient.addColorStop(1, 'rgba(0, 198, 255, 0.0)');

    weeklyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
            datasets: [
                {
                    label: 'อุณหภูมิสูงสุด (°C)',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: tempGradient,
                    borderColor: '#ff5e62',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#ff5e62',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    yAxisID: 'yTemp'
                },
                {
                    label: 'ความชื้นสูงสุด (% RH)',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: humGradient,
                    borderColor: '#00c6ff',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#00c6ff',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    yAxisID: 'yHum'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc',
                        font: { family: 'Kanit', size: 13 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    titleFont: { family: 'Kanit', size: 14, weight: 'bold' },
                    bodyFont: { family: 'Kanit', size: 13 }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Kanit' } }
                },
                yTemp: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'อุณหภูมิ (°C)',
                        color: '#ff9966',
                        font: { family: 'Kanit', size: 12 }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#ff9966', font: { family: 'Outfit' } },
                    suggestedMin: 15,
                    suggestedMax: 45
                },
                yHum: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'ความชื้น (% RH)',
                        color: '#00c6ff',
                        font: { family: 'Kanit', size: 12 }
                    },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#00c6ff', font: { family: 'Outfit' } },
                    suggestedMin: 30,
                    suggestedMax: 100
                }
            }
        }
    });
}

// Update Chart Data with API Response
function updateChartData(weeklyData) {
    if (!weeklyChart) return;

    const labels = weeklyData.map(item => item.label);
    const maxTemps = weeklyData.map(item => item.maxTemp);
    const maxHums = weeklyData.map(item => item.maxHumidity);

    weeklyChart.data.labels = labels;
    weeklyChart.data.datasets[0].data = maxTemps;
    weeklyChart.data.datasets[1].data = maxHums;
    weeklyChart.update();
}

// 10-Second Countdown Timer
function startCountdown() {
    countdownValue = 10;
    countdownEl.textContent = countdownValue;

    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(() => {
        countdownValue--;
        if (countdownValue <= 0) {
            countdownValue = 10;
            fetchCurrentData();
            // Periodically refresh chart data too
            fetchWeeklyMaxData();
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
