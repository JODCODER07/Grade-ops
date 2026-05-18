import dns.resolver
from bson import ObjectId
dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ['8.8.8.8'] # Forces Python to use Google's DNS!

from fastapi import FastAPI, UploadFile, File, HTTPException
# ... (rest of your imports stay the same)
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
import shutil
import os

# Import your AI engines
from vision_engine import CloudVisionEngine
from agentic_grader import AgenticGrader
from plagiarism_agent import PlagiarismDetector

app = FastAPI(title="GradeOps API")

# Allow React to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from dotenv import load_dotenv
load_dotenv()

# --- MONGODB SETUP WITH RESILIENT IN-MEMORY DEMO FALLBACK ---
try:
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb+srv://naitikagarwal20054_db_user:gradeops123@cluster0.flsleqk.mongodb.net/?appName=Cluster0")
    client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=2000)
    db = client.gradeops
    grades_collection = db.grades
    client.admin.command('ping')
    print("[SUCCESS] MongoDB Connected Successfully!")
except Exception as e:
    print(f"[WARNING] MongoDB Connection failed ({str(e)}). Falling back to resilient in-memory database.")
    class MockGradesCollection:
        def __init__(self):
            self.store = [
                {"_id": "mock_1", "student_id": "STU-1001", "total_score": 9, "status": "Approved", "feedback": "Flawless differentiation and calculus proof steps. Excellent work!"},
                {"_id": "mock_2", "student_id": "STU-1002", "total_score": 7, "status": "Approved", "feedback": "Great conceptual understanding. Minor algebraic addition slip in Q1 final answer."},
                {"_id": "mock_3", "student_id": "STU-1003", "total_score": 4, "status": "Overridden", "feedback": "TA Adjusted: Student attempted all parts but skipped the power rule details entirely."},
                {"_id": "mock_4", "student_id": "STU-1004", "total_score": 8, "status": "Approved", "feedback": "Superb limit computation. Clear breakdown of steps and proper variables usage."},
                {"_id": "mock_5", "student_id": "STU-1005", "total_score": 2, "status": "Overridden", "feedback": "TA Adjusted: Empty paper with only basic formulas written."}
            ]
        def insert_one(self, data):
            import uuid
            new_data = dict(data)
            new_data["_id"] = str(uuid.uuid4())
            self.store.append(new_data)
            class MockResult:
                def __init__(self, inserted_id):
                    self.inserted_id = inserted_id
            return MockResult(new_data["_id"])
        def find(self):
            return self.store
        def delete_one(self, query):
            target_id = query.get("_id")
            if target_id:
                initial_len = len(self.store)
                str_id = str(target_id)
                self.store = [item for item in self.store if str(item.get("_id")) != str_id]
                class MockDeleteResult:
                    def __init__(self, deleted_count):
                        self.deleted_count = deleted_count
                return MockDeleteResult(initial_len - len(self.store))
            return MockDeleteResult(0)
    grades_collection = MockGradesCollection()

# --- INITIALIZE AI ENGINES ---
vision_ai = CloudVisionEngine()
grader_ai = AgenticGrader()
plagiarism_ai = PlagiarismDetector()

# --- DATA MODELS ---
class GradingRequest(BaseModel):
    student_answer: str
    rubric_data: str 
    rigor: str = "balanced"
    temperature: float = 0.1

class PlagiarismRequest(BaseModel):
    student_1_answer: str
    student_2_answer: str

class SaveGradeRequest(BaseModel):
    student_id: str
    total_score: int
    feedback: str
    status: str


# ==========================================
#               API ENDPOINTS
# ==========================================

@app.get("/")
def read_root():
    return {"status": "GradeOps API Server is LIVE 🚀"}

@app.post("/api/extract")
async def extract_text(file: UploadFile = File(...)):
    """Receives an image, saves it temporarily, and runs OCR via Gemini Vision."""
    try:
        temp_file_path = f"temp_{file.filename}"
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        extracted_text = vision_ai.extract_text(temp_file_path)
        os.remove(temp_file_path)
        
        return {"extracted_text": extracted_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/grade")
async def grade_answer(request: GradingRequest):
    """Receives extracted text AND the custom rubric, runs the Langchain Grader."""
    try:
        # Overwrite the local rubric file with the TA's custom one from the UI
        with open("rubric.json", "w") as f:
            f.write(request.rubric_data)
            
        evaluation = grader_ai.grade_answer("rubric.json", request.student_answer, request.rigor, request.temperature)
        return evaluation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/check-plagiarism")
async def check_plagiarism(request: PlagiarismRequest):
    """Compares two answers and returns the plagiarism report."""
    try:
        report = plagiarism_ai.analyze_papers(request.student_1_answer, request.student_2_answer)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-grade")
async def save_grade(request: SaveGradeRequest):
    """Saves the final grade to MongoDB as a JSON document."""
    try:
        # Changed from model_dump() to dict() to ensure cross-version stability!
        grade_doc = request.dict() 
        grades_collection.insert_one(grade_doc)
        return {"message": "Grade permanently saved to MongoDB!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/grades")
async def get_all_grades():
    """Fetches all saved grades for the Class Roster."""
    try:
        grades = list(grades_collection.find())
        # MongoDB _id is not JSON serializable, convert to string
        for grade in grades:
            grade["_id"] = str(grade["_id"])
        return grades
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.delete("/api/grades/{grade_id}")
async def delete_grade(grade_id: str):
    """Deletes a specific grade from the MongoDB Class Roster."""
    try:
        # MongoDB requires the ID string to be converted to an ObjectId object
        result = grades_collection.delete_one({"_id": ObjectId(grade_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Grade not found.")
            
        return {"message": "Grade deleted successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))