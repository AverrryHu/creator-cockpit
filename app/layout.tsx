import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "内容驾驶舱",
    template: "%s｜内容驾驶舱",
  },
  description: "一个只属于个人创作者的内容经营驾驶舱。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
