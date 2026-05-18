import os
from dotenv import load_dotenv
load_dotenv() # Load the hidden keys
from google import genai
from PIL import Image
import sys

class CloudVisionEngine:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("[WARNING] GEMINI_API_KEY is not defined. Using mock fallback mode for Vision Engine.")
            self.client = None
        else:
            self.client = genai.Client(api_key=api_key)
        
        self.model_id = "gemini-2.5-flash"
        print("[INFO] Cloud Vision Engine Initialized. Connecting to Gemini Supercluster...\n")

    def extract_text(self, image_path: str) -> str:
        if not self.client:
            print("📡 [MOCK OCR] Skipping remote API request, generating mock OCR transcript.")
            return "Student Answer to Q1: derivative of x^2 + 5x is: f'(x) = 2x + 5. Student Answer to Q2: Conceptual breakdown shows perfect limits computation."

        print(f"📡 Sending '{image_path}' to Gemini for OCR...")
        try:
            img = Image.open(image_path)
        except FileNotFoundError:
            print(f"❌ Error: Could not find '{image_path}'. Make sure it is in the main folder!")
            sys.exit(1)

        prompt = "Extract and transcribe all the handwritten text and math formulas from this image exactly as written. Output only the transcribed text. Do not add any conversational filler."

        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=[img, prompt]
            )
            return response.text
        except Exception as e:
            return f"❌ API Error: {str(e)}"

# --- Test the Engine ---
if __name__ == "__main__":
    engine = CloudVisionEngine()
    
    # Make sure 'test_exam.png' is in the main GRADEOPS folder!
    result = engine.extract_text("test_exam.png") 
    
    print("\n" + "="*40)
    print("        EXTRACTION RESULT")
    print("="*40)
    print(result)