from pymongo import MongoClient
from datetime import datetime
from PyPDF2 import PdfReader
from docx import Document
import os

# ======= ตั้งค่าการเชื่อม MongoDB =======
client = MongoClient("mongodb://localhost:27017/")
db = client["configmate"]
files_collection = db["files_collection"]

# ======= 📁 ระบุโฟลเดอร์ที่เก็บไฟล์ =======
FOLDER_PATH = r"D:\configmate2\TextFolder"  # ✅ เปลี่ยนเป็นพาธโฟลเดอร์ของพี่

# ======= ฟังก์ชันอ่านเนื้อหาไฟล์ =======
def extract_text_from_file(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    text = ""
    try:
        if ext == ".pdf":
            reader = PdfReader(file_path)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"

        elif ext == ".docx":
            doc = Document(file_path)
            for para in doc.paragraphs:
                text += para.text + "\n"

        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()

        else:
            print(f"⚠️ ข้ามไฟล์ {file_path} (ไม่รองรับนามสกุลนี้)")
            return ""
    except Exception as e:
        print(f"❌ อ่านไฟล์ {file_path} ไม่ได้: {e}")
    return text.strip()

# ======= ฟังก์ชันอัปโหลดเข้า MongoDB =======
def upload_to_mongo(file_path: str):
    filename = os.path.basename(file_path)
    content = extract_text_from_file(file_path)

    if not content:
        print(f"🚫 ไม่มีเนื้อหาในไฟล์ {filename}, ข้าม")
        return

    files_collection.insert_one({
        "username": "system",
        "chat_id": None,
        "filename": filename,
        "content": content,
        "uploaded_at": datetime.utcnow(),
        "is_global": True  # ✅ ตั้งให้เป็นไฟล์ฐานความรู้ถาวร
    })

    print(f"✅ อัปโหลดไฟล์ '{filename}' เข้าฐานข้อมูลเรียบร้อย")

# ======= ลูปอ่านไฟล์ทุกไฟล์ในโฟลเดอร์ =======
if __name__ == "__main__":
    if not os.path.exists(FOLDER_PATH):
        print("❌ ไม่พบโฟลเดอร์:", FOLDER_PATH)
    else:
        print(f"📂 เริ่มอัปโหลดไฟล์จากโฟลเดอร์: {FOLDER_PATH}")
        for file in os.listdir(FOLDER_PATH):
            full_path = os.path.join(FOLDER_PATH, file)
            if os.path.isfile(full_path):
                upload_to_mongo(full_path)

        print("🎉 เสร็จสิ้น — อัปโหลดไฟล์ทั้งหมดเรียบร้อยแล้ว!")

        # ✅ แสดงรายชื่อไฟล์ทั้งหมดที่มีใน files_collection ตอนนี้
        print("\n📄 ไฟล์ทั้งหมดในฐานข้อมูลตอนนี้:")
        for doc in files_collection.find({}, {"filename": 1, "is_global": 1}):
            print(f" - {doc.get('filename')} | global={doc.get('is_global')}")
