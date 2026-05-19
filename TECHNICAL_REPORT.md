# GradeOps — Technical Report

## 1. Introduction

### 1.1 Problem Statement

Grading handwritten exams is time-consuming, inconsistent, and prone to fatigue-induced bias. A single instructor grading 200+ papers inevitably applies rubrics unevenly — early papers receive more scrutiny than later ones. This creates fairness issues and wastes hundreds of faculty hours per semester.

### 1.2 Proposed Solution

GradeOps is a Human-in-the-Loop (HITL) grading platform that uses Vision-Language Models and Agentic LLMs to evaluate scanned exams against strict rubrics. It automatically extracts, transcribes, and grades handwritten answers, awarding partial credit with justifications. AI-proposed grades are pushed to a high-speed dashboard where Teaching Assistants rapidly review, approve, or override decisions.

### 1.3 Key Goals

- Upload bulk exam scans and define granular JSON rubrics
- Role-Based Access Control (Instructor vs. TA)
- OCR/Vision models to extract messy handwritten answers
- Agentic LLM pipeline to award partial credit with structured justifications
- Flag similar logic structures across papers for plagiarism
- High-throughput review dashboard with keyboard shortcuts

---

## 2. System Architecture

### 2.1 High-Level Design

```
  React 19 SPA (Vite 8)          FastAPI Backend (Python 3.11+)
 ┌─────────────────────┐        ┌──────────────────────────────┐
 │  RBAC Login Screen   │        │  /api/extract                │
 │  Grading Pipeline    │◄─────►│  /api/grade                  │
 │  Plagiarism Checker  │ Axios  │  /api/check-plagiarism       │
 │  Class Roster + Stats│ REST   │  /api/save-grade             │
 │  Theme Switcher      │        │  /api/grades                 │
 └─────────────────────┘        │  /api/grades/{id}            │
                                 └──────────┬───────────────────┘
                                            │
                          ┌─────────────────┼─────────────────┐
                          │                 │                 │
                    Vision Engine    Agentic Grader    Plagiarism Agent
                   (Gemini 2.5 Flash) (LangChain)    (LangChain)
                          │                 │                 │
                          └─────────────────┼─────────────────┘
                                            │
                                     MongoDB Atlas
                                 (+ In-Memory Fallback)
```

### 2.2 Data Flow

1. **Upload**: Instructor uploads exam scan images via the React frontend
2. **Extract**: Image sent to `/api/extract` → Gemini 2.5 Flash performs multimodal OCR → returns transcribed text
3. **Grade**: Extracted text + rubric JSON sent to `/api/grade` → LangChain agent grades each question with step-by-step breakdown → returns `FullExamReport`
4. **Review**: TA views AI grade alongside exam image → approves (Enter) or overrides (Space)
5. **Persist**: Final grade saved to MongoDB via `/api/save-grade`
6. **Analyze**: Instructor can compare two submissions for plagiarism via `/api/check-plagiarism`

---

## 3. Technology Stack

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| Frontend | React | 19.2.6 | Component-based SPA with hooks for state management |
| Build Tool | Vite | 8.0.12 | Fast HMR and optimized production builds |
| HTTP Client | Axios | 1.16.1 | Promise-based HTTP with interceptor support |
| Styling | Custom CSS | — | Glassmorphism design with CSS custom properties for theming |
| Backend | FastAPI | 0.136.1 | Async Python framework with auto-generated OpenAPI docs |
| Server | Uvicorn | 0.47.0 | ASGI server for production deployment |
| Database | MongoDB Atlas (PyMongo) | 4.17.0 | Document store for flexible grade schemas |
| AI Model | Google Gemini 2.5 Flash | — | Multimodal model for both OCR and grading |
| Orchestration | LangChain | 1.3.1 | Agent chaining with structured output support |
| Schema Validation | Pydantic | 2.13.4 | Typed response schemas for LLM structured outputs |

---

## 4. Module Design

### 4.1 Vision Engine (`vision_engine.py`)

**Purpose**: Extract handwritten text from exam scan images using Gemini's multimodal capabilities.

**Key Design Decisions**:
- Uses `google-genai` client SDK (not LangChain) for direct multimodal image+text input
- PIL Image loading for format validation before API call
- Mock fallback returns realistic sample OCR text when no API key is configured
- Raises `ValueError` on missing files instead of crashing the server

**Interface**:
```python
class CloudVisionEngine:
    def extract_text(self, image_path: str) -> str
```

### 4.2 Agentic Grader (`agentic_grader.py`)

**Purpose**: Grade an entire multi-question exam against a JSON rubric array using LangChain structured outputs.

**Pydantic Output Schema** (3-level hierarchy):
```
FullExamReport
├── total_exam_score: int
├── max_exam_points: int
├── general_feedback: str
└── questions: List[QuestionGrade]
    ├── question_id: str
    ├── score / max_points: int
    ├── feedback: str
    └── step_grades: List[StepGrade]
        ├── step_name: str
        ├── points_awarded: int
        └── justification: str
```

**Key Design Decisions**:
- Uses `ChatGoogleGenerativeAI.with_structured_output(FullExamReport)` for guaranteed schema compliance
- Three rigor policies injected into the system prompt: Strict, Balanced, Lenient
- Adjustable LLM temperature (0.0–1.0) for grading consistency vs. creativity
- Fresh LLM instance created per request to apply per-request temperature
- Mock fallback generates rigor-aware scores without API calls

### 4.3 Plagiarism Detector (`plagiarism_agent.py`)

**Purpose**: Compare two student submissions for evidence of copying based on shared reasoning anomalies.

**Output Schema**:
```python
class PlagiarismReport(BaseModel):
    is_suspicious: bool          # Flagged or cleared
    confidence_score: int        # 0-100 percentage
    shared_anomalies: list[str]  # Specific shared mistakes
    verdict_justification: str   # Explanation for the professor
```

**Key Design Decisions**:
- Focuses on shared *wrong logic* rather than text overlap — two students making the same bizarre mathematical mistake is stronger evidence than similar phrasing
- Temperature set to 0.0 for deterministic analysis
- Returns dict via `.model_dump()` for consistent API serialization

### 4.4 FastAPI Backend (`main.py`)

**Purpose**: REST API server connecting the frontend to all AI engines and the database.

**Key Design Decisions**:
- **Resilient MongoDB fallback**: If Atlas is unreachable, a `MockGradesCollection` class provides full CRUD with 5 pre-seeded demo records
- **DNS override**: Forces Google DNS (8.8.8.8) to resolve MongoDB Atlas hostnames reliably on restricted networks
- **CORS**: Wide-open `allow_origins=["*"]` for development simplicity
- **Rubric override**: The `/api/grade` endpoint writes the TA's custom rubric to `rubric.json` before grading, allowing per-session rubric customization
- **Proper error handling**: HTTPException re-raised before generic catch to preserve correct HTTP status codes

### 4.5 React Frontend (`App.jsx` + `App.css`)

**Purpose**: Single-page application with three tabs (Grading, Plagiarism, Roster) and RBAC role selection.

**Key Features**:
- **Batch pipeline**: Multi-file upload queue with automatic advancement after each grade decision
- **Collapsible accordions**: Question-by-question grade breakdown with animated expand/collapse
- **Keyboard shortcuts**: Enter (approve) and Space (override) with ref-based state tracking to prevent stale closures
- **Toast notifications**: Floating notification stack with auto-dismiss and manual close
- **Dynamic themes**: 4 CSS custom property palettes persisted in localStorage
- **Grade histogram**: Pure CSS bar chart with hover tooltips showing student counts per score bracket
- **CSV/JSON export**: Client-side file generation and download for the class roster
- **Scanner overlay**: Animated laser sweep effect during OCR processing

---

## 5. API Endpoint Specification

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| `GET` | `/` | — | `{ status: string }` |
| `POST` | `/api/extract` | `multipart/form-data` (image file) | `{ extracted_text: string }` |
| `POST` | `/api/grade` | `{ student_answer, rubric_data, rigor, temperature }` | `FullExamReport` (JSON) |
| `POST` | `/api/check-plagiarism` | `{ student_1_answer, student_2_answer }` | `PlagiarismReport` (JSON) |
| `POST` | `/api/save-grade` | `{ student_id, total_score, feedback, status }` | `{ message: string }` |
| `GET` | `/api/grades` | — | `Array<GradeDocument>` |
| `DELETE` | `/api/grades/{grade_id}` | Path param: MongoDB ObjectId | `{ message: string }` |

---

## 6. Role-Based Access Control

| Feature | Instructor | Teaching Assistant |
|---------|:----------:|:------------------:|
| Define/edit JSON rubrics | ✅ | 🔒 Read-only banner |
| Upload exam scans | ✅ | ✅ |
| Run AI grading pipeline | ✅ | ✅ |
| Configure rigor & temperature | ✅ | ✅ |
| Approve/override grades | ✅ | ✅ |
| Plagiarism detection | ✅ | ❌ Tab hidden |
| Class roster & analytics | ✅ | ❌ Tab hidden |
| CSV/JSON data export | ✅ | ❌ Tab hidden |

Implementation: Client-side role state variable controls tab visibility and rubric editability. The TA role hides the Plagiarism and Roster tabs entirely and displays a lock banner over the rubric editor.

---

## 7. Frontend Design System

### 7.1 Theme Architecture

Four university-inspired themes implemented via CSS custom properties on `<body>`:

| Theme | Primary Accent | CSS Class |
|-------|---------------|-----------|
| Oxford Indigo | `#4f46e5` | `theme-oxford` |
| Harvard Crimson | `#991b1b` | `theme-crimson` |
| MIT Teal | `#0f766e` | `theme-teal` |
| Stanford Gold | `#b45309` | `theme-stanford` |

Each theme overrides `--lavender-accent`, `--lavender-light`, and `--lavender-glow` variables. Theme selection persists across sessions via `localStorage`.

### 7.2 UI Components

- **Glassmorphism panels**: `backdrop-filter: blur()` with semi-transparent backgrounds
- **Animated scanner overlay**: CSS `@keyframes laserSweep` with gradient sweep line during OCR
- **Collapsible accordions**: `max-height` transition with chevron rotation
- **Toast notifications**: Fixed-position stack with slide-up animation and auto-dismiss
- **Grade histogram**: Flexbox bar chart with percentage-height bars and hover tooltips
- **Score pills & status tags**: Color-coded badges for scores and review status

---

## 8. Database Design

### 8.1 MongoDB Schema

**Collection**: `grades`

```json
{
  "_id": "ObjectId",
  "student_id": "STU-1001",
  "total_score": 9,
  "feedback": "Flawless differentiation and calculus proof steps.",
  "status": "Approved"    // "Approved" | "Overridden"
}
```

### 8.2 Resilient Fallback

When MongoDB Atlas is unreachable, a `MockGradesCollection` class provides:
- `insert_one()` with UUID-based ID generation
- `find()` returning the in-memory store
- `delete_one()` with string-based ID matching
- 5 pre-seeded demo records for immediate functionality

---

## 9. AI Pipeline Details

### 9.1 OCR Pipeline

```
Image Upload → PIL Validation → Gemini 2.5 Flash (Multimodal) → Raw Text
```

**Prompt**: *"Extract and transcribe all the handwritten text and math formulas from this image exactly as written. Output only the transcribed text."*

### 9.2 Grading Pipeline

```
Raw Text + JSON Rubric + Rigor Policy → LangChain ChatPromptTemplate
    → Gemini 2.5 Flash (Structured Output) → FullExamReport
```

The system prompt instructs the model to:
1. Match student text to corresponding rubric questions
2. Grade each question individually against its specific criteria
3. Be lenient with spelling/grammar if core logic is correct
4. Assign 0 for entirely missing questions
5. Follow the rigor policy (strict/balanced/lenient)

### 9.3 Plagiarism Pipeline

```
Student 1 Text + Student 2 Text → LangChain ChatPromptTemplate
    → Gemini 2.5 Flash (Structured Output) → PlagiarismReport
```

Detection rules:
- Verbatim phrasing match → 99% confidence flag
- Shared incorrect mathematical logic → strong copying indicator
- Identical short answers → treated as highly suspicious

---

## 10. Testing & Verification

### 10.1 Backend Verification

- All 4 Python modules pass `py_compile` syntax validation
- FastAPI auto-generates OpenAPI spec at `/docs` for endpoint testing
- Mock fallback mode enables full pipeline testing without external services

### 10.2 Frontend Verification

- Vite production build: 69 modules transformed, 0 errors (471ms)
- Bundle sizes: CSS 24.04 KB (5.74 KB gzipped), JS 256.52 KB (83.03 KB gzipped)

### 10.3 Integration Testing

The mock/demo mode enables end-to-end testing of the complete pipeline:
1. Upload any image → mock OCR text returned
2. Grade with any rubric → rigor-aware mock scores generated
3. Approve/override → saved to in-memory database
4. View roster → pre-seeded + newly saved grades displayed
5. Plagiarism check → mock suspicious report returned

---

## 11. Deployment Guide

### 11.1 Development

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

### 11.2 Production Build

```bash
# Frontend static build
cd frontend && npm run build
# Output: frontend/dist/

# Backend
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 12. Future Scope

- **PDF Processing**: Direct multi-page PDF parsing with per-page OCR
- **JWT Authentication**: Server-side role enforcement with token-based auth
- **Batch Analytics**: Cross-student performance trends and question difficulty analysis
- **LangGraph Workflow**: Multi-step agentic pipeline with retry and human-escalation nodes
- **Rubric Version History**: Track rubric changes across grading sessions
- **Real-time Collaboration**: WebSocket-based live grading queue for multiple TAs

---

## 13. Conclusion

GradeOps demonstrates a practical application of agentic AI in education. By combining multimodal vision models for OCR, structured LLM outputs for rubric-based grading, and a human-in-the-loop review interface, the platform achieves consistent, auditable, and scalable exam evaluation. The resilient fallback design ensures the system is fully demonstrable without external dependencies, while the modular architecture supports straightforward extension to production deployments.

---

*Report prepared: May 2026*
*License: MIT*
