# LoadForge

**A distributed HTTP load-testing and performance-analysis platform, built from scratch.**

LoadForge is an engineering learning project designed to teach systems programming, computer networking, concurrency, distributed systems, and performance engineering by building a production-quality load testing tool.

## Architecture

- **Engine** (C++) — High-performance HTTP load generator
- **Controller** (Node.js + TypeScript) — Test orchestration, worker management, API
- **Frontend** (React + TypeScript + Vite + Tailwind) — Real-time dashboard
- **Communication** — gRPC + Protocol Buffers (for distributed worker coordination)
- **Storage** — PostgreSQL (metrics persistence)
- **Observability** — Prometheus + Grafana

## Project Status

🏗️ **Under Construction** — Currently in foundational learning phase.

## Documentation

The complete technical book for this project lives at:

📖 [`docs`](docs)

This document explains every concept, design decision, and implementation detail from zero.

## Directory Structure

```
LoadForge/
├── README.md
├── docs/               # Technical book and documentation
│   └── LOADFORGE_FROM_SCRATCH.md
├── engine/             # C++ load generation engine
├── controller/         # Node.js + TypeScript controller
├── frontend/           # React + TypeScript dashboard
├── tests/              # All test suites
├── benchmarks/         # Performance benchmarks
├── examples/           # Example configurations and targets
├── docker/             # Docker and Docker Compose files
└── scripts/            # Build, deploy, and utility scripts
```

## License

This project is for educational purposes.
