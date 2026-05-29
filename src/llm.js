// 선택적 LLM 연동: 코스에 어울리는 추천 멘트를 생성한다.
// LLM_API_KEY 가 없으면 null 을 반환하고, 호출 측은 규칙 기반 문구를 사용한다.

export function llmEnabled() {
  return !!process.env.LLM_API_KEY;
}

/**
 * 코스 한 건에 대한 자연스러운 추천 멘트를 생성.
 * @returns {Promise<string|null>}
 */
export async function describeCourse(course, context = {}) {
  if (!llmEnabled()) return null;

  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const stopsText = course.stops
    .map((s, i) => `${i + 1}. ${s.name} (${s.categoryLabel})`)
    .join("\n");

  const prompt = `다음은 ${context.region || ""} 데이트 코스입니다.
원하는 분위기: ${(context.tags || []).join(", ") || "특별한 조건 없음"}
코스 순서:
${stopsText}
장소 간 총 이동거리: 약 ${course.totalKm}km

이 코스를 추천하는 따뜻하고 설레는 멘트를 2~3문장의 한국어로 작성해줘. 과장 없이 자연스럽게.`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "너는 다정한 데이트 코스 큐레이터야." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 200,
      }),
    });
    if (!res.ok) {
      console.warn("[llm] 응답 오류:", res.status);
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn("[llm] 호출 실패:", err.message);
    return null;
  }
}
