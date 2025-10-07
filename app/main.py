from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from datetime import datetime
from bson import ObjectId
import os

from app.models import ChatIn
from app.rag_service import ask_bot_stream, save_to_mongo
from app.auth import get_current_user, router as auth_router
from app.db import db

qa_collection = db["qa_pairs"]
chats_collection = db["chats_collection"]

app = FastAPI(title="ConfigMate API", version="3.8.0")

# ===== CORS =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])

# ---------- สร้างห้อง ----------
@app.post("/chat/new", tags=["chat"])
def create_chat(username: str = Depends(get_current_user)):
    new_chat = {
        "username": username,
        "title": "แชทใหม่",
        "created_at": datetime.utcnow()
    }
    result = chats_collection.insert_one(new_chat)
    return {"chat": str(result.inserted_id)}

# ---------- รายการห้อง ----------
@app.get("/chat/list", tags=["chat"])
def list_chats(username: str = Depends(get_current_user)):
    chats = list(chats_collection.find({"username": username}, {"_id": 1, "title": 1}))
    return {"chats": [{"_id": str(c["_id"]), "title": c.get("title", "แชทใหม่")} for c in chats]}

# ---------- ประวัติแชท ----------
@app.get("/chat/history/{chat_id}", tags=["chat"])
def chat_history(chat_id: str, username: str = Depends(get_current_user)):
    history = list(
        qa_collection.find({"chat_id": chat_id}, {"_id": 0, "question": 1, "answer": 1})
        .sort("timestamp", 1)
    )
    return {"history": history}

# ---------- แชท (Streaming + Save หลังจบ) ----------
@app.post("/chat", tags=["chat"])
async def chat(inp: ChatIn, username: str = Depends(get_current_user)):
    from app.rag_service import save_to_mongo, ask_bot_stream
    import asyncio

    if not inp.chat_id:
        raise HTTPException(status_code=400, detail="Missing chat_id")

    full_answer = ""
    stopped = False  # ✅ เพิ่มตัวแปรสถานะการหยุด

    async def generate():
        nonlocal full_answer, stopped
        try:
            async for token in ask_bot_stream(inp.question, username, inp.chat_id):
                full_answer += token
                yield token
        except asyncio.CancelledError:
            stopped = True
            print("⛔ Stream stopped by user (AbortController)")
            raise  # ต้อง raise ต่อเพื่อให้ StreamingResponse รู้ว่าหยุดจริง

    async def on_stream_complete():
        if not stopped and full_answer.strip():
            # ✅ บันทึกเฉพาะถ้าไม่ถูกหยุดกลางทาง
            save_to_mongo(inp.question, full_answer, username, inp.chat_id)
            print(f"💾 [main] Saved after stream | chat_id={inp.chat_id}")
        else:
            print(f"🚫 Skip save (user stopped or empty answer)")

    response = StreamingResponse(generate(), media_type="text/plain")
    response.background = on_stream_complete
    return response

# ---------- ลบห้องแชท + ลบข้อมูลทั้งหมดในห้องนั้น ----------
@app.delete("/chat/delete/{chat_id}", tags=["chat"])
def delete_chat(chat_id: str, username: str = Depends(get_current_user)):
    from app.db import qa_collection, files_collection  # ✅ import เพิ่ม

    # 🔍 ตรวจสอบว่าแชทนี้เป็นของผู้ใช้คนนี้จริงไหม
    chat = chats_collection.find_one({"_id": ObjectId(chat_id), "username": username})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # 🧹 ลบ Q&A ทั้งหมดในห้องนี้
    qa_deleted = qa_collection.delete_many({"chat_id": chat_id})
    # 🧹 ลบไฟล์ทั้งหมดที่แนบในห้องนี้
    files_deleted = files_collection.delete_many({"chat_id": chat_id})
    # 🧹 ลบห้องแชทออก
    chat_deleted = chats_collection.delete_one({"_id": ObjectId(chat_id)})

    print(f"🗑️ Deleted chat {chat_id}: {qa_deleted.deleted_count} QA | {files_deleted.deleted_count} files")

    return {
        "msg": "Chat and related data deleted successfully",
        "deleted_qas": qa_deleted.deleted_count,
        "deleted_files": files_deleted.deleted_count,
        "deleted_chat": chat_deleted.deleted_count
    }

# ---------- เปลี่ยนชื่อห้อง ----------
from pydantic import BaseModel

class RenameChatIn(BaseModel):
    title: str

@app.put("/chat/rename/{chat_id}", tags=["chat"])
def rename_chat(chat_id: str, data: RenameChatIn, username: str = Depends(get_current_user)):
    result = chats_collection.update_one(
        {"_id": ObjectId(chat_id), "username": username},
        {"$set": {"title": data.title}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")

    chat = chats_collection.find_one({"_id": ObjectId(chat_id)})
    return {"_id": str(chat["_id"]), "title": chat["title"]}

# ---------- แก้ไขคำถามในห้อง ----------
from app.rag_service import normalize

class EditQuestionIn(BaseModel):
    old_question: str
    new_question: str

@app.put("/chat/edit_question/{chat_id}", tags=["chat"])
async def edit_question(chat_id: str, data: EditQuestionIn, username: str = Depends(get_current_user)):
    from app.rag_service import qa_collection, ask_bot_stream

    norm_new = normalize(data.new_question)
    norm_old = normalize(data.old_question)

    # 🔍 หา record เดิม (ทั้ง exact และ normalize)
    record = qa_collection.find_one({
        "chat_id": chat_id,
        "username": username,
        "$or": [
            {"question": data.old_question},
            {"normalized": norm_old}
        ]
    })

    if not record:
        print(f"⚠️ Question not found for editing: {data.old_question}")
        raise HTTPException(status_code=404, detail="Question not found")

    # 🚀 ให้บอทตอบใหม่จากคำถามที่แก้
    new_answer = ""
    async for token in ask_bot_stream(data.new_question, username, chat_id):
        new_answer += token

    if not new_answer.strip():
        raise HTTPException(status_code=500, detail="Bot did not return a new answer")

    # 💾 เพิ่ม record ใหม่ (ไม่ลบของเก่า)
    qa_collection.insert_one({
        "username": username,
        "chat_id": chat_id,
        "question": data.new_question,
        "normalized": norm_new,
        "answer": new_answer.strip(),
        "timestamp": datetime.utcnow()
    })

    print(f"✅ Added new Q&A for edited question | chat_id={chat_id}")

    # ✅ บังคับตอบกลับสถานะ 200 OK ชัดเจน
    return JSONResponse(
        status_code=200,
        content={"msg": "Question updated and re-answered successfully", "answer": new_answer.strip()}
    )

# ---------- แนบไฟล์เอกสาร (PDF / Word) ----------
from app.db import files_collection
from PyPDF2 import PdfReader
from docx import Document
import tempfile

@app.post("/chat/upload/{chat_id}", tags=["chat"])
async def upload_file(chat_id: str, file: UploadFile = File(...), username: str = Depends(get_current_user)):
    """
    📎 แนบไฟล์ PDF หรือ Word แล้วเก็บเนื้อหาใน MongoDB
    เพื่อให้ระบบนำข้อมูลในเอกสารมาใช้ตอบคำถามในห้องนั้นได้
    """
    try:
        # ตรวจสอบนามสกุลไฟล์
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in [".pdf", ".docx"]:
            raise HTTPException(status_code=400, detail="รองรับเฉพาะไฟล์ PDF และ Word (.docx) เท่านั้น")

        # เก็บไฟล์ชั่วคราวเพื่ออ่านเนื้อหา
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        # อ่านเนื้อหาจากไฟล์
        text_content = ""
        if ext == ".pdf":
            try:
                reader = PdfReader(tmp_path)
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_content += page_text + "\n"
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"อ่านไฟล์ PDF ไม่ได้: {e}")
        elif ext == ".docx":
            try:
                doc = Document(tmp_path)
                for para in doc.paragraphs:
                    text_content += para.text + "\n"
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"อ่านไฟล์ Word ไม่ได้: {e}")

        # ลบไฟล์ชั่วคราว
        os.remove(tmp_path)

        if not text_content.strip():
            raise HTTPException(status_code=400, detail="ไม่พบข้อความในไฟล์")

        # ✅ บันทึกเนื้อหาไฟล์ลง MongoDB
        files_collection.insert_one({
            "username": username,
            "chat_id": chat_id,
            "filename": file.filename,
            "content": text_content.strip(),
            "uploaded_at": datetime.utcnow()
        })

        print(f"📎 Uploaded file saved to MongoDB: {file.filename}")

        return JSONResponse(
            status_code=200,
            content={"msg": f"ไฟล์ '{file.filename}' ถูกบันทึกเรียบร้อยแล้ว!"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"เกิดข้อผิดพลาดในการอัปโหลดไฟล์: {e}")
