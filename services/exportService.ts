import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import { Slide, UploadedImage, VoiceSettings } from '../types';
import exifr from 'exifr';

// Helper function to correct image orientation based on EXIF data
const getCorrectedImage = async (image: UploadedImage): Promise<string> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  return new Promise((resolve) => {
    img.onload = async () => {
      let orientation = 1;
      try {
        orientation = (await exifr.orientation(image.file)) || 1;
      } catch (e) {
        console.warn("Could not parse orientation, defaulting to 1.", e)
      }

      let width = img.width;
      let height = img.height;

      if (orientation > 4 && orientation < 9) { // 90 or 270 degrees rotation
        [width, height] = [height, width];
      }

      canvas.width = width;
      canvas.height = height;

      if (!ctx) return resolve(`data:${image.file.type};base64,${image.base64}`);

      // Apply transformations based on orientation
      switch (orientation) {
        case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
        case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
        case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
        case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
        case 7: ctx.transform(0, -1, -1, 0, height, width); break;
        case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
        default: break;
      }

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL(image.file.type));
    };
    img.src = `data:${image.file.type};base64,${image.base64}`;
    img.onerror = () => resolve(`data:${image.file.type};base64,${image.base64}`); // Fallback
  });
};


export const exportToPdf = async (slides: Slide[], allImages: UploadedImage[]): Promise<void> => {
  // @ts-ignore
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1280, 720] // 16:9 aspect ratio
  });

  for (const [index, slide] of slides.entries()) {
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, 1280, 720, 'F');
    const image = allImages.find(img => img.id === slide.imageId);
    if (image) {
        const correctedImgData = await getCorrectedImage(image);
        // Get image dimensions to center it (fit contain)
        const img = new Image();
        img.src = correctedImgData;
        await new Promise(resolve => img.onload = resolve);
        const ratio = Math.min(1280 / img.width, 720 / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (1280 - w) / 2;
        const y = (720 - h) / 2;
        doc.addImage(correctedImgData, 'JPEG', x, y, w, h);
    }
    
    // Gradient overlay for text readability
    const gradient = doc.context2d.createLinearGradient(0, 720, 0, 400);
    gradient.addColorStop(0, 'rgba(0,0,0,0.8)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    doc.context2d.fillStyle = gradient;
    doc.context2d.fillRect(0, 400, 1280, 320);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(48);
    doc.setFont('helvetica', 'bold');
    doc.text(slide.title, 50, 580, { maxWidth: 1180 });
    
    // Add text overlay if exists
    if (slide.textOverlay) {
        doc.setFontSize(24);
        doc.setFont('helvetica', 'normal');
        doc.text(slide.textOverlay, 50, 630, { maxWidth: 1180 });
    }
    
    // Add script to notes section
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    const splitScript = doc.splitTextToSize(`Заметки диктора: ${slide.script}`, 1180);
    doc.text(splitScript, 50, 680);
    
    if (index < slides.length - 1) {
        doc.addPage();
    }
  }
  doc.save('presentation.pdf');
};


export const exportToPptx = async (slides: Slide[], allImages: UploadedImage[], isPodcastMode: boolean): Promise<void> => {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    
    for (const slide of slides) {
        const pptxSlide = pptx.addSlide();
        pptxSlide.background = { color: '000000' };

        const image = allImages.find(img => img.id === slide.imageId);
        
        if (image) {
            const correctedImgData = await getCorrectedImage(image);
            pptxSlide.addImage({
                data: correctedImgData,
                x: 0, y: 0, w: '100%', h: '100%',
                sizing: { type: 'contain', w: '100%', h: '100%' }
            });
        }
        
        pptxSlide.addShape('rect', { x: 0, y: '70%', w: '100%', h: '30%', fill: { color: '000000', transparency: 50 } });

        const scriptToUse = isPodcastMode && slide.podcastScript ? slide.podcastScript : slide.script;

        pptxSlide.addText(slide.title, { x: 0.5, y: '72%', w: '90%', h: 0.75, fontSize: 32, color: 'FFFFFF', bold: true });
        
        if (slide.textOverlay) {
          pptxSlide.addText(slide.textOverlay, { x: 0.5, y: '80%', w: '90%', h: 1, fontSize: 18, color: 'F1F1F1' });
        }
        
        pptxSlide.addNotes(`Заметки диктора (Диктор ${slide.speaker + 1}):\n${scriptToUse}`);
    }
    
    await pptx.writeFile({ fileName: 'presentation.pptx' });
};

const createHtmlPlayer = (slides: Slide[], images: Record<string, string>, voiceSettings: VoiceSettings): string => {
    const slidesJson = JSON.stringify(slides);
    const imagesJson = JSON.stringify(images);
    const voiceSettingsJson = JSON.stringify(voiceSettings);
  
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Презентация</title>
    <style>
        :root { --accent-color: #6366f1; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #111827; color: #f9fafb; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .presentation-container { position: relative; width: 100%; flex-grow: 1; background-color: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .slide-image-base { position: absolute; max-width: 100%; max-height: 100%; object-fit: contain; transition: opacity 0.8s ease-in-out; }
        .slide-image-enter { z-index: 10; opacity: 1; animation: kenburns 20s ease-out forwards; }
        .slide-image-exit { z-index: 5; opacity: 0; }
        .gradient-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.2) 50%, transparent); }
        .text-content { position: relative; z-index: 20; width: 100%; height: 100%; padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; box-sizing: border-box; }
        .text-content h2 { font-size: 2.5rem; font-weight: bold; margin: 0 0 1rem 0; text-shadow: 0 0 12px rgba(0,0,0,0.8); animation: text-in 0.8s ease-out forwards; }
        .text-content p { font-size: 1.25rem; margin: 0; text-shadow: 0 0 12px rgba(0,0,0,0.8); background-color: rgba(0,0,0,0.4); padding: 0.75rem; border-radius: 0.5rem; animation: text-in 0.8s 0.3s ease-out forwards; opacity: 0; animation-fill-mode: forwards; max-width: 70%;}
        .controls { flex-shrink: 0; padding: 1rem; background-color: #1f2937; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .thumbnails { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; }
        .thumb { width: 120px; height: 67.5px; flex-shrink: 0; border: 2px solid transparent; border-radius: 0.375rem; overflow: hidden; cursor: pointer; position: relative; }
        .thumb img { width: 100%; height: 100%; object-cover; }
        .thumb.active { border-color: var(--accent-color); }
        .thumb-overlay { position: absolute; inset: 0; background-color: rgba(0,0,0,0.3); }
        .thumb-number { position: absolute; bottom: 4px; right: 4px; font-size: 0.75rem; font-weight: bold; background-color: rgba(0,0,0,0.6); padding: 2px 5px; border-radius: 4px;}
        .main-controls, .info { display: flex; align-items: center; gap: 0.75rem; }
        .control-btn { background-color: #4b5563; border: none; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.2s; }
        .control-btn:hover { background-color: #6b7280; }
        .play-btn { background-color: var(--accent-color); }
        .play-btn:hover { background-color: #4f46e5; }
        .control-btn svg { width: 24px; height: 24px; }
        .info { font-family: monospace; font-size: 1rem; }
        @keyframes kenburns { 0% { transform: scale(1) translate(0, 0); } 100% { transform: scale(1.08) translate(-1%, 1%); } }
        @keyframes text-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div id="presentation-container" class="presentation-container"></div>
    <div class="controls">
        <div id="thumbnails" class="thumbnails"></div>
        <div class="main-controls">
            <button id="prev-btn" class="control-btn" title="Предыдущий слайд">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <button id="play-btn" class="control-btn play-btn" title="Воспроизвести">
                <svg id="play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <svg id="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display: none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            </button>
            <button id="next-btn" class="control-btn" title="Следующий слайд">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
        </div>
        <div id="info" class="info">1 / 1</div>
    </div>
    <script>
        const SLIDES = ${slidesJson};
        const IMAGES = ${imagesJson};
        const VOICE_SETTINGS = ${voiceSettingsJson};

        const presentationEl = document.getElementById('presentation-container');
        const thumbnailsEl = document.getElementById('thumbnails');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const playBtn = document.getElementById('play-btn');
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const infoEl = document.getElementById('info');
        
        let currentSlideIndex = 0;
        let isPlaying = false;
        let previousSlideIndex = null;
        let voices = [];

        function loadVoices() {
            voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('ru'));
        }
        loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }

        function speak(text, speakerIndex) {
            window.speechSynthesis.cancel();
            const scriptToSpeak = text.replace(/[*_#\`]/g, '');
            const utterance = new SpeechSynthesisUtterance(scriptToSpeak);
            
            const speakerProfile = VOICE_SETTINGS.voices[speakerIndex] || VOICE_SETTINGS.voices[0];
            if (speakerProfile && voices.length > 0) {
                const selectedVoice = voices.find(v => v.voiceURI === speakerProfile.voiceURI);
                utterance.voice = selectedVoice || voices[0] || null;
                utterance.rate = speakerProfile.rate;
                utterance.pitch = speakerProfile.pitch;
            }
            utterance.lang = 'ru-RU';

            utterance.onend = () => {
                if (isPlaying) {
                    if (currentSlideIndex < SLIDES.length - 1) {
                        goToSlide(currentSlideIndex + 1);
                    } else {
                        setIsPlaying(false);
                    }
                }
            };
            window.speechSynthesis.speak(utterance);
        }

        function renderSlide(index) {
            const slide = SLIDES[index];
            const image = IMAGES[slide.imageId];
            const prevImage = previousSlideIndex !== null ? IMAGES[SLIDES[previousSlideIndex].imageId] : null;

            let content = '';
            if (prevImage) content += \`<img src="\${prevImage}" class="slide-image-base slide-image-exit" />\`;
            if (image) content += \`<img src="\${image}" alt="\${slide.title}" class="slide-image-base slide-image-enter" />\`;
            content += '<div class="gradient-overlay"></div>';
            content += \`
                <div class="text-content">
                    <div>
                        <h2>\${slide.title}</h2>
                        \${slide.textOverlay ? \`<p>\${slide.textOverlay}</p>\` : ''}
                    </div>
                </div>
            \`;
            presentationEl.innerHTML = content;
            infoEl.textContent = \`\${index + 1} / \${SLIDES.length}\`;
            updateThumbnails();
            
            if (isPlaying) {
                const script = VOICE_SETTINGS.isPodcastMode && slide.podcastScript ? slide.podcastScript : slide.script;
                speak(script, slide.speaker);
            }
        }

        function goToSlide(index, fromPlayToggle = false) {
            if (index === currentSlideIndex && !fromPlayToggle) return;
            window.speechSynthesis.cancel();
            previousSlideIndex = currentSlideIndex;
            currentSlideIndex = index;
            renderSlide(index);
        }
        
        function setIsPlaying(state) {
            isPlaying = state;
            playIcon.style.display = isPlaying ? 'none' : 'block';
            pauseIcon.style.display = isPlaying ? 'block' : 'none';
        }

        function togglePlay() {
            if (isPlaying) {
                setIsPlaying(false);
                window.speechSynthesis.cancel();
            } else {
                setIsPlaying(true);
                if (currentSlideIndex >= SLIDES.length - 1) {
                    goToSlide(0, true);
                } else {
                    renderSlide(currentSlideIndex);
                }
            }
        }

        function renderThumbnails() {
            thumbnailsEl.innerHTML = SLIDES.map((slide, index) => {
                const image = IMAGES[slide.imageId];
                return \`
                    <div class="thumb" data-index="\${index}" title="Слайд \${index + 1}">
                        \${image ? \`<img src="\${image}" />\` : ''}
                        <div class="thumb-overlay"></div>
                        <div class="thumb-number">\${index + 1}</div>
                    </div>
                \`;
            }).join('');
        }

        function updateThumbnails() {
            document.querySelectorAll('.thumb').forEach((thumb, index) => {
                if (index === currentSlideIndex) {
                    thumb.classList.add('active');
                    thumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                } else {
                    thumb.classList.remove('active');
                }
            });
        }

        prevBtn.addEventListener('click', () => {
            setIsPlaying(false);
            goToSlide((currentSlideIndex - 1 + SLIDES.length) % SLIDES.length);
        });
        nextBtn.addEventListener('click', () => {
            setIsPlaying(false);
            goToSlide((currentSlideIndex + 1) % SLIDES.length);
        });
        playBtn.addEventListener('click', togglePlay);
        thumbnailsEl.addEventListener('click', (e) => {
            const thumb = e.target.closest('.thumb');
            if (thumb) {
                const index = parseInt(thumb.dataset.index, 10);
                setIsPlaying(false);
                goToSlide(index);
            }
        });
        
        // Initial render
        renderThumbnails();
        renderSlide(0);
    </script>
</body>
</html>
  `;
};

export const exportToHtml = async (slides: Slide[], allImages: UploadedImage[], voiceSettings: VoiceSettings): Promise<void> => {
    const imageDataMap: Record<string, string> = {};
    for (const image of allImages) {
        // FIX: The property 'imageId' does not exist on 'UploadedImage'.
        // This logic has been corrected to process only images that are actually used in slides,
        // which appears to be the original intent.
        if (slides.some(slide => slide.imageId === image.id)) {
            imageDataMap[image.id] = await getCorrectedImage(image);
        }
    }
    
    // Create a simplified voice settings object for export to avoid including AI narration feature
    const exportedVoiceSettings: VoiceSettings = {
        ...voiceSettings,
        aiEnhancedNarration: false // This feature is not available in the exported file
    };
    
    const htmlContent = createHtmlPlayer(slides, imageDataMap, exportedVoiceSettings);
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'presentation.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};