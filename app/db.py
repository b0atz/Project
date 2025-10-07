from pymongo import MongoClient, ASCENDING, DESCENDING

# ===== MongoDB Connection =====
client = MongoClient("mongodb://localhost:27017/")
db = client["configmate"]

qa_collection = db["qa_pairs"]             # เก็บคำถาม/คำตอบทั้งหมด
chats_collection = db["chats_collection"]  # เก็บรายชื่อห้องแชท

# ✅ เพิ่ม collection สำหรับเก็บไฟล์เอกสาร (PDF, Word)
files_collection = db["files_collection"]  # เก็บเนื้อหาไฟล์ที่ผู้ใช้อัปโหลด

# ===== Indexes =====
try:
    qa_collection.create_index([("chat_id", ASCENDING)])
    qa_collection.create_index([("normalized", ASCENDING)])
    qa_collection.create_index([("timestamp", DESCENDING)])

    # ✅ สร้าง index ให้ files_collection ด้วย (ค้นหาเร็วขึ้น)
    files_collection.create_index([("chat_id", ASCENDING)])
    files_collection.create_index([("uploaded_at", DESCENDING)])
except Exception:
    pass

print("✅ MongoDB connected to database:", db.name)
print("📦 Collections:", db.list_collection_names())
