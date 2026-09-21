async function loadImage(file: File, maxBytes: number, limitLabel: string): Promise<{ image: HTMLImageElement; release: () => void }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Выберите изображение JPG, PNG или WebP.');
  if (file.size > maxBytes) throw new Error(`Изображение слишком большое. Максимальный размер: ${limitLabel}.`);
  if (!file.size) throw new Error('Выбран пустой файл.');
  const url = URL.createObjectURL(file);
  const release = () => URL.revokeObjectURL(url);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Изображение должно быть не больше 40 мегапикселей.');
    return { image, release };
  } catch (error) {
    release();
    if (error instanceof Error && error.name !== 'EncodingError') throw error;
    throw new Error('Не удалось открыть изображение. Попробуйте другой файл.');
  }
}

// Draw a centred cover-crop so uploads keep their proportions on every surface.
function crop(image: HTMLImageElement, width: number, height: number, quality: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает обработку изображения.');
  context.fillStyle = '#25252A';
  context.fillRect(0, 0, width, height);
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function readAvatar(file: File): Promise<string> {
  const { image, release } = await loadImage(file, 5 * 1024 * 1024, '5 МБ');
  try { return crop(image, 256, 256, .86); } finally { release(); }
}

export async function readCover(file: File): Promise<string> {
  const { image, release } = await loadImage(file, 8 * 1024 * 1024, '8 МБ');
  try {
    for (const [width, quality] of [[1280, .82], [1024, .78], [820, .72]] as const) {
      const data = crop(image, width, Math.round(width / 3.05), quality);
      if (data.length <= 1_400_000) return data;
    }
    throw new Error('Не удалось уменьшить изображение. Выберите файл поменьше.');
  } finally { release(); }
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; }
  const textarea = document.createElement('textarea');
  textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try { if (!document.execCommand('copy')) throw new Error('Clipboard unavailable'); }
  finally { textarea.remove(); }
}
