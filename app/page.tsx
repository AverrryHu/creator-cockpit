import type { Metadata } from "next";
import Cockpit from "./Cockpit";

export const metadata: Metadata = {
  title: { absolute: "内容驾驶舱" },
  description: "从阶段大目标到每日推进、内容发布和反馈复盘的个人自媒体经营工作台。",
};

export default function Home() {
  return <Cockpit />;
}
