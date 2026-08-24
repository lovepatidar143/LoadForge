# LoadForge Example Target Server

A simple Node.js/Express application designed to be the target of load tests. It features configurable endpoints for simulating different types of responses, including varied latencies, payload sizes, and error rates.

## Running

```bash
npm install
npm start
```

## Configuration (Environment Variables)

- `PORT` - Port to listen on (default: 8080)
- `LATENCY_MS` - Simulated baseline latency in ms (default: 10)
- `ERROR_RATE` - Probability (0.0 to 1.0) of any route (except `/api/health`) returning a 500 error (default: 0)

## Endpoints

- `GET /api/users` - Returns a JSON array of users.
- `GET /api/users/:id` - Returns a single user.
- `POST /api/users` - Creates a user (returns 201).
- `GET /api/slow` - Simulates a slow request (2-5s delay).
- `GET /api/error` - 50% chance of returning a 500 error.
- `GET /api/health` - Immediately returns 200 (ignores delay/error configs).
- `GET /api/large` - Returns a 100KB JSON response.
