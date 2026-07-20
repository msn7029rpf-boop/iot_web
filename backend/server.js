const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Supabase Database Configuration ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('⚡ Supabase Client initialized successfully!');
    } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
    }
} else {
    console.log('ℹ️ Supabase environment variables missing. Operating in In-Memory / Hybrid Simulation mode.');
}

// --- Data Store & Memory Management ---
let currentReading = {
    temperature: 30.5,
    humidity: 62.0,
    timestamp: new Date().toISOString()
};

// Memory storage for sensor readings fallback
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
            
            const tempBase = 27 + 6 * Math.sin(((hour - 7) / 24) * 2 * Math.PI);
            const tempVariation = (Math.random() - 0.5) * 2.5;
            const temperature = parseFloat(Math.max(22, Math.min(38, tempBase + tempVariation)).toFixed(1));
            
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

// --- Real-time Sensor Data Generator (Simulates physical IoT hardware DHT22 when idle) ---
async function updateSensorData() {
    // Small random fluctuations around current reading
    const tempDelta = (Math.random() - 0.48) * 0.4;
    const humDelta = (Math.random() - 0.5) * 0.8;

    let newTemp = currentReading.temperature + tempDelta;
    let newHum = currentReading.humidity + humDelta;

    newTemp = Math.max(24.0, Math.min(37.5, newTemp));
    newHum = Math.max(40.0, Math.min(90.0, newHum));

    currentReading = {
        temperature: parseFloat(newTemp.toFixed(1)),
        humidity: parseFloat(newHum.toFixed(1)),
        timestamp: new Date().toISOString()
    };

    historyReadings.push(currentReading);

    // Keep memory history capped at 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    while (historyReadings.length > 0 && new Date(historyReadings[0].timestamp) < fourteenDaysAgo) {
        historyReadings.shift();
    }

    // Save to Supabase if connected
    if (supabase) {
        try {
            await supabase.from('sensor_readings').insert([
                {
                    temperature: currentReading.temperature,
                    humidity: currentReading.humidity,
                    created_at: currentReading.timestamp
                }
            ]);
        } catch (err) {
            console.error('Error saving simulated reading to Supabase:', err.message);
        }
    }

    console.log(`[Sensor Simulator] Update: Temp=${currentReading.temperature}°C, Humidity=${currentReading.humidity}% at ${currentReading.timestamp}`);
}

// Automatically generate sensor update every 10 seconds
setInterval(updateSensorData, 10000);

// --- REST API Endpoints ---

// 1. GET Current environmental metrics (every 10 seconds)
app.get('/api/environment/current', async (req, res) => {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('sensor_readings')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0) {
                const latest = data[0];
                return res.json({
                    status: 'success',
                    data: {
                        temperature: parseFloat(latest.temperature),
                        humidity: parseFloat(latest.humidity),
                        timestamp: latest.created_at
                    },
                    updateIntervalSeconds: 10
                });
            }
        } catch (err) {
            console.error('Supabase fetch current error:', err.message);
        }
    }

    res.json({
        status: 'success',
        data: currentReading,
        updateIntervalSeconds: 10
    });
});

// 2. GET Weekly daily maximum overview (Past 7 Days Max Temperature & Humidity)
app.get('/api/environment/weekly-max', async (req, res) => {
    const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const daysMap = {};

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

    let sourceReadings = historyReadings;

    if (supabase) {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const { data, error } = await supabase
                .from('sensor_readings')
                .select('*')
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: true });

            if (!error && data && data.length > 0) {
                sourceReadings = data.map(item => ({
                    temperature: parseFloat(item.temperature),
                    humidity: parseFloat(item.humidity),
                    timestamp: item.created_at
                }));
            }
        } catch (err) {
            console.error('Supabase fetch weekly max error:', err.message);
        }
    }

    // Calculate maximum values for each day
    sourceReadings.forEach(reading => {
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
app.post('/api/environment/telemetry', async (req, res) => {
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

    if (supabase) {
        try {
            await supabase.from('sensor_readings').insert([
                {
                    temperature: currentReading.temperature,
                    humidity: currentReading.humidity,
                    created_at: currentReading.timestamp
                }
            ]);
        } catch (err) {
            console.error('Error inserting hardware telemetry into Supabase:', err.message);
        }
    }

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

