import { NextResponse } from "next/server";

type AnalysisKind = "topic" | "script" | "review" | "goal";

const kindLabels: Record<AnalysisKind, string> = {
  topic: "选题体检",
  script: "脚本质检",
  review: "发布复盘",
  goal: "阶段目标诊断",
};

function buildPrompt(kind: AnalysisKind, payload: unknown) {
  const tasks: Record<AnalysisKind, string> = {
    topic: "判断这个选题是否值得投入制作，指出最有价值的角度、主要风险和最低成本验证动作。不要直接扩写成长稿。",
    script: "检查开头承诺、结构、具体场景、案例与节奏，指出最影响完播和理解的问题，并给出小幅可执行修改。",
    review: "结合内容、实际指标和创作者判断，区分问题来自选题、表达、包装还是执行，并提炼下一条内容可验证的规则。",
    goal: "比较时间进度、内容产出、粉丝增长、质量目标和未来两周管线，解释最大风险，并给出下周最值得做的三项动作。不要自动修改目标。",
  };
  return [
    "你是一名克制、具体的中文内容策略编辑，服务小红书 AI / 科技内容创作者。",
    `任务：${kindLabels[kind]}。${tasks[kind]}`,
    "要求：只依据给定数据；没有证据时明确说未知；建议必须落到下一步动作；避免泛泛鼓励。",
    "请输出：一句总结、关键信号、风险、下一步动作。",
    "",
    "输入数据：",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    signals: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    nextActions: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "signals", "risks", "nextActions"],
};

export async function POST(request: Request) {
  let body: { kind?: AnalysisKind; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const kind = body.kind;
  if (!kind || !Object.hasOwn(kindLabels, kind)) {
    return NextResponse.json({ error: "不支持的分析类型。" }, { status: 400 });
  }

  const prompt = buildPrompt(kind, body.payload ?? {});
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ mode: "prompt", prompt, configured: false });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        input: prompt,
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "creator_analysis",
            strict: true,
            schema: outputSchema,
          },
        },
        store: false,
        safety_identifier: "local-creator-cockpit",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenAI analysis failed", response.status, errorBody.slice(0, 500));
      return NextResponse.json({ mode: "prompt", prompt, configured: true, error: "AI 暂时不可用，已切换为提示词模式。" });
    }

    const data = await response.json() as {
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };
    const text = data.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text;
    if (!text) throw new Error("OpenAI response did not contain output_text");
    const result = JSON.parse(text) as { summary: string; signals: string[]; risks: string[]; nextActions: string[] };
    return NextResponse.json({ mode: "direct", prompt, configured: true, result });
  } catch (error) {
    console.error("AI analysis error", error);
    return NextResponse.json({ mode: "prompt", prompt, configured: true, error: "AI 暂时不可用，已切换为提示词模式。" });
  }
}
