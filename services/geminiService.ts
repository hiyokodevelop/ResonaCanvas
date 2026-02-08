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
  /**
   * 画像と影響度スコアからプロンプトを生成する
   * @param apiKey ユーザー入力または環境変数のAPIキー
   */
  async generateSynthesisPrompt(images: ReferenceImage[], apiKey: string): Promise<string> {
    // 優先順位: 引数(ユーザー入力) > NEXT_PUBLIC環境変数 > 通常の環境変数
    const effectiveKey = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY || "";
    
    if (!effectiveKey) {
      throw new Error("API Key is missing. Please set your key in the settings.");
    }

    // クライアントを都度初期化
    const ai = new GoogleGenAI({ apiKey: effectiveKey });
    
    const parts = images.map((img) => ([
      { text: `[Influence Score: ${Math.round(img.score || 5)}]` },
      { 
        inlineData: { 
          mimeType: "image/png", 
          data: img.base64.split(',')[1] 
        } 
      }
    ])).flat();

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // 必要に応じて 'gemini-2.0-flash' 等に変更
        contents: [
          { role: 'user', parts: parts }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.9,
        },
      });

      return response.text()?.trim() || "A dreamlike fusion of light and form.";
    } catch (error) {
      console.error("Prompt Generation Error:", error);
      throw error;
    }
  }

  /**
   * 画像生成を実行する
   * @param apiKey ユーザー入力または環境変数のAPIキー
   */
  async generateImage(prompt: string, model: ImageModel, aspectRatio: AspectRatio, apiKey: string): Promise<string> {
    const effectiveKey = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY || "";
    
    if (!effectiveKey) {
      throw new Error("API Key is missing. Please set your key in the settings.");
    }

    const ai = new GoogleGenAI({ apiKey: effectiveKey });

    try {
      if (model === 'imagen-4.0-generate-001') {
        // Imagen 3/4 系
        const response = await ai.models.generateImages({
          model: model,
          prompt: prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: aspectRatio === '1:1' ? '1:1' : aspectRatio === '16:9' ? '16:9' : aspectRatio === '9:16' ? '9:16' : '4:3',
          },
        });
        const base64 = response.generatedImages[0].image.imageBytes;
        return `data:image/png;base64,${base64}`;
      } else {
        // Gemini Flash/Pro Image series (Nano Banana)
        const response = await ai.models.generateContent({
          model: model,
          contents: [
            { role: 'user', parts: [{ text: prompt }] }
          ],
          config: {
            // @ts-ignore: SDKのバージョンによっては型定義が追いついていない場合があるため
            imageConfig: {
              aspectRatio: aspectRatio
            }
          }
        });

        // レスポンスから画像データを探す
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        
        throw new Error("No image data found in response.");
      }
    } catch (error: any) {
        console.error("Image Generation Error:", error);
        throw new Error(error.message || "The synthesis engine failed to manifest the visual.");
    }
  }
}

export const geminiService = new GeminiService();