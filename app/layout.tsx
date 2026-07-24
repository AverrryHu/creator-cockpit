import type { Metadata } from "next";
import "./globals.css";

const themeBootScript = `
  (() => {
    try {
      const saved = localStorage.getItem("creator-cockpit-theme");
      const theme = saved === "light" || saved === "dark"
        ? saved
        : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {}
  })();
`;

export const metadata: Metadata = {
  title: {
    default: "内容驾驶舱",
    template: "%s｜内容驾驶舱",
  },
  description: "一个只属于个人创作者的内容经营驾驶舱。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
