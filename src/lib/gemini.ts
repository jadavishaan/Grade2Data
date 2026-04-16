import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface MarksheetData {
  studentName: string;
  rollNumber: string;
  institutionName: string;
  subjects: {
    subjectCode?: string;
    subjectName: string;
    marksObtained: number | string;
    maxMarks: number | string;
    grade?: string;
  }[];
  totalMarksObtained: number | string;
  totalMaxMarks: number | string;
  percentage: string;
  resultStatus: string;
}

export async function extractMarksheetData(base64Image: string): Promise<MarksheetData | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image,
              },
            },
            {
              text: "Extract student marksheet data. Use empty string/0 if missing. resultStatus must be 'Pass' or 'Fail'. Include subject codes and institutionName if implied.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: { type: Type.STRING },
            rollNumber: { type: Type.STRING },
            institutionName: { type: Type.STRING },
            subjects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subjectCode: { type: Type.STRING },
                  subjectName: { type: Type.STRING },
                  marksObtained: { type: Type.STRING },
                  maxMarks: { type: Type.STRING },
                  grade: { type: Type.STRING },
                },
                required: ["subjectName", "marksObtained", "maxMarks"],
              },
            },
            totalMarksObtained: { type: Type.STRING },
            totalMaxMarks: { type: Type.STRING },
            percentage: { type: Type.STRING },
            resultStatus: { type: Type.STRING },
          },
          required: ["studentName", "subjects"],
        },
      },
    });

    if (!response.text) return null;
    return JSON.parse(response.text) as MarksheetData;
  } catch (error) {
    console.error("Error extracting marksheet data:", error);
    return null;
  }
}
