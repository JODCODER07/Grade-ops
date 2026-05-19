import os
import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing import List

# --- 1. NEW NESTED DATA STRUCTURES ---
class StepGrade(BaseModel):
    step_name: str = Field(description="Name of the rubric step")
    points_awarded: int = Field(description="Points given for this step")
    justification: str = Field(description="Why points were given or lost")

class QuestionGrade(BaseModel):
    question_id: str = Field(description="e.g., Q1, Q2")
    score: int = Field(description="Total points awarded for this specific question")
    max_points: int = Field(description="Maximum possible points for this question")
    feedback: str = Field(description="Feedback for this specific question")
    step_grades: List[StepGrade] = Field(description="Breakdown of points per step")

class FullExamReport(BaseModel):
    total_exam_score: int = Field(description="Sum of all question scores")
    max_exam_points: int = Field(description="Sum of all max points")
    questions: List[QuestionGrade] = Field(description="List of all graded questions")
    general_feedback: str = Field(description="Overall feedback for the student's entire exam")

# --- 2. AGENT DEFINITION ---
class AgenticGrader:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("[WARNING] GEMINI_API_KEY is not defined. Using mock fallback mode for Grader.")
            self.llm = None
            self.structured_llm = None
        else:
            self.llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                temperature=0.1,
                api_key=api_key
            )
            self.structured_llm = self.llm.with_structured_output(FullExamReport)
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert Professor grading an entire handwritten exam.
            You will be given a JSON array of rubrics (one for each question) and the raw extracted text from a student's exam.
            
            YOUR TASKS:
            1. Analyze the student's text and identify which parts correspond to which question in the rubric.
            2. Grade EVERY question individually based strictly on its specific rubric criteria.
            3. Calculate the total exam score and max possible points.
            4. Be lenient with spelling/grammar if the core concept or math logic is correct.
            5. If a question is entirely missing from the student's text, give it a 0.
            
            Rubric Data:
            {rubric_data}
            """),
            ("human", "Student Exam Text:\n{student_answer}\n\nGrade the entire exam and return the structured report.")
        ])

    def grade_answer(self, rubric_file_path: str, student_answer: str, rigor: str = "balanced", temperature: float = 0.1):
        """Reads the multi-question rubric and grades the full exam."""
        try:
            with open(rubric_file_path, "r") as f:
                rubric_data = f.read()
        except Exception as e:
            rubric_data = "Error loading rubric."

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("📡 [MOCK GRADER] Generating mock Structured Report based on rigor policy:", rigor)
            score1 = 4 if rigor == "balanced" else (3 if rigor == "strict" else 5)
            score2 = 3 if rigor == "balanced" else (2 if rigor == "strict" else 4)
            total = score1 + score2
            return {
                "total_exam_score": total,
                "max_exam_points": 10,
                "questions": [
                    {
                        "question_id": "Q1",
                        "score": score1,
                        "max_points": 5,
                        "feedback": f"Evaluated under {rigor.upper()} rules. Strong application of calculus derivatives.",
                        "step_grades": [
                            {"step_name": "Power Rule on x^2", "points_awarded": 2, "justification": "Applied power rule perfectly to get 2x."},
                            {"step_name": "Derivative of 5x", "points_awarded": 2 if score1 >= 4 else 1, "justification": "Computed correctly."},
                            {"step_name": "Final Answer", "points_awarded": 1 if score1 >= 5 else 0, "justification": "Awarded according to criteria."}
                        ]
                    },
                    {
                        "question_id": "Q2",
                        "score": score2,
                        "max_points": 5,
                        "feedback": "Showed solid understanding of conceptual limit problems.",
                        "step_grades": [
                            {"step_name": "Basic concept", "points_awarded": score2, "justification": "Conceptual steps demonstrated."}
                        ]
                    }
                ],
                "general_feedback": f"Calculus Exam Summary: Overall strong comprehension. Student showed correct steps with a minor boundary slip. Graded under {rigor.upper()} criteria successfully."
            }

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=temperature,
            api_key=api_key
        )
        structured_llm = llm.with_structured_output(FullExamReport)

        if rigor == "strict":
            rigor_instruction = (
                "You must grade with extreme STRICTION. Award points ONLY if the student's answer "
                "precisely satisfies every requirement of the step. Be highly critical of math logic errors, "
                "imprecise terminology, or partial missing arguments. Deduct points if the answer is ambiguous."
            )
        elif rigor == "lenient":
            rigor_instruction = (
                "You should grade with LENIENCY. Focus on the student's conceptual understanding. "
                "Award full points for steps where the correct reasoning is shown, even if there are minor "
                "computational slip-ups or formatting mistakes. Give generous partial credit for attempt paths."
            )
        else: # balanced
            rigor_instruction = (
                "Grade with a BALANCED approach. Award points fairly, checking for correct concepts while "
                "holding standard mathematical logic/reasoning steps accountable. Award partial credit "
                "proportionately based on rubric criteria."
            )

        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert Professor grading an entire handwritten exam.
            You will be given a JSON array of rubrics (one for each question) and the raw extracted text from a student's exam.
            
            YOUR TASKS:
            1. Analyze the student's text and identify which parts correspond to which question in the rubric.
            2. Grade EVERY question individually based strictly on its specific rubric criteria.
            3. Calculate the total exam score and max possible points.
            4. Be lenient with spelling/grammar if the core concept or math logic is correct.
            5. If a question is entirely missing from the student's text, give it a 0.
            
            GRADING RIGOR POLICY:
            {rigor_instruction}

            Rubric Data:
            {rubric_data}
            """),
            ("human", "Student Exam Text:\n{student_answer}\n\nGrade the entire exam and return the structured report.")
        ])

        chain = prompt | structured_llm
        result = chain.invoke({
            "rigor_instruction": rigor_instruction,
            "rubric_data": rubric_data,
            "student_answer": student_answer
        })
        
        return result.model_dump()