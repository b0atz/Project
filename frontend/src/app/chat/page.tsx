"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ===== โหลดห้องแชทเมื่อเปิดหน้า =====
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }

    const init = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/chat/list", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("load chat list failed");
        const data = await res.json();

        if (data.chats && data.chats.length > 0) {
          setChats(data.chats);
          setActiveChat(data.chats[0]._id);
          loadMessages(data.chats[0]._id);
        } else {
          const newChat = await fetch("http://127.0.0.1:8000/chat/new", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const newData = await newChat.json();
          const newItem = { _id: newData.chat, title: "แชทใหม่" };
          setChats([newItem]);
          setActiveChat(newItem._id);
        }
      } catch (err) {
        console.error("❌ init error:", err);
      }
    };

    init();
  }, [router]);

  // ===== โหลดข้อความของห้อง =====
  const loadMessages = async (chatId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      router.push("/");
      return;
    }

    setMessages([]);
    const res = await fetch(`http://127.0.0.1:8000/chat/history/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    const msgs: { sender: string; text: string }[] = [];
    for (const item of data.history || []) {
      msgs.push({ sender: "user", text: item.question });
      msgs.push({ sender: "bot", text: item.answer });
    }
    setMessages(msgs);
  };

  // ===== ส่งข้อความ =====
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !activeChat) return;

    const token = localStorage.getItem("token");
    if (!token) {
      alert("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      router.push("/");
      return;
    }

    const userMsg = { sender: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const ctrl = new AbortController();
    setController(ctrl);

    try {
      const res = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: text,
          chat_id: activeChat,
        }),
        signal: ctrl.signal,
      });

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let botText = "";

      setMessages((prev) => [...prev, { sender: "bot", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        botText += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { sender: "bot", text: botText };
          return updated;
        });
      }

      await loadMessages(activeChat);
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("⛔ หยุดการตอบแล้ว");
      } else {
        console.error("❌ fetch error:", error);
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "❌ เกิดข้อผิดพลาดในการเชื่อมต่อ" },
        ]);
      }
    } finally {
      setLoading(false);
      setController(null);
    }
  };

  // ===== ✅ ฟังก์ชันแก้ไขคำถาม =====
  const handleEditQuestion = async (oldText: string, newText: string) => {
    if (!activeChat) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/chat/edit_question/${activeChat}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ old_question: oldText, new_question: newText }),
      });

      const data = await res.json();

      if (!res.ok) return;

      setMessages((prev) => [
        ...prev,
        { sender: "user", text: newText },
        { sender: "bot", text: data.answer },
      ]);

    } catch (err) {
      console.error("❌ edit error:", err);
    } finally {
      setEditingIndex(null);
    }
  };

  // ✅ Scroll ลงล่างอัตโนมัติเมื่อมีข้อความใหม่
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ===== สร้างห้องใหม่ =====
  const createNewChat = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      router.push("/");
      return;
    }

    const res = await fetch("http://127.0.0.1:8000/chat/new", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      alert("สร้างห้องไม่สำเร็จ");
      return;
    }

    const data = await res.json();
    const newItem = { _id: data.chat, title: "แชทใหม่" };
    setChats((prev) => [newItem, ...prev]);
    setActiveChat(newItem._id);
    setMessages([]);
  };

  // ===== เปลี่ยนชื่อห้อง =====
  const renameChat = async (chatId: string) => {
    const newTitle = prompt("ตั้งชื่อแชทใหม่:");
    if (!newTitle) return;
    const token = localStorage.getItem("token");
    if (!token) {
      alert("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      router.push("/");
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:8000/chat/rename/${chatId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!res.ok) throw new Error("rename failed");
      const updated = await res.json();
      setChats((prev) =>
        prev.map((c) => (c._id === chatId ? { ...c, title: updated.title } : c))
      );
    } catch (err) {
      console.error("❌ rename error:", err);
      alert("เกิดข้อผิดพลาดในการเปลี่ยนชื่อแชท");
    }
  };

  // ===== ลบแชท =====
  const deleteChat = async (chatId: string) => {
    const confirmDel = confirm("ต้องการลบแชทนี้หรือไม่?");
    if (!confirmDel) return;
    const token = localStorage.getItem("token");
    if (!token) {
      alert("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      router.push("/");
      return;
    }

    await fetch(`http://127.0.0.1:8000/chat/delete/${chatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setChats((prev) => prev.filter((c) => c._id !== chatId));
    if (activeChat === chatId) {
      setMessages([]);
      setActiveChat(null);
    }
  };

  // ===== แนบไฟล์ =====
  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !activeChat) return;
    const token = localStorage.getItem("token");
    if (!token) {
      alert("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      router.push("/");
      return;
    }

    const form = new FormData();
    form.append("file", e.target.files[0]);
    await fetch(`http://127.0.0.1:8000/chat/upload/${activeChat}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    alert("📎 แนบไฟล์เรียบร้อย!");
  };

  const logout = () => {
    localStorage.clear();
    router.push("/");
  };

  return (
    <div className="flex h-screen bg-[#0f0f0f] text-gray-100 transition-all duration-300">
      {/* ===== Sidebar ===== */}
      <aside className="w-80 bg-[#1a1a1a] border-r border-[#2a2a2a] flex flex-col">
        <div className="p-6 border-b border-[#2a2a2a]">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold text-gray-100">การสนทนา</h2>
            <button
              onClick={createNewChat}
              className="bg-[#2a2a2a] hover:bg-[#3a3a3a] px-4 py-2 rounded-lg text-gray-200 font-medium transition-colors duration-200 flex items-center gap-2 border border-[#3a3a3a]"
            >
              <span className="text-lg">+</span> สร้างใหม่
            </button>
          </div>
          <p className="text-sm text-gray-400">จัดการการสนทนาทั้งหมดของคุณ</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {chats.map((chat) => (
            <div
              key={chat._id}
              className={`group p-4 rounded-lg cursor-pointer flex justify-between items-center transition-all duration-200 ${
                chat._id === activeChat
                  ? "bg-[#2a2a2a] text-white shadow-lg border border-[#3a3a3a]"
                  : "bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-gray-300"
              }`}
              onClick={() => {
                setActiveChat(chat._id);
                loadMessages(chat._id);
              }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`p-2 rounded ${
                    chat._id === activeChat
                      ? "bg-[#3a3a3a] text-gray-100"
                      : "bg-[#2a2a2a] text-gray-400"
                  }`}
                >
                  <span className="text-sm">💭</span>
                </div>
                <span className="truncate font-medium text-sm">{chat.title}</span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity duration-200">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    renameChat(chat._id);
                  }}
                  className="p-1.5 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded transition-colors text-gray-300"
                  title="เปลี่ยนชื่อ"
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chat._id);
                  }}
                  className="p-1.5 bg-[#4a1a1a] hover:bg-[#5a2a2a] rounded transition-colors text-red-300"
                  title="ลบแชท"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ===== ปุ่มออกจากระบบ ===== */}
        <div className="p-4 border-t border-[#2a2a2a] mt-auto">
          <button
            onClick={logout}
            className="w-full bg-[#4a1a1a] hover:bg-[#5a2a2a] px-3 py-2 rounded-lg text-red-300 text-sm font-medium border border-[#5a2a2a] transition-colors duration-200"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* ===== Main Chat Area ===== */}
      <div className="flex-1 flex flex-col">
        {/* ===== Header กลาง ===== */}
        <header className="flex justify-center items-center px-8 py-5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
          <h1 className="text-2xl font-bold text-gray-100">ConfigMate</h1>
        </header>

        {/* ===== แสดงข้อความ ===== */}
        <main className="flex-1 overflow-y-auto p-8 flex flex-col space-y-6 bg-[#0f0f0f]">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <div className="text-center max-w-md">
                <div className="text-6xl mb-4">⚙️</div>
                <h3 className="text-xl font-medium text-gray-300 mb-2">
                  ยินดีต้อนรับสู่ ConfigMate
                </h3>
                <p className="text-gray-400 text-sm">
                  เมื่อผ่านต้องการตั้งค่า OSPF บน Aruba หรือ Huawei,
                  คุณสามารถใช้ที่ตอบเข้าถึงตั้งค่า OSPF และ JP ที่แนบทางไปที่สุดได้
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {/* ✅ Avatar ของบอท (แสดงเฉพาะฝั่งซ้าย) */}
                {msg.sender === "bot" && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-400 text-gray-800">
                      🤖
                    </div>
                  </div>
                )}

                {/* ข้อความและปุ่มแก้ไข */}
                <div className={`flex flex-col gap-1 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-lg max-w-[70%] ${
                      msg.sender === "user"
                        ? "bg-[#2a2a2a] text-gray-100 rounded-br-none border border-[#3a3a3a]"
                        : "bg-[#1a1a1a] text-gray-200 rounded-bl-none border border-[#2a2a2a]"
                    }`}
                  >
                    {editingIndex === i && msg.sender === "user" ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          defaultValue={msg.text}
                          className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg p-2 text-gray-100 text-sm focus:outline-none"
                          rows={2}
                          id={`editText-${i}`}
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              const val = (document.getElementById(
                                `editText-${i}`
                              ) as HTMLTextAreaElement).value;
                              handleEditQuestion(msg.text, val);
                            }}
                            className="px-3 py-1 bg-green-700 hover:bg-green-800 rounded text-sm"
                          >
                            ส่ง
                          </button>
                          <button
                            onClick={() => setEditingIndex(null)}
                            className="px-3 py-1 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {msg.text}
                        {/* ✅ ไอคอนกำลังพิมพ์ของบอท */}
                        {msg.sender === "bot" && loading && i === messages.length - 1 && (
                          <span className="inline-block ml-2 animate-pulse">✍️</span>
                        )}
                      </div>
                    )}
                  </div>

                  {msg.sender === "user" && editingIndex !== i && (
                    <button
                      onClick={() => setEditingIndex(i)}
                      className="text-xs text-blue-400 hover:underline mt-1"
                    >
                      ✏️ แก้ไขคำถาม
                    </button>
                  )}
                </div>

                {/* ✅ Avatar ของผู้ใช้ (แสดงเฉพาะฝั่งขวา) */}
                {msg.sender === "user" && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-400 text-gray-800">
                      👤
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {/* ✅ จุดให้ scroll มาหยุดที่นี่ */}
          <div ref={messagesEndRef} />
        </main>

        {/* ===== แถบพิมพ์ข้อความ ===== */}
        <footer className="p-6 border-t border-[#2a2a2a] bg-[#1a1a1a]">
          <div className="max-w-4xl mx-auto">
            <div className="relative bg-[#2a2a2a] rounded-xl border border-[#3a3a3a] shadow-2xl">
              {/* ปุ่มแนบไฟล์ */}
              <div className="absolute left-3 top-3 z-10">
                <label className="flex items-center gap-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] px-3 py-2 rounded-lg cursor-pointer transition-colors duration-200 text-gray-300 text-sm border border-[#4a4a4a]">
                  <span className="text-sm">+</span>
                  แนบไฟล์
                  <input type="file" onChange={uploadFile} className="hidden" />
                </label>
              </div>

              {/* ช่องพิมพ์ */}
              <div className="pl-32 pr-20 py-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={1}
                  placeholder="พิมพ์ข้อความของคุณที่นี่..."
                  className="w-full bg-transparent text-gray-200 text-sm focus:outline-none resize-none placeholder-gray-500 min-h-[40px] max-h-32"
                />
              </div>

              {/* ปุ่มส่ง */}
              <div className="absolute right-3 top-3 flex items-center gap-3">
                <div className="text-xs text-gray-500">{input.length}/500</div>

                {/* ปุ่มหยุดการตอบ */}
                {loading && controller && (
                  <button
                    onClick={() => {
                      controller.abort();
                      setController(null);
                      setLoading(false);
                    }}
                    className="px-3 py-1 bg-red-700 hover:bg-red-800 rounded text-xs text-white font-medium transition-colors"
                  >
                    หยุด
                  </button>
                )}

                {/* ปุ่มส่งข้อความ */}
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 ${
                    loading || !input.trim()
                      ? "bg-[#3a3a3a] text-gray-500 cursor-not-allowed"
                      : "bg-[#4a4a4a] hover:bg-[#5a5a5a] text-gray-200 shadow-lg hover:shadow-gray-500/25"
                  }`}
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-300"></div>
                  ) : (
                    <span className="text-sm">➤</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}