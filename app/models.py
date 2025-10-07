from pydantic import BaseModel
from typing import Optional

class ChatIn(BaseModel):
    question: str
    chat_id: Optional[str] = None  # ใช้ระบุว่าคุยอยู่ในห้องไหน
