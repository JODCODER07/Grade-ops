import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const RUBRIC_TEMPLATES = {
  calculus: `[
  {
    "question_id": "Q1",
    "total_points": 5,
    "grading_criteria": [
      { "step": "Power Rule on x^2", "points": 2, "condition": "Award 2 points if they apply power rule to x^2 to get 2x." },
      { "step": "Derivative of 5x", "points": 2, "condition": "Award 2 points if they derive 5x as 5." },
      { "step": "Final Answer", "points": 1, "condition": "Award 1 point only if final answer is exactly 2x + 5." }
    ]
  },
  {
    "question_id": "Q2",
    "total_points": 5,
    "grading_criteria": [
      { "step": "Basic concept", "points": 5, "condition": "Award 5 pts if they show understanding of the second question." }
    ]
  }
]`,
  programming: `[
  {
    "question_id": "Q1",
    "total_points": 5,
    "grading_criteria": [
      { "step": "Loop initialization", "points": 2, "condition": "Award 2 points if they correctly initialize a for/while loop structure." },
      { "step": "Loop condition logic", "points": 2, "condition": "Award 2 points if the loop condition boundary handles limit correctly." },
      { "step": "Correct variable accumulation", "points": 1, "condition": "Award 1 point if variables accumulate sum/index perfectly." }
    ]
  }
]`,
  essay: `[
  {
    "question_id": "Q1",
    "total_points": 10,
    "grading_criteria": [
      { "step": "Thesis clarity", "points": 3, "condition": "Award 3 points if they write a clear, arguable, and precise thesis statement." },
      { "step": "Evidentiary support", "points": 4, "condition": "Award 4 points if they cite strong evidence and historical contexts correctly." },
      { "step": "Grammar and organization", "points": 3, "condition": "Award 3 points for clear syntax structure, vocabulary, and flawless spelling." }
    ]
  }
]`
};

function App() {
  // --- 1. RBAC & NAVIGATION STATE ---
  const [role, setRole] = useState(null) // 'instructor' or 'ta'
  const [activeTab, setActiveTab] = useState('grading')

  // --- 2. GRADING STATE ---
  const [files, setFiles] = useState([])         
  const [currentFileIndex, setCurrentFileIndex] = useState(0) 
  const [studentName, setStudentName] = useState("")
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loadingStep, setLoadingStep] = useState(null)
  const [extractedText, setExtractedText] = useState("")
  const [gradeReport, setGradeReport] = useState(null)
  const [error, setError] = useState(null)

  // --- AI PARAMETERS ---
  const [rigor, setRigor] = useState('balanced') // 'strict' | 'balanced' | 'lenient'
  const [temperature, setTemperature] = useState(0.1)

  // --- UI ENHANCEMENTS ---
  const [openQuestions, setOpenQuestions] = useState({}) // Accordion collapsible questions
  const [toasts, setToasts] = useState([]) // Notifications stack

  // --- NEW FEATURES STATES ---
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  // --- RUBRIC CONFIG STATE ---
  const [rubricText, setRubricText] = useState(RUBRIC_TEMPLATES.calculus)

  // --- 3. OVERRIDE STATE ---
  const [isOverriding, setIsOverriding] = useState(false)
  const [manualScore, setManualScore] = useState(0)
  const [manualFeedback, setManualFeedback] = useState("")

  // --- 4. PLAGIARISM STATE ---
  const [file1, setFile1] = useState(null)
  const [file2, setFile2] = useState(null)
  const [plagLoading, setPlagLoading] = useState(false)
  const [plagReport, setPlagReport] = useState(null)

  // --- 5. ROSTER STATE (MongoDB) ---
  const [rosterData, setRosterData] = useState([])
  const [loadingRoster, setLoadingRoster] = useState(false)

  // ==========================================
  //                  EFFECTS & TOASTS
  // ==========================================
  
  // Custom Toast Notification System
  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!gradeReport || isOverriding) return; 
      
      if (e.key === 'Enter') {
        saveGradeToDB("Approved", gradeReport.total_exam_score, gradeReport.general_feedback)
      }
      if (e.key === ' ') { 
        e.preventDefault()
        triggerOverride()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gradeReport, isOverriding])

  // ==========================================
  //               API HANDLERS
  // ==========================================

  const runBatchPipeline = async () => {
    if (files.length === 0) {
      showToast("No more exams in queue!", "error")
      return setError("No more exams in queue!")
    }
    
    setLoadingStep("extracting")
    setError(null)
    setGradeReport(null)

    try {
      const formData = new FormData()
      formData.append("file", files[0])
      const extractRes = await axios.post("http://127.0.0.1:8000/api/extract", formData)
      const text = extractRes.data.extracted_text
      setExtractedText(text)

      setLoadingStep("grading")
      const gradeRes = await axios.post("http://127.0.0.1:8000/api/grade", {
        student_answer: text, 
        rubric_data: rubricText,
        rigor: rigor,
        temperature: temperature
      })
      
      setGradeReport(gradeRes.data)
      setLoadingStep(null)
      showToast("Intelligent Grading Completed Successfully!", "success")

    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message
      setError(`Error on file ${files[0].name}: ${errMsg}`)
      setLoadingStep(null)
      showToast("Inference processing error occurred.", "error")
    }
  }

  const saveGradeToDB = async (statusLabel, finalScore, finalFeedback) => {
    try {
      await axios.post("http://127.0.0.1:8000/api/save-grade", {
        student_id: studentName.trim() || "Unknown Student", 
        total_score: finalScore,
        feedback: finalFeedback,
        status: statusLabel
      })
      showToast(`Grade permanently cataloged in Ledger! (${finalScore} Pts) - ${statusLabel}`, "success")
      resetForNextExam()
    } catch (err) {
      showToast("Failed to write to MongoDB array.", "error")
    }
  }

  const fetchRoster = async () => {
    try {
      setLoadingRoster(true)
      const res = await axios.get("http://127.0.0.1:8000/api/grades")
      setRosterData(res.data)
      setLoadingRoster(false)
    } catch (err) {
      showToast("Database cluster sync offline.", "error")
      setLoadingRoster(false)
    }
  }

  const runPlagiarismCheck = async () => {
    if (!file1 || !file2) return showToast("Select two students' exam payloads first!", "warning")
    try {
      setPlagLoading(true)
      const fd1 = new FormData(); fd1.append("file", file1);
      const res1 = await axios.post("http://127.0.0.1:8000/api/extract", fd1)
      
      const fd2 = new FormData(); fd2.append("file", file2);
      const res2 = await axios.post("http://127.0.0.1:8000/api/extract", fd2)

      const plagRes = await axios.post("http://127.0.0.1:8000/api/check-plagiarism", {
        student_1_answer: res1.data.extracted_text,
        student_2_answer: res2.data.extracted_text
      })

      setPlagReport(plagRes.data)
      setPlagLoading(false)
      showToast("Collusion analysis complete!", "success")
    } catch (err) {
      showToast("Security scan collapsed. Check status.", "error")
      setPlagLoading(false)
    }
  }

  const deleteGrade = async (gradeId) => {
    if (!window.confirm("⚠️ Are you sure you want to permanently purge this grade entry?")) return;
    try {
      await axios.delete(`http://127.0.0.1:8000/api/grades/${gradeId}`)
      setRosterData(rosterData.filter(grade => grade._id !== gradeId))
      showToast("Grade entry successfully purged.", "success")
    } catch (err) {
      showToast("Ledger edit rejected by DB.", "error")
    }
  }

  const resetForNextExam = () => {
    const remainingFiles = files.slice(1)
    setFiles(remainingFiles)
    setGradeReport(null); 
    setIsOverriding(false); 
    setStudentName("");
    setExtractedText(""); 
    setOpenQuestions({});
    
    if (remainingFiles.length > 0) {
      setPreviewUrl(URL.createObjectURL(remainingFiles[0])) 
    } else {
      setPreviewUrl(null)
      setCurrentFileIndex(0)
      showToast("Session Complete! All exams successfully processed.", "warning")
    }
  }

  const triggerOverride = () => {
    setManualScore(gradeReport.total_exam_score)
    setManualFeedback(gradeReport.general_feedback)
    setIsOverriding(true)
  }

  const saveOverride = () => {
    saveGradeToDB("Overridden", parseInt(manualScore), manualFeedback)
  }

  // ==========================================
  //          LEDGER STATISTICS & EXPORTS
  // ==========================================

  const getRosterStats = () => {
    if (rosterData.length === 0) return { avg: 0, max: 0, passRate: 0 }
    const scores = rosterData.map(g => g.total_score)
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    const max = Math.max(...scores)
    // Assume passing score is 5 points or higher
    const passingCount = rosterData.filter(g => g.total_score >= 5).length
    const passRate = ((passingCount / rosterData.length) * 100).toFixed(0)
    return { avg, max, passRate }
  }

  // Pure CSS dynamic Histogram brackets calculation
  const getScoreBrackets = () => {
    const brackets = { "0-2": 0, "3-4": 0, "5-6": 0, "7-8": 0, "9-10": 0 }
    rosterData.forEach(g => {
      const score = g.total_score
      if (score <= 2) brackets["0-2"]++
      else if (score <= 4) brackets["3-4"]++
      else if (score <= 6) brackets["5-6"]++
      else if (score <= 8) brackets["7-8"]++
      else brackets["9-10"]++
    })
    return brackets
  }

  const exportToCSV = () => {
    if (rosterData.length === 0) return showToast("No ledger records available to export.", "warning")
    
    const headers = ["Student ID", "Total Score", "Review Status", "Feedback"]
    const rows = rosterData.map(g => [
      `"${g.student_id}"`,
      g.total_score,
      `"${g.status}"`,
      `"${(g.feedback || "").replace(/"/g, '""')}"`
    ])
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
      
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `gradeops_roster_ledger_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast("CSV Ledger downloaded successfully.", "success")
  }

  const exportToJSON = () => {
    if (rosterData.length === 0) return showToast("No ledger records available to export.", "warning")
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rosterData, null, 2))
    const link = document.createElement("a")
    link.setAttribute("href", dataStr)
    link.setAttribute("download", `gradeops_roster_ledger_${Date.now()}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast("JSON Ledger downloaded successfully.", "success")
  }

  const stats = getRosterStats()
  const brackets = getScoreBrackets()
  const maxBracketCount = Math.max(...Object.values(brackets), 1)

  // Real-time table filters logic
  const filteredRoster = rosterData.filter(grade => {
    const matchesSearch = grade.student_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (grade.feedback || "").toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" ? true : grade.status.toLowerCase() === statusFilter.toLowerCase()
    return matchesSearch && matchesStatus
  })

  // ==========================================
  //                  RENDER
  // ==========================================

  if (!role) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <div className="vl-icon-brand">GO</div>
          <h1>VIRTUAL GRADING MATRIX</h1>
          <p className="login-subtitle">Authenticate secure grading ledger operational criteria:</p>
          <div className="login-btn-group">
            <button className="hifi-btn mode-instructor" onClick={() => { setRole('instructor'); showToast("Connected to Root Console.", "success"); }}>
              INSTRUCTOR AUTHORIZATION
            </button>
            <button className="hifi-btn mode-ta" onClick={() => { setRole('ta'); showToast("Connected as TA Evaluator.", "warning"); }}>
              TA DASHBOARD ACCESS
            </button>
          </div>
          <div className="login-footer">GRADEOPS v4.0 // Slate & Cyber-Lavender Hybrid</div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <header className="header">
        <div className="header-brand-group">
          <h1>
            GRADEOPS 
            <span className={`badge ${role === 'instructor' ? 'badge-host' : 'badge-guest'}`}>
              {role === 'instructor' ? 'CORE // INSTRUCTOR' : 'EVALUATOR // TA'}
            </span>
          </h1>
          <p className="logout-subtext">Secure Session Active // <a href="#" onClick={() => { setRole(null); setGradeReport(null); setFiles([]); setPreviewUrl(null); }}>Disconnect Terminal</a></p>
        </div>
        <div className="tabs">
          <button className={activeTab === 'grading' ? 'active-tab' : ''} onClick={() => setActiveTab('grading')}>📝 Grade Exam</button>
          {role === 'instructor' && (
             <>
               <button className={activeTab === 'plagiarism' ? 'active-tab' : ''} onClick={() => setActiveTab('plagiarism')}>🕵️‍♂️ Plagiarism Check</button>
               <button className={activeTab === 'roster' ? 'active-tab' : ''} onClick={() => { setActiveTab('roster'); fetchRoster(); }}>🗄️ Class Roster</button>
             </>
          )}
        </div>
      </header>

      {/* --- TAB 1: GRADING --- */}
      {activeTab === 'grading' && (
        <main className="main-content">
          <section className="panel">
            {role === 'instructor' ? (
              <>
                <h2>1. Dynamic Rubric Config (JSON Architecture)</h2>
                
                {/* Preset Rubric Template Selector (NEW FEAT) */}
                <div className="input-field-group" style={{ marginBottom: '16px' }}>
                  <label>Select Rubric Template Preset:</label>
                  <select 
                    className="hifi-select"
                    onChange={(e) => {
                      const selected = e.target.value
                      if (RUBRIC_TEMPLATES[selected]) {
                        setRubricText(RUBRIC_TEMPLATES[selected])
                        showToast(`Loaded ${selected.toUpperCase()} rubric template structure!`, "success")
                      }
                    }}
                    defaultValue="calculus"
                  >
                    <option value="calculus">📐 Calculus Derivative Quiz</option>
                    <option value="programming">💻 Python Loop Structure Lab</option>
                    <option value="essay">📝 Essay Synthesis & Thesis critique</option>
                  </select>
                </div>
                
                <textarea value={rubricText} onChange={(e) => setRubricText(e.target.value)} rows={9} className="hifi-textarea code-font"/>
              </>
            ) : (
              <div className="lock-banner">
                <strong>🔒 SYSTEM CONFIGURATION:</strong> Core matrix structure locked by root administrator.
              </div>
            )}

            <h2>2. Session Context & Dynamic Parameters</h2>
            
            {/* Dynamic AI Parameter Panel */}
            <div className="param-control-deck">
              <div className="param-col">
                <div className="param-header">
                  <span>Grading Rigor</span>
                  <span className="param-val" style={{ 
                    color: rigor === 'strict' ? 'var(--coral-accent)' : rigor === 'lenient' ? 'var(--sage-accent)' : 'var(--lavender-light)' 
                  }}>{rigor.toUpperCase()}</span>
                </div>
                <div className="rigor-button-group">
                  <button 
                    type="button" 
                    className={`rigor-btn ${rigor === 'strict' ? 'active-strict' : ''}`}
                    onClick={() => { setRigor('strict'); showToast("Rigor changed to STRICT: Strict logical grading.", "error"); }}
                  >
                    STRICT
                  </button>
                  <button 
                    type="button" 
                    className={`rigor-btn ${rigor === 'balanced' ? 'active-balanced' : ''}`}
                    onClick={() => { setRigor('balanced'); showToast("Rigor changed to BALANCED: Standard rubrics.", "success"); }}
                  >
                    BALANCED
                  </button>
                  <button 
                    type="button" 
                    className={`rigor-btn ${rigor === 'lenient' ? 'active-lenient' : ''}`}
                    onClick={() => { setRigor('lenient'); showToast("Rigor changed to LENIENT: Generous points.", "success"); }}
                  >
                    LENIENT
                  </button>
                </div>
              </div>

              <div className="param-col">
                <div className="param-header">
                  <span>LLM Temperature</span>
                  <span className="param-val">{temperature}</span>
                </div>
                <div className="slider-container">
                  <input 
                    type="range" 
                    min="0.0" 
                    max="1.0" 
                    step="0.05" 
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="hifi-slider"
                  />
                </div>
              </div>
            </div>
            
            <div className="input-field-group">
              <label>Target Student Reference / Metadata ID:</label>
              <input 
                type="text" 
                placeholder="e.g. STU-9942" 
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="hifi-input"
              />
            </div>

            <div className="custom-file-upload-card">
              <input type="file" id="batch-file" accept="image/*,application/pdf" multiple onChange={(e) => {
                const selectedFiles = Array.from(e.target.files)
                setFiles(selectedFiles)
                setPreviewUrl(URL.createObjectURL(selectedFiles[0])) 
                setGradeReport(null); setIsOverriding(false); setCurrentFileIndex(0);
                showToast(`Batch loaded: ${selectedFiles.length} payloads queued.`, "success")
              }} />
              <label htmlFor="batch-file" className="file-zone-label">
                <span>📁 Click to upload or drop exam matrices (Image/PDF)</span>
              </label>
            </div>
            
            {files.length > 0 && (
              <div className="queue-status-indicator">
                ⚡ Batch Pipeline Loaded: <strong>{files.length} payloads</strong> in active execution queue.
              </div>
            )}

            {previewUrl && (
              <div className="preview-container">
                <div className="preview-header">// SCAN_PREVIEW_ACTIVE_VIEWPORT</div>
                <div className="viewport-body">
                  <img src={previewUrl} alt="Exam Scan" className="exam-preview-img"/>
                  {loadingStep && (
                    <div className="active-scanner-overlay">
                      <div className="scanner-matrix-grid"></div>
                      <div className="scanner-sweep-line"></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button className="run-btn" onClick={runBatchPipeline} disabled={files.length === 0 || loadingStep !== null}>
              {loadingStep === "extracting" ? `📡 INFERENCE: Multimodal OCR Extraction...` : 
               loadingStep === "grading" ? `🧠 AGENTIC PROCESSING: Rubric Mapping...` : 
               `🚀 Initialize Intelligent Grading Engine`}
            </button>
            {error && <div className="error-box">🛑 PLATFORM EXCEPTION: {error}</div>}
          </section>

          <section className="panel">
            <h2>3. Output Analytics Real-time Stream</h2>
            {gradeReport ? (
              <div className="report-card">
                
                {!isOverriding ? (
                  <>
                    <div className="score-header">
                      <h3>AGGREGATED EVALUATION INDEX:</h3>
                      <span className="score-badge">{gradeReport.total_exam_score} / {gradeReport.max_exam_points} PTS</span>
                    </div>
                    
                    <div className="feedback-box">
                      <div className="fb-title">// SYSTEM EXECUTIVE REPORT SUMMARY</div>
                      {gradeReport.general_feedback}
                    </div>

                    {/* Question evaluation Cards Refactored to Collapsible Accordions */}
                    {gradeReport.questions.map((q, qIdx) => {
                      const isOpen = openQuestions[q.question_id] !== false // Default open
                      return (
                        <div key={qIdx} className="q-block-card">
                          <h4 className="q-card-title" onClick={() => setOpenQuestions(prev => ({
                            ...prev,
                            [q.question_id]: !isOpen
                          }))}>
                            <div className="q-tag-title-group">
                              <span className="q-tag">{q.question_id}</span> 
                              <span className={`accordion-chevron ${isOpen ? 'chevron-rotated' : ''}`}>▼</span>
                            </div>
                            <span className="score-split">{q.score} / {q.max_points} PTS</span>
                          </h4>
                          
                          <div className={`accordion-content ${isOpen ? 'accordion-open' : ''}`}>
                            <p className="q-summary-text">{q.feedback}</p>
                            <ul className="step-list">
                              {q.step_grades.map((step, sIdx) => (
                                <li key={sIdx} className={step.points_awarded > 0 ? "step-pass" : "step-fail"}>
                                  <div className="step-row-top">
                                    <strong>{step.points_awarded > 0 ? "⚡" : "⚠️"} {step.step_name}</strong>
                                    <span className="step-points-pill">{step.points_awarded} pts</span>
                                  </div>
                                  <p className="step-justification-p">{step.justification}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )
                    })}
                    
                    <div className="action-row-footer">
                      <button onClick={() => saveGradeToDB("Approved", gradeReport.total_exam_score, gradeReport.general_feedback)} className="btn-approve-action">✅ Approve (Enter)</button>
                      <button onClick={triggerOverride} className="btn-override-action">✏️ Override (Space)</button>
                    </div>
                  </>
                ) : (
                  
                  <div className="override-mode-container">
                    <h3>⚠️ Manual TA Override Active</h3>
                    
                    <div className="input-field-group">
                      <label>Adjust Final Exam Score:</label>
                      <input type="number" value={manualScore} onChange={(e) => setManualScore(e.target.value)} className="hifi-input" />
                    </div>
                    
                    <div className="input-field-group">
                      <label>Adjust TA General Feedback:</label>
                      <textarea value={manualFeedback} onChange={(e) => setManualFeedback(e.target.value)} rows={4} className="hifi-textarea" />
                    </div>
                    
                    <div className="action-row-footer">
                      <button onClick={saveOverride} className="btn-approve-action" style={{background: 'var(--lavender-accent)', color: 'var(--text-pure)', boxShadow: '0 4px 10px rgba(139,92,246,0.2)'}}>💾 Save Override & Submit</button>
                      <button onClick={() => setIsOverriding(false)} className="btn-cancel">Cancel</button>
                    </div>
                  </div>
                )}
                
              </div>
            ) : (
              <div className="data-box-stream">
                {extractedText ? (
                  <pre className="stream-terminal-pre">{extractedText}</pre>
                ) : (
                  <div className="placeholder-text-stream">// TERMINAL STREAM LISTENER AWAITING BATCH PIPELINE UPLINK...</div>
                )}
              </div>
            )}
          </section>
        </main>
      )}

      {/* --- TAB 2: PLAGIARISM --- */}
      {activeTab === 'plagiarism' && (
        <main className="main-content">
          <section className="panel">
            <h2>Compare Integrity Matrices</h2>
            <div className="plag-upload-row">
              <strong>Payload Stream 1: </strong>
              <input type="file" className="dark-file-input" onChange={(e) => setFile1(e.target.files[0])} />
            </div>
            <div className="plag-upload-row">
              <strong>Payload Stream 2: </strong>
              <input type="file" className="dark-file-input" onChange={(e) => setFile2(e.target.files[0])} />
            </div>
            <button className="run-btn" onClick={runPlagiarismCheck} disabled={plagLoading}>
              {plagLoading ? "🕵️‍♂️ SCANNING COLLUSION ANOMALIES IN MEMORY DATA ARRAYS..." : "🔍 RUN ANOMALY COLLUSION DETECTOR"}
            </button>
          </section>

          <section className="panel">
            <h2>Integrity Vector Breakdown</h2>
            
            {/* Plagiarism Similarity Heatmap circular indicator (NEW FEAT) */}
            {plagReport && (
              <div className="plag-heatmap-row">
                <div 
                  className="plag-gauge-circle"
                  style={{
                    background: `conic-gradient(${plagReport.is_suspicious ? 'var(--coral-accent)' : 'var(--sage-accent)'} ${plagReport.confidence_score}%, rgba(255,255,255,0.05) ${plagReport.confidence_score}%)`,
                    color: plagReport.is_suspicious ? 'var(--coral-accent)' : 'var(--sage-accent)'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    width: '58px',
                    height: '58px',
                    borderRadius: '50%',
                    background: 'var(--bg-slate-card-solid)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {plagReport.confidence_score}%
                  </div>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', color: plagReport.is_suspicious ? 'var(--coral-accent)' : 'var(--sage-accent)', fontFamily: 'Inter', fontSize: '14px', fontWeight: '700' }}>
                    {plagReport.is_suspicious ? "🚨 High Plagiarism Collusion Risk" : "✅ No Shared Logical Copied Vectors"}
                  </h4>
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Visual logical collusion indices calculated reasoning crossover matches.
                  </p>
                </div>
              </div>
            )}
            
            {plagReport ? (
              <div className="report-card-plag" style={{ borderColor: plagReport.is_suspicious ? 'var(--coral-accent)' : 'var(--sage-accent)'}}>
                <h3 style={{color: plagReport.is_suspicious ? 'var(--coral-accent)' : 'var(--sage-accent)', marginTop: 0, fontFamily: 'Inter', fontSize: '14px'}}>
                  {plagReport.is_suspicious ? "COLLUSION THREAT CONFIRMED" : "LOGICAL VARIANCE VALIDATION CLEAR"}
                </h3>
                
                <h4>Identified Reasoning Cross-Over Matches:</h4>
                <ul className="step-list">
                  {plagReport.shared_anomalies.map((anom, i) => <li key={i} className="anom-li-item">🚩 Structural Anomaly: {anom}</li>)}
                  {plagReport.shared_anomalies.length === 0 && <li className="anom-li-item">No shared structural failures tracked inside memory arrays.</li>}
                </ul>
                
                <div className="feedback-box-plag"><strong>LOGIC EVALUATOR VERDICT: </strong> {plagReport.verdict_justification}</div>
              </div>
            ) : <div className="placeholder-text-stream">// Awaiting computational vector inputs...</div>}
          </section>
        </main>
      )}

     {/* --- TAB 3: CLASS ROSTER --- */}
      {activeTab === 'roster' && (
        <main className="main-content layout-full">
          <section className="panel row-span-all">
            <h2>🗄️ Master Class Roster (Live Database Ledger)</h2>
            
            {/* Dynamic Ledger summaries */}
            <div className="ledger-summary-row">
              <div className="summary-widget-card wid-avg">
                <p>Class Average</p>
                <div className="metric-val">{stats.avg} PTS</div>
              </div>
              <div className="summary-widget-card wid-max">
                <p>Highest Score</p>
                <div className="metric-val">{stats.max} PTS</div>
              </div>
              <div className="summary-widget-card wid-pass">
                <p>Passing Rate (Score &ge; 5)</p>
                <div className="metric-val">{stats.passRate}%</div>
              </div>
            </div>

            {/* Dynamic CSS Grade Distribution Histogram Chart (NEW FEAT) */}
            <div className="histogram-section">
              <div className="histogram-title">📊 Grade Distribution Histogram</div>
              <div className="histogram-chart-wrapper">
                {Object.entries(brackets).map(([range, count]) => {
                  const percentHeight = ((count / maxBracketCount) * 100).toFixed(0)
                  return (
                    <div key={range} className="histogram-bar-col">
                      <div 
                        className="histogram-bar" 
                        style={{ height: `${Math.max(parseInt(percentHeight), 3)}%` }}
                      ></div>
                      <div className="histogram-tooltip">{count} Student{count !== 1 ? 's' : ''} ({range} score)</div>
                      <div className="histogram-label">{range}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Search, filters, and Export controls panel (NEW FEAT) */}
            <div className="roster-control-panel">
              <div className="roster-search-box">
                <span className="roster-search-icon">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search student reference or feedback..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="roster-search-input"
                />
              </div>
              
              <div className="roster-filter-box">
                <select 
                  className="roster-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="approved">Approved</option>
                  <option value="overridden">Overridden</option>
                </select>
              </div>

              <div className="roster-action-deck">
                <button className="btn-export-ledger" onClick={exportToCSV}>📤 Export CSV</button>
                <button className="btn-export-ledger" onClick={exportToJSON}>📤 Export JSON</button>
              </div>
            </div>

            {loadingRoster ? <div className="placeholder-text-stream">Querying live data arrays...</div> : (
              <div className="table-responsive-container">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Exam Score</th>
                      <th>Review Status</th>
                      <th>TA Feedback</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoster.length === 0 && <tr><td colSpan="5" className="empty-table-prompt">// No matching records located.</td></tr>}
                    {filteredRoster.map((grade) => (
                      <tr key={grade._id}>
                        <td className="st-id-cell">{grade.student_id}</td>
                        <td>
                          <span className="table-score-pill">{grade.total_score} PTS</span>
                        </td>
                        <td>
                          <span className={`status-tag ${grade.status === 'Approved' ? 'status-approved' : 'status-overridden'}`}>
                            {grade.status}
                          </span>
                        </td>
                        <td className="table-feedback-text-cell">{grade.feedback}</td>
                        <td>
                          <button onClick={() => deleteGrade(grade._id)} className="purge-btn-table">
                            Purge
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      )}

      {/* Toast Notification Mount Stack */}
      <div className="hifi-toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`hifi-toast hifi-toast-${toast.type}`}>
            <span className="toast-icon">
              {toast.type === 'success' ? '⚡' : toast.type === 'error' ? '🛑' : '⚠️'}
            </span>
            <span className="toast-msg">{toast.message}</span>
            <button 
              className="toast-close" 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App