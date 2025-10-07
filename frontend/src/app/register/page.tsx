"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!username.trim() || !password.trim()) {
      alert("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) throw new Error();
      alert("✅ สมัครสมาชิกสำเร็จ!");
      router.push("/");
    } catch {
      alert("❌ ชื่อผู้ใช้นี้มีอยู่แล้ว");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRegister();
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#0f0f0f] text-gray-100">
      <div className="w-full max-w-md bg-[#1a1a1a] p-8 rounded-2xl shadow-2xl border border-[#2a2a2a]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⚙️</div>
          <h1 className="text-3xl font-bold text-gray-100 mb-2">ConfigMate</h1>
          <h2 className="text-2xl font-bold text-white mb-2">
            สมัครสมาชิก
          </h2>
          <p className="text-gray-400 text-sm">สร้างบัญชีผู้ใช้ใหม่</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              ชื่อผู้ใช้
            </label>
            <input
              type="text"
              placeholder="กรอกชื่อผู้ใช้ของคุณ"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#4a4a4a] focus:ring-1 focus:ring-[#4a4a4a] transition-colors duration-200"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              รหัสผ่าน
            </label>
            <input
              type="password"
              placeholder="กรอกรหัสผ่านของคุณ"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#4a4a4a] focus:ring-1 focus:ring-[#4a4a4a] transition-colors duration-200"
              disabled={loading}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-8 space-y-3">
          <button
            onClick={handleRegister}
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center ${
              loading
                ? "bg-green-800 text-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white border border-green-500 hover:border-green-400 hover:shadow-lg hover:shadow-green-500/20"
            }`}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                กำลังสมัครสมาชิก...
              </>
            ) : (
              "สมัครสมาชิก"
            )}
          </button>

          <button
            onClick={() => router.push("/")}
            disabled={loading}
            className="w-full py-3 px-4 bg-[#1a1a1a] hover:bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] rounded-lg text-gray-300 font-medium transition-all duration-200 hover:shadow-lg hover:shadow-gray-500/10"
          >
            กลับไปล็อกอิน
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            ระบบช่วยการตั้งค่าเครือข่ายและคอนฟิกอุปกรณ์
          </p>
        </div>
      </div>
    </div>
  );
}