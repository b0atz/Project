import "./globals.css";

export const metadata = {
  title: "ConfigMate",
  description: "AI Config Assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="bg-gray-900 text-white w-screen h-screen overflow-hidden m-0 p-0">
        {children}
      </body>
    </html>
  );
}
