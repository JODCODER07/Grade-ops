# GradeOps · Agentic AI Grading & Academic Integrity Platform

> **Human-in-the-Loop exam grading powered by Vision-Language Models, Agentic LLMs, and a high-throughput TA review dashboard.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com/atlas)
[![LangChain](https://img.shields.io/badge/LangChain-1.3-1C3C3C?style=flat-square&logo=langchain&logoColor=white)](https://langchain.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Roles & Permissions](#roles--permissions)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Mock / Demo Mode](#mock--demo-mode)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Manual grading of handwritten exams is slow, inconsistent, and prone to fatigue-induced bias. **GradeOps** solves this with a three-stage agentic pipeline:

1. **Extract** — A Vision-Language Model (Google Gemini 2.5 Flash) transcribes handwritten student answers from uploaded exam scans (images/PDFs).
2. **Grade** — An Agentic LLM pipeline (LangChain + Gemini Structured Outputs) evaluates each answer against instructor-defined JSON rubrics, awarding partial credit with step-by-step justifications across multiple questions.
3. **Review** — A high-throughput TA dashboard surfaces AI-proposed grades side-by-side with the exam scan. TAs approve or override with a single keystroke.

An additional **Plagiarism Detection Agent** compares two student submissions for shared anomalous reasoning patterns — not just text overlap, but identical _wrong logic_, which is a strong indicator of copying.

The result: consistent, auditable grades at scale — with a human always in the loop.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GradeOps Platform                            │
│                                                                     │
│  ┌──────────────────┐   REST/JSON   ┌────────────────────────────┐  │
│  │  React 19 (Vite) │◄────────────►│      FastAPI Backend        │  │
│  │  Frontend SPA    │              │                              │  │
│  │                  │              │  ┌────────────────────────┐  │  │
│  │  • RBAC Login    │              │  │  Vision Engine         │  │  │
│  │  • Grading Tab   │              │  │  (Gemini 2.5 Flash     │  │  │
│  │  • Plagiarism Tab│              │  │   Multimodal OCR)      │  │  │
│  │  • Roster Tab    │              │  └────────────────────────┘  │  │
│  │                  │              │              │                │  │
│  │  Theme Switcher  │              │  ┌───────────▼────────────┐  │  │
│  │  (4 Palettes)    │              │  │  Agentic Grader        │  │  │
│  │                  │              │  │  (LangChain +          │  │  │
│  │  Keyboard        │              │  │   Pydantic Structured  │  │  │
│  │  Shortcuts       │              │  │   Outputs)             │  │  │
│  └──────────────────┘              │  └────────────────────────┘  │  │
│                                    │              │                │  │
│                                    │  ┌───────────▼────────────┐  │  │
│                                    │  │  Plagiarism Detector   │  │  │
│                                    │  │  (Shared Anomaly       │  │  │
│                                    │  │   Logic Analysis)      │  │  │
│                                    │  └────────────────────────┘  │  │
│                                    │              │                │  │
│                                    │  ┌───────────▼────────────┐  │  │
│                                    │  │  MongoDB Atlas         │  │  │
│                                    │  │  (Grades Persistence   │  │  │
│                                    │  │   + In-Memory Fallback)│  │  │
│                                    │  └────────────────────────┘  │  │
│                                    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Features

### 🧠 Agentic Multi-Question Grading

Processes entire handwritten exams in batch. The LangChain agent evaluates each question individually against its specific rubric criteria, calculates per-step partial credit, and returns a full structured exam report with `FullExamReport → QuestionGrade → StepGrade` hierarchy. Supports three rigor modes (**Strict**, **Balanced**, **Lenient**) and adjustable LLM temperature for grading consistency control.

### 👁️ Vision-Language OCR (Gemini 2.5 Flash)

Google Gemini 2.5 Flash's multimodal capabilities extract and transcribe messy handwritten answers from scanned images, handling varied handwriting styles, mathematical formulas, and crossed-out text — all via a single API call.

### 🕵️ Logic-Based Plagiarism Detection

Goes beyond surface-level text matching. The plagiarism agent compares two submissions for **shared anomalous logic structures** — when both students make the exact same unusual mathematical mistake or follow identical flawed reasoning, it flags the pair with a confidence score, a list of shared anomalies, and a verdict justification.

### ✏️ Human-in-the-Loop (HITL) Review Dashboard

A side-by-side view of the exam scan image (with animated scanner overlay during processing) and the AI-proposed grade with collapsible question-by-question breakdowns. TAs can:
- **Approve** the AI grade with a single click or `Enter` key
- **Override** the score and feedback via a manual editing panel (`Space` key)
- Navigate batch exam queues automatically after each decision

### 📐 Dynamic Rubric Configuration

Instructors define granular JSON rubrics with per-question, per-step criteria and point allocations. Three preset rubric templates are included (Calculus, Programming, Essay), and custom rubrics can be authored directly in the JSON editor.

### 🗄️ Live Class Roster with Analytics

MongoDB Atlas persists all finalized grades. The Instructor roster view includes:
- **Real-time statistics**: class average, highest score, pass rate
- **Grade distribution histogram** with hover tooltips
- **Search & filter**: find students by ID or feedback text; filter by status (Approved/Overridden)
- **Data export**: download the full roster as CSV or JSON

### 🎨 Multi-Theme Palette System

Four curated university-inspired color themes, persisted in localStorage:
- **Oxford Indigo** (default) — deep purple/indigo academic theme
- **Harvard Crimson** — warm red tones
- **MIT Teal** — cool teal/cyan palette
- **Stanford Gold** — amber/gold warmth

### 🔐 Role-Based Access Control (RBAC)

| Role | Capabilities |
|------|-------------|
| **Instructor** | Upload exams, define/edit rubrics, view full roster & analytics, run plagiarism analysis, configure AI parameters |
| **Teaching Assistant** | Access grading queue, approve/override AI grades, view exam scans & reports |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 (Vite 8), Axios | Single-page application with dynamic themes |
| **Styling** | Custom CSS (Glassmorphism) | Premium slate-mode UI with micro-animations |
| **Backend** | Python 3.11+, FastAPI, Uvicorn | RESTful API server with async request handling |
| **Database** | MongoDB Atlas (PyMongo) | Cloud-hosted document store with in-memory fallback |
| **AI / Vision** | Google Gemini 2.5 Flash | Multimodal OCR extraction and exam grading |
| **Agentic Orchestration** | LangChain + Pydantic v2 | Structured output grading with typed response schemas |
| **Plagiarism Analysis** | LangChain Structured Output | Anomaly-based collusion detection agent |

---

## Project Structure

```
GRADEOPS/
├── backend/
│   ├── main.py              # FastAPI app: routing, CORS, MongoDB setup, in-memory fallback
│   ├── agentic_grader.py    # LangChain grading agent with Pydantic structured outputs
│   ├── plagiarism_agent.py  # AI plagiarism detector comparing shared reasoning anomalies
│   ├── vision_engine.py     # Gemini 2.5 Flash multimodal OCR wrapper
│   ├── database.py          # Standalone MongoDB connection utility
│   ├── rubric.json          # Default rubric schema (overwritten per grading session)
│   ├── requirements.txt     # Pinned Python dependencies
│   ├── .env.example         # Environment variables template
│   └── .env                 # Local secrets (git-ignored)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Full application: RBAC, grading pipeline, plagiarism, roster
│   │   ├── App.css          # Premium glassmorphism styles with 4 dynamic theme palettes
│   │   ├── index.css        # Base reset and root container styles
│   │   └── main.jsx         # Vite/React entry point
│   ├── index.html           # HTML shell with Vite mount point
│   ├── package.json         # Node dependencies (React 19, Axios, Vite 8)
│   └── vite.config.js       # Vite dev server configuration
│
├── .gitignore               # Ignores venv/, .env, __pycache__/
├── LICENSE                  # MIT License
└── README.md                # This file
```

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Python** | 3.11+ | Backend runtime |
| **Node.js** | 18+ | Frontend build toolchain |
| **MongoDB Atlas** | Free tier | Cloud database ([sign up](https://mongodb.com/atlas)) |
| **Google Gemini API Key** | — | Required for OCR & grading ([get one](https://aistudio.google.com/app/apikey)) |

> **Note:** The app works fully without a Gemini API key or MongoDB connection — it automatically falls back to **mock/demo mode** with simulated OCR results, mock grading, and an in-memory database with pre-seeded sample data.

---

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/JODCODER07/Grade-ops.git
cd Grade-ops
```

### 2. Backend (FastAPI)

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env and add your GEMINI_API_KEY and MONGODB_URI

# Start the server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`
Interactive docs: `http://localhost:8000/docs`

### 3. Frontend (React + Vite)

```bash
# Open a new terminal
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`

---

## Environment Variables

Create a `.env` file in `backend/` using `.env.example` as a template:

```env
# Google Gemini AI Config
GEMINI_API_KEY=your_google_gemini_api_key_here

# MongoDB Atlas Database URI Connection String
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/gradeops?retryWrites=true&w=majority
```

> ⚠️ **Never commit your `.env` file.** It is already listed in `.gitignore`.

> 💡 Both variables are **optional** — the app falls back to mock AI responses and an in-memory database if either is missing.

---

## API Reference

Full interactive documentation is available at `/docs` (Swagger UI) when the backend is running.

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|-------------|
| `GET` | `/` | Health check | — |
| `POST` | `/api/extract` | Upload an exam image and extract text via Gemini Vision OCR | `multipart/form-data` (file) |
| `POST` | `/api/grade` | Grade extracted text against a rubric using the Agentic LLM | `{ student_answer, rubric_data, rigor, temperature }` |
| `POST` | `/api/check-plagiarism` | Compare two student answers for collusion | `{ student_1_answer, student_2_answer }` |
| `POST` | `/api/save-grade` | Persist a finalized grade to MongoDB | `{ student_id, total_score, feedback, status }` |
| `GET` | `/api/grades` | Retrieve all saved grades for the class roster | — |
| `DELETE` | `/api/grades/{grade_id}` | Delete a specific grade entry | — |

---

## Roles & Permissions

GradeOps uses a client-side role selection system with two access levels:

| Feature | Instructor | TA |
|---------|:----------:|:--:|
| Define/edit JSON rubrics | ✅ | 🔒 Locked |
| Upload exam scans | ✅ | ✅ |
| Run AI grading pipeline | ✅ | ✅ |
| Configure rigor & temperature | ✅ | ✅ |
| Approve AI grades | ✅ | ✅ |
| Override grades manually | ✅ | ✅ |
| Plagiarism detection tab | ✅ | ❌ Hidden |
| Class roster & analytics | ✅ | ❌ Hidden |
| Export CSV/JSON | ✅ | ❌ Hidden |

---

## Keyboard Shortcuts

The review dashboard supports keyboard-driven workflows for rapid grading:

| Key | Action |
|-----|--------|
| `Enter` | Approve AI-proposed grade and advance to next exam |
| `Space` | Open the manual override panel |

> Shortcuts are active only when a grade report is displayed and the override panel is closed.

---

## Mock / Demo Mode

GradeOps is designed to be **fully functional without any API keys or database connections**:

| Component | Fallback Behavior |
|-----------|-------------------|
| **Gemini API Key** missing | Vision engine returns mock OCR text; grader returns simulated multi-question report with rigor-adjusted scores |
| **MongoDB** unreachable | In-memory collection with 5 pre-seeded student records; full CRUD operations supported |
| **Plagiarism Agent** (no key) | Returns a mock high-suspicion report with sample shared anomalies |

This makes it easy to demo, develop, and test the platform without external dependencies.

---

## Contributing

Contributions are welcome. Please follow this workflow:

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes with clear, atomic commits
3. Ensure the frontend builds cleanly: `npm run build`
4. Open a pull request against `main` with a description of what changed and why

For significant changes, please open an issue first to discuss the approach.

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

<p align="center">Built with ☕ by <strong>Naitik Agarwal</strong></p>
