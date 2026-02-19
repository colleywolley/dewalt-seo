
import { GoogleGenAI, Type } from "@google/genai";
import { MILWAUKEE_CATALOG_DATA } from "./catalogData";

export interface ForgedContent {
  title: string;
  html: string;
  tags: string;
  personaUsed: 'Woodworker' | 'Plumber' | 'Electrician' | 'Tool Expert' | 'Heavy Civil';
}

/**
 * Generates Shopify product content using gemini-3-flash-preview with Search Grounding.
 * Strictly adheres to the formatting seen on thepowertoolstore.com
 */
export const generateShopifyCopy = async (sku: string, description: string): Promise<ForgedContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const prompt = `
    TASK:
    1. Identify the tool from SKU: "${sku}" and Input Description: "${description || 'EMPTY'}".
    2. STRICT PERSONA SELECTION:
       - DEFAULT: Use "Tool Expert" for ALL universal tools (Tape Measures, Levels, Drills, Impact Drivers, Sawzalls, Circular Saws, Work Lights, Packout, PPE/Gloves).
       - ELECTRICIAN: Use ONLY for specialized electrical gear: Voltage Testers, Knockout Tools, Fish Tapes, Cable Cutters, Crimpers.
       - PLUMBER: Use ONLY for specialized plumbing gear: Drain Cleaners, Force Logic Press Tools, PEX Expanders, Threaders.
       - WOODWORKER: Use ONLY for precision woodworking: Routers, Planers, Track Saws, Finish Nailers.
       - HEAVY CIVIL: Use ONLY for high-capacity equipment: MX FUEL, Core Drills, Breaker Hammers, 1" Drive Impacts.

    PERSONA VOICE RULES:
    - DO NOT introduce yourself. NEVER say "As a tool expert..." or "I am an electrician...".
    - SHOW the persona through technical vocabulary and trade-specific context.
    - If Woodworker: Mention finish quality, tear-out, or precision jigs.
    - If Plumber: Mention wet-work reality, tight crawlspaces, or code-compliant connections.
    - If Electrician: Mention wire-pulling efficiency, panel space, or insulation testing.
    - If Heavy Civil: Mention structural durability, high-torque demands, and extreme jobsite environments.
    - If Tool Expert: Focus on the mechanical design, motor efficiency (POWERSTATE), and long-term professional ROI.

    DATA INTEGRITY & GROUNDING:
    - IF THE INPUT DESCRIPTION IS EMPTY: You MUST find the product info.
    - STEP 1: Search for the SKU in the internal Catalog Data provided below.
    - STEP 2: Use the Google Search tool to find official specifications from milwaukeetool.com.
    - CRITICAL: DO NOT hallucinate features. If no specific technical data is found after searching, write a high-level, factual professional description based on the product category.

    SEO TITLE: Milwaukee + [Full Product Name] + [System/Platform] + [Model #].

    FORMATTING (MUST MATCH THEPOWERTOOLSTORE.COM EXACTLY):
    
    <h3 style="color: #000000; text-transform: uppercase; font-style: italic; font-weight: 900; font-size: 26px; margin-bottom: 18px; border-left: 6px solid #E31E24; padding-left: 12px; line-height: 1.1; font-family: sans-serif;">[INSERT UNIQUE TRADE-SPECIFIC SEO HEADLINE]</h3>
    
    <p style="font-size: 15px; line-height: 1.6; color: #333333; margin-bottom: 18px; font-family: sans-serif;">[Scenario-based technical prose. Evident trade voice. No self-introductions.]</p>
    
    <ul style="list-style: none; padding: 0; margin: 0 0 18px 0;">
      <li style="margin-bottom: 8px; font-size: 15px; display: flex; align-items: flex-start; font-family: sans-serif; color: #333333;">
        <span style="color: #E31E24; font-weight: 900; margin-right: 8px; font-style: italic;">/</span> [Feature and Jobsite Benefit]
      </li>
      [...repeat for 3-5 key features...]
    </ul>
    
    <details style="border: 2px solid #000; margin-bottom: 25px; background: #fafafa; font-family: sans-serif;">
      <summary style="background: #FCEE21; color: #000; padding: 12px 15px; font-weight: 900; cursor: pointer; text-transform: uppercase; border-bottom: 2px solid #000; font-style: italic; outline: none;">TECHNICAL SPECIFICATIONS</summary>
      <div style="padding: 15px; color: #000000;">
        <table style="width: 100%; border-collapse: collapse; color: #000000; font-size: 14px;">
          [Insert <tr> rows here. Ensure every <td> has color: #000000; if necessary to override defaults.]
        </table>
      </div>
    </details>
    
    <h4 style="color: #E31E24; text-transform: uppercase; font-weight: 900; border-bottom: 3px solid #FCEE21; padding-bottom: 4px; margin-top: 25px; font-size: 18px; font-family: sans-serif; font-style: italic;">WHAT'S IN THE BOX</h4>
    <p style="font-size: 15px; color: #333333; font-family: sans-serif;">[Accurate component list]</p>

    CATALOG DATA:
    """
    ${MILWAUKEE_CATALOG_DATA}
    """

    INPUT: SKU: ${sku}, Description: ${description || 'EMPTY - MUST SEARCH OFFICIAL MILWAUKEETOOL.COM SPECS'}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.5,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            htmlContent: { type: Type.STRING },
            tags: { type: Type.STRING },
            personaUsed: { 
              type: Type.STRING, 
              enum: ['Woodworker', 'Plumber', 'Electrician', 'Tool Expert', 'Heavy Civil'] 
            }
          },
          required: ['title', 'htmlContent', 'tags', 'personaUsed']
        }
      },
    });

    const json = JSON.parse(response.text);
    return {
      title: json.title,
      html: json.htmlContent,
      tags: json.tags,
      personaUsed: json.personaUsed
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
