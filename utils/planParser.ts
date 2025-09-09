import { Slide } from '../types';

/**
 * Parses a markdown string from the AI chat into a structured array of Slides.
 * This is now a fallback method.
 * @param markdownText The text content of the AI's message containing the presentation plan.
 * @returns An array of Slide objects.
 */
export const parseSlidesFromMarkdown = (markdownText: string): Slide[] => {
  if (!markdownText || !markdownText.includes('### Слайд')) {
    return [];
  }

  const slides: Slide[] = [];
  const slideSections = markdownText.split(/(?=### Слайд)/g).filter(s => s.trim().startsWith('### Слайд'));

  let speakerIndex = 0;

  for (const section of slideSections) {
    const titleMatch = section.match(/###\s*Слайд\s*\d+:\s*(.*)/);
    const title = titleMatch ? titleMatch[1].trim() : 'Без названия';

    const imageIdMatch = section.match(/\*\*Изображение:\**\s*Используем\s*кадр\s*с\s*ID:\s*([a-zA-Z0-9-]+)/i);
    const imageId = imageIdMatch ? imageIdMatch[1] : null;

    const script = section
      .replace(/###\s*Слайд\s*\d+:\s*(.*)(\n|$)/, '')
      .replace(/\*\*Изображение:\**\s*.*(\n|$)/i, '')
      .replace(/\[SEARCH_IMAGE\]:.*(\n|$)/, '')
      .replace(/\[GENERATE_IMAGE\]:.*(\n|$)/, '')
      .trim();
      
    if (script) {
        slides.push({
            title,
            script,
            imageId,
            speaker: speakerIndex,
            needsImage: !imageId,
        });
    
        speakerIndex = (speakerIndex + 1) % 2;
    }
  }

  return slides;
};

/**
 * Parses a JSON string from the AI into a structured array of Slides.
 * This is the primary method for creating the storyboard.
 * @param jsonText The JSON string from the AI.
 * @returns An array of Slide objects.
 */
export const parseSlidesFromJson = (jsonText: string): Slide[] => {
    try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) {
            console.error("Parsed JSON is not an array:", parsed);
            return [];
        }

        return parsed.map(item => {
            const slide: Slide = {
                title: item.title || 'Без названия',
                script: item.script || 'Нет текста.',
                imageId: item.imageId || null,
                textOverlay: item.textOverlay || '',
                podcastScript: item.podcastScript || '',
                needsImage: item.needsImage ?? !item.imageId, // Use nullish coalescing for better default
                suggestions: item.suggestions || undefined,
                speaker: item.speaker ?? 0, // Default to speaker 0 if not provided
            };
            return slide;
        });
    } catch (e) {
        console.error("Failed to parse JSON for slides:", e, "Raw text:", jsonText);
        // Fallback to markdown parser if JSON fails
        return parseSlidesFromMarkdown(jsonText);
    }
};
