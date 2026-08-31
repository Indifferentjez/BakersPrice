import { Router } from 'express';
import multer from 'multer';
import {
  llmAvailable, LlmUnavailableError,
  parseRecipeText, parseRecipeImage, parseRecipePdf,
} from '../anthropic.js';
import { resolveRecipe } from '../lib/recipe.js';

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();
const MAX_TEXT_CHARS = 100_000;

// Sniff the file from its bytes, not the client-supplied MIME. Anthropic
// accepts JPEG/PNG/GIF/WebP images and PDF documents.
export function sniffUpload(buf) {
  if (!buf || buf.length < 4) return { error: 'File is empty or too small.' };
  const at = (i, ...bytes) => bytes.every((b, n) => buf[i + n] === b);
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return { kind: 'pdf', mediaType: 'application/pdf' }; // %PDF
  if (at(0, 0xFF, 0xD8, 0xFF)) return { kind: 'image', mediaType: 'image/jpeg' };
  if (at(0, 0x89, 0x50, 0x4E, 0x47)) return { kind: 'image', mediaType: 'image/png' };
  if (at(0, 0x47, 0x49, 0x46)) return { kind: 'image', mediaType: 'image/gif' };
  if (buf.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) {
    return { kind: 'image', mediaType: 'image/webp' };
  }
  return { error: 'Upload a JPEG, PNG, GIF, WebP, or PDF — the file contents do not match those types.' };
}

router.get('/status', (_req, res) => {
  res.json({ available: llmAvailable() });
});

// POST /api/parse            body: { text }
// POST /api/parse  multipart: file=<image|pdf>
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    let parsed;
    let kind;
    if (req.file) {
      const sniffed = sniffUpload(req.file.buffer);
      if (sniffed.error) return res.status(400).json({ error: sniffed.error });
      const base64 = req.file.buffer.toString('base64');
      if (sniffed.kind === 'pdf') {
        parsed = await parseRecipePdf({ base64 });
        kind = 'pdf';
      } else {
        parsed = await parseRecipeImage({ base64, mediaType: sniffed.mediaType });
        kind = 'image';
      }
    } else if (req.body && typeof req.body.text === 'string' && req.body.text.trim()) {
      if (req.body.text.length > MAX_TEXT_CHARS) {
        return res.status(400).json({ error: `Recipe text is too long (max ${MAX_TEXT_CHARS.toLocaleString()} characters).` });
      }
      parsed = await parseRecipeText(req.body.text);
      kind = 'text';
    } else {
      return res.status(400).json({ error: 'Provide a recipe as `text` or upload an image/PDF file.' });
    }

    const preview = resolveRecipe(parsed.ingredients || []);
    res.json({
      kind,
      parsed,
      preview: {
        master: preview.master,
        unresolved: preview.unresolved,
        classification: preview.classification,
        totalMasterGrams: preview.totalMasterGrams,
      },
    });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      return res.status(503).json({ error: err.message, code: 'LLM_UNAVAILABLE' });
    }
    next(err);
  }
});

// Re-run conversion + classification on a baker-edited ingredient list (no LLM).
// body: { ingredients:[{name,quantity,unit,grams?,notes?}], overrides?:{idx:{grams}} }
router.post('/resolve', (req, res) => {
  const { ingredients = [], overrides = {} } = req.body || {};
  const r = resolveRecipe(ingredients, overrides);
  res.json(r);
});

export default router;
