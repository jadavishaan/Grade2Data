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
      model: "gemini-3-flash-preview",
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
              text: "Extract the student marksheet data from this image. If a field is not found, use an empty string or 0 as appropriate. For resultStatus, strictly use 'Pass' or 'Fail' to avoid inconsistencies. Extract subject codes if available. Ensure institutionName is extracted. If not explicitly written but implied by the document context, include it.",
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
