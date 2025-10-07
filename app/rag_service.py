from app.db import db
from datetime import datetime
import re, unicodedata
from ollama import AsyncClient
from bson import ObjectId

# ✅ collections
qa_collection = db["qa_pairs"]
files_collection = db["files_collection"]  # เพิ่ม collection สำหรับเก็บไฟล์

# ===== Normalize =====
def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text.lower().strip())
    text = re.sub(r"[^\u0E00-\u0E7Fa-zA-Z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# ===== ดึงคำตอบที่ตรงกันแบบเป๊ะ =====
def get_exact_answer(question: str):
    norm_q = normalize(question)
    found = qa_collection.find_one({"normalized": norm_q})
    if found:
        print(f"♻ ใช้คำตอบจาก MongoDB ที่มีอยู่แล้ว: {found['question']}")
        return found["answer"]
    return None

# ===== บันทึก Q&A =====
def save_to_mongo(question: str, answer: str, username: str = "guest", chat_id: str | None = None):
    if not question or not answer:
        print("⚠️ ข้ามการบันทึก (ไม่มีคำถามหรือคำตอบ)")
        return

    norm_q = normalize(question)
    qa_collection.insert_one({
        "username": username,
        "chat_id": chat_id,
        "question": question,
        "normalized": norm_q,
        "answer": answer,
        "timestamp": datetime.utcnow()
    })
    print(f"💾 [save_to_mongo] บันทึกคำถามใหม่: '{question}' (chat_id={chat_id})")

    # 🧹 จำกัด 5 record ล่าสุดต่อคำถาม
    duplicates = list(qa_collection.find({"normalized": norm_q}).sort("timestamp", -1))
    if len(duplicates) > 5:
        old_ids = [d["_id"] for d in duplicates[5:]]
        qa_collection.delete_many({"_id": {"$in": old_ids}})
        print(f"🧹 ลบ record เก่าของ '{question}' ออก {len(old_ids)} รายการ")

# ===== ฟังก์ชัน Ask Bot (Streaming พร้อมบริบทแชทและไฟล์) =====
async def ask_bot_stream(question: str, username: str = "guest", chat_id: str | None = None):
    # ✅ ตรวจคำถามใน MongoDB ก่อน (ตอบซ้ำ)
    existing_answer = get_exact_answer(question)
    if existing_answer:
        # 🔁 ส่งคำตอบจาก MongoDB กลับแบบ streaming
        for token in existing_answer:
            yield token
        return  # ❗ ไม่ต้องเรียก LLM ต่อ

    client = AsyncClient()

    # 🧠 ดึงบริบทแชทล่าสุด 5 อัน
    context_messages = []
    if chat_id:
        history = list(
            qa_collection.find({"chat_id": chat_id})
            .sort("timestamp", -1)
            .limit(5)
        )
        for h in reversed(history):
            context_messages.append({"role": "user", "content": h["question"]})
            context_messages.append({"role": "assistant", "content": h["answer"]})

    # 📄 ดึงข้อมูลจากไฟล์
    doc_context = ""
    if chat_id:
        docs = list(files_collection.find({
            "$or": [
                {"chat_id": chat_id},
                {"is_global": True}  # ✅ เพิ่มไฟล์ถาวร (global knowledge)
            ]
        }))
        if docs:
            print(f"📎 พบไฟล์ {len(docs)} ไฟล์ (รวม global) ในห้อง {chat_id}")
            for doc in docs:
                doc_context += f"\n\n[ไฟล์: {doc['filename']}]\n{doc['content'][:1500]}"

    # 🔹 รวมบริบทเอกสารเข้ากับคำถาม
    question_with_context = (
        f"จากข้อมูลในเอกสารต่อไปนี้:\n{doc_context}\n\nคำถาม: {question}"
        if doc_context.strip()
        else question
    )

    context_messages.append({"role": "user", "content": question_with_context})

    # 🚀 ส่งไปยังโมเดล (พร้อมบริบททั้งหมด)
    stream = await client.chat(
        model="mistral",
        messages=context_messages,
        stream=True
    )

    full_answer = ""
    try:
        async for chunk in stream:
            if "message" in chunk and "content" in chunk["message"]:
                token = chunk["message"]["content"]
                full_answer += token
                yield token
    except Exception as e:
        print(f"🟥 Stream interrupted: {e}")
        return

    # ✅ บันทึกคำถาม-คำตอบหลังจบการตอบ
    if full_answer.strip():
        save_to_mongo(question, full_answer, username, chat_id)
        print(f"✅ Saved contextual Q&A (chat_id={chat_id})")
