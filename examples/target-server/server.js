const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const LATENCY_MS = parseInt(process.env.LATENCY_MS || '10');
const ERROR_RATE = parseFloat(process.env.ERROR_RATE || '0');

let reqCount = 0;

// Middleware to simulate latency and error rate
app.use((req, res, next) => {
    reqCount++;
    if (req.path === '/api/health') return next();

    const delay = req.path === '/api/slow' ? Math.floor(Math.random() * 3000) + 2000 : LATENCY_MS;
    
    setTimeout(() => {
        if (req.path === '/api/error') {
            if (Math.random() < 0.5) return res.status(500).json({ error: 'Internal Server Error' });
            return res.status(200).json({ status: 'OK' });
        }
        
        if (ERROR_RATE > 0 && Math.random() < ERROR_RATE) {
            return res.status(500).json({ error: 'Simulated Error' });
        }
        next();
    }, delay);
});

// Endpoints
app.get('/api/health', (req, res) => res.status(200).send('OK'));

app.get('/api/users', (req, res) => {
    res.json([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
});

app.get('/api/users/:id', (req, res) => {
    res.json({ id: req.params.id, name: 'Test User' });
});

app.post('/api/users', (req, res) => {
    res.status(201).json({ id: Date.now(), ...req.body });
});

app.get('/api/slow', (req, res) => {
    res.json({ status: 'Done after delay' });
});

app.get('/api/error', (req, res) => {
    // Handled in middleware
});

app.get('/api/large', (req, res) => {
    const payload = 'A'.repeat(102400); // 100KB string
    res.json({ data: payload });
});

// Stats logging
setInterval(() => {
    console.log(`[Stats] Handled ${reqCount} requests in the last 10 seconds.`);
    reqCount = 0;
}, 10000);

const server = app.listen(PORT, () => {
    console.log(`Target server running on port ${PORT}`);
    console.log(`Config: Latency=${LATENCY_MS}ms, ErrorRate=${ERROR_RATE}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});
