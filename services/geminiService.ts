import { GoogleGenAI } from "@google/genai";
import { ReferenceImage, ImageModel, AspectRatio } from "../types";

const SYSTEM_INSTRUCTION = `You are a world-class senior creative director and visual synth engineer.
Your task: Analyze multiple "Reference Images" and their "Influence Scores" to create a single, highly detailed prompt for an image generation AI.

## CORE PRINCIPLE: PRINCIPLE OF SINGULARITY (単一性の原則)
The resulting image MUST feature exactly ONE central subject (one person, one character, one primary object, or one landscape focus).
- DO NOT place elements side-by-side (e.g., if you see a man and a woman, do not describe two people standing next to each other).
- INSTEAD, blend features into a single, cohesive entity. Create a hybrid being or an object that incorporates traits from both.
- The output should be a single, unified visual concept.

## BLENDING RULES
1. High Score (8-10): Determines the main subject's core identity, dominant art style, and primary color palette.
2. Medium Score (4-7): Contributes textures, background atmosphere, lighting nuances, and secondary features.
3. Low Score (1-3): Provides subtle accents, fine details, or background "flavor".

## OUTPUT FORMAT
- Provide ONLY the detailed visual prompt in English.
- Describe style, lighting, composition, and physical textures.
- No meta-commentary.`;

export class GeminiService {
  // ... (generateSynthesisPrompt はそのままでOK) ...
  async generateSynthesisPrompt(images: ReferenceImage[], apiKey: string): Promise<string> {
      // ... (省略: 先ほど修正した通り) ...
      // ※ここは generateContent のままでOKです（テキスト生成なので）
      const effectiveKey = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY || "";
      if (!effectiveKey) throw new Error("API Key is missing.");
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      
      const parts = images.map((img) => ([
        { text: `[Influence Score: ${Math.round(img.score || 5)}]` },
        { inlineData: { mimeType: "image/png", data: img.base64.split(',')[1] } }
      ])).flat();

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // テキスト生成はGemini 3でOK
        contents: [{ role: 'user', parts: parts }],
        config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.9 },
      });
      
      // テキスト取得部分の安全策
      const candidate = response.candidates?.[0];
      const textPart = candidate?.content?.parts?.find(p => p.text);
      return textPart?.text?.trim() || "A fusion of concepts.";
  }

  // ★ここを修正します★
  async generateImage(prompt: string, model: ImageModel, aspectRatio: AspectRatio, apiKey: string): Promise<string> {
    const effectiveKey = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY || "";
    if (!effectiveKey) throw new Error("API Key is missing.");

    const ai = new GoogleGenAI({ apiKey: effectiveKey });

    try {
      // 修正: モデル名に関わらず、画像生成はすべて `generateImages` メソッドを使います。
      // Gemini 3 Pro や Imagen 4 はこのメソッドに対応しています。
      
      const response = await ai.models.generateImages({
        model: model, // 画面で選ばれたモデル（gemini-3-pro-preview や imagen-4.0 等）をそのまま使う
        prompt: prompt,
        config: {
          numberOfImages: 1,
          // アスペクト比の設定
          aspectRatio: aspectRatio === '1:1' ? '1:1' : aspectRatio === '16:9' ? '16:9' : aspectRatio === '9:16' ? '9:16' : '4:3',
          // Gemini系で画像生成する場合、パラメータ名が違う可能性があるため念のため
          // outputMimeType: "image/png" などを指定する場合もありますが、
          // 最新SDKなら generateImages だけで通るはずです。
        },
      });

      // レスポンスから画像を取り出す
      if (response.generatedImages && response.generatedImages.length > 0) {
        const base64 = response.generatedImages[0].image.imageBytes;
        return `data:image/png;base64,${base64}`;
      }

      throw new Error("No image data returned from the model.");

    } catch (error: any) {
        console.error("Image Generation Error:", error);
        
        // もしGeminiモデルが generateImages に未対応（テキスト専用）だった場合のフォールバック
        // その場合は Imagen 4 に切り替えて再トライするロジックを入れておくと親切です
        if (error.message?.includes("not supported") || error.message?.includes("404")) {
            console.warn("Model doesn't support generateImages, falling back to Imagen 4");
            return this.generateImage(prompt, 'imagen-4.0-generate-001' as ImageModel, aspectRatio, apiKey);
        }

        throw new Error(error.message || "Failed to generate image.");
    }
  }
}

export const geminiService = new GeminiService();