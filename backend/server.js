const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Data Store & Memory Management ---
let currentReading = {
    temperature: 30.5,
    humidity: 62.0,
    timestamp: new Date().toISOString()
};

// Memory storage for sensor readings (in a real production app, this would be SQLite/PostgreSQL)
// We pre-populate 7 days of mock historical readings to demonstrate the 1-week daily max chart
const historyReadings = [];

function initializeMockHistory() {
    const now = new Date();
    // Populate past 7 days (including today)
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
        const date = new Date(now);
        date.setDate(now.getDate() - dayOffset);
        
        // Generate 24 hourly readings for each day to ensure realistic daily peaks
        for (let hour = 0; hour < 24; hour++) {
            const time = new Date(date);
            time.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
            
            // Temperature peaks around 13:00 - 15:00 (midday heat)
            const tempBase = 27 + 6 * Math.sin(((hour - 7) / 24) * 2 * Math.PI);
            const tempVariation = (Math.random() - 0.5) * 2.5;
            const temperature = parseFloat(Math.max(22, Math.min(38, tempBase + tempVariation)).toFixed(1));
            
            // Humidity inversely correlates with temperature
            const humBase = 75 - (tempBase - 27) * 3;
            const humVariation = (Math.random() - 0.5) * 4;
            const humidity = parseFloat(Math.max(45, Math.min(95, humBase + humVariation)).toFixed(1));
            
            historyReadings.push({
                temperature,
                humidity,
                timestamp: time.toISOString()
            });
        }
    }
}

initializeMockHistory();

// --- Real-time Sensor Data Generator (Simulates physical IoT hardware DHT22) ---
function updateSensorData() {
    // Small random fluctuations around current reading
    const tempDelta = (Math.random() - 0.48) * 0.4;
    const humDelta = (Math.random() - 0.5) * 0.8;

    let newTemp = currentReading.temperature + tempDelta;
    let newHum = currentReading.humidity + humDelta;

    // Keep within reasonable environmental bounds (Thailand indoor/outdoor range)
    newTemp = Math.max(24.0, Math.min(37.5, newTemp));
    newHum = Math.max(40.0, Math.min(90.0, newHum));

    currentReading = {
        temperature: parseFloat(newTemp.toFixed(1)),
        humidity: parseFloat(newHum.toFixed(1)),
        timestamp: new Date().toISOString()
    };

    historyReadings.push(currentReading);

    // Keep history memory footprint light (keep maximum 14 days of data)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    while (historyReadings.length > 0 && new Date(historyReadings[0].timestamp) < fourteenDaysAgo) {
        historyReadings.shift();
    }

    console.log(`[Sensor Simulator] Update: Temp=${currentReading.temperature}°C, Humidity=${currentReading.humidity}% at ${currentReading.timestamp}`);
}

// Automatically generate sensor update every 10 seconds
setInterval(updateSensorData, 10000);

// --- REST API Endpoints ---

// 1. GET Current environmental metrics (every 10 seconds)
app.get('/api/environment/current', (req, res) => {
    res.json({
        status: 'success',
        data: currentReading,
        updateIntervalSeconds: 10
    });
});

// 2. GET Weekly daily maximum overview (Past 7 Days Max Temperature & Humidity)
app.get('/api/environment/weekly-max', (req, res) => {
    const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const daysMap = {};

    // Group history readings by date YYYY-MM-DD
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dateKey = d.toISOString().split('T')[0];
        const dayLabel = `${dayNames[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`;

        daysMap[dateKey] = {
            date: dateKey,
            label: dayLabel,
            maxTemp: -Infinity,
            maxHumidity: -Infinity,
            readingsCount: 0
        };
    }

    // Calculate maximum values for each day
    historyReadings.forEach(reading => {
        const dateKey = reading.timestamp.split('T')[0];
        if (daysMap[dateKey]) {
            if (reading.temperature > daysMap[dateKey].maxTemp) {
                daysMap[dateKey].maxTemp = reading.temperature;
            }
            if (reading.humidity > daysMap[dateKey].maxHumidity) {
                daysMap[dateKey].maxHumidity = reading.humidity;
            }
            daysMap[dateKey].readingsCount++;
        }
    });

    const weeklyData = Object.values(daysMap).map(day => ({
        date: day.date,
        label: day.label,
        maxTemp: day.maxTemp === -Infinity ? currentReading.temperature : parseFloat(day.maxTemp.toFixed(1)),
        maxHumidity: day.maxHumidity === -Infinity ? currentReading.humidity : parseFloat(day.maxHumidity.toFixed(1)),
        readingsCount: day.readingsCount
    }));

    res.json({
        status: 'success',
        data: weeklyData
    });
});

// 3. POST Hardware Sensor Endpoint (For ESP32/ESP8266/Arduino physical hardware)
app.post('/api/environment/telemetry', (req, res) => {
    const { temperature, humidity } = req.body;

    if (typeof temperature !== 'number' || typeof humidity !== 'number') {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid payload. Expecting { temperature: number, humidity: number }'
        });
    }

    currentReading = {
        temperature: parseFloat(temperature.toFixed(1)),
        humidity: parseFloat(humidity.toFixed(1)),
        timestamp: new Date().toISOString()
    };

    historyReadings.push(currentReading);

    res.json({
        status: 'success',
        message: 'Telemetry received successfully',
        data: currentReading
    });
});

// Start backend server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`==================================================`);
        console.log(`🚀 IoT Environment Backend Server Running!`);
        console.log(`🌐 Web UI: http://localhost:${PORT}`);
        console.log(`📡 API Current: http://localhost:${PORT}/api/environment/current`);
        console.log(`📊 API Weekly Max: http://localhost:${PORT}/api/environment/weekly-max`);
        console.log(`==================================================`);
    });
}

module.exports = app;

